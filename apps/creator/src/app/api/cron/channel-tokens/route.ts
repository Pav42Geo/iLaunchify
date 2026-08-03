// POST /api/cron/channel-tokens (Track B3, docs/SHOP_CONNECT_E2E_2026-07-24.md §5)
//
// Hourly token-health sweep over CONNECTED channel connections:
//   evaluateTokenHealth (pure, @ilaunchify/channels) decides per connection →
//   REFRESH: adapter.refresh with vault tokens, re-seal IN PLACE (refs never
//     churn), stamp accessTokenExpiresAt/lastRefreshAt; a failed refresh flips
//     the connection to TOKEN_EXPIRED.
//   EXPIRE: credential chain is dead (refresh credential aged out, Amazon
//     365-day re-auth passed, no refresh token) → TOKEN_EXPIRED.
// TOKEN_EXPIRED flips notify the creator ONCE per transition
// (CREATOR_CHANNEL_RECONNECT_NEEDED → Channels hub shows "Reconnect needed";
// re-running the sweep is idempotent because only CONNECTED rows are scanned).
// Every refresh attempt is ChannelSyncEvent-logged for the admin console.
// Also sweeps long-expired ChannelOauthState rows (handshake hygiene).
//
// Auth: shared CRON_SECRET (stock-alerts pattern).
// Schedule (apps/creator/vercel.json): { "path": "/api/cron/channel-tokens",
// "schedule": "20 * * * *" }: hourly at :20, offset from the :00 router.
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/channel-tokens -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { resolveChannelAdapter, evaluateTokenHealth, type ChannelCode, type TokenSet } from '@ilaunchify/channels'
import { readChannelSecret, rotateChannelSecret, channelVaultConfigured } from '@/app/(dashboard)/channels/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Sequential on purpose (bounded DB + vendor-API pressure); allow headroom.
export const maxDuration = 300

const SWEEP_CAP = 500 // revisit with a cursor once connections exceed this

/** B3 columns / enum value pending db:push+generate on stale clients:
 *  CHANNEL-B3-CAST: reads fall back to undefined, writes go through this
 *  cast + catch, the notification event literal hops through unknown. Drop
 *  after the push lands everywhere. */
type LifecycleCols = {
  accessTokenExpiresAt?: Date | null
  lastRefreshAt?: Date | null
}
const p = prisma as unknown as {
  channelConnection: { update: (a: unknown) => Promise<unknown> }
  channelOauthState: { deleteMany: (a: unknown) => Promise<{ count: number }> }
  channelSyncEvent: { create: (a: unknown) => Promise<unknown> }
}

async function logSyncEvent(connectionId: string, outcome: 'OK' | 'ERROR', detail: string): Promise<void> {
  await p.channelSyncEvent
    .create({
      data: { channelConnectionId: connectionId, direction: 'PUSH', topic: 'token.refresh', outcome, detail },
    })
    .catch(() => {})
}

