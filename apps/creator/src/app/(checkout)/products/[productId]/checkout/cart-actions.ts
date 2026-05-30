'use server'

// Phase G5 — final "Pay" action for the checkout wizard.
//
// placeOrderFromCheckoutDraft(productId, options)
//   1. Loads the in-progress CheckoutDraft for this (creator, product).
//   2. Validates that quantity / ship-to / production picks are present.
//   3. Resolves partner routing via existing @ilaunchify/orders.
//   4. Creates Order row in PENDING_PAYMENT with a full snapshot of
//      substrate / packaging / finishes / ship-to / promo code.
//   5. Optionally persists the Proceed-at-my-risk ack onto the latest
//      DesignVersion.generationMeta (DS-69 pattern reused).
//   6. Creates a Stripe Checkout Session and returns its URL.
//   7. Deletes the CheckoutDraft (kept only until handoff to Stripe so
//      the creator can hit "Cancel" on Stripe and resume).
//
// On webhook completion the existing @ilaunchify/payments handler flips
// Order → PAID and createDispatches() fires routing.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { findRouting, estimateDispatchCosts } from '@ilaunchify/orders'
import {
  createCheckoutSession,
  createProductionSubscription,
  getOrCreateCreatorCustomer,
} from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import type { CheckoutDraftState } from './types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const PLATFORM_FEE_BPS = 500 // V1 5% — moves to PlatformFeeConfig long-term

export interface PlaceOrderOptions {
  /** DS-69-style ack payload. Set when blocking compliance findings remain
   *  and the creator has consciously opted to proceed. */
  complianceAck: {
    acknowledged: boolean
    acknowledgedAt: string
    blockingFindingIds: string[]
  } | null
}

