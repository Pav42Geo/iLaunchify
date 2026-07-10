'use server'

// C2.2a — route a READY channel order into the PRODUCTION pipeline.
//
// The safe money-path slice: this reuses the EXISTING checkout billing rail
// (order @ PENDING_PAYMENT + Stripe Checkout session) rather than off-session
// auto-charging. "Route & pay" creates the production order(s), links them to
// the ChannelOrder (ROUTED), and hands back the Stripe URL. Full auto-charge
// (LOCKED decision #1's per-order charge with daily cap) is C2.2b, gated on
// STRIPE_TESTMODE_VERIFICATION per the payments-readiness discipline.
//
// Ship-to: the CONSUMER address rides the order's ship-to fields. The locked
// logistics enum has no DIRECT_CONSUMER value yet — we mark origin in
// internalNotes and flag the enum addition to the logistics workstream.

import { prisma } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
import { resolveCreatorFeeBps, resolveCreatorFeeBounds, creatorFeeCents } from '@ilaunchify/plans'
import { logAuditAs } from '@ilaunchify/audit'
import { createOrderWithNumber, assertOrderTransition } from '@ilaunchify/orders'
import { createCheckoutSession } from '@ilaunchify/payments'
import { resolveChannelAdapter, applyLedgerEntry, type ChannelCode } from '@ilaunchify/channels'
import { recomputeStockAlert } from '../inventory/alerts'


type AnyDelegate = {
  findFirst?: (a: unknown) => Promise<Record<string, unknown> | null>
  update?: (a: unknown) => Promise<unknown>
  create?: (a: unknown) => Promise<Record<string, unknown>>
}
const d = (name: string): AnyDelegate | null => ((prisma as unknown as Record<string, AnyDelegate | undefined>)[name] ?? null)

export type RouteResult = { ok: true; checkoutUrl: string | null; orderIds: string[] } | { ok: false; error: string }

interface ShipTo {
  name?: string
  address1?: string
  address2?: string
  city?: string
  provinceCode?: string
  postalCode?: string
  countryCode?: string
  phone?: string
}

