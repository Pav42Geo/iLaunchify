'use server'

// C2.2 - route READY channel orders into production with AUTO-BILLING.
//
// C2.2a (the "Route & pay" Stripe-Checkout rail) is RETIRED by C2.2b: the
// per-consumer-order model is the LOCKED decision #1 auto-charge of the
// creator's saved method (daily cap, ON_HOLD on breach/failure, auto-recovery
// next cycle). The implementation lives in route-core.ts (shared with the
// /api/cron/channel-router sweep); this file is the thin creator-scoped
// server-action skin: "Route now" per order + "Run router" for the inbox.
//
// Pricing, gating and the single-dispatch law are all in route-core.ts:
// findRouting -> assertSinglePartnerPlan -> velocity-banded ON_DEMAND bands
// through computeOrderPricing -> off-session charge -> ONE manufacturer
// dispatch. See docs/C22_BUILD_BRIEF_2026-07-22.md.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, applyLedgerEntry, type ChannelCode } from '@ilaunchify/channels'
import { recomputeStockAlert } from '../inventory/alerts'
import { routeReadyChannelOrder, scanAndRouteForCreator, type RouterRunSummary } from './route-core'

type AnyDelegate = {
  findFirst?: (a: unknown) => Promise<Record<string, unknown> | null>
  update?: (a: unknown) => Promise<unknown>
  create?: (a: unknown) => Promise<Record<string, unknown>>
}
const d = (name: string): AnyDelegate | null => ((prisma as unknown as Record<string, AnyDelegate | undefined>)[name] ?? null)

export type RouteNowResult =
  | { ok: true; orderIds: string[]; chargedCents: number }
  | { ok: false; parked?: 'ON_HOLD' | 'NEEDS_ATTENTION'; error: string }

/** "Route now": route ONE channel order (also the manual retry for ON_HOLD). */
export async function routeChannelOrderNow(channelOrderId: string): Promise<RouteNowResult> {
  const user = await requireUser()
  const outcome = await routeReadyChannelOrder(user.id, channelOrderId)
  switch (outcome.kind) {
    case 'ROUTED':
      return { ok: true, orderIds: outcome.orderIds, chargedCents: outcome.chargedCents }
    case 'BULK_ONLY':
      return { ok: false, error: 'This order ships from stock. Use "Mark fulfilled (self-ship)" once it ships.' }
    case 'PARKED':
      return { ok: false, parked: outcome.park, error: outcome.reason }
    case 'SKIPPED':
      return { ok: false, error: outcome.reason }
  }
}

/** "Run router": sweep every routable order for the signed-in creator
 *  (READY + auto-recoverable ON_HOLD). The cron runs the same core hourly. */
export async function runMyChannelRouter(): Promise<RouterRunSummary> {
  const user = await requireUser()
  return scanAndRouteForCreator(user.id)
}

// =============================================================================
// Fulfillment tail (C2.4 completion): bulk SELF-SHIP + cancel.
// =============================================================================

export type FulfillResult = { ok: true } | { ok: false; error: string }

/** Mark a channel order fulfilled from the creator's own stock (bulk self-ship):
 *  pushes tracking to the channel via the adapter, converts reservations to
 *  CHANNEL_SALE ledger entries (pure invariants), and closes the FSM leg. */