export async function placeOrderFromCheckoutDraft(
  productId: string,
  options: PlaceOrderOptions,
): Promise<Result<{ checkoutUrl: string; orderId: string }>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { ok: false, error: 'Only creators can place production orders.' }
  }

  // --- 1. Authorise + load product + draft -----------------------------------
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      brand: true,
      productTemplate: true,
      recipe: {
        include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  })
  if (!product) return { ok: false, error: 'Product not found.' }

  const draft = await prisma.checkoutDraft.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId } },
  })
  if (!draft) {
    return {
      ok: false,
      error: 'No in-progress checkout. Refresh the page and try again.',
    }
  }
  const state = draft.state as unknown as CheckoutDraftState

  // H3.1 guard — drafts in adjust mode must use applyOrderAdjustment, not
  // this Stripe-handoff path. Belt + suspenders since the CartStep button
  // already branches on the same flag.
  if (state.isAdjustmentForOrderId) {
    return {
      ok: false,
      error:
        'This draft is an order adjustment, not a new order. Use the Resubmit button instead.',
    }
  }

  // --- 2. Validate the draft has what we need to place an order --------------
  const qty = state.production.quantity ?? 0
  if (qty <= 0) {
    return { ok: false, error: 'Pick a quantity in step 2 before paying.' }
  }
  if (!state.production.substrateSlug || !state.production.packagingMaterialSlug) {
    return {
      ok: false,
      error: 'Pick a substrate and packaging material in step 2 before paying.',
    }
  }
  if (!state.fulfillment.shipToType) {
    return { ok: false, error: 'Pick a destination in step 4 before paying.' }
  }

  // --- 3. Resolve ship-to + warehouse-partner ID -----------------------------
  const shipTo = await resolveShipTo({ user, draftState: state })
  if (!shipTo.ok) return { ok: false, error: shipTo.error }

  // --- 4. Find routing (existing @ilaunchify/orders) -------------------------
  const routing = await findRouting({
    productId: product.id,
    quantity: qty,
    templateId: product.productTemplateId,
  })
  if (!routing.ok) return { ok: false, error: routing.message }

  // --- 5. Cost calculation. V1: pull substrate + packaging + finish baselines
  //        from the typed catalogs (G3 standardisation). Real partner pricing
  //        replaces this when the partner-side editors light up (Phase F2 +
  //        G3.1).
  const [substrate, packaging, finishApps] = await Promise.all([
    prisma.substrate.findUnique({ where: { slug: state.production.substrateSlug } }),
    prisma.packagingMaterial.findUnique({
      where: { slug: state.production.packagingMaterialSlug },
    }),
    state.production.finishPartnerFinishIds.length
      ? prisma.partnerFinish.findMany({
          where: { id: { in: state.production.finishPartnerFinishIds } },
          select: { basePriceCents: true, perUnitPriceCents: true },
        })
      : Promise.resolve([] as Array<{ basePriceCents: number; perUnitPriceCents: number }>),
  ])

  // Anchor label-printing baseline mirrors estimateProductionCost in the
  // step UI so the creator sees the same number they paid.
  const labelUnitCents = 8 + (substrate?.baseUnitCostCents ?? 0)
  const packagingUnitCents = packaging?.baseUnitCostCents ?? 0
  let finishUnitCents = 0
  let finishSetupCents = 0
  for (const f of finishApps) {
    finishSetupCents += f.basePriceCents ?? 0
    finishUnitCents += f.perUnitPriceCents ?? 0
  }
  const productionUnitCents = labelUnitCents + packagingUnitCents + finishUnitCents
  const productionSubtotalCents = productionUnitCents * qty + finishSetupCents

  // Cost-basis estimate for partner transfers (@ilaunchify/orders
  // returns a per-dispatch breakdown — V1 reuses to keep the manifest
  // same cost basis the partner-side dispatch routing uses).
  const referenceUnit = Math.max(1, Math.round(productionUnitCents))
  const dispatchCosts = estimateDispatchCosts({
    productId: product.id,
    quantity: qty,
    unitPriceCents: referenceUnit,
  })
  const dispatchSubtotal =
    dispatchCosts.manufacturerCostCents + dispatchCosts.printProviderCostCents

  // Reconcile — pick the higher of the two so partner cost is never under-
  // funded. The wizard UI showed productionSubtotalCents; if dispatch math
  // comes out higher we treat the gap as a 'platform absorbs' line (V1
  // simplification; V2 reconciles partner pricing properly).
  const productionTotalCents = Math.max(productionSubtotalCents, dispatchSubtotal)

  // --- 6. Shipping placeholder for V1 (same per-unit tier as
  //        estimateShipping in fulfillment-actions, mirrored here to keep
  //        the action self-contained when the wizard isn't running). ----------
  const shippingCents = estimateFlatShipping(qty, state.fulfillment.shipToType)

  // --- 7. Platform fee ------------------------------------------------------
  const feeBase = productionTotalCents + shippingCents
  const platformFeeCents = Math.floor(feeBase * (PLATFORM_FEE_BPS / 10000))
  const totalCents = productionTotalCents + shippingCents + platformFeeCents

  // --- 8. Order + OrderItem in a single txn ---------------------------------
  const promo = state.cart.promoCode?.trim() ? state.cart.promoCode.trim() : null
  const internalNotes = buildInternalNotes({
    promo,
    state,
    productionSubtotalCents,
    productionTotalCents,
    dispatchSubtotal,
  })

  // Phase G8 — lock the exact DesignVersion sold so the partner-side
  // production bundle is deterministic. Null when the product has no
  // saved design yet (legacy edge — order goes through with the bundle
  // marked FAILED for admin to follow up).
  const lockedDesign = await prisma.design.findFirst({
    where: { productId: product.id },
    orderBy: { updatedAt: 'desc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  })
  const lockedDesignVersionId = lockedDesign?.versions[0]?.id ?? null

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        brandId: product.brandId,
        creatorUserId: user.id,
        status: 'PENDING_PAYMENT',
        subtotalCents: productionTotalCents,
        shippingCents,
        taxCents: 0,
        totalCents,
        manufacturerServiceId: routing.manufacturingServiceId,
        printProviderServiceId: routing.labelPrintingServiceId,
        shipToType: shipTo.data.shipToType,
        shipToPartnerServiceId: shipTo.data.shipToPartnerServiceId,
        shipToContactName: shipTo.data.contactName,
        shipToContactPhone: shipTo.data.contactPhone,
        shipToAddressLine1: shipTo.data.addressLine1,
        shipToAddressLine2: shipTo.data.addressLine2,
        shipToCity: shipTo.data.city,
        shipToState: shipTo.data.state,
        shipToPostalCode: shipTo.data.postalCode,
        shipToCountry: shipTo.data.country,
        internalNotes,
      },
    })
    await tx.orderItem.create({
      data: {
        orderId: created.id,
        productId: product.id,
        quantity: qty,
        unitPriceCents: Math.round(productionTotalCents / qty),
        totalCents: productionTotalCents,
        designVersionId: lockedDesignVersionId,
      },
    })

    // --- 9. Persist Proceed-at-my-risk ack on the latest DesignVersion ------
    //         (DS-69 reuse — only when blockings remained at My cart time).
    if (options.complianceAck?.acknowledged) {
      const latestDesign = await tx.design.findFirst({
        where: { productId: product.id },
        orderBy: { updatedAt: 'desc' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      })
      const latestVersion = latestDesign?.versions[0]
      if (latestVersion) {
        const meta = (latestVersion.generationMeta ?? {}) as Record<string, unknown>
        const history = Array.isArray(meta.complianceAckHistory)
          ? (meta.complianceAckHistory as unknown[])
          : []
        history.push({
          orderId: created.id,
          surface: 'checkout-cart',
          acknowledgedAt: options.complianceAck.acknowledgedAt,
          blockingFindingIds: options.complianceAck.blockingFindingIds,
        })
        await tx.designVersion.update({
          where: { id: latestVersion.id },
          data: {
            generationMeta: {
              ...meta,
              complianceAckHistory: history,
            } as unknown as object,
          },
        })
      }
    }

    // --- 10. Discard the draft — Stripe is the next stop. -------------------
    //         (If Stripe Checkout fails we'd want this back; we recreate
    //         from the Order row at /order/success in that edge.)
    await tx.checkoutDraft.delete({ where: { id: draft.id } })

    return created
  })

  // --- 11. Audit log --------------------------------------------------------
  await logAuditAs(user, {
    entityType: 'Order',
    entityId: order.id,
    action: 'ORDER_CREATED',
    toValue: 'PENDING_PAYMENT',
    payload: {
      brandId: product.brandId,
      productId: product.id,
      quantity: qty,
      subtotalCents: productionTotalCents,
      shippingCents,
      totalCents,
      shipToType: shipTo.data.shipToType,
      surface: 'checkout-wizard',
    },
  })

  // --- 11.b G6.b — create the recurring ProductionSubscription if the ----
  //          creator accepted Subscribe & save at Step 3. Fails soft:
  //          if Stripe Subscription creation throws, we keep the day-1
  //          Order intact (the creator still pays for that one-time
  //          run) and surface the subscription error in internalNotes.
  //          The creator can resubscribe later from their dashboard.
  const sub = state.subscription
  if (sub.offerAccepted && sub.cadence) {
    const discountBp = Math.max(0, Math.min(10_000, sub.discountBp))
    const perRunUnitCents = Math.max(
      0,
      Math.round(totalCents * (10_000 - discountBp) / 10_000),
    )
    try {
      const customerId = await getOrCreateCreatorCustomer({
        userId: user.id,
        email: user.email,
        name: user.name ?? null,
      })

      const created = await prisma.productionSubscription.create({
        data: {
          creatorUserId: user.id,
          brandId: product.brandId,
          productId: product.id,
          designVersionId: lockedDesignVersionId,
          cadence: sub.cadence,
          totalRuns: sub.runCount,
          discountBp,
          // Filled in below after Stripe call; using temp placeholders that
          // we overwrite in the second update so the row exists for the
          // logAudit FK before we hit Stripe.
          stripeSubscriptionId: `pending_${order.id}`,
          stripePriceId: `pending_${order.id}`,
          status: 'ACTIVE',
          manifestSnapshot: {
            quantity: qty,
            substrateSlug: state.production.substrateSlug,
            packagingMaterialSlug: state.production.packagingMaterialSlug,
            finishPartnerFinishIds: state.production.finishPartnerFinishIds,
            shipTo: shipTo.data,
          } as unknown as object,
          subtotalCentsAtCreation: totalCents,
        },
      })

      const stripeResult = await createProductionSubscription({
        customerId,
        productName: product.name,
        brandId: product.brandId,
        brandName: product.brand.name,
        productId: product.id,
        cadence: sub.cadence,
        perRunUnitAmountCents: perRunUnitCents,
        totalRuns: sub.runCount,
        productionSubscriptionId: created.id,
      })

      await prisma.productionSubscription.update({
        where: { id: created.id },
        data: {
          stripeSubscriptionId: stripeResult.stripeSubscriptionId,
          stripePriceId: stripeResult.stripePriceId,
          nextRunAt: new Date(stripeResult.firstInvoiceAt * 1000),
        },
      })

      await logAuditAs(user, {
        entityType: 'ProductionSubscription',
        entityId: created.id,
        action: 'PRODUCTION_SUBSCRIPTION_CREATED',
        toValue: 'ACTIVE',
        payload: {
          orderId: order.id,
          productId: product.id,
          cadence: sub.cadence,
          totalRuns: sub.runCount,
          discountBp,
          perRunUnitAmountCents: perRunUnitCents,
        },
      })
    } catch (err) {
      // Don't fail the whole checkout — the creator already designed,
      // priced, and clicked Pay. Note the failure on the Order so support
      // can offer to recreate the subscription manually.
      await prisma.order.update({
        where: { id: order.id },
        data: {
          internalNotes: `${internalNotes}\n\nG6 subscription create failed (day-1 order intact): ${(err as Error).message}`,
        },
      })
      // And clean up the placeholder row so an admin doesn't see a
      // permanently-pending subscription with no Stripe handle.
      await prisma.productionSubscription
        .deleteMany({
          where: {
            creatorUserId: user.id,
            stripeSubscriptionId: `pending_${order.id}`,
          },
        })
        .catch(() => {/* ignore */})
    }
  }

  // --- 12. Stripe Checkout Session ------------------------------------------
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const successUrl = `${baseUrl}/products/${product.id}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/products/${product.id}/checkout`

  let session
  try {
    session = await createCheckoutSession({
      orderId: order.id,
      brandId: product.brandId,
      creatorId: user.id,
      brandName: product.brand.name,
      successUrl,
      cancelUrl,
      customerEmail: user.email,
      lineItems: [
        {
          productName: `${product.name} (production order × ${qty})`,
          unitAmountCents: totalCents,
          quantity: 1,
        },
      ],
      applicationFeeCents: platformFeeCents,
    })
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        internalNotes: `${internalNotes}\n\nStripe error: ${(err as Error).message}`,
      },
    })
    return {
      ok: false,
      error: `Couldn't reach Stripe. Detail: ${(err as Error).message}`,
    }
  }

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL.' }
  }

  return { ok: true, data: { checkoutUrl: session.url, orderId: order.id } }
}

