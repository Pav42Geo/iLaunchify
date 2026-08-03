// Auto-cancel dispatches that partners didn't accept in time.
//
// Pattern: a scheduled job (Vercel Cron or external scheduler) hits
// /api/cron/auto-cancel-dispatches once per minute. That route calls
// runAutoCancel() which:
//   1. Finds OrderDispatch rows where status=PENDING_ACCEPT and
//      acceptDeadlineAt < now()
//   2. Updates them to TIMED_OUT in a single transaction per row
//   3. Writes a SYSTEM-actor audit log entry for each
//
// We process one row at a time (small transactions) so a single bad row
// doesn't block the entire batch. The result tells the caller how many
// dispatches were affected and whether any failed.
//
// V1.5+: when a dispatch times out, we should re-route to the next-best
// partner. For V1 we just mark it timed out and let admin handle manually.

import { reverseTemplateInventory } from './template-inventory-db'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import { assertOrderTransition } from './order-fsm'

export interface AutoCancelResult {
  scanned: number
  cancelled: number
  failed: number
  failures: Array<{ dispatchId: string; error: string }>
}

export async function runAutoCancel(): Promise<AutoCancelResult> {
  const now = new Date()
  // `delayProposedAt: null` excludes dispatches awaiting a creator decision on a
  // partner-proposed delivery delay (docs/ROUTING_BINDING_MODEL.md §7) — those are
  // waiting on the creator, not the partner, so they must not auto-cancel. Cast-
  // guarded: the proposal columns ship with a pending migration.
  const candidates = await (prisma as unknown as {
    orderDispatch: {
      findMany: (a: unknown) => Promise<Array<{ id: string; orderId: string; type: string; acceptDeadlineAt: Date | null; partnerServiceId: string }>>
    }
  }).orderDispatch.findMany({
    where: {
      status: 'PENDING_ACCEPT',
      acceptDeadlineAt: { lt: now },
      delayProposedAt: null,
    },
    select: { id: true, orderId: true, type: true, acceptDeadlineAt: true, partnerServiceId: true },
    take: 200, // safety cap; if there's ever a backlog larger than this, alert
  })

  const result: AutoCancelResult = {
    scanned: candidates.length,
    cancelled: 0,
    failed: 0,
    failures: [],
  }

  for (const d of candidates) {
    try {
      // Concurrency guard: re-check status inside the update so we don't
      // flip a row a partner accepted between findMany and update.
      const update = await prisma.orderDispatch.updateMany({
        where: { id: d.id, status: 'PENDING_ACCEPT' },
        data: { status: 'TIMED_OUT' },
      })
      if (update.count === 0) {
        // A partner accepted in the gap. Not a failure.
        continue
      }

      await logSystemAudit({
        entityType: 'OrderDispatch',
        entityId: d.id,
        action: 'DISPATCH_AUTO_CANCEL',
        fromValue: 'PENDING_ACCEPT',
        toValue: 'TIMED_OUT',
        payload: {
          orderId: d.orderId,
          partnerServiceId: d.partnerServiceId,
          acceptDeadlineAt: d.acceptDeadlineAt?.toISOString() ?? null,
          cancelledAt: now.toISOString(),
        },
      })

      // Escalate the parent order so a timed-out dispatch doesn't strand it
      // silently in ROUTING — the cold-start failure mode (few partners, one
      // ghosts the accept window). Conservative V1: route to ON_HOLD for admin
      // manual handling, NOT auto-cancel — a no-response is softer than an
      // explicit decline, and at cold-start ops wants to nudge / extend / reroute
      // rather than kill the order. FSM-safe (ROUTING/IN_FULFILLMENT → ON_HOLD)
      // and race-guarded by the status filter; only the FIRST timed-out dispatch
      // of an order escalates (the sibling sees ON_HOLD and no-ops).
      const escalated = await prisma.order.updateMany({
        where: { id: d.orderId, status: { in: ['ROUTING', 'IN_FULFILLMENT'] } },
        data: {
          status: 'ON_HOLD',
          internalNotes: `Dispatch ${d.type} timed out (no partner response by ${d.acceptDeadlineAt?.toISOString() ?? 'deadline'}) — needs manual routing`,
        },
      })
      if (escalated.count > 0) {
        await logSystemAudit({
          entityType: 'Order',
          entityId: d.orderId,
          action: 'ORDER_ON_HOLD_DISPATCH_TIMEOUT',
          toValue: 'ON_HOLD',
          payload: { dispatchId: d.id, dispatchType: d.type, partnerServiceId: d.partnerServiceId, at: now.toISOString() },
        })
      }

      result.cancelled++
    } catch (err) {
      result.failed++
      result.failures.push({
        dispatchId: d.id,
        error: (err as Error).message,
      })
    }
  }

  return result
}

