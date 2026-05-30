'use server'

// Phase H3.1 — order adjustment actions.
//
// startOrderAdjustment(productId, orderId)
//   Loads the existing Order + OrderItem + Order.internalNotes lookups
//   and reconstructs a CheckoutDraft pre-filled with the current
//   manifest. The wizard renders an "Adjusting order #X" banner. The
//   draft's isAdjustmentForOrderId points at the order being adjusted.
//
// applyOrderAdjustment(draft)
//   Compares the adjusted draft against the existing Order. For each
//   manifest field that changed, revokes ACCEPTED status on the
//   impacted dispatches (per the impact-column rules in
//   docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md §4). Bumps the dispatch's
//   manifestVersion. Clears all CHANGES_REQUESTED rows. Recomputes
//   aggregate. Notifies the impacted partners that they need to
//   re-review.

import { prisma } from '@ilaunchify/db'
import { Prisma } from '@prisma/client'
import { requireUser } from '@ilaunchify/auth'
import { recomputeAggregateApprovalStatus, parseInternalNotesLookups } from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { emptyDraftState, type CheckoutDraftState } from './types'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// startOrderAdjustment — seed a draft from an existing Order
// -----------------------------------------------------------------------------

export async function startOrderAdjustment(input: {
  productId: string
  orderId: string
}): Promise<Result<{ draftWritten: true }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }

  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      creatorUserId: user.id,
      items: { some: { productId: input.productId } },
    },
    include: {
      items: { take: 1 },
      dispatches: { select: { status: true, changeRequest: true } },
    },
  })
  if (!order) return { ok: false, error: 'Order not found.' }

  // Only adjustable when at least one dispatch is CHANGES_REQUESTED, or
  // every dispatch is still PENDING_ACCEPT (creator second-thoughts
  // before any partner approves). After that the order is committed.
  const canAdjust =
    order.dispatches.some((d) => d.status === 'CHANGES_REQUESTED') ||
    order.dispatches.every((d) => d.status === 'PENDING_ACCEPT')
  if (!canAdjust) {
    return {
      ok: false,
      error:
        'This order is past the point where it can be adjusted. Contact iLaunchify support.',
    }
  }

  const item = order.items[0]
  if (!item) return { ok: false, error: 'Order has no items.' }

  // Reconstruct manifest picks from Order.internalNotes (V1 transport;
  // V1.5 promotes these to first-class columns).
  const lookups = parseInternalNotesLookups(order.internalNotes)

  // Reconstruct ship-to from Order fields.
  const fulfillment: CheckoutDraftState['fulfillment'] =
    order.shipToType === 'WAREHOUSE_PARTNER'
      ? {
          shipToType: order.shipToPartnerServiceId
            ? 'SPECIFIC_WAREHOUSE'
            : 'CLOSEST_WAREHOUSE',
          warehousePartnerServiceId: order.shipToPartnerServiceId,
          savedAddressId: null,
          newAddress: null,
          saveNewAddress: false,
        }
      : {
          shipToType: 'NEW_ADDRESS',
          warehousePartnerServiceId: null,
          savedAddressId: null,
          newAddress: {
            label: 'From order ' + order.id.slice(-8),
            contactName: order.shipToContactName,
            contactPhone: order.shipToContactPhone ?? '',
            addressLine1: order.shipToAddressLine1,
            addressLine2: order.shipToAddressLine2 ?? '',
            city: order.shipToCity,
            state: order.shipToState ?? '',
            postalCode: order.shipToPostalCode,
            country: order.shipToCountry,
          },
          saveNewAddress: false,
        }

  const seed = emptyDraftState()
  const state: CheckoutDraftState = {
    ...seed,
    production: {
      quantity: item.quantity,
      substrateSlug: lookups.substrateSlug,
      packagingMaterialSlug: lookups.packagingSlug,
      finishPartnerFinishIds: lookups.finishPartnerIds,
    },
    fulfillment,
    designVersionId: item.designVersionId,
    isAdjustmentForOrderId: order.id,
  }

  await prisma.checkoutDraft.upsert({
    where: {
      creatorUserId_productId: {
        creatorUserId: user.id,
        productId: input.productId,
      },
    },
    create: {
      creatorUserId: user.id,
      productId: input.productId,
      state: state as unknown as object,
      // Drop them at Production step — the creator usually needs to
      // change a production field to address the partner's request.
      currentStep: 2,
      completedSteps: [1],
    },
    update: {
      state: state as unknown as object,
      currentStep: 2,
      completedSteps: [1],
    },
  })

  revalidatePath(`/products/${input.productId}/checkout`)
  return { ok: true, data: { draftWritten: true } }
}