// =============================================================================
// Helpers
// =============================================================================

interface ShipToResolved {
  shipToType: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER'
  shipToPartnerServiceId: string | null
  contactName: string
  contactPhone: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string | null
  postalCode: string
  country: string
}

async function resolveShipTo({
  user,
  draftState,
}: {
  user: { id: string }
  draftState: CheckoutDraftState
}): Promise<Result<ShipToResolved>> {
  const f = draftState.fulfillment

  if (f.shipToType === 'CLOSEST_WAREHOUSE' || f.shipToType === 'SPECIFIC_WAREHOUSE') {
    let warehouseId = f.warehousePartnerServiceId
    if (!warehouseId && f.shipToType === 'CLOSEST_WAREHOUSE') {
      const closest = await prisma.partnerService.findFirst({
        where: { type: 'WAREHOUSE', status: 'ACTIVE' },
        select: { id: true },
      })
      warehouseId = closest?.id ?? null
    }
    if (!warehouseId) return { ok: false, error: 'No eligible warehouse partner.' }
    const warehouse = await prisma.partnerService.findFirst({
      where: { id: warehouseId, type: 'WAREHOUSE', status: 'ACTIVE' },
      include: { partner: true },
    })
    if (!warehouse) return { ok: false, error: 'Warehouse partner unavailable.' }
    return {
      ok: true,
      data: {
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerServiceId: warehouse.id,
        contactName: warehouse.partner.companyName,
        contactPhone: warehouse.partner.contactPhone,
        addressLine1: warehouse.partner.addressLine1 ?? 'Address on file',
        addressLine2: warehouse.partner.addressLine2,
        city: warehouse.partner.city ?? 'Unknown',
        state: warehouse.partner.state,
        postalCode: warehouse.partner.postalCode ?? '00000',
        country: warehouse.partner.country,
      },
    }
  }

  if (f.shipToType === 'SAVED_ADDRESS') {
    if (!f.savedAddressId) return { ok: false, error: 'No saved address picked.' }
    const a = await prisma.creatorSavedAddress.findFirst({
      where: { id: f.savedAddressId, creatorUserId: user.id },
    })
    if (!a) return { ok: false, error: 'Saved address not found.' }
    return {
      ok: true,
      data: {
        shipToType: 'CREATOR_ADDRESS',
        shipToPartnerServiceId: null,
        contactName: a.contactName,
        contactPhone: a.contactPhone,
        addressLine1: a.addressLine1,
        addressLine2: a.addressLine2,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
      },
    }
  }

  if (f.shipToType === 'NEW_ADDRESS') {
    const a = f.newAddress
    if (!a || !a.addressLine1 || !a.city || !a.postalCode || !a.contactName) {
      return { ok: false, error: 'Fill out the new address before paying.' }
    }
    return {
      ok: true,
      data: {
        shipToType: 'CREATOR_ADDRESS',
        shipToPartnerServiceId: null,
        contactName: a.contactName,
        contactPhone: a.contactPhone ?? null,
        addressLine1: a.addressLine1,
        addressLine2: a.addressLine2 ?? null,
        city: a.city,
        state: a.state ?? null,
        postalCode: a.postalCode,
        country: a.country || 'US',
      },
    }
  }

  return { ok: false, error: 'Pick a destination in step 4 before paying.' }
}

