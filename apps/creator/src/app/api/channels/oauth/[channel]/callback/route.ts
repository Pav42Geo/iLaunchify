// GET /api/channels/oauth/[channel]/callback: the OAuth landing leg
// (Track B2, docs/SHOP_CONNECT_E2E_2026-07-24.md §5). The marketplace consent
// screen redirects here with ?code&state; this route turns that into a
// CONNECTED ChannelConnection:
//
//   consume single-use state (CSRF/replay guard, vault.ts) → session must match
//   the creator who started the handshake → re-check the tier cap → adapter
//   exchangeCode (PKCE verifier passed through when the state carried one) →
//   seal tokens into the vault, refs onto the connection row → registerWebhooks
//   (secret sealed too) → audit + notify → bounce to /channels with a banner.
//
// EVERY failure lands back on the hub as ?connect_error=<code> (short allowlist
// rendered by ChannelsHubClient) - never a raw 500, never reflected input.
// With the stub adapter the consent URL bounces straight back here, so the
// whole leg is clickable keyless in dev.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser, getEffectiveCreatorTier, channelConnectionLimit } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, type ChannelCode } from '@ilaunchify/channels'
import {
  consumeOauthState,
  storeChannelSecret,
  destroyConnectionSecrets,
  linkSecretToConnection,
} from '@/app/(dashboard)/channels/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Short, allowlisted error codes the hub renders as friendly banners. */
type ConnectErrorCode = 'signin' | 'session' | 'state' | 'channel' | 'config' | 'cap' | 'denied' | 'exchange' | 'setup'

