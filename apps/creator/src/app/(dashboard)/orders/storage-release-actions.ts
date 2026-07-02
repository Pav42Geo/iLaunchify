'use server'

// Phase L1.2a — creator stock-release flow for HOLD_AT_MANUFACTURER orders
// (docs/LOGISTICS_AND_FULFILLMENT.md §4 + §9).
//
// The creator's stored stock lives under a StorageAgreement; a release is a
// StorageReleaseOrder the storing partner then works REQUESTED → PICKING →
// SHIPPED (→ DELIVERED) in the partner app. Two rules keep the balance honest:
//
//   1. unitsRemaining is NOT decremented at request time — only when the
//      partner marks the release SHIPPED (the goods physically leave the dock).
//      A REQUESTED release can still be cancelled with nothing moved.
//   2. Agreement status mirrors open work: ACTIVE ↔ RELEASING while a release
//      is open; CLOSED only when the balance hits zero (partner-side, at ship).
//
// V1 destination = CREATOR_ADDRESS only (the creator's default saved address,
// snapshotted into destinationJson for legal reproducibility — the release
// ships to the address as it was at request time even if the creator edits it
// later). FC + channel destinations arrive with L2/L3 rails.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type StorageReleaseResult = { ok: true } | { ok: false; error: string }

// Release statuses that count as "open" (still holding the agreement in
// RELEASING). SHIPPED/DELIVERED/CANCELLED are settled from the agreement's
// point of view.
const OPEN_RELEASE_STATUSES = ['REQUESTED', 'PICKING'] as const

export async function createStorageRelease({
  orderId,
  quantity,
}: {
  orderId: string
  quantity: number
}): Promise<StorageReleaseResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Not a creator account.' }

  // Creator-ownership guard — same shape as the sibling cancel/dispute actions:
  // the order row must belong to this creator (tenant isolation, threat #1).
  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    select: { id: true, shipToType: true },
  })
  if (!order) return { ok: false, error: 'Order not found.' }
  if (order.shipToType !== 'HOLD_AT_MANUFACTURER') {
    return { ok: false, error: 'This order is not stored at the manufacturer.' }
  }

  const agreement = await prisma.storageAgreement.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
  })
  if (!agreement) return { ok: false, error: 'No storage agreement found for this order.' }
  if (agreement.status !== 'ACTIVE') {
    return {
      ok: false,
      error:
        agreement.status === 'RELEASING'
          ? 'A release is already in progress — wait for it to ship, or cancel it first.'
          : 'This storage agreement is closed — all stock has been released.',
    }
  }

  const qty = Math.floor(quantity)
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Quantity must be at least 1.' }
  if (qty > agreement.unitsRemaining) {
    return { ok: false, error: `Only ${agreement.unitsRemaining.toLocaleString()} units remain in storage.` }
  }

  // V1 destination — the creator's default saved address. The disabled
  // "To a fulfillment center" option in the panel is display-only until the
  // FC release rail lands; the server accepts CREATOR_ADDRESS only.
  const address = await prisma.creatorSavedAddress.findFirst({
    where: { creatorUserId: user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  if (!address) {
    return { ok: false, error: 'Save a shipping address first — releases ship to your saved address.' }
  }

  let releaseId = ''
  try {
    await prisma.$transaction(async (tx) => {
      // Re-read under the txn so two concurrent requests can't both pass the
      // ACTIVE + balance check made above.
      const fresh = await tx.storageAgreement.findFirst({
        where: { id: agreement.id, status: 'ACTIVE' },
        select: { id: true, unitsRemaining: true },
      })
      if (!fresh || qty > fresh.unitsRemaining) throw new Error('AGREEMENT_STATE_CHANGED')

      const release = await tx.storageReleaseOrder.create({
        data: {
          storageAgreementId: agreement.id,
          destinationType: 'CREATOR_ADDRESS',
          // Address snapshot — reproducible even if the saved address is later
          // edited or deleted. savedAddressId kept as provenance only.
          destinationJson: {
            savedAddressId: address.id,
            contactName: address.contactName,
            contactPhone: address.contactPhone,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
          },
          quantity: qty,
          status: 'REQUESTED',
          requestedById: user.id,
        },
        select: { id: true },
      })
      releaseId = release.id

      // NOTE: unitsRemaining is intentionally NOT decremented here — the
      // balance only moves when the partner marks the release SHIPPED
      // (releases-actions.ts in apps/partner). RELEASING just flags open work.
      await tx.storageAgreement.update({
        where: { id: agreement.id },
        data: { status: 'RELEASING' },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'AGREEMENT_STATE_CHANGED') {
      return { ok: false, error: 'Stored balance changed — refresh the page and try again.' }
    }
    throw e
  }

  await logAuditAs(user, {
    entityType: 'StorageAgreement',
    entityId: agreement.id,
    action: 'STORAGE_RELEASE_REQUESTED',
    fromValue: 'ACTIVE',
    toValue: 'RELEASING',
    payload: {
      orderId: order.id,
      releaseId,
      quantity: qty,
      destinationType: 'CREATOR_ADDRESS',
      savedAddressId: address.id,
    },
  })

  revalidatePath(`/orders/${order.id}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function cancelStorageRelease({
  orderId,
  releaseId,
}: {
  orderId: string
  releaseId: string
}): Promise<StorageReleaseResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Not a creator account.' }

  // Same creator-ownership guard; the release must hang off an agreement on
  // an order this creator owns.
  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    select: { id: true },
  })
  if (!order) return { ok: false, error: 'Order not found.' }

  const release = await prisma.storageReleaseOrder.findFirst({
    where: { id: releaseId, storageAgreement: { orderId: order.id } },
    include: { storageAgreement: { select: { id: true, status: true } } },
  })
  if (!release) return { ok: false, error: 'Release not found.' }
  if (release.status !== 'REQUESTED') {
    return {
      ok: false,
      error: 'Only requested releases can be cancelled — the partner is already working this one.',
    }
  }

  let agreementBackToActive = false
  await prisma.$transaction(async (tx) => {
    await tx.storageReleaseOrder.update({
      where: { id: release.id },
      data: { status: 'CANCELLED' },
    })
    // Agreement returns to ACTIVE only when no other release is still open.
    const otherOpen = await tx.storageReleaseOrder.count({
      where: {
        storageAgreementId: release.storageAgreementId,
        status: { in: [...OPEN_RELEASE_STATUSES] },
        id: { not: release.id },
      },
    })
    if (otherOpen === 0 && release.storageAgreement.status === 'RELEASING') {
      await tx.storageAgreement.update({
        where: { id: release.storageAgreementId },
        data: { status: 'ACTIVE' },
      })
      agreementBackToActive = true
    }
  })

  await logAuditAs(user, {
    entityType: 'StorageAgreement',
    entityId: release.storageAgreementId,
    action: 'STORAGE_RELEASE_CANCELLED',
    fromValue: 'REQUESTED',
    toValue: 'CANCELLED',
    payload: {
      orderId: order.id,
      releaseId: release.id,
      quantity: release.quantity,
      agreementBackToActive,
    },
  })

  revalidatePath(`/orders/${order.id}`)
  return { ok: true }
}