function estimateFlatShipping(
  qty: number,
  shipToType: NonNullable<CheckoutDraftState['fulfillment']['shipToType']>,
): number {
  if (qty <= 0) return 0
  let perUnit: number
  if (qty < 100) perUnit = 95
  else if (qty < 500) perUnit = 72
  else if (qty < 2500) perUnit = 58
  else perUnit = 44
  const mode =
    shipToType === 'CLOSEST_WAREHOUSE' || shipToType === 'SPECIFIC_WAREHOUSE' ? 0.78 : 1.0
  return Math.round(perUnit * qty * mode)
}

function buildInternalNotes(args: {
  promo: string | null
  state: CheckoutDraftState
  productionSubtotalCents: number
  productionTotalCents: number
  dispatchSubtotal: number
}): string {
  const lines: string[] = []
  if (args.promo) lines.push(`Promo: ${args.promo}`)
  lines.push(
    `Wizard production subtotal: ${args.productionSubtotalCents}c · Dispatch basis: ${args.dispatchSubtotal}c · Booked: ${args.productionTotalCents}c`,
  )
  if (args.state.production.substrateSlug)
    lines.push(`Substrate: ${args.state.production.substrateSlug}`)
  if (args.state.production.packagingMaterialSlug)
    lines.push(`Packaging: ${args.state.production.packagingMaterialSlug}`)
  if (args.state.production.finishPartnerFinishIds.length)
    lines.push(
      `Finishes: ${args.state.production.finishPartnerFinishIds.join(', ')} (PartnerFinish IDs)`,
    )
  return lines.join('\n')
}
