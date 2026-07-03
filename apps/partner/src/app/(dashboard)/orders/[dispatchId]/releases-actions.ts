'use server'

// Phase L1.2a — storing-partner side of HOLD_AT_MANUFACTURER stock releases
// (docs/LOGISTICS_AND_FULFILLMENT.md §4 + §9).
//
// Deliberately a NEW file — ./actions.ts owns the dispatch FSM and was just
// reworked (L1.1b doc gates); the release FSM is a separate machine on
// StorageReleaseOrder:
//
//   REQUESTED → PICKING → SHIPPED → DELIVERED
//   (CANCELLED happens creator-side, and only while REQUESTED)
//
// Balance rules (mirrors the creator-side createStorageRelease contract):
//   - StorageAgreement.unitsRemaining decrements ONLY at SHIPPED — the moment
//     goods physically leave the dock. Never below zero.
//   - unitsRemaining hitting 0 closes the agreement (CLOSED + endedAt);
//     otherwise it returns to ACTIVE once no releases remain open.
//   - palletsRemaining is NOT adjusted in V1 — pallet-level reconciliation
//     lands with the receiving-manifest flow (L1.2b).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { serviceOwnedBy } from '@/lib/partner-context'

type Result = { ok: true } | { ok: false; error: string }

// P1 (docs/PARTNER_ROLE_ACCOUNTS.md §3.1) — these actions are now shared by
// TWO surfaces: the dispatch detail (HOLD_AT_MANUFACTURER storing partner) and
// the FC /outbound queue. dispatchId may be empty when invoked from /outbound;
// refresh both surfaces either way.
function revalidateReleaseSurfaces(dispatchId: string) {
  if (dispatchId) revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/outbound')
  revalidatePath('/inventory')
}

// Partner-ownership guard — same walk as loadOwnedDispatch in ./actions.ts,
// but rooted at the release: release → agreement → partnerService → partner →
// userId (tenant isolation, threat #1). A release on another partner's
// agreement is indistinguishable from "not found".
async function loadOwnedRelease(userId: string, releaseId: string) {
  return prisma.storageReleaseOrder.findFirst({
    where: {
      id: releaseId,
      storageAgreement: { partnerService: serviceOwnedBy(userId) },
    },
    include: { storageAgreement: true },
  })
}

export async function startReleasePicking({
  dispatchId,
  releaseId,
}: {
  dispatchId: string
  releaseId: string
}): Promise<Result> {
  const user = await requireUser()
  const release = await loadOwnedRelease(user.id, releaseId)
  if (!release) return { ok: false, error: 'Release not found' }
  if (release.status !== 'REQUESTED') {
    return { ok: false, error: `Cannot start picking from ${release.status}` }
  }

  await prisma.storageReleaseOrder.update({
    where: { id: release.id },
    data: { status: 'PICKING' },
  })

  await logAuditAs(user, {
    entityType: 'StorageAgreement',
    entityId: release.storageAgreementId,
    action: 'STORAGE_RELEASE_PICKING',
    fromValue: 'REQUESTED',
    toValue: 'PICKING',
    payload: {
      releaseId: release.id,
      orderId: release.storageAgreement.orderId,
      quantity: release.quantity,
    },
  })

  revalidateReleaseSurfaces(dispatchId)
  return { ok: true }
}

export async function shipStorageRelease({
  dispatchId,
  releaseId,
  trackingCarrier,
  trackingNumber,
}: {
  dispatchId: string
  releaseId: string
  trackingCarrier: string
  trackingNumber: string
}): Promise<Result> {
  const user = await requireUser()
  const release = await loadOwnedRelease(user.id, releaseId)
  if (!release) return { ok: false, error: 'Release not found' }
  if (release.status !== 'PICKING') {
    return { ok: false, error: `Cannot mark shipped from ${release.status}` }
  }

  const carrier = trackingCarrier.trim()
  const number = trackingNumber.trim()
  if (!carrier || !number) {
    return { ok: false, error: 'Tracking carrier and number are required to mark shipped.' }
  }

  const agreement = release.storageAgreement
  // Never draw the balance below zero — request-time validation ran against a
  // then-current balance, so a stale/raced release could otherwise overdraw.
  const newUnitsRemaining = Math.max(0, agreement.unitsRemaining - release.quantity)
  const closes = newUnitsRemaining === 0
  let agreementStatusAfter: 'ACTIVE' | 'RELEASING' | 'CLOSED' = 'RELEASING'

  await prisma.$transaction(async (tx) => {
    // V1: tracking is stored on destinationJson.tracking and NO ShipmentLeg is
    // created (shipmentLegId stays null) — Phase L2's platform label/BOL
    // booking replaces this manual entry and links the booked leg instead.
    const priorDestination =
      typeof release.destinationJson === 'object' &&
      release.destinationJson !== null &&
      !Array.isArray(release.destinationJson)
        ? (release.destinationJson as Record<string, unknown>)
        : {}
    await tx.storageReleaseOrder.update({
      where: { id: release.id },
      data: {
        status: 'SHIPPED',
        destinationJson: {
          ...priorDestination,
          tracking: { carrier, number, shippedAt: new Date().toISOString() },
        } as unknown as object,
      },
    })

    // Decrement happens HERE (goods left the dock), never at request time.
    const otherOpen = await tx.storageReleaseOrder.count({
      where: {
        storageAgreementId: agreement.id,
        status: { in: ['REQUESTED', 'PICKING'] },
        id: { not: release.id },
      },
    })
    agreementStatusAfter = closes ? 'CLOSED' : otherOpen === 0 ? 'ACTIVE' : 'RELEASING'
    await tx.storageAgreement.update({
      where: { id: agreement.id },
      data: closes
        ? { unitsRemaining: 0, status: 'CLOSED', endedAt: new Date() }
        : { unitsRemaining: newUnitsRemaining, status: agreementStatusAfter },
    })
  })

  await logAuditAs(user, {
    entityType: 'StorageAgreement',
    entityId: agreement.id,
    action: 'STORAGE_RELEASE_SHIPPED',
    fromValue: 'PICKING',
    toValue: 'SHIPPED',
    payload: {
      releaseId: release.id,
      orderId: agreement.orderId,
      quantity: release.quantity,
      trackingCarrier: carrier,
      trackingNumber: number,
      unitsRemainingAfter: newUnitsRemaining,
      agreementStatusAfter,
    },
  })

  revalidateReleaseSurfaces(dispatchId)
  return { ok: true }
}

export async function deliverStorageRelease({
  dispatchId,
  releaseId,
}: {
  dispatchId: string
  releaseId: string
}): Promise<Result> {
  const user = await requireUser()
  const release = await loadOwnedRelease(user.id, releaseId)
  if (!release) return { ok: false, error: 'Release not found' }
  if (release.status !== 'SHIPPED') {
    return { ok: false, error: `Cannot mark delivered from ${release.status}` }
  }

  // V1: the creator confirms nothing — the storing partner marks DELIVERED
  // manually. L2 tracking webhooks flip this automatically off the carrier feed.
  await prisma.storageReleaseOrder.update({
    where: { id: release.id },
    data: { status: 'DELIVERED' },
  })

  await logAuditAs(user, {
    entityType: 'StorageAgreement',
    entityId: release.storageAgreementId,
    action: 'STORAGE_RELEASE_DELIVERED',
    fromValue: 'SHIPPED',
    toValue: 'DELIVERED',
    payload: {
      releaseId: release.id,
      orderId: release.storageAgreement.orderId,
      quantity: release.quantity,
    },
  })

  revalidateReleaseSurfaces(dispatchId)
  return { ok: true }
}
