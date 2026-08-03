'use server'

// Creator /channels hub server actions (CHANNEL_MANAGEMENT_SPEC §3.4; C0
// stub flow upgraded to the Track B2 redirect flow, SHOP_CONNECT_E2E §5).
//
// "Connect" now ISSUES the OAuth handshake (single-use state + PKCE where
// mandated) and returns the marketplace consent URL; the exchange + CONNECTED
// flip happen in /api/channels/oauth/[channel]/callback. The stub adapter's
// consent URL bounces straight back to that callback, so dev keeps a full
// clickable round trip, keyless. Tier caps enforced server-side (1 / 3 / all,
// CHANNEL_CONNECTION_LIMITS). Everything audited.

import { prisma } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, channelConnectionLimit } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, type ChannelCode } from '@ilaunchify/channels'
import { channelVaultConfigured, issueOauthState, destroyConnectionSecrets, destroyChannelSecrets } from './vault'
import { normalizeShopDomain } from '@ilaunchify/channels'

/** Best-effort security-confirmation ping (coverage batch 2026-07-06). Lazy
 *  import + swallow — notifications never break a connect/disconnect. */
async function notifyChannelEvent(
  userId: string,
  event: 'CREATOR_CHANNEL_CONNECTED' | 'CREATOR_CHANNEL_DISCONNECTED',
  data: { channelName: string; shopName?: string },
): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    await dispatchNotification({ userId, event, data, audience: 'creator' })
  } catch {
    /* best-effort */
  }
}

export interface ChannelCardData {
  channelId: string
  code: string
  displayName: string
  enabled: boolean
  oauthConfigured: boolean
  /** Admin ops (spec §3.4a): true while iLaunchify has paused sync/push for
   *  this channel platform-wide. `maintenanceNote` explains why, verbatim. */
  paused: boolean
  maintenanceNote: string | null
  connection: {
    id: string
    status: string
    externalAccountId: string | null
    connectedAt: string | null
    lastSyncAt: string | null
  } | null
}

export interface ChannelsHubData {
  channels: ChannelCardData[]
  connectedCount: number
  connectionCap: number // Infinity serialized as -1
  tier: string
}

/** The hub's data: all enabled channels + this creator's connection per channel. */
export async function loadChannelsHub(): Promise<ChannelsHubData> {
  const user = await requireUser()
  const [channels, connections, tier] = await Promise.all([
    prisma.channel.findMany({ orderBy: { displayName: 'asc' } }),
    prisma.channelConnection.findMany({ where: { creatorUserId: user.id } }),
    getEffectiveCreatorTier(user),
  ])
  const byChannel = new Map(connections.map((c) => [c.channelId, c]))
  const cap = channelConnectionLimit(tier)
  const connectedCount = connections.filter((c) => c.status === 'CONNECTED').length
  return {
    tier,
    connectedCount,
    connectionCap: Number.isFinite(cap) ? cap : -1,
    channels: channels
      .filter((ch) => ch.enabled)
      .map((ch) => {
        const conn = byChannel.get(ch.id)
        // Ops columns are post-C0 schema — read via cast so the hub renders
        // before db:push (missing column → undefined → not paused).
        const ops = ch as unknown as { ingestPaused?: boolean; pushPaused?: boolean; maintenanceNote?: string | null }
        return {
          channelId: ch.id,
          code: ch.code,
          displayName: ch.displayName,
          enabled: ch.enabled,
          oauthConfigured: ch.oauthConfigured,
          paused: Boolean(ops.ingestPaused || ops.pushPaused),
          maintenanceNote: ops.maintenanceNote ?? null,
          connection: conn
            ? {
                id: conn.id,
                status: conn.status,
                externalAccountId: conn.externalAccountId,
                connectedAt: conn.connectedAt?.toISOString() ?? null,
                lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
              }
            : null,
        }
      }),
  }
}

/** Channels whose OAuth mandates PKCE S256 (Etsy). Additive per adapter. */
const PKCE_CHANNELS: ReadonlySet<string> = new Set(['etsy'])

/** Absolute origin for OAuth redirect URIs (env-driven, localhost in dev). */
function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export type ConnectResult = { ok: true; authUrl: string } | { ok: false; error: string }

/** Start a channel connection (Track B2, docs/SHOP_CONNECT_E2E_2026-07-24.md).
 *  Issues single-use OAuth state (+ PKCE where mandated), builds the
 *  marketplace consent URL through the adapter seam, and returns it for the
 *  client to redirect to. The exchange + CONNECTED flip now happen ONLY in
 *  /api/channels/oauth/[channel]/callback: with the stub adapter the "consent
 *  URL" bounces straight back to that callback, so dev keeps a full clickable
 *  round trip, keyless. Tier-capped + audited. */