async function flipToExpired(input: {
  connectionId: string
  creatorUserId: string
  channelName: string
  reason: string
}): Promise<void> {
  await prisma.channelConnection.update({
    where: { id: input.connectionId },
    data: { status: 'TOKEN_EXPIRED' },
  })
  await p.channelConnection
    .update({ where: { id: input.connectionId }, data: { lastRefreshError: input.reason } })
    .catch(() => {})
  // One notification per transition: this function only runs for rows that
  // were CONNECTED this sweep, so a repeat sweep cannot re-notify.
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    await dispatchNotification({
      userId: input.creatorUserId,
      // CHANNEL-B3-CAST: enum value pending db:push+generate.
      event: 'CREATOR_CHANNEL_RECONNECT_NEEDED' as unknown as Parameters<typeof dispatchNotification>[0]['event'],
      audience: 'creator',
      data: { channelName: input.channelName, reason: input.reason },
    })
  } catch {
    /* notifications never break the sweep */
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!channelVaultConfigured()) {
    // No key = no sealed tokens anywhere; nothing to refresh, nothing to expire.
    return NextResponse.json({ ok: true, skipped: 'CHANNEL_TOKEN_KEY not configured' })
  }

  const connections = await prisma.channelConnection.findMany({
    where: { status: 'CONNECTED', accessTokenRef: { not: null } },
    include: { channel: { select: { code: true, displayName: true } } },
    take: SWEEP_CAP,
  })

  const now = Date.now()
  let refreshed = 0
  let expired = 0
  let errors = 0

  for (const conn of connections) {
    const lifecycle = conn as unknown as LifecycleCols
    const verdict = evaluateTokenHealth({
      code: conn.channel.code,
      nowMs: now,
      connectedAtMs: conn.connectedAt?.getTime() ?? null,
      accessTokenExpiresAtMs: lifecycle.accessTokenExpiresAt?.getTime() ?? null,
      lastRefreshAtMs: lifecycle.lastRefreshAt?.getTime() ?? null,
      hasRefreshToken: Boolean(conn.refreshTokenRef),
    })

    if (verdict.action === 'NONE') continue

    if (verdict.action === 'EXPIRE') {
      await flipToExpired({
        connectionId: conn.id,
        creatorUserId: conn.creatorUserId,
        channelName: conn.channel.displayName ?? conn.channel.code,
        reason: verdict.reason,
      })
      await logSyncEvent(conn.id, 'ERROR', `expired: ${verdict.reason}`)
      expired += 1
      continue
    }

    // REFRESH
    const adapter = resolveChannelAdapter(conn.channel.code as ChannelCode)
    if (!adapter?.refresh) {
      // No live adapter to refresh through (e.g. production before the native
      // adapter lands). Leave the row; the EXPIRE rules still protect it.
      continue
    }
    try {
      const accessToken = conn.accessTokenRef ? await readChannelSecret(conn.accessTokenRef, 'access_token') : null
      const refreshToken = conn.refreshTokenRef ? await readChannelSecret(conn.refreshTokenRef, 'refresh_token') : null
      if (!accessToken || !refreshToken) {
        await flipToExpired({
          connectionId: conn.id,
          creatorUserId: conn.creatorUserId,
          channelName: conn.channel.displayName ?? conn.channel.code,
          reason: 'stored credentials missing',
        })
        await logSyncEvent(conn.id, 'ERROR', 'refresh skipped: stored credentials missing')
        expired += 1
        continue
      }

      const current: TokenSet = { accessToken, refreshToken }
      const next = await adapter.refresh(current)

      // Re-seal IN PLACE: the refs on the connection row stay stable.
      if (conn.accessTokenRef) await rotateChannelSecret(conn.accessTokenRef, 'access_token', next.accessToken)
      if (conn.refreshTokenRef && next.refreshToken && next.refreshToken !== refreshToken) {
        await rotateChannelSecret(conn.refreshTokenRef, 'refresh_token', next.refreshToken)
      }
      await p.channelConnection
        .update({
          where: { id: conn.id },
          data: {
            accessTokenExpiresAt: next.expiresAt ? new Date(next.expiresAt) : null,
            lastRefreshAt: new Date(),
            lastRefreshError: null,
          },
        })
        .catch(() => {})
      await logSyncEvent(conn.id, 'OK', 'access token refreshed')
      refreshed += 1
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 300) : 'refresh failed'
      await flipToExpired({
        connectionId: conn.id,
        creatorUserId: conn.creatorUserId,
        channelName: conn.channel.displayName ?? conn.channel.code,
        reason: 'token refresh failed',
      })
      await logSyncEvent(conn.id, 'ERROR', `refresh failed: ${detail}`)
      errors += 1
      expired += 1
    }
  }

  // Handshake hygiene: OAuth states expired more than a day ago serve no
  // debugging purpose; single-use consume already guards correctness.
  const sweptStates = await p.channelOauthState
    .deleteMany({ where: { expiresAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
    .catch(() => ({ count: 0 }))

  return NextResponse.json({
    ok: true,
    scanned: connections.length,
    refreshed,
    expired,
    errors,
    staleOauthStatesDeleted: sweptStates.count,
    capped: connections.length >= SWEEP_CAP,
    ranAt: new Date(now).toISOString(),
  })
}
