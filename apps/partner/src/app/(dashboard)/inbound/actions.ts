'use server'

// WAREHOUSE (Fulfillment Center) inbound receipt confirmation.
// Phase L1.1c, upgraded for Partner Role Accounts P0 —
// docs/PARTNER_ROLE_ACCOUNTS.md §3.1.A (LOCKED 2026-07-02):
//
//   * D2 HARD GATE — lot number + expiry are required at receive time for every
//     lot-tracked line and IMMUTABLE afterwards (no backfill; corrections go
//     through a ReceivingDiscrepancy, never an edit).
//   * The receipt is a first-class InboundReceipt row (+ lines), no longer an
//     audit-log-only record. Audit rows remain the forensic trail.
//   * Short/over/damaged files a first-class ReceivingDiscrepancy (OPEN) that
//     the admin exceptions queue works — platform-mediated end to end.
//
// Guard: the acting user must own the WAREHOUSE service the order ships to
// (order.shipToPartnerService) — NOT the dispatch's producing service. Mirrors
// the sibling loadOwnedDispatch pattern in orders/[dispatchId]/actions.ts but
// on the receiving side of the shipment.

import { prisma, getOrderSettings } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertDispatchTransition } from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export interface ReceivedLine {
  orderItemId: string
  receivedQty: number
  /** Required when the line's variant is lot-tracked (D2). */
  lotNumber?: string
  /** ISO date (yyyy-mm-dd) — required when lot-tracked (D2). */
  lotExpiry?: string
}

