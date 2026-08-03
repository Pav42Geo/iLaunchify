'use server'

// Channel-order ingest: creator-facing server actions (C2.1). The engine body
// lives in ./ingest-core (plain module) since Track B4 so the webhook receiver
// can ingest session-free; these wrappers add requireUser + ownership scoping.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { ingestOrdersForConnectionCore, type IngestSummary } from './ingest-core'

export type { IngestSummary } from './ingest-core'

/** Pull + ingest orders for ONE connection the caller owns. */
export async function importOrdersForConnection(connectionId: string): Promise<IngestSummary> {
  const user = await requireUser()
  // Ownership is enforced INSIDE the core: its connection lookup filters
  // creatorUserId to the actor, so a foreign connectionId reads as not-found.
  return ingestOrdersForConnectionCore(user, connectionId)
}

/** Sync every CONNECTED channel for the current creator ("Sync now"). */
export async function importOrdersForAllConnections(): Promise<IngestSummary> {
  const user = await requireUser()
  const conns = await prisma.channelConnection.findMany({
    where: { creatorUserId: user.id, status: 'CONNECTED' },
    select: { id: true },
  })
  const total: IngestSummary = { pulled: 0, imported: 0, ready: 0, onHold: 0, needsAttention: 0, errors: [] }
  for (const c of conns) {
    const s = await importOrdersForConnection(c.id)
    total.pulled += s.pulled
    total.imported += s.imported
    total.ready += s.ready
    total.onHold += s.onHold
    total.needsAttention += s.needsAttention
    total.errors.push(...s.errors)
  }
  return total
}

/** Manual-confirm approval (LOCKED #5): creator releases a held READY order.
 *  C2.2's router then picks up READY + !manualConfirmRequired for production. */
export async function approveChannelOrder(channelOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await prisma.channelOrder.findFirst({
    where: { id: channelOrderId, connection: { creatorUserId: user.id } },
    select: { id: true, status: true, manualConfirmRequired: true },
  })
  if (!row) return { ok: false, error: 'Order not found.' }
  if (row.status !== 'READY' || !row.manualConfirmRequired) return { ok: false, error: 'Nothing to approve on this order.' }
  await prisma.channelOrder.update({ where: { id: channelOrderId }, data: { manualConfirmRequired: false } })
  await logAuditAs(user, { entityType: 'ChannelOrder', entityId: channelOrderId, action: 'CHANNEL_ORDER_APPROVED', payload: {} })
  return { ok: true }
}