// -----------------------------------------------------------------------------
// applyOrderAdjustment — diff manifest, revoke impacted dispatches
// -----------------------------------------------------------------------------

// Per spec §4 — which dispatch types are impacted by each manifest field.
const FIELD_IMPACTS: Record<string, Array<'PRODUCT' | 'LABEL' | 'WAREHOUSE'>> = {
  quantity: ['PRODUCT', 'LABEL', 'WAREHOUSE'],
  substrate: ['LABEL'],
  packagingMaterial: ['PRODUCT', 'WAREHOUSE'],
  finishes: ['LABEL'],
  shipTo: ['WAREHOUSE'],
  leadTime: ['PRODUCT', 'LABEL', 'WAREHOUSE'],
}

export async function applyOrderAdjustment(input: {
  productId: string
  draft: CheckoutDraftState
}): Promise<Result<{ adjustedDispatchCount: number }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }
  const orderId = input.draft.isAdjustmentForOrderId
  if (!orderId) {
    return { ok: false, error: 'Draft is not an adjustment.' }
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      dispatches: true,
      items: { take: 1 },
    },
  })
  if (!order) return { ok: false, error: 'Order not found.' }
  const item = order.items[0]
  if (!item) return { ok: false, error: 'Order has no items.' }

  // Compute the changed-fields set from current Order state vs. draft.
  const lookups = parseInternalNotesLookups(order.internalNotes)
  const changed = new Set<keyof typeof FIELD_IMPACTS>()
  if (input.draft.production.quantity !== item.quantity) changed.add('quantity')
  if (input.draft.production.substrateSlug !== lookups.substrateSlug)
    changed.add('substrate')
  if (input.draft.production.packagingMaterialSlug !== lookups.packagingSlug)
    changed.add('packagingMaterial')
  if (
    input.draft.production.finishPartnerFinishIds.join(',') !==
    lookups.finishPartnerIds.join(',')
  ) {
    changed.add('finishes')
  }
  // Ship-to comparison — we compare address line 1 + ZIP + warehouse id
  // as a simple stand-in for full equality (sufficient for V1 since
  // partners are routed by ZIP).
  const draftShipKey = shipKey(input.draft.fulfillment, order)
  if (draftShipKey !== orderShipKey(order)) changed.add('shipTo')

  if (changed.size === 0) {
    return {
      ok: false,
      error: 'No changes detected. Adjust at least one field before resubmitting.',
    }
  }

  // Build the set of dispatch types whose acceptances should revoke.
  const impactedTypes = new Set<string>()
  for (const f of changed) {
    for (const t of FIELD_IMPACTS[f] ?? []) impactedTypes.add(t)
  }

  // New internalNotes carrying the adjusted lookups so future
  // manifest regeneration reads the right values.
  const newPromo = input.draft.cart.promoCode?.trim() || null
  const newInternalNotes = [
    newPromo ? `Promo: ${newPromo}` : null,
    `Adjusted ${new Date().toISOString()} by creator (manifest v${(order.dispatches[0]?.manifestVersion ?? 1) + 1})`,
    input.draft.production.substrateSlug
      ? `Substrate: ${input.draft.production.substrateSlug}`
      : null,
    input.draft.production.packagingMaterialSlug
      ? `Packaging: ${input.draft.production.packagingMaterialSlug}`
      : null,
    input.draft.production.finishPartnerFinishIds.length
      ? `Finishes: ${input.draft.production.finishPartnerFinishIds.join(', ')} (PartnerFinish IDs)`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Apply the transition.
  let revokedCount = 0
  const newManifestVersion =
    (order.dispatches[0]?.manifestVersion ?? 1) + 1

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { internalNotes: newInternalNotes },
    })

    await tx.orderItem.update({
      where: { id: item.id },
      data: { quantity: input.draft.production.quantity ?? item.quantity },
    })

    for (const d of order.dispatches) {
      const impacted = impactedTypes.has(d.type)
      if (impacted) {
        // Bump manifest version + clear acceptance + clear change request.
        await tx.orderDispatch.update({
          where: { id: d.id },
          data: {
            status: 'PENDING_ACCEPT',
            manifestVersion: newManifestVersion,
            acceptedAt: null,
            acceptedManifestVersion: null,
            changeRequest: Prisma.JsonNull,
            // Reset the accept deadline so partners have a fresh
            // window to re-review.
            acceptDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        revokedCount++
      } else if (d.status === 'CHANGES_REQUESTED') {
        // Non-impacted CHANGES_REQUESTED — clear the request, return
        // to PENDING_ACCEPT against the same manifest version.
        await tx.orderDispatch.update({
          where: { id: d.id },
          data: { status: 'PENDING_ACCEPT', changeRequest: Prisma.JsonNull },
        })
      }
    }

    // Order goes back to ROUTING since we revoked acceptances.
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'ROUTING' },
    })

    await recomputeAggregateApprovalStatus(tx, order.id)

    // Discard the in-progress draft now that the adjustment has shipped.
    await tx.checkoutDraft.deleteMany({
      where: { creatorUserId: user.id, productId: input.productId },
    })
  })

  // H5 — append to the audit log. The actor is the creator; the entity
  // is the Order. payload carries the diff so /admin/audit can render
  // exactly which fields were touched.
  try {
    await logAuditAs(
      { id: user.id, role: 'CREATOR' },
      {
        entityType: 'Order',
        entityId: order.id,
        action: 'ORDER_ADJUSTMENT_RESUBMITTED',
        fromValue: `manifest v${order.dispatches[0]?.manifestVersion ?? 1}`,
        toValue: `manifest v${newManifestVersion}`,
        payload: {
          changedFields: Array.from(changed),
          revokedDispatchCount: revokedCount,
          impactedTypes: Array.from(impactedTypes),
        },
      },
    )
  } catch {
    /* swallow */
  }

  // Notify impacted partners (best-effort). We use the existing
  // DISPATCH_RECEIVED event so they see it in their inbox — V1.5 may
  // want a dedicated "re-review" event.
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const impacted = await prisma.orderDispatch.findMany({
      where: { orderId: order.id, status: 'PENDING_ACCEPT' },
      include: {
        partnerService: {
          include: { partner: { select: { userId: true, companyName: true } } },
        },
      },
    })
    await Promise.all(
      impacted.map((d) =>
        dispatchNotification({
          userId: d.partnerService.partner.userId,
          event: 'DISPATCH_RECEIVED',
          audience: 'partner',
          data: {
            orderId: order.id,
            type: d.type,
          },
        }),
      ),
    )
  } catch {
    /* swallow */
  }

  revalidatePath(`/products/${input.productId}/checkout`)
  revalidatePath(`/orders/${order.id}`)
  revalidatePath('/orders')
  return { ok: true, data: { adjustedDispatchCount: revokedCount } }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function shipKey(
  f: CheckoutDraftState['fulfillment'],
  order: { shipToType: string; shipToPartnerServiceId: string | null },
): string {
  if (f.shipToType === 'SPECIFIC_WAREHOUSE' || f.shipToType === 'CLOSEST_WAREHOUSE') {
    return `wh:${f.warehousePartnerServiceId ?? 'closest'}`
  }
  if (f.shipToType === 'NEW_ADDRESS' && f.newAddress) {
    return `addr:${f.newAddress.addressLine1}|${f.newAddress.postalCode}`
  }
  if (f.shipToType === 'SAVED_ADDRESS') {
    return `saved:${f.savedAddressId ?? ''}`
  }
  return `unset:${order.shipToType}`
}

function orderShipKey(order: {
  shipToType: string
  shipToPartnerServiceId: string | null
  shipToAddressLine1: string
  shipToPostalCode: string
}): string {
  if (order.shipToType === 'WAREHOUSE_PARTNER') {
    return `wh:${order.shipToPartnerServiceId ?? 'closest'}`
  }
  return `addr:${order.shipToAddressLine1}|${order.shipToPostalCode}`
}
