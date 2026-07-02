'use server'

// Partner-side dispatch transition actions.
// State machine (B6):
//   PENDING_ACCEPT → ACCEPTED → PRODUCING → QUALITY_CHECK → READY → SHIPPED → IN_TRANSIT → DELIVERED
// QC can be skipped (PRODUCING → READY directly) for low-risk batches.
// FAILED_QC ends in admin reroute.
//
// All transitions write to AuditLog + update per-state timestamps.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { recomputeAggregateApprovalStatus, assertDispatchTransition } from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'
import { uploadFile, deleteFile, partnerFileKey } from '@ilaunchify/storage'
import {
  SHIP_DOC_LABELS,
  PARTNER_UPLOADED_DOC_TYPES,
  type CoolantType,
  type ShipDocType,
} from '@ilaunchify/shipping'
import { revalidatePath } from 'next/cache'
import { getDispatchShippingContext } from './ship-requirements'
import {
  notifyDispatchAccepted,
  notifyChangesRequested,
  notifyDeclined,
  notifyWithdrawn,
} from './workflow-notifications'

type Result = { ok: true } | { ok: false; error: string }

async function loadOwnedDispatch(userId: string, dispatchId: string) {
  return prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: { partner: { userId } } },
    include: { order: true, partnerService: { include: { partner: true } } },
  })
}

