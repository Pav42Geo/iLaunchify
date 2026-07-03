'use server'

// Admin channel-ops actions (CHANNEL_MANAGEMENT_SPEC §3.4a).
//
// Three levels of control, coarsest → finest — the ChannelEngine/Linnworks
// ops pattern:
//   1. `enabled`      — visibility switch. Off = hidden from creators entirely.
//   2. `ingestPaused` / `pushPaused` — capability kill switches. The channel
//      stays visible; one direction of traffic stops platform-wide. Used for
//      vendor API incidents / maintenance windows without ripping the channel
//      out from under creators.
//   3. per-connection force-disconnect — surgical: one creator↔store link.
// Every flip is audited. Ops-column writes are cast-guarded so the console
// degrades gracefully before `pnpm db:push`.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function toggleChannel({
  channelId,
  enabled,
}: { channelId: string; enabled: boolean }): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const channel = await prisma.channel.findUnique({ where: { id: channelId } })
  if (!channel) return { ok: false, error: 'Channel not found' }

  await prisma.channel.update({
    where: { id: channelId },
    data: { enabled },
  })

  await logAuditAs(admin, {
    entityType: 'Channel',
    entityId: channelId,
    action: enabled ? 'CHANNEL_ENABLE' : 'CHANNEL_DISABLE',
    fromValue: String(channel.enabled),
    toValue: String(enabled),
    payload: { code: channel.code, displayName: channel.displayName },
  })

  revalidatePath('/channels')
  return { ok: true }
}

/** Flip an ingest/push kill switch and/or set the creator-facing maintenance
 *  note. Cast-guarded: before db:push the ops columns don't exist and the
 *  update fails cleanly with a "run db:push" message instead of a 500. */
export async function setChannelOps(input: {
  channelId: string
  ingestPaused?: boolean
  pushPaused?: boolean
  maintenanceNote?: string | null
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const channel = await prisma.channel.findUnique({ where: { id: input.channelId } })
  if (!channel) return { ok: false, error: 'Channel not found' }

  const data: Record<string, unknown> = {}
  if (input.ingestPaused !== undefined) data.ingestPaused = input.ingestPaused
  if (input.pushPaused !== undefined) data.pushPaused = input.pushPaused
  if (input.maintenanceNote !== undefined) {
    const trimmed = input.maintenanceNote?.trim() ?? ''
    data.maintenanceNote = trimmed.length > 0 ? trimmed.slice(0, 500) : null
  }
  if (Object.keys(data).length === 0) return { ok: false, error: 'Nothing to change' }

  try {
    await (prisma.channel as unknown as { update: (a: unknown) => Promise<unknown> }).update({
      where: { id: input.channelId },
      data,
    })
  } catch {
    return { ok: false, error: 'Ops columns not migrated yet — run pnpm db:push && pnpm db:generate.' }
  }

  const flips: string[] = []
  if (input.ingestPaused !== undefined) flips.push(`ingest ${input.ingestPaused ? 'PAUSED' : 'resumed'}`)
  if (input.pushPaused !== undefined) flips.push(`push ${input.pushPaused ? 'PAUSED' : 'resumed'}`)
  if (input.maintenanceNote !== undefined) flips.push(data.maintenanceNote ? 'note set' : 'note cleared')

  await logAuditAs(admin, {
    entityType: 'Channel',
    entityId: input.channelId,
    action: 'CHANNEL_OPS_CHANGE',
    toValue: flips.join(' · '),
    payload: { code: channel.code, ...data },
  })

  revalidatePath('/channels')
  return { ok: true }
}

/** Admin force-disconnect of ONE creator↔channel connection — the surgical
 *  option when a single store misbehaves (webhook storms, token abuse) and
 *  pausing the whole channel would punish everyone. Listings/links stay as
 *  rows; sync stops immediately. The creator sees DISCONNECTED in their hub
 *  and can reconnect unless the channel is disabled. */
export async function adminDisconnectConnection(connectionId: string, reason: string): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  const trimmed = reason.trim()
  if (trimmed.length < 5) return { ok: false, error: 'A reason is required (min 5 chars) — it lands in the audit log.' }

  const conn = await prisma.channelConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, status: true, externalAccountId: true, channel: { select: { code: true } }, creator: { select: { email: true } } },
  })
  if (!conn) return { ok: false, error: 'Connection not found' }
  if (conn.status === 'DISCONNECTED') return { ok: false, error: 'Already disconnected' }

  await prisma.channelConnection.update({
    where: { id: conn.id },
    data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
  })

  await logAuditAs(admin, {
    entityType: 'ChannelConnection',
    entityId: conn.id,
    action: 'CHANNEL_ADMIN_DISCONNECT',
    fromValue: conn.status,
    toValue: 'DISCONNECTED',
    payload: { channel: conn.channel.code, creator: conn.creator.email, externalAccountId: conn.externalAccountId, reason: trimmed },
  })

  revalidatePath('/channels/connections')
  return { ok: true }
}