/** Route ONE ready channel order: create production order(s) + payment session. */
export async function routeChannelOrderToProduction(channelOrderId: string): Promise<RouteResult> {
  const user = await requireUser()
  // Creator tier fee for this batch (FEE_MODEL_RECONCILIATION_SPEC 2026-07-09) — same
  // SSOT as checkout; resolved once, reused per order. Retires the hardcoded 5%.
  const creatorTier = await getCreatorTier(user.id)
  const creatorFee = await resolveCreatorFeeBps(creatorTier)
  const creatorFeeBounds = await resolveCreatorFeeBounds(creatorTier)
  const od = d('channelOrder')
  if (!od?.findFirst || !od.update) return { ok: false, error: 'Channel-order tables not migrated yet.' }

  const row = (await od
    .findFirst({
      where: { id: channelOrderId, connection: { creatorUserId: user.id } },
      include: { lines: true, connection: { select: { id: true, channel: { select: { code: true } } } } },
    })
    .catch(() => null)) as
    | ({
        id: string
        status: string
        manualConfirmRequired: boolean
        externalOrderId: string
        shipToJson: ShipTo | null
        productionOrderId: string | null
        connection: { id: string; channel: { code: string } }
        lines: Array<{ id: string; channelVariantLinkId: string | null; quantity: number }>
      } & Record<string, unknown>)
    | null
  if (!row) return { ok: false, error: 'Order not found.' }
  if (row.status !== 'READY') return { ok: false, error: `Order is ${row.status}, not READY.` }
  if (row.manualConfirmRequired) return { ok: false, error: 'Approve the order first (manual-confirm is on).' }
  if (row.productionOrderId) return { ok: false, error: 'Already routed.' }

  // Resolve lines → products via variant links; group quantities per product.
  const vlinkIds = row.lines.map((l) => l.channelVariantLinkId).filter((x): x is string => !!x)
  if (vlinkIds.length !== row.lines.length) return { ok: false, error: 'Unmapped lines — resolve them first.' }
  const vlinks = (await (
    prisma as unknown as {
      channelVariantLink: { findMany: (a: unknown) => Promise<Array<{ id: string; productId: string }>> }
    }
  ).channelVariantLink.findMany({ where: { id: { in: vlinkIds } }, select: { id: true, productId: true } })) as Array<{
    id: string
    productId: string
  }>
  const productIdByLink = new Map(vlinks.map((v) => [v.id, v.productId]))
  const qtyByProduct = new Map<string, number>()
  for (const l of row.lines) {
    const pid = productIdByLink.get(l.channelVariantLinkId!)
    if (!pid) return { ok: false, error: 'A line lost its product mapping — re-sync and retry.' }
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + l.quantity)
  }

  const ship = row.shipToJson
  if (!ship?.address1 || !ship.city || !ship.postalCode || !ship.countryCode) {
    return { ok: false, error: 'The channel order has no complete consumer ship-to address.' }
  }

  // MONEY-PATH GUARD (review 2026-07-02): one Checkout session pays ONE order.
  // Multi-product channel orders would strand orders 2..n unpaid — V1 routes
  // single-product orders only; multi-product splitting lands with C2.2b.
  if (qtyByProduct.size > 1) {
    return {
      ok: false,
      error: 'This order spans multiple products — per-product routing for mixed orders arrives with auto-billing. Contact support to split it.',
    }
  }

  // CONCURRENCY GUARD: atomically claim the order (READY + unrouted → ROUTED)
  // so a double-click can't create duplicate production orders. If anything
  // below fails, we release the claim back to READY.
  const claimed = (await (
    prisma as unknown as { channelOrder: { updateMany: (a: unknown) => Promise<{ count: number }> } }
  ).channelOrder.updateMany({
    where: { id: row.id, status: 'READY', productionOrderId: null },
    data: { status: 'ROUTED', statusReason: 'Routing…' },
  })) as { count: number }
  if (claimed.count !== 1) return { ok: false, error: 'This order is already being routed.' }
  const releaseClaim = async (reason: string) => {
    await od.update?.({ where: { id: row.id }, data: { status: 'READY', statusReason: reason } }).catch(() => {})
  }

  // One production order per product (dispatch model is per-order/per-service).
  const orderIds: string[] = []
  let firstCheckoutUrl: string | null = null
  for (const [productId, qty] of qtyByProduct) {
    const product = await prisma.product.findFirst({
      where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
      select: {
        id: true,
        name: true,
        priceCents: true,
        brandId: true,
        brand: { select: { name: true } },
        productTemplate: { select: { manufacturerServiceId: true } },
      },
    })
    if (!product) {
      await releaseClaim('Routing failed: product not found for a mapped line.')
      return { ok: false, error: 'Product not found for a mapped line.' }
    }
    const manufacturerServiceId = product.productTemplate?.manufacturerServiceId
    if (!manufacturerServiceId) {
      await releaseClaim(`Routing failed: ${product.name} has no pinned manufacturer.`)
      return { ok: false, error: `${product.name} has no pinned manufacturer.` }
    }

    const subtotalCents = product.priceCents * qty
    const totalCents = subtotalCents // shipping/tax legs land with the logistics rail
    // Channel reorders use the SAME creator tier fee as checkout (base = subtotal;
    // channel orders have no FC-labeling/shipping legs at this stage).
    const platformFeeCents = creatorFeeCents(subtotalCents, creatorFee.feeBps, creatorFeeBounds)

    const order = await createOrderWithNumber(async (orderNumber) => {
      const created = await prisma.order.create({
        data: {
          orderNumber,
          brandId: product.brandId,
          creatorUserId: user.id,
          status: 'PENDING_PAYMENT',
          subtotalCents,
          shippingCents: 0,
          taxCents: 0,
          totalCents,
          platformFeeBps: creatorFee.feeBps,
          platformFeeCents,
          platformFeeSource: creatorFee.source,
          manufacturerServiceId,
          shipToType: 'CREATOR_ADDRESS', // DIRECT_CONSUMER enum pending (logistics)
          shipToContactName: ship.name ?? 'Consumer',
          shipToContactPhone: ship.phone ?? null,
          shipToAddressLine1: ship.address1,
          shipToAddressLine2: ship.address2 ?? null,
          shipToCity: ship.city,
          shipToState: ship.provinceCode ?? null,
          shipToPostalCode: ship.postalCode,
          shipToCountry: ship.countryCode,
          internalNotes: `ORIGIN: CHANNEL (${row.connection.channel.code}) · consumer order ${row.externalOrderId} · ChannelOrder ${row.id} — ship DIRECT TO CONSUMER at the address on this order.`,
        } as Parameters<typeof prisma.order.create>[0]['data'],
      })
      await prisma.orderItem.create({
        data: {
          orderId: created.id,
          productId: product.id,
          quantity: qty,
          unitPriceCents: product.priceCents,
          totalCents: subtotalCents,
        } as Parameters<typeof prisma.orderItem.create>[0]['data'],
      })
      return created
    })
    orderIds.push(order.id)

    // Payment session on the EXISTING rail. Failure leaves the order at
    // PENDING_PAYMENT (auto-cancel policy sweeps stale ones) + surfaces why.
    if (!firstCheckoutUrl) {
      try {
        const session = await createCheckoutSession({
          orderId: order.id,
          brandId: product.brandId,
          creatorId: user.id,
          brandName: product.brand?.name ?? 'iLaunchify',
          successUrl: `${process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'}/channels/orders?paid=1`,
          cancelUrl: `${process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'}/channels/orders`,
          lineItems: [{ productName: `${product.name} (channel on-demand ×${qty})`, unitAmountCents: product.priceCents, quantity: qty }],
          applicationFeeCents: platformFeeCents,
        })
        firstCheckoutUrl = session.url
      } catch (err) {
        console.error('[channels] checkout session failed:', err)
        // Self-healing failure (review 2026-07-02): cancel the just-created
        // PENDING_PAYMENT order(s) and release the claim so "Route & pay" can be
        // retried cleanly — no stranded orders, no duplicate risk.
        for (const oid of orderIds) {
          // Best-effort per order — just-created PENDING_PAYMENT, so
          // PENDING_PAYMENT→CANCELLED is verified-legal; errors swallowed per order.
          try {
            assertOrderTransition('PENDING_PAYMENT', 'CANCELLED')
            await prisma.order.update({ where: { id: oid }, data: { status: 'CANCELLED' } as never })
            await logAuditAs(user, {
              entityType: 'Order',
              entityId: oid,
              action: 'ORDER_CANCELLED_CHANNEL_ROUTE_FAILED',
              fromValue: 'PENDING_PAYMENT',
              toValue: 'CANCELLED',
              payload: { reason: 'checkout_session_failed' },
            })
          } catch {
            /* leave the stale order for the auto-cancel sweep */
          }
        }
        await releaseClaim('Payment session failed — check Stripe configuration and retry.')
        return { ok: false, error: 'Payment session failed — check Stripe configuration and hit Route & pay again.' }
      }
    }
  }

  await od.update({
    where: { id: row.id },
    data: { status: 'ROUTED', statusReason: null, productionOrderId: orderIds[0] ?? null },
  })
  await d('channelSyncEvent')
    ?.create?.({
      data: {
        channelConnectionId: row.connection.id,
        direction: 'PUSH',
        topic: 'order.route',
        outcome: 'OK',
        detail: `→ ${orderIds.length} production order(s)`,
      },
    })
    .catch(() => {})
  await logAuditAs(user, {
    entityType: 'ChannelOrder',
    entityId: row.id,
    action: 'CHANNEL_ORDER_ROUTED',
    payload: { orderIds, externalOrderId: row.externalOrderId, channel: row.connection.channel.code },
  })
  return { ok: true, checkoutUrl: firstCheckoutUrl, orderIds }
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