function hubRedirect(origin: string, query: { connected?: string; connect_error?: ConnectErrorCode }): NextResponse {
  const url = new URL('/channels', origin)
  if (query.connected) url.searchParams.set('connected', query.connected)
  if (query.connect_error) url.searchParams.set('connect_error', query.connect_error)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelParam } = await params
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const search = req.nextUrl.searchParams

  // Marketplace-side decline (e.g. Etsy "Refuse access") arrives as ?error=.
  if (search.get('error')) return hubRedirect(origin, { connect_error: 'denied' })

  const code = search.get('code')
  const state = search.get('state')
  if (!code || !state) return hubRedirect(origin, { connect_error: 'state' })

  // Unauthenticated hits get the standard guard redirect to /login (Next
  // convention: requireUser throws the redirect; the user signs in + retries).
  const user = await requireUser()

  // Single-use claim: unknown / expired / replayed state all land here.
  // Pre-`db:push` the ChannelOauthState table is missing → 'setup'.
  let claimed: Awaited<ReturnType<typeof consumeOauthState>>
  try {
    claimed = await consumeOauthState(state)
  } catch {
    return hubRedirect(origin, { connect_error: 'setup' })
  }
  if (!claimed) return hubRedirect(origin, { connect_error: 'state' })
  if (claimed.creatorUserId !== user.id) return hubRedirect(origin, { connect_error: 'session' })

  const channel = await prisma.channel.findUnique({ where: { id: claimed.channelId } })
  if (!channel || !channel.enabled || channel.code !== channelParam) {
    return hubRedirect(origin, { connect_error: 'channel' })
  }

  const adapter = resolveChannelAdapter(channel.code as ChannelCode)
  if (!adapter) return hubRedirect(origin, { connect_error: 'config' })

  // Tier cap re-check at completion time (LOCKED: connection COUNT is gated).
  // The start action checked too, but the consent leg can outlive a plan change.
  const cap = channelConnectionLimit(await getEffectiveCreatorTier(user))
  if (Number.isFinite(cap)) {
    const connected = await prisma.channelConnection.count({
      where: { creatorUserId: user.id, status: 'CONNECTED', NOT: { channelId: channel.id } },
    })
    if (connected >= cap) return hubRedirect(origin, { connect_error: 'cap' })
  }

  const redirectUri = `${origin}/api/channels/oauth/${channel.code}/callback`
  let tokens: Awaited<ReturnType<typeof adapter.exchangeCode>>
  try {
    tokens = await adapter.exchangeCode({
      code,
      redirectUri,
      ...(claimed.codeVerifier ? { codeVerifier: claimed.codeVerifier } : {}),
      // Shopify's callback carries the store domain as ?shop= (the exchange
      // endpoint lives on that domain); other channels ignore it.
      ...(search.get('shop') ? { shopHint: search.get('shop') as string } : {}),
    })
  } catch {
    await logAuditAs(user, {
      entityType: 'ChannelConnection',
      entityId: channel.id,
      action: 'CHANNEL_CONNECT_EXCHANGE_FAILED',
      payload: { channel: channel.code, adapter: adapter.code },
    }).catch(() => {})
    return hubRedirect(origin, { connect_error: 'exchange' })
  }

  try {
    const conn = await prisma.channelConnection.upsert({
      where: { channelId_creatorUserId: { channelId: channel.id, creatorUserId: user.id } },
      create: {
        channelId: channel.id,
        creatorUserId: user.id,
        externalAccountId: tokens.externalAccountId ?? null,
        status: 'CONNECTED',
        connectedAt: new Date(),
        scopes: tokens.scopes ?? [],
      },
      update: {
        externalAccountId: tokens.externalAccountId ?? null,
        status: 'CONNECTED',
        connectedAt: new Date(),
        disconnectedAt: null,
        scopes: tokens.scopes ?? [],
      },
      select: { id: true },
    })

    // Reconnect hygiene: any earlier tokens for this connection die first, then
    // the fresh set is sealed. Refs land on the connection row; refresh flows
    // later ROTATE in place so these refs never churn (vault.ts).
    await destroyConnectionSecrets(conn.id)
    const accessTokenRef = await storeChannelSecret({
      kind: 'access_token',
      plaintext: tokens.accessToken,
      channelConnectionId: conn.id,
    })
    const refreshTokenRef = tokens.refreshToken
      ? await storeChannelSecret({ kind: 'refresh_token', plaintext: tokens.refreshToken, channelConnectionId: conn.id })
      : null

    // Webhook registration through the seam (receiver route family lands in
    // Track B4; the URL shape is fixed now so adapters register once).
    let webhookSecretRef: string | null = null
    if (adapter.registerWebhooks) {
      const { webhookSecret } = await adapter.registerWebhooks(
        {
          connectionId: conn.id,
          externalAccountId: tokens.externalAccountId ?? null,
          tokens,
        },
        // Per-connection callback URL: the receiver resolves ?cid= directly
        // (app-level registrations use adapter.identifyWebhook instead).
        `${origin}/api/webhooks/channels/${channel.code}?cid=${conn.id}`,
      )
      if (webhookSecret) {
        webhookSecretRef = await storeChannelSecret({
          kind: 'webhook_secret',
          plaintext: webhookSecret,
          channelConnectionId: conn.id,
        })
        await linkSecretToConnection(webhookSecretRef, conn.id)
      }
    }

    await prisma.channelConnection.update({
      where: { id: conn.id },
      data: { accessTokenRef, refreshTokenRef, webhookSecretRef },
    })

    // Token lifecycle metadata (Track B3 columns; SEPARATE cast-guarded write
    // so a stale client pre-`db:generate` can never fail the connect).
    await (prisma as unknown as { channelConnection: { update: (a: unknown) => Promise<unknown> } }).channelConnection
      .update({
        where: { id: conn.id },
        data: {
          accessTokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
          lastRefreshAt: new Date(),
          lastRefreshError: null,
        },
      })
      .catch(() => {})

    await logAuditAs(user, {
      entityType: 'ChannelConnection',
      entityId: conn.id,
      action: 'CHANNEL_CONNECTED',
      payload: {
        channel: channel.code,
        adapter: adapter.code,
        externalAccountId: tokens.externalAccountId ?? null,
        via: 'oauth_callback',
      },
    })
    try {
      const { dispatchNotification } = await import('@ilaunchify/notifications')
      await dispatchNotification({
        userId: user.id,
        event: 'CREATOR_CHANNEL_CONNECTED',
        data: {
          channelName: channel.displayName ?? channel.code,
          ...(tokens.externalAccountId ? { shopName: tokens.externalAccountId } : {}),
        },
        audience: 'creator',
      })
    } catch {
      /* notifications never break a connect */
    }
  } catch {
    // Vault write failed mid-flight (or table pending pre-push). Don't leave a
    // CONNECTED row with unusable tokens: flip it to ERROR, best-effort.
    await prisma.channelConnection
      .updateMany({
        where: { channelId: channel.id, creatorUserId: user.id, status: 'CONNECTED', accessTokenRef: null },
        data: { status: 'ERROR' },
      })
      .catch(() => {})
    return hubRedirect(origin, { connect_error: 'setup' })
  }

  const dest = claimed.returnTo ?? `/channels?connected=${channel.code}`
  return NextResponse.redirect(new URL(dest, origin))
}