// -----------------------------------------------------------------------------
// Stale unpaid-order auto-cancel — the consumer for OrderSettings.autoCancelAfterHours.
//
// Distinct from the dispatch accept-timeout above: this sweeps orders that never
// got PAID (abandoned checkout, failed/expired Stripe session) and have sat in
// PENDING_PAYMENT past the admin-tuned window. There's no Stripe
// `checkout.session.expired` handler, so without this they linger forever. Safe
// because a PENDING_PAYMENT order has no money captured and no dispatches created;
// PENDING_PAYMENT → CANCELLED is an allowed FSM transition.
// -----------------------------------------------------------------------------

/** Pure: has the order sat unpaid at least `autoCancelAfterHours`? */
export function isOrderStale(createdAt: Date, now: Date, autoCancelAfterHours: number): boolean {
  return now.getTime() - createdAt.getTime() >= autoCancelAfterHours * 60 * 60 * 1000
}

export interface StaleOrderCancelResult {
  /** The window applied (hours), echoed for observability. */
  autoCancelAfterHours: number
  scanned: number
  cancelled: number
  failed: number
  failures: Array<{ orderId: string; error: string }>
}

export async function runStaleOrderAutoCancel(): Promise<StaleOrderCancelResult> {
  const settings = await getOrderSettings()
  const hours = settings.autoCancelAfterHours
  const now = new Date()
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000)

  // Document + validate the transition up front (throws if the FSM ever changes
  // to disallow it) — the per-row updateMany below stays the atomic, race-safe
  // write, mirroring the dispatch sweep's concurrency guard.
  assertOrderTransition('PENDING_PAYMENT', 'CANCELLED')

  const candidates = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
    select: { id: true, createdAt: true },
    take: 200, // safety cap; alert if the unpaid backlog ever exceeds this
  })

  const result: StaleOrderCancelResult = {
    autoCancelAfterHours: hours,
    scanned: candidates.length,
    cancelled: 0,
    failed: 0,
    failures: [],
  }

  for (const o of candidates) {
    try {
      // Re-check status inside the write so we never cancel an order that got
      // PAID in the gap between findMany and update.
      const update = await prisma.order.updateMany({
        where: { id: o.id, status: 'PENDING_PAYMENT' },
        data: {
          status: 'CANCELLED',
          internalNotes: `Auto-cancelled: unpaid for over ${hours}h (created ${o.createdAt.toISOString()})`,
        },
      })
      if (update.count === 0) continue // paid (or already moved) in the gap — not a failure

      // I4 (MANUFACTURER_INVENTORY): put consumed manufacturer stock back for the
      // swept order (idempotent; best-effort — a failed reversal never fails the sweep).
      try {
        const item = await prisma.orderItem.findFirst({
          where: { orderId: o.id },
          select: { product: { select: { productTemplateId: true } } },
        })
        await reverseTemplateInventory(prisma, {
          productTemplateId: item?.product.productTemplateId ?? null,
          orderId: o.id,
        })
      } catch {
        /* reversal is best-effort */
      }

      await logSystemAudit({
        entityType: 'Order',
        entityId: o.id,
        action: 'ORDER_AUTO_CANCEL_UNPAID',
        fromValue: 'PENDING_PAYMENT',
        toValue: 'CANCELLED',
        payload: {
          createdAt: o.createdAt.toISOString(),
          autoCancelAfterHours: hours,
          cancelledAt: now.toISOString(),
        },
      })

      result.cancelled++
    } catch (err) {
      result.failed++
      result.failures.push({ orderId: o.id, error: (err as Error).message })
    }
  }

  return result
}