export async function acceptDispatch({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return { ok: false, error: `Cannot accept from ${dispatch.status}` }
  }

  let aggregate: string = 'AWAITING_PARTNERS'
  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedManifestVersion: dispatch.manifestVersion,
      },
    })

    // Phase H — recompute aggregate approval gate. When all dispatches
    // have flowed past PENDING_ACCEPT into ACCEPTED-or-further, the
    // helper flips Order.aggregateApprovalStatus to FULLY_ACCEPTED;
    // here we mirror that into Order.status → IN_FULFILLMENT so the
    // existing fulfillment pipeline picks it up.
    aggregate = await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
    if (aggregate === 'FULLY_ACCEPTED') {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'IN_FULFILLMENT' },
      })
    }
  })

  // Phase H4 — notify creator. Best-effort; failures swallow.
  await notifyDispatchAccepted({
    dispatchId: dispatch.id,
    wasFinalGate: aggregate === 'FULLY_ACCEPTED',
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_ACCEPT',
    fromValue: 'PENDING_ACCEPT',
    toValue: 'ACCEPTED',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function declineDispatch({
  dispatchId,
  reason,
  notes,
}: {
  dispatchId: string
  reason: 'AT_CAPACITY' | 'CANNOT_FULFILL_SPEC' | 'PRICING_DISPUTE' | 'OTHER'
  notes?: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return { ok: false, error: `Cannot decline from ${dispatch.status}` }
  }

  // Phase H — manufacturer decline = order CANCELLED (recipe owner can't
  // be rerouted, per [[ilaunchify-orchestration-thesis]]). Other partner
  // types still go to ON_HOLD for admin manual reroute until #153 lands
  // marketplace auto-rerouting.
  const isManufacturerReject = dispatch.type === 'PRODUCT'

  // A manufacturer decline CANCELS a paid order — the creator is owed their money
  // back. Capture that as a structured PENDING SupportRefundRequest (lands in the
  // admin refund Inbox, which has the approve→executeOrderRefund action + approver
  // notifications) instead of relying on a free-text "refund needed" note that an
  // admin could miss. Only when money was actually captured (a dispatch exists ⇒ the
  // order was PAID, so a SUCCEEDED Charge should be present). Amount = the real
  // captured charge, not the order total.
  const paidCharge = isManufacturerReject
    ? await prisma.charge.findFirst({
        where: { orderId: dispatch.orderId, status: 'SUCCEEDED' },
        select: { amountCents: true },
      })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: reason,
        declineNotes: notes ?? null,
      },
    })
    if (isManufacturerReject) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'CANCELLED',
          aggregateApprovalStatus: 'CANCELLED',
          internalNotes: `Manufacturer declined (${reason}): ${notes ?? ''} — order cancelled, refund needed`,
        },
      })
      // Structured refund obligation (skipped if somehow unpaid — nothing to refund).
      if (paidCharge && paidCharge.amountCents > 0) {
        await tx.supportRefundRequest.create({
          data: {
            orderId: dispatch.orderId,
            requestedById: user.id,
            amountCents: paidCharge.amountCents,
            reason: `Manufacturer declined production (${reason}) — order auto-cancelled, full refund owed`,
          },
        })
      }
    } else {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'ON_HOLD',
          internalNotes: `Dispatch ${dispatch.type} declined by partner: ${reason} — needs reroute`,
        },
      })
      await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_DECLINE',
    fromValue: 'PENDING_ACCEPT',
    toValue: 'DECLINED',
    payload: { orderId: dispatch.orderId, type: dispatch.type, reason, notes },
  })

  // Phase H4 — notify creator (+ admin if manufacturer).
  await notifyDeclined({
    dispatchId: dispatch.id,
    reason: notes,
    isManufacturer: isManufacturerReject,
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

/**
 * Delay-accept (docs/ROUTING_BINDING_MODEL.md §7). The partner CAN make the order
 * but not by the quoted date — they propose a later delivery date instead of
 * declining. Status stays PENDING_ACCEPT (still not finally accepted) but carries
 * the proposal; auto-cancel SKIPS rows with a pending proposal. The creator then
 * approves (→ ACCEPTED on the revised date) or rejects (→ cancel + refund), handled
 * creator-side. Cast-guarded — proposal columns ship with a pending migration.
 */
export async function proposeDispatchDelay({
  dispatchId,
  proposedDeadlineAt,
  reason,
}: {
  dispatchId: string
  proposedDeadlineAt: string | Date
  reason?: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return { ok: false, error: `Cannot propose a delay from ${dispatch.status}` }
  }
  const revised = new Date(proposedDeadlineAt)
  if (Number.isNaN(revised.getTime())) return { ok: false, error: 'Invalid proposed date.' }
  if (revised.getTime() <= Date.now()) return { ok: false, error: 'The proposed date must be in the future.' }

  await (prisma as unknown as { orderDispatch: { update: (a: unknown) => Promise<unknown> } }).orderDispatch.update({
    where: { id: dispatch.id },
    data: { proposedDeadlineAt: revised, delayReason: reason ?? null, delayProposedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_DELAY_PROPOSED',
    payload: { orderId: dispatch.orderId, type: dispatch.type, proposedDeadlineAt: revised.toISOString(), reason: reason ?? null },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markProducing({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'ACCEPTED') {
    return { ok: false, error: `Cannot mark producing from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'PRODUCING', productionStartedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_PRODUCING',
    fromValue: 'ACCEPTED',
    toValue: 'PRODUCING',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function enterQualityCheck({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PRODUCING') {
    return { ok: false, error: `Cannot enter QC from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'QUALITY_CHECK', qualityCheckStartedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_QC_START',
    fromValue: 'PRODUCING',
    toValue: 'QUALITY_CHECK',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

// B.4 — partner-requested cancellation. Allowed mid-production (ACCEPTED /
// PRODUCING / QUALITY_CHECK); goes through CancellationRequest → admin review
// (PLATFORM_SPEC §B.4, locked 2026-05-19). Approval forfeits payment + strike;
// denial means the partner must fulfill — both handled at admin review.
export async function requestCancellation({
  dispatchId,
  reason,
}: {
  dispatchId: string
  reason: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (
    dispatch.status !== 'ACCEPTED' &&
    dispatch.status !== 'PRODUCING' &&
    dispatch.status !== 'QUALITY_CHECK'
  ) {
    return { ok: false, error: `Cannot request cancellation from ${dispatch.status}` }
  }
  const trimmed = reason.trim()
  if (trimmed.length < 5) return { ok: false, error: 'Please give a brief reason (5+ characters).' }

  const existing = await prisma.cancellationRequest.findFirst({
    where: { dispatchId: dispatch.id, status: 'PENDING_REVIEW' },
  })
  if (existing) return { ok: false, error: 'A cancellation request is already pending review.' }

  const req = await prisma.cancellationRequest.create({
    data: {
      orderId: dispatch.orderId,
      dispatchId: dispatch.id,
      requestedById: user.id,
      reason: trimmed,
      status: 'PENDING_REVIEW',
    },
  })

  await logAuditAs(user, {
    entityType: 'CancellationRequest',
    entityId: req.id,
    action: 'CANCELLATION_REQUESTED',
    payload: {
      orderId: dispatch.orderId,
      dispatchId: dispatch.id,
      dispatchStatus: dispatch.status,
      reason: trimmed,
    },
  })

  // Tell admins a partner cancellation request is waiting in /cancellations.
  // Reuses ORDER_NEEDS_ATTENTION (same pattern as the creator cancel path).
  // Best-effort — the dispatcher never throws.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await Promise.allSettled(
    admins.map((a) =>
      dispatchNotification({
        userId: a.id,
        event: 'ORDER_NEEDS_ATTENTION',
        data: { orderId: dispatch.orderId, status: 'CANCELLATION_REQUESTED' },
        audience: 'admin',
      }),
    ),
  )

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

// B.1 partner-response step — a partner on the order adds their side of a
// creator-opened quality dispute (once, while OPEN / UNDER_REVIEW). Moves the
// dispute to UNDER_REVIEW and notifies admins. OrderDispute is a pending-migration
// model → cast-guarded.
export async function respondToOrderDispute({
  disputeId,
  response,
}: {
  disputeId: string
  response: string
}): Promise<Result> {
  const user = await requireUser()
  const trimmed = response.trim()
  if (trimmed.length < 5) return { ok: false, error: 'Please add a brief response (5+ characters).' }
  if (trimmed.length > 2000) return { ok: false, error: 'Response must be 2000 characters or fewer.' }

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findUnique: (a: unknown) => Promise<{
          id: string
          orderId: string
          status: string
          partnerResponse: string | null
        } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).orderDispute

  const dispute = await disputeModel.findUnique({
    where: { id: disputeId },
    select: { id: true, orderId: true, status: true, partnerResponse: true },
  })
  if (!dispute) return { ok: false, error: 'Dispute not found.' }
  if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
    return { ok: false, error: 'This dispute is already closed.' }
  }
  if (dispute.partnerResponse) {
    return { ok: false, error: 'You already responded to this dispute.' }
  }

  // Confirm this partner is actually assigned to the disputed order.
  const owned = await prisma.orderDispatch.findFirst({
    where: { orderId: dispute.orderId, partnerService: { partner: { userId: user.id } } },
    select: { id: true },
  })
  if (!owned) return { ok: false, error: 'You are not assigned to this order.' }

  await disputeModel.update({
    where: { id: dispute.id },
    data: {
      partnerResponse: trimmed,
      partnerRespondedById: user.id,
      partnerRespondedAt: new Date(),
      status: 'UNDER_REVIEW',
    },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispute',
    entityId: dispute.id,
    action: 'ORDER_DISPUTE_PARTNER_RESPONDED',
    payload: { orderId: dispute.orderId },
  })

  // Tell admins the partner has responded (reuse ORDER_NEEDS_ATTENTION — admin link
  // /orders/[orderId] is correct in the admin app). Best-effort.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await Promise.allSettled(
    admins.map((a) =>
      dispatchNotification({
        userId: a.id,
        event: 'ORDER_NEEDS_ATTENTION',
        data: { orderId: dispute.orderId, status: 'DISPUTE_PARTNER_RESPONDED' },
        audience: 'admin',
      }),
    ),
  )

  revalidatePath(`/orders/${dispute.orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function failQualityCheck({
  dispatchId,
  notes,
}: { dispatchId: string; notes: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'QUALITY_CHECK') {
    return { ok: false, error: `Cannot fail QC from ${dispatch.status}` }
  }
  if (!notes?.trim()) {
    return { ok: false, error: 'QC failure notes are required' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'FAILED_QC',
        qualityCheckFailedAt: new Date(),
        qualityCheckFailureNotes: notes.trim(),
      },
    })
    // Park the order for admin reroute, mirroring the DECLINED → ON_HOLD pattern
    await tx.order.update({
      where: { id: dispatch.orderId },
      data: {
        status: 'ON_HOLD',
        internalNotes: `${dispatch.type} dispatch failed QC: ${notes.trim().slice(0, 200)}`,
      },
    })
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_QC_FAIL',
    fromValue: 'QUALITY_CHECK',
    toValue: 'FAILED_QC',
    payload: { orderId: dispatch.orderId, type: dispatch.type, notes },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markReady({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  // Allow READY from PRODUCING (skip QC) or QUALITY_CHECK (passed QC)
  if (dispatch.status !== 'PRODUCING' && dispatch.status !== 'QUALITY_CHECK') {
    return { ok: false, error: `Cannot mark ready from ${dispatch.status}` }
  }
  const fromStatus = dispatch.status
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'READY', readyAt: new Date() },
  })

  // If both dispatches READY (or further along), mark Order READY_TO_SHIP
  const remaining = await prisma.orderDispatch.count({
    where: {
      orderId: dispatch.orderId,
      status: { notIn: ['READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
    },
  })
  if (remaining === 0) {
    await prisma.order.update({
      where: { id: dispatch.orderId },
      data: { status: 'READY_TO_SHIP' },
    })
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_READY',
    fromValue: fromStatus,
    toValue: 'READY',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function shipDispatch({
  dispatchId,
  trackingCarrier,
  trackingNumber,
  sealNumber,
  coolantType,
  dryIceNetWeightGrams,
}: {
  dispatchId: string
  trackingCarrier?: string
  trackingNumber?: string
  /** Freight only — trailer seal recorded at loading (§1.1 delivery evidence). */
  sealNumber?: string
  /** CHILLED/FROZEN legs — data-driven; cold storage classes are admin-gated. */
  coolantType?: CoolantType
  /** Dry-ice net weight (g) — drives UN1845 marking; only with DRY_ICE coolant. */
  dryIceNetWeightGrams?: number
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'READY') {
    return { ok: false, error: `Cannot ship from ${dispatch.status}` }
  }
  assertDispatchTransition('READY', 'SHIPPED')

  // Phase L1.1 — required-document gate, re-evaluated SERVER-SIDE (the client
  // renders the same rule but is never trusted). A dispatch may not flip to
  // SHIPPED while a required partner-uploaded doc (COA/SDS/logger/washout)
  // is missing. docs/LOGISTICS_AND_FULFILLMENT.md §1.1.
  const shippingCtx = await getDispatchShippingContext(dispatch.id)
  if (!shippingCtx.gate.canShip) {
    const missing = shippingCtx.gate.missing.map((d) => SHIP_DOC_LABELS[d]).join(', ')
    return {
      ok: false,
      error: `Cannot mark shipped — required shipping documents are missing: ${missing}. Upload them in the Shipping requirements card first.`,
    }
  }

  if (dryIceNetWeightGrams != null) {
    if (coolantType !== 'DRY_ICE') {
      return { ok: false, error: 'Dry-ice net weight only applies with coolant type DRY_ICE.' }
    }
    if (!Number.isInteger(dryIceNetWeightGrams) || dryIceNetWeightGrams <= 0) {
      return { ok: false, error: 'Dry-ice net weight must be a positive whole number of grams.' }
    }
  }

  // Seal/coolant evidence provided → persist a ShipmentLeg alongside the
  // legacy BYO tracking fields (the tracking columns stay the fast path;
  // legs carry the custody/cold-chain evidence — schema comment on
  // OrderDispatch.shipmentLegs).
  const wantsLeg = Boolean(sealNumber?.trim() || (coolantType && coolantType !== 'NONE'))
  let shipmentLegId: string | null = null

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
        trackingCarrier: trackingCarrier || null,
        trackingNumber: trackingNumber || null,
      },
    })

    if (wantsLeg) {
      const leg = await tx.shipmentLeg.create({
        data: {
          orderDispatchId: dispatch.id,
          mode: shippingCtx.mode,
          status: 'PICKED_UP', // partner is confirming physical departure
          carrierName: trackingCarrier?.trim() || null,
          coolantType: coolantType ?? 'NONE',
          dryIceNetWeightGrams: dryIceNetWeightGrams ?? null,
          sealNumber: sealNumber?.trim() || null,
          trackingNumber: trackingNumber?.trim() || null,
          shippedAt: new Date(),
        },
      })
      shipmentLegId = leg.id
    }

    // Queue Transfer to partner (manufacturer paid when product ships,
    // print provider when label ships).
    const charge = await tx.charge.findFirst({ where: { orderId: dispatch.orderId } })
    if (charge) {
      const partner = dispatch.partnerService.partner
      await tx.transfer.create({
        data: {
          chargeId: charge.id,
          destinationStripeId: '',
          destinationUserId: partner.userId,
          destinationType: dispatch.type === 'PRODUCT' ? 'MANUFACTURER' : 'PRINT_PROVIDER',
          amountCents: dispatch.costCents,
          reason: dispatch.type === 'PRODUCT' ? 'PRODUCT_COST' : 'LABEL_COST',
          status: 'PENDING',
          scheduledFor: new Date(),
        },
      })
    }

    const remaining = await tx.orderDispatch.count({
      where: {
        orderId: dispatch.orderId,
        status: { notIn: ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
      },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'SHIPPED' },
      })
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_SHIPPED',
    fromValue: 'READY',
    toValue: 'SHIPPED',
    payload: {
      orderId: dispatch.orderId,
      type: dispatch.type,
      trackingCarrier: trackingCarrier ?? null,
      trackingNumber: trackingNumber ?? null,
      // L1.1 — gate evidence at flip time (which docs were required/uploaded).
      requiredDocs: shippingCtx.gate.required,
      shipmentLegId,
    },
  })

  if (shipmentLegId) {
    await logAuditAs(user, {
      entityType: 'ShipmentLeg',
      entityId: shipmentLegId,
      action: 'SHIPMENT_LEG_CREATED',
      toValue: 'PICKED_UP',
      payload: {
        orderId: dispatch.orderId,
        dispatchId: dispatch.id,
        mode: shippingCtx.mode,
        coolantType: coolantType ?? 'NONE',
        dryIceNetWeightGrams: dryIceNetWeightGrams ?? null,
        sealNumber: sealNumber?.trim() || null,
      },
    })
  }

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

// =============================================================================
// Phase L1.1b — shipping documents (docs/LOGISTICS_AND_FULFILLMENT.md §1.1 + §9)
// =============================================================================
//
// Partner-uploaded evidence (COA / SDS / temp-logger / washout cert) gates the
// READY → SHIPPED transition; QC photos are optional checklist evidence.
// Upload mechanism reuses the certifications pattern exactly: R2 upload via
// @ilaunchify/storage + a PartnerFile row; ShipmentDocument.assetId stores the
// PartnerFile id (soft FK, same convention as bundleAssetId). Downloads go
// through /api/ship-doc/[fileId] (ownership-checked signed-URL redirect).

const SHIP_DOC_UPLOAD_MAX_BYTES = 20 * 1024 * 1024 // 20 MB (certifications parity)
// PDF/images for certs + QC photos; CSV for temperature-logger exports.
const SHIP_DOC_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
])
const UPLOADABLE_SHIP_DOC_TYPES: ShipDocType[] = [...PARTNER_UPLOADED_DOC_TYPES, 'QC_PHOTO']
// Docs can land any time after acceptance; logger files are often extracted
// after delivery, so post-ship uploads stay open (deletes lock instead).
const SHIP_DOC_UPLOAD_STATUSES = new Set([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
])

export async function uploadShipmentDocument(formData: FormData): Promise<Result> {
  const user = await requireUser()

  const dispatchId = String(formData.get('dispatchId') ?? '')
  const rawType = String(formData.get('type') ?? '')
  const lotNumbersRaw = String(formData.get('lotNumbers') ?? '')
  const file = formData.get('file')

  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (!SHIP_DOC_UPLOAD_STATUSES.has(dispatch.status)) {
    return { ok: false, error: `Cannot upload shipping documents from ${dispatch.status}.` }
  }
  if (!(UPLOADABLE_SHIP_DOC_TYPES as string[]).includes(rawType)) {
    return { ok: false, error: 'Unsupported shipping document type.' }
  }
  const type = rawType as ShipDocType

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Pick a file to upload.' }
  }
  if (file.size > SHIP_DOC_UPLOAD_MAX_BYTES) {
    return { ok: false, error: 'File too large (max 20 MB).' }
  }
  if (!SHIP_DOC_ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type}". Use PDF, PNG, JPEG, WebP, or CSV.` }
  }

  const lotNumbers = lotNumbersRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // COA is a per-lot artifact (§1.1) — the lot linkage is the point.
  if (type === 'COA' && lotNumbers.length === 0) {
    return { ok: false, error: 'Enter the lot number(s) this Certificate of Analysis covers.' }
  }

  const partner = dispatch.partnerService.partner

  // Upload to R2 first (certifications pattern — no orphan DB rows on failure).
  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: partnerFileKey({ partnerId: partner.id, section: 'documents', filename: file.name }),
      body: buffer,
      contentType: file.type,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '_')}"`,
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const partnerFile = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType: 'DOCUMENTS',
      kind: 'OTHER',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  const doc = await prisma.shipmentDocument.create({
    data: {
      orderDispatchId: dispatch.id,
      type,
      assetId: partnerFile.id,
      lotNumbers,
      uploadedByPartnerId: partner.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'SHIP_DOC_UPLOADED',
    payload: {
      orderId: dispatch.orderId,
      documentId: doc.id,
      docType: type,
      filename: file.name,
      lotNumbers,
    },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function deleteShipmentDocument({
  documentId,
}: {
  documentId: string
}): Promise<Result> {
  const user = await requireUser()

  // Ownership via the dispatch's partner — same tenant guard as loadOwnedDispatch.
  const doc = await prisma.shipmentDocument.findFirst({
    where: { id: documentId, orderDispatch: { partnerService: { partner: { userId: user.id } } } },
    include: { orderDispatch: { select: { id: true, orderId: true, status: true } } },
  })
  if (!doc) return { ok: false, error: 'Document not found' }

  // Evidence lock — once the dispatch has shipped, its docs are delivery
  // evidence (COA/logger/seal per §1.1) and the partner can no longer remove them.
  if (['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(doc.orderDispatch.status)) {
    return { ok: false, error: 'Documents are locked once the dispatch has shipped.' }
  }

  const file = await prisma.partnerFile.findUnique({
    where: { id: doc.assetId },
    select: { id: true, r2Key: true },
  })

  await prisma.shipmentDocument.delete({ where: { id: doc.id } })

  if (file) {
    try {
      await deleteFile(file.r2Key)
    } catch {
      // Best-effort — DB row is already gone; orphan stays in R2.
    }
    await prisma.partnerFile.delete({ where: { id: file.id } }).catch(() => {})
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: doc.orderDispatch.id,
    action: 'SHIP_DOC_DELETED',
    payload: {
      orderId: doc.orderDispatch.orderId,
      documentId: doc.id,
      docType: doc.type,
      lotNumbers: doc.lotNumbers,
    },
  })

  revalidatePath(`/orders/${doc.orderDispatch.id}`)
  return { ok: true }
}

export async function markInTransit({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'SHIPPED') {
    return { ok: false, error: `Cannot mark in-transit from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'IN_TRANSIT', inTransitAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_IN_TRANSIT',
    fromValue: 'SHIPPED',
    toValue: 'IN_TRANSIT',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markDelivered({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'SHIPPED' && dispatch.status !== 'IN_TRANSIT') {
    return { ok: false, error: `Cannot mark delivered from ${dispatch.status}` }
  }
  const fromStatus = dispatch.status

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    })

    // If both dispatches DELIVERED, advance Order → DELIVERED
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

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_DELIVERED',
    fromValue: fromStatus,
    toValue: 'DELIVERED',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

// =============================================================================
// Phase H2 — request changes / withdraw
// =============================================================================

/** Manifest fields a partner can flag in a CHANGES_REQUESTED action. */
export type FlaggedField =
  | 'quantity'
  | 'substrate'
  | 'packagingMaterial'
  | 'finishes'
  | 'shipTo'
  | 'leadTime'
  | 'other'

const ALLOWED_FLAGGED_FIELDS: FlaggedField[] = [
  'quantity',
  'substrate',
  'packagingMaterial',
  'finishes',
  'shipTo',
  'leadTime',
  'other',
]

export async function requestDispatchChanges({
  dispatchId,
  flaggedFields,
  partnerNote,
  suggestedAlternatives,
}: {
  dispatchId: string
  flaggedFields: FlaggedField[]
  partnerNote: string
  suggestedAlternatives?: Record<string, string>
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return {
      ok: false,
      error: `Cannot request changes from ${dispatch.status}`,
    }
  }
  const sanitised = flaggedFields.filter((f) => ALLOWED_FLAGGED_FIELDS.includes(f))
  if (sanitised.length === 0) {
    return { ok: false, error: 'Pick at least one field to flag.' }
  }
  if (!partnerNote.trim()) {
    return {
      ok: false,
      error: 'Partner note is required so the creator knows what needs changing.',
    }
  }
  if (partnerNote.length > 1000) {
    return { ok: false, error: 'Partner note must be 1000 characters or fewer.' }
  }

  const changeRequest = {
    flaggedFields: sanitised,
    partnerNote: partnerNote.trim(),
    suggestedAlternatives: suggestedAlternatives ?? {},
    requestedAt: new Date().toISOString(),
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'CHANGES_REQUESTED',
        changeRequest: changeRequest as unknown as object,
      },
    })
    await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_CHANGES_REQUESTED',
    fromValue: 'PENDING_ACCEPT',
    toValue: 'CHANGES_REQUESTED',
    payload: {
      orderId: dispatch.orderId,
      type: dispatch.type,
      flaggedFields: sanitised,
      partnerNote: partnerNote.trim(),
    },
  })

  // Phase H4 — notify creator with the flagged-field count so the email
  // subject conveys the urgency.
  await notifyChangesRequested({
    dispatchId: dispatch.id,
    flaggedFieldCount: sanitised.length,
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

/**
 * Withdraw after acceptance — partner accepted but can't deliver
 * (capacity surprise, machine breakdown, supplier issue). Distinct
 * from decline because the lifecycle stage is different.
 *
 * V1: parks the order at ON_HOLD for admin manual reroute (mirroring
 * decline behaviour). V1.5 marketplace matching (#153) auto-reroutes
 * non-manufacturer withdrawals.
 */
export async function withdrawDispatch({
  dispatchId,
  reason,
}: {
  dispatchId: string
  reason: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  const withdrawableStates = ['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK']
  if (!withdrawableStates.includes(dispatch.status)) {
    return {
      ok: false,
      error: `Cannot withdraw from ${dispatch.status}. Contact iLaunchify support.`,
    }
  }
  if (!reason.trim()) {
    return {
      ok: false,
      error: 'Reason is required so admin + creator know what happened.',
    }
  }
  if (reason.length > 1000) {
    return { ok: false, error: 'Reason must be 1000 characters or fewer.' }
  }

  const fromStatus = dispatch.status
  const isManufacturer = dispatch.type === 'PRODUCT'

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawReason: reason.trim(),
      },
    })
    if (isManufacturer) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'CANCELLED',
          aggregateApprovalStatus: 'CANCELLED',
          internalNotes: `Manufacturer withdrew (${reason
            .trim()
            .slice(0, 200)}) — admin: handle cost recovery`,
        },
      })
    } else {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'ON_HOLD',
          internalNotes: `Dispatch ${dispatch.type} withdrawn: ${reason
            .trim()
            .slice(0, 200)} — needs reroute`,
        },
      })
      await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_WITHDRAWN',
    fromValue: fromStatus,
    toValue: 'WITHDRAWN',
    payload: {
      orderId: dispatch.orderId,
      type: dispatch.type,
      reason: reason.trim(),
    },
  })

  // Phase H4 — notify creator (+ admin always for withdrawals).
  await notifyWithdrawn({
    dispatchId: dispatch.id,
    reason: reason.trim(),
    isManufacturer,
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}