export async function confirmInboundReceipt({
  dispatchId,
  received,
  discrepancyNote,
  damaged,
  confirmedChecklistKeys,
}: {
  dispatchId: string
  received: ReceivedLine[]
  discrepancyNote?: string
  damaged: boolean
  confirmedChecklistKeys: string[]
}): Promise<Result> {
  const user = await requireUser()

  const dispatch = await prisma.orderDispatch.findFirst({
    where: {
      id: dispatchId,
      order: {
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerService: { type: 'WAREHOUSE', partner: { userId: user.id } },
      },
    },
    select: {
      id: true,
      status: true,
      type: true,
      orderId: true,
      orderItemId: true,
      shipmentLegs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { palletCount: true },
      },
      order: {
        select: {
          orderNumber: true,
          shipToPartnerServiceId: true,
          shipToPartnerService: {
            select: {
              id: true,
              storageBillingUnit: true,
              storageRateCents: true,
              storageFreeGraceDays: true,
              storageMinMonthlyCents: true,
              pickFeeCents: true,
              packFeeCents: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
              product: {
                select: {
                  name: true,
                  internalSku: true,
                  variant: { select: { lotTracking: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!dispatch) return { ok: false, error: 'Inbound shipment not found' }

  if (dispatch.status !== 'SHIPPED' && dispatch.status !== 'IN_TRANSIT') {
    return { ok: false, error: `Cannot confirm receipt from ${dispatch.status}` }
  }
  // Dispatch FSM guard (@ilaunchify/orders) — never an unchecked status write.
  assertDispatchTransition(dispatch.status, 'DELIVERED')

  // ---- Reconcile received vs expected (scoped to the dispatch's item when set) ----
  const expectedItems = dispatch.orderItemId
    ? dispatch.order.items.filter((i) => i.id === dispatch.orderItemId)
    : dispatch.order.items
  const expectedById = new Map(expectedItems.map((i) => [i.id, i]))

  if (received.length !== expectedItems.length) {
    return { ok: false, error: 'Received quantities must cover every expected line.' }
  }
  for (const line of received) {
    const expected = expectedById.get(line.orderItemId)
    if (!expected) return { ok: false, error: 'Received line does not match an expected item.' }
    if (!Number.isInteger(line.receivedQty) || line.receivedQty < 0) {
      return { ok: false, error: 'Received quantities must be whole numbers of 0 or more.' }
    }
    // D2 HARD GATE — server-side, mirrors the form. Conservative default:
    // lot-track unless the variant explicitly opted out.
    const lotTracked = expected.product.variant?.lotTracking !== false
    if (lotTracked && line.receivedQty > 0) {
      const lot = line.lotNumber?.trim() ?? ''
      const expiry = line.lotExpiry?.trim() ?? ''
      if (lot.length === 0 || expiry.length === 0) {
        return {
          ok: false,
          error: `Lot number and expiry date are required for ${expected.product.name} — they cannot be added after confirmation.`,
        }
      }
      if (lot.length > 64) {
        return { ok: false, error: 'Lot numbers must be 64 characters or fewer.' }
      }
      if (Number.isNaN(new Date(expiry).getTime())) {
        return { ok: false, error: 'Lot expiry must be a valid date.' }
      }
    }
  }
  const note = discrepancyNote?.trim() || null
  if (note && note.length > 1000) {
    return { ok: false, error: 'Discrepancy note must be 1000 characters or fewer.' }
  }

  const discrepancies = received
    .map((line) => {
      const expected = expectedById.get(line.orderItemId)
      if (!expected) return null
      return {
        orderItemId: line.orderItemId,
        product: expected.product.name,
        sku: expected.product.internalSku,
        expected: expected.quantity,
        received: line.receivedQty,
        delta: line.receivedQty - expected.quantity,
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null && d.delta !== 0)
  const hasDiscrepancy = discrepancies.length > 0
  const filesDiscrepancy = hasDiscrepancy || damaged

  const fromStatus = dispatch.status
  const orderRef = dispatch.order.orderNumber ?? `#${dispatch.orderId.slice(-8)}`
  const totalReceived = received.reduce((s, l) => s + l.receivedQty, 0)
  const orderSettings = await getOrderSettings()

  let discrepancyId: string | null = null
  let openedAgreementId: string | null = null
  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    })

    // First-class, immutable receipt record (D2) — one per dispatch.
    await tx.inboundReceipt.create({
      data: {
        orderDispatchId: dispatch.id,
        receivedByUserId: user.id,
        damaged,
        note,
        checklistKeys: confirmedChecklistKeys,
        lines: {
          create: received.map((line) => {
            const expected = expectedById.get(line.orderItemId)
            return {
              orderItemId: line.orderItemId,
              expectedQty: expected?.quantity ?? 0,
              receivedQty: line.receivedQty,
              lotNumber: line.lotNumber?.trim() || null,
              lotExpiryAt: line.lotExpiry ? new Date(line.lotExpiry) : null,
            }
          }),
        },
      },
    })

    if (filesDiscrepancy) {
      const row = await tx.receivingDiscrepancy.create({
        data: {
          orderDispatchId: dispatch.id,
          linesJson: discrepancies,
          damaged,
          note,
          openedByUserId: user.id,
        },
        select: { id: true },
      })
      discrepancyId = row.id
    }

    // FC storage agreement (P1 seam fix, docs/PARTNER_ROLE_ACCOUNTS.md §3.1.B):
    // WAREHOUSE_PARTNER orders open their StorageAgreement HERE — at the
    // physical receipt — not at checkout (mirrors the HOLD comment: "the clock
    // legally starts when the finished run lands in storage"). Fee schedule is
    // snapshotted from the FC's rates at receipt (legal reproducibility;
    // known V1 caveat: rates shown at checkout could differ if the FC
    // repriced in transit — flagged in the doc). Idempotent: one agreement
    // per (order, FC service); balance = what was actually RECEIVED.
    const fcService = dispatch.order.shipToPartnerService
    if (fcService && totalReceived > 0) {
      const existing = await tx.storageAgreement.findFirst({
        where: { orderId: dispatch.orderId, partnerServiceId: fcService.id },
        select: { id: true },
      })
      if (!existing) {
        const agreement = await tx.storageAgreement.create({
          data: {
            orderId: dispatch.orderId,
            partnerServiceId: fcService.id,
            mode: 'STOCK_RELEASE', // V1 default — ON_DEMAND arrives with channel rails (C-phases)
            status: 'ACTIVE',
            startedAt: new Date(),
            unitsRemaining: totalReceived,
            palletsRemaining: dispatch.shipmentLegs[0]?.palletCount ?? null,
            feeSnapshotJson: {
              billingUnit: fcService.storageBillingUnit ?? 'PALLET_MONTH',
              rateCents: fcService.storageRateCents ?? 0,
              graceDays: fcService.storageFreeGraceDays ?? 0,
              minMonthlyCents: fcService.storageMinMonthlyCents ?? 0,
              pickFeeCents: fcService.pickFeeCents ?? 0,
              packFeeCents: fcService.packFeeCents ?? 0,
              referralFeeBps: orderSettings.warehouseReferralFeeBps,
            } as unknown as object,
          },
          select: { id: true },
        })
        openedAgreementId = agreement.id
      }
    }

    // Mirror markDelivered: when every dispatch has landed, advance the Order.
    const remaining = await tx.orderDispatch.count({
      where: { orderId: dispatch.orderId, status: { not: 'DELIVERED' } },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      })
    }
  })

  if (openedAgreementId) {
    await logAuditAs(user, {
      entityType: 'StorageAgreement',
      entityId: openedAgreementId,
      action: 'STORAGE_AGREEMENT_OPENED_AT_RECEIPT',
      payload: {
        orderId: dispatch.orderId,
        unitsReceived: totalReceived,
        palletCount: dispatch.shipmentLegs[0]?.palletCount ?? null,
      },
    })
  }

  const auditPayload = {
    orderId: dispatch.orderId,
    type: dispatch.type,
    expected: expectedItems.map((i) => ({
      orderItemId: i.id,
      product: i.product.name,
      sku: i.product.internalSku,
      quantity: i.quantity,
    })),
    received: received.map((l) => ({
      orderItemId: l.orderItemId,
      quantity: l.receivedQty,
      lotNumber: l.lotNumber?.trim() || null,
      lotExpiry: l.lotExpiry || null,
    })),
    discrepancyNote: note,
    damaged,
    checklist: confirmedChecklistKeys,
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'INBOUND_RECEIPT_CONFIRMED',
    fromValue: fromStatus,
    toValue: 'DELIVERED',
    payload: auditPayload,
  })

  if (filesDiscrepancy) {
    // Second audit row flags the short/over/damage explicitly so the admin
    // discrepancy trail is queryable without unpacking every receipt payload.
    await logAuditAs(user, {
      entityType: 'OrderDispatch',
      entityId: dispatch.id,
      action: 'INBOUND_RECEIPT_DISCREPANCY',
      payload: {
        orderId: dispatch.orderId,
        discrepancyId,
        discrepancies,
        damaged,
        discrepancyNote: note,
      },
    })

    // Tell admins — RECEIVING_DISCREPANCY_OPENED lands in the exceptions queue
    // (best-effort fan-out; the dispatcher never throws). Platform-mediated:
    // the creator hears from iLaunchify after adjudication, not from the FC.
    const summaryParts = [
      ...discrepancies.map((d) => `${d.product}: expected ${d.expected}, received ${d.received}.`),
      ...(damaged ? ['Damage reported on arrival.'] : []),
    ]
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.allSettled(
      admins.map((a) =>
        dispatchNotification({
          userId: a.id,
          // Cast until `pnpm db:generate` picks up the P0 enum additions
          // (same pattern as orderNumber post-dating the generated client).
          event: 'RECEIVING_DISCREPANCY_OPENED' as NotificationEvent,
          data: {
            orderRef,
            summary: summaryParts.join(' ').slice(0, 400),
            href: `/orders/${dispatch.orderId}`,
          },
          audience: 'admin',
        }),
      ),
    )
  }

  revalidatePath('/inbound')
  revalidatePath(`/inbound/${dispatchId}`)
  return { ok: true }
}
