'use server'

// L1.2b — admin order-detail logistics actions
// (docs/LOGISTICS_AND_FULFILLMENT.md §5 + §9 admin + L8 "admin can hard-pin").
//
//   • overrideFulfillmentCenter — hard-pin the order's FC. Eligibility is
//     RECOMPUTED server-side (rankWarehousesForOrder — never trust the client);
//     ineligible picks need an explicit confirm flag + reason. Blocked once any
//     dispatch has goods moving (SHIPPED/IN_TRANSIT/DELIVERED). Writes an
//     FcAwardLog row (override-tagged) + AuditLog 'FC_OVERRIDDEN'.
//   • closeStorageAgreement — close a HOLD_AT_MANUFACTURER agreement. Free when
//     unitsRemaining = 0; otherwise confirm + reason. AuditLog
//     'STORAGE_AGREEMENT_CLOSED'. Billing execution stays gated behind the
//     payments-verification checklist — closing only stops the accrual clock.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { buildAwardLogPayload } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'
import { rankWarehousesForOrder } from './logistics-data'

type Result = { ok: true } | { ok: false; error: string }

/** Dispatch statuses meaning goods have left the facility — FC override is
 *  meaningless (or actively harmful) once freight is moving to the old node. */
const GOODS_MOVING = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED']

export async function overrideFulfillmentCenter({
  orderId,
  partnerServiceId,
  reason,
  confirmIneligible,
}: {
  orderId: string
  partnerServiceId: string
  /** Required (logged) when pinning an ineligible node; optional otherwise. */
  reason?: string
  /** Explicit acknowledgement that the pick fails Phase-1 hard eligibility. */
  confirmIneligible?: boolean
}): Promise<Result> {
  const admin = await requireCapability('orders:write')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shipToType: true,
      shipToPartnerServiceId: true,
      dispatches: { select: { status: true } },
    },
  })
  if (!order) return { ok: false, error: 'Order not found.' }
  if (order.shipToType !== 'WAREHOUSE_PARTNER') {
    return { ok: false, error: 'This order does not ship to a fulfillment center.' }
  }
  if (order.dispatches.some((d) => GOODS_MOVING.includes(d.status))) {
    return {
      ok: false,
      error:
        'Goods are already moving (a dispatch is shipped/in transit/delivered) — the fulfillment center can no longer be changed.',
    }
  }
  if (order.shipToPartnerServiceId === partnerServiceId) {
    return { ok: false, error: 'That fulfillment center is already assigned.' }
  }

  const target = await prisma.partnerService.findFirst({
    where: { id: partnerServiceId, type: 'WAREHOUSE', status: 'ACTIVE' },
    include: { partner: true },
  })
  if (!target) return { ok: false, error: 'Warehouse partner unavailable.' }

  // Recompute live eligibility — the L8 hard-pin may knowingly cross it, but
  // never silently (confirm + reason are required for an ineligible pick).
  const ranking = await rankWarehousesForOrder(orderId)
  const targetRanked = ranking.ranked.find((r) => r.candidate.partnerServiceId === partnerServiceId) ?? null
  const trimmedReason = reason?.trim() || null
  if (!targetRanked?.eligible) {
    if (!confirmIneligible) {
      return {
        ok: false,
        error: `This node is ineligible (${targetRanked?.exclusionReason ?? 'not in the candidate set'}) — confirm the override to proceed.`,
      }
    }
    if (!trimmedReason) {
      return { ok: false, error: 'A reason is required when pinning an ineligible fulfillment center.' }
    }
  }

  const previousPartnerServiceId = order.shipToPartnerServiceId

  // Award-log payload: the standard explainability shape, winner = the admin's
  // pick, tagged as an override so the rotation-fairness reader can tell a
  // hard-pin from an algorithmic award.
  const scoreJson = {
    ...buildAwardLogPayload({ winner: targetRanked, ranked: ranking.ranked }),
    winner: partnerServiceId, // hard-pin wins even when ranked ineligible
    override: true,
    reason: trimmedReason,
    adminId: admin.id,
  }

  await prisma.$transaction([
    // Snapshot the new node's facility address onto the order (same snapshot
    // shape the checkout resolveShipTo writes) so the manifest ship-to follows.
    prisma.order.update({
      where: { id: orderId },
      data: {
        shipToPartnerServiceId: target.id,
        shipToContactName: target.partner.companyName,
        shipToContactPhone: target.partner.contactPhone,
        shipToAddressLine1: target.partner.addressLine1 ?? 'Address on file',
        shipToAddressLine2: target.partner.addressLine2,
        shipToCity: target.partner.city ?? 'Unknown',
        shipToState: target.partner.state,
        shipToPostalCode: target.partner.postalCode ?? '00000',
        shipToCountry: target.partner.country,
      },
    }),
    prisma.fcAwardLog.create({
      data: {
        partnerServiceId: target.id,
        orderId,
        scoreJson: scoreJson as unknown as object,
      },
    }),
  ])

  await logAuditAs(admin, {
    entityType: 'Order',
    entityId: orderId,
    action: 'FC_OVERRIDDEN',
    fromValue: previousPartnerServiceId,
    toValue: target.id,
    payload: {
      reason: trimmedReason,
      ineligiblePick: !targetRanked?.eligible,
      exclusionReason: targetRanked?.exclusionReason ?? (targetRanked ? null : 'not in the candidate set'),
      distanceMiles: targetRanked?.distanceMiles ?? null,
    },
  })

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function closeStorageAgreement({
  agreementId,
  orderId,
  reason,
  confirm,
}: {
  agreementId: string
  orderId: string
  /** Required (with confirm) when closing while units remain in storage. */
  reason?: string
  /** Explicit acknowledgement when unitsRemaining > 0. */
  confirm?: boolean
}): Promise<Result> {
  const admin = await requireCapability('orders:write')

  const agreement = await prisma.storageAgreement.findUnique({
    where: { id: agreementId },
    select: { id: true, orderId: true, status: true, unitsRemaining: true },
  })
  if (!agreement || agreement.orderId !== orderId) {
    return { ok: false, error: 'Storage agreement not found on this order.' }
  }
  if (agreement.status === 'CLOSED') {
    return { ok: false, error: 'This agreement is already closed.' }
  }

  const trimmedReason = reason?.trim() || null
  if (agreement.unitsRemaining > 0) {
    if (!confirm) {
      return {
        ok: false,
        error: `${agreement.unitsRemaining.toLocaleString()} units are still in storage — confirm the close to proceed.`,
      }
    }
    if (!trimmedReason) {
      return { ok: false, error: 'A reason is required when closing with units still in storage.' }
    }
  }

  const endedAt = new Date()
  await prisma.storageAgreement.update({
    where: { id: agreement.id },
    data: { status: 'CLOSED', endedAt },
  })

  await logAuditAs(admin, {
    entityType: 'StorageAgreement',
    entityId: agreement.id,
    action: 'STORAGE_AGREEMENT_CLOSED',
    fromValue: agreement.status,
    toValue: 'CLOSED',
    payload: {
      orderId,
      unitsRemaining: agreement.unitsRemaining,
      reason: trimmedReason,
      endedAt: endedAt.toISOString(),
    },
  })

  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}