export async function fulfillChannelOrder(input: {
  channelOrderId: string
  carrier: string
  trackingNumber: string
  trackingUrl?: string
}): Promise<FulfillResult> {
  const user = await requireUser()
  const od = d('channelOrder')
  if (!od?.findFirst || !od.update) return { ok: false, error: 'Channel-order tables not migrated yet.' }
  if (!input.carrier.trim() || !input.trackingNumber.trim()) return { ok: false, error: 'Carrier and tracking number are required.' }

  const row = (await od
    .findFirst({
      where: { id: input.channelOrderId, connection: { creatorUserId: user.id } },
      include: { lines: true, connection: { select: { id: true, externalAccountId: true, channel: { select: { code: true } } } } },
    })
    .catch(() => null)) as
    | ({
        id: string
        status: string
        manualConfirmRequired: boolean
        externalOrderId: string
        connection: { id: string; externalAccountId: string | null; channel: { code: string } }
        lines: Array<{ channelVariantLinkId: string | null; quantity: number }>
      } & Record<string, unknown>)
    | null
  if (!row) return { ok: false, error: 'Order not found.' }
  if (!['READY', 'ROUTED', 'IN_FULFILLMENT'].includes(row.status)) {
    return { ok: false, error: `Order is ${row.status} — nothing to fulfill.` }
  }
  if (row.status === 'READY' && row.manualConfirmRequired) return { ok: false, error: 'Approve the order first.' }

  // Push tracking to the channel (adapter seam; stub no-ops in dev).
  const adapter = resolveChannelAdapter(row.connection.channel.code as ChannelCode)
  if (adapter) {
    try {
      await adapter.pushFulfillment(
        { connectionId: row.connection.id, externalAccountId: row.connection.externalAccountId, tokens: { accessToken: 'stub' } },
        row.externalOrderId,
        { carrier: input.carrier.trim(), trackingNumber: input.trackingNumber.trim(), trackingUrl: input.trackingUrl },
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'fulfillment push failed'
      await d('channelSyncEvent')
        ?.create?.({ data: { channelConnectionId: row.connection.id, direction: 'PUSH', topic: 'fulfillment.push', outcome: 'ERROR', detail } })
        .catch(() => {})
      return { ok: false, error: `Tracking push failed: ${detail}` }
    }
  }

  // Convert reservations → sales for every BULK line with a pool (invariant-checked).
  const touchedProducts = new Set<string>()
  for (const l of row.lines) {
    if (!l.channelVariantLinkId) continue
    const vlink = await (
      prisma as unknown as {
        channelVariantLink: { findUnique: (a: unknown) => Promise<{ productId: string; channelProductLink: { mode?: string } } | null> }
      }
    ).channelVariantLink
      .findUnique({ where: { id: l.channelVariantLinkId }, select: { productId: true, channelProductLink: { select: { mode: true } } } })
      .catch(() => null)
    if (!vlink || vlink.channelProductLink?.mode !== 'BULK') continue
    const pool = await d('inventoryPool')
      ?.findFirst?.({
        where: { creatorUserId: user.id, productId: vlink.productId },
        select: { id: true, quantityOnHand: true, quantityReserved: true },
      })
      .catch(() => null)
    if (!pool) continue
    const applied = applyLedgerEntry(
      { onHand: Number(pool.quantityOnHand ?? 0), reserved: Number(pool.quantityReserved ?? 0) },
      'CHANNEL_SALE',
      l.quantity,
    )
    if (!applied.ok) continue // reservation drift — reconcile via replayLedger, never block fulfillment
    await d('inventoryPool')
      ?.update?.({ where: { id: String(pool.id) }, data: { quantityOnHand: applied.next.onHand, quantityReserved: applied.next.reserved } })
      .catch(() => {})
    await d('inventoryLedger')
      ?.create?.({
        data: { poolId: String(pool.id), kind: 'CHANNEL_SALE', delta: -l.quantity, channelOrderId: row.id, note: `fulfilled ${row.externalOrderId}` },
      })
      .catch(() => {})
    touchedProducts.add(vlink.productId)
  }

  // Stock consumed → recompute alert state per product; notifies on escalation (C6.3).
  for (const pid of touchedProducts) await recomputeStockAlert(user.id, pid)

  await od.update({ where: { id: row.id }, data: { status: 'FULFILLED', statusReason: null, fulfilledAt: new Date() } })
  await d('channelSyncEvent')
    ?.create?.({
      data: {
        channelConnectionId: row.connection.id,
        direction: 'PUSH',
        topic: 'fulfillment.push',
        outcome: 'OK',
        detail: `${input.carrier.trim()} ${input.trackingNumber.trim()}`,
      },
    })
    .catch(() => {})
  await logAuditAs(user, {
    entityType: 'ChannelOrder',
    entityId: row.id,
    action: 'CHANNEL_ORDER_FULFILLED',
    payload: { carrier: input.carrier.trim(), trackingNumber: input.trackingNumber.trim() },
  })
  return { ok: true }
}

/** Cancel a not-yet-fulfilled channel order: releases bulk reservations back to
 *  available (RELEASE ledger) and closes the FSM leg. */
export async function cancelChannelOrder(channelOrderId: string, reason?: string): Promise<FulfillResult> {
  const user = await requireUser()
  const od = d('channelOrder')
  if (!od?.findFirst || !od.update) return { ok: false, error: 'Channel-order tables not migrated yet.' }
  const row = (await od
    .findFirst({
      where: { id: channelOrderId, connection: { creatorUserId: user.id } },
      select: { id: true, status: true, externalOrderId: true },
    })
    .catch(() => null)) as { id: string; status: string; externalOrderId: string } | null
  if (!row) return { ok: false, error: 'Order not found.' }
  if (['FULFILLED', 'CLOSED', 'CANCELLED'].includes(row.status)) {
    return { ok: false, error: `Order is ${row.status} — cannot cancel.` }
  }

  // Release reservations this order holds (ledger provenance query).
  const reservations =
    (await (
      prisma as unknown as {
        inventoryLedger?: { findMany: (a: unknown) => Promise<Array<{ poolId: string; delta: number }>> }
      }
    ).inventoryLedger
      ?.findMany({ where: { channelOrderId: row.id, kind: 'RESERVATION' }, select: { poolId: true, delta: true } })
      .catch(() => [])) ?? []
  const releasedProducts = new Set<string>()
  for (const r of reservations) {
    const pool = await d('inventoryPool')
      ?.findFirst?.({ where: { id: r.poolId }, select: { id: true, productId: true, quantityOnHand: true, quantityReserved: true } })
      .catch(() => null)
    if (!pool) continue
    const applied = applyLedgerEntry(
      { onHand: Number(pool.quantityOnHand ?? 0), reserved: Number(pool.quantityReserved ?? 0) },
      'RELEASE',
      Math.abs(r.delta),
    )
    if (!applied.ok) continue
    await d('inventoryPool')?.update?.({ where: { id: r.poolId }, data: { quantityReserved: applied.next.reserved } }).catch(() => {})
    await d('inventoryLedger')
      ?.create?.({ data: { poolId: r.poolId, kind: 'RELEASE', delta: -Math.abs(r.delta), channelOrderId: row.id, note: 'cancelled' } })
      .catch(() => {})
    if (typeof pool.productId === 'string') releasedProducts.add(pool.productId)
  }

  // Stock released → recompute; a release can be the recovery back to HEALTHY (C6.3).
  for (const pid of releasedProducts) await recomputeStockAlert(user.id, pid)

  await od.update({
    where: { id: row.id },
    data: { status: 'CANCELLED', statusReason: reason?.trim().slice(0, 300) || 'Cancelled by creator' },
  })
  await logAuditAs(user, {
    entityType: 'ChannelOrder',
    entityId: row.id,
    action: 'CHANNEL_ORDER_CANCELLED',
    payload: { externalOrderId: row.externalOrderId, reason: reason ?? null, reservationsReleased: reservations.length },
  })
  return { ok: true }
}