export async function connectChannel(channelCode: string, shopHint?: string): Promise<ConnectResult> {
  const user = await requireUser()
  const channel = await prisma.channel.findUnique({ where: { code: channelCode } })
  if (!channel || !channel.enabled) return { ok: false, error: 'That channel is not available.' }

  // Tier cap (LOCKED: only CONNECTION COUNT is gated — 1 / 3 / all).
  const tier = await getEffectiveCreatorTier(user)
  const cap = channelConnectionLimit(tier)
  if (Number.isFinite(cap)) {
    const connected = await prisma.channelConnection.count({
      where: { creatorUserId: user.id, status: 'CONNECTED', NOT: { channelId: channel.id } },
    })
    if (connected >= cap) {
      return {
        ok: false,
        error:
          cap === 1
            ? 'Your plan includes 1 connected channel. Upgrade to Builder for 3, or Agency for all.'
            : `Your plan includes ${cap} connected channels. Upgrade to Agency for all.`,
      }
    }
  }

  const adapter = resolveChannelAdapter(channel.code as ChannelCode)
  if (!adapter) return { ok: false, error: 'This channel’s integration is not configured yet.' }

  // Shopify's OAuth starts ON the store's own domain, so the creator supplies
  // it first (Printful asks the same). Normalized + validated server-side.
  let normalizedShopHint = shopHint
  if (channel.code === 'shopify') {
    const shop = normalizeShopDomain(shopHint ?? '')
    if (!shop) {
      return { ok: false, error: 'Enter your Shopify store domain (something.myshopify.com) to connect.' }
    }
    normalizedShopHint = shop
  }

  if (!channelVaultConfigured()) {
    return {
      ok: false,
      error: 'Channel connections need CHANNEL_TOKEN_KEY set in the environment (see .env.example). Ask the admin to configure it.',
    }
  }

  // Single-use CSRF state (+ sealed PKCE verifier where the channel mandates
  // it). Throws pre-`db:push` (ChannelOauthState table pending) - surface that
  // as a friendly setup error instead of a 500.
  let handshake: { state: string; codeChallenge: string | null }
  try {
    handshake = await issueOauthState({
      creatorUserId: user.id,
      channelId: channel.id,
      returnTo: `/channels?connected=${channel.code}`,
      withPkce: PKCE_CHANNELS.has(channel.code),
    })
  } catch {
    return {
      ok: false,
      error: 'Channel connect rails need the pending database update (CHANNEL CONNECT B1 push). Run pnpm db:push + db:generate first.',
    }
  }

  const redirectUri = `${appOrigin()}/api/channels/oauth/${channel.code}/callback`
  const authUrl = adapter.buildAuthUrl({
    state: handshake.state,
    redirectUri,
    ...(normalizedShopHint ? { shopHint: normalizedShopHint } : {}),
    ...(handshake.codeChallenge ? { codeChallenge: handshake.codeChallenge } : {}),
  })

  await logAuditAs(user, {
    entityType: 'ChannelConnection',
    entityId: channel.id,
    action: 'CHANNEL_CONNECT_STARTED',
    payload: { channel: channel.code, adapter: adapter.code, pkce: PKCE_CHANNELS.has(channel.code) },
  })
  return { ok: true, authUrl }
}

/** Disconnect (creator-initiated). Listings/links/orders remain rows; sync
 *  stops; TOKENS DIE (vault rows destroyed + refs cleared - Track B2). */
export async function disconnectChannel(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const conn = await prisma.channelConnection.findFirst({
    where: { id: connectionId, creatorUserId: user.id },
    select: {
      id: true,
      accessTokenRef: true,
      refreshTokenRef: true,
      webhookSecretRef: true,
      channel: { select: { code: true, displayName: true } },
    },
  })
  if (!conn) return { ok: false, error: 'Connection not found.' }
  // Best-effort token destruction: pre-`db:push` the ChannelSecret table may
  // not exist yet, and a disconnect must never fail on cleanup.
  try {
    await destroyConnectionSecrets(conn.id)
    await destroyChannelSecrets([conn.accessTokenRef, conn.refreshTokenRef, conn.webhookSecretRef])
  } catch {
    /* best-effort */
  }
  await prisma.channelConnection.update({
    where: { id: conn.id },
    data: {
      status: 'DISCONNECTED',
      disconnectedAt: new Date(),
      accessTokenRef: null,
      refreshTokenRef: null,
      webhookSecretRef: null,
    },
  })
  await logAuditAs(user, {
    entityType: 'ChannelConnection',
    entityId: conn.id,
    action: 'CHANNEL_DISCONNECTED',
    payload: { channel: conn.channel.code },
  })
  await notifyChannelEvent(user.id, 'CREATOR_CHANNEL_DISCONNECTED', {
    channelName: conn.channel.displayName ?? conn.channel.code,
  })
  return { ok: true }
}
