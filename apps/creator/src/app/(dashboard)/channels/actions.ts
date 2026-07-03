'use server'

// Creator /channels hub — server actions (CHANNEL_MANAGEMENT_SPEC §3.4, Phase C0).
//
// C0 wires the STUB flow end-to-end: "Connect" resolves the channel's adapter
// (stub in dev — real OAuth redirects land per phase C1/C3/C4/C5), exchanges the
// fake code, and flips the ChannelConnection to CONNECTED. Tier caps enforced
// server-side (1 / 3 / all — CHANNEL_CONNECTION_LIMITS). Everything audited.

import { prisma } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, channelConnectionLimit } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, type ChannelCode } from '@ilaunchify/channels'

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

export type ConnectResult = { ok: true; connectionId: string; externalAccountId: string | null } | { ok: false; error: string }

/** Connect a channel. C0: the stub adapter "authorizes" instantly in dev; when a
 *  real adapter lands (C1+) this returns a redirect URL instead and the OAuth
 *  callback route completes the exchange. Tier-capped + audited. */
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

  // C0 stub flow: exchange immediately (no redirect). Real adapters (C1+) will
  // return buildAuthUrl(...) here and finish in the OAuth callback route.
  const tokens = await adapter.exchangeCode({ code: 'stub-code', redirectUri: 'stub://callback', shopHint })

  const conn = await prisma.channelConnection.upsert({
    where: { channelId_creatorUserId: { channelId: channel.id, creatorUserId: user.id } },
    create: {
      channelId: channel.id,
      creatorUserId: user.id,
      externalAccountId: tokens.externalAccountId ?? null,
      status: 'CONNECTED',
      connectedAt: new Date(),
      scopes: tokens.scopes ?? [],
      // Token REFS land with the real secret-store wiring (C1); the stub stores none.
    },
    update: {
      externalAccountId: tokens.externalAccountId ?? null,
      status: 'CONNECTED',
      connectedAt: new Date(),
      disconnectedAt: null,
      scopes: tokens.scopes ?? [],
    },
  })

  await logAuditAs(user, {
    entityType: 'ChannelConnection',
    entityId: conn.id,
    action: 'CHANNEL_CONNECTED',
    payload: { channel: channel.code, externalAccountId: tokens.externalAccountId ?? null, adapter: adapter.code },
  })
  return { ok: true, connectionId: conn.id, externalAccountId: tokens.externalAccountId ?? null }
}

/** Disconnect (creator-initiated). Listings/links remain rows; sync stops. */
export async function disconnectChannel(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const conn = await prisma.channelConnection.findFirst({
    where: { id: connectionId, creatorUserId: user.id },
    select: { id: true, channel: { select: { code: true } } },
  })
  if (!conn) return { ok: false, error: 'Connection not found.' }
  await prisma.channelConnection.update({
    where: { id: conn.id },
    data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
  })
  await logAuditAs(user, {
    entityType: 'ChannelConnection',
    entityId: conn.id,
    action: 'CHANNEL_DISCONNECTED',
    payload: { channel: conn.channel.code },
  })
  return { ok: true }
}
