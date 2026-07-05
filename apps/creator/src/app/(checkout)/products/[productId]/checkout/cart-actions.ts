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

import { prisma, getSampleSettings, resolveOrderSettings, getLogisticsSettings, isLogisticsEnabled, isStorageClassEnabled } from '@ilaunchify/db'
import {
  evaluateChannelInboundGates,
  decidePlacementSplits,
  type InboundChannel,
  type PlacementDecision,
} from '@ilaunchify/shipping'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
import {
  findRouting,
  estimateDispatchCosts,
  applySampleCredit,
  createOrderWithNumber,
  buildCreatorConfiguration,
  resolveDestinationOptions,
  scoreAndSelectFc,
  buildScoredAwardPayload,
  type FcCandidate,
  type FcScoringWeights,
  type FcAwardHistoryEntry,
  type SampleCreditEntry,
} from '@ilaunchify/orders'
import {
  createCheckoutSession,
  createProductionSubscription,
  getOrCreateCreatorCustomer,
} from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import {
  validatePackSelection,
  composePack,
  packPriceCents,
  orderTotalCents,
  type PricingBasis as PackPricingBasis,
  type FlavorFillRule as PackFlavorFillRule,
} from '@ilaunchify/ui'
import type { CheckoutDraftState } from './types'
import { checkProductRestrictions } from './restriction-actions'
import { quoteCarrierShipping } from './fulfillment-actions'
import { loadProductLabelCompliance } from '@/lib/dieline-compliance'

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

  // --- 1b. Restricted-category HARD GATE (labeling ≠ licensing) --------------
  //         Block the order outright when the product trips a restricted
  //         category we don't support (alcohol / hemp-CBD / tobacco-nicotine /
  //         OTC drug / kratom). This is the server-side enforcement: the
  //         checkout UI also disables Pay, but a creator who bypasses that
  //         still cannot place the order here.
  const restrictions = await checkProductRestrictions(productId)
  if (restrictions.length > 0) {
    await logAuditAs(user, {
      entityType: 'Product',
      entityId: product.id,
      action: 'ORDER_BLOCKED_RESTRICTED',
      payload: {
        brandId: product.brandId,
        productId: product.id,
        restrictions: restrictions.map((r) => ({
          code: r.code,
          matchedBy: r.matchedBy,
          evidence: r.evidence,
        })),
        surface: 'checkout-wizard',
      },
    })
    const labels = restrictions.map((r) => r.label).join(', ')
    return {
      ok: false,
      error:
        `This product can't be ordered: ${labels}. These categories require licensing ` +
        `iLaunchify doesn't support yet. This is not legal advice.`,
    }
  }

  // --- 1c. Die-line label-frame HARD GATE (DIELINE_FRAME_EDITOR_SPEC §5) -----
  //         If the product's die-line declares required label frames and the
  //         saved design is missing one (presence gate, V1), block the order:
  //         the platform-owned regulatory objects must be on the printed label.
  //         The Studio surfaces these as soft warnings while editing; this is the
  //         server-side hard stop a creator can't bypass client-side. (Safe-area
  //         + recipe-staleness activate once Phase B stamps objects on canvas.)
  const labelCompliance = await loadProductLabelCompliance(productId, user.id)
  if (labelCompliance?.hasDieline && labelCompliance.report?.status === 'fail') {
    const failing = labelCompliance.report.checks.filter((c) => c.status === 'fail')
    await logAuditAs(user, {
      entityType: 'Product',
      entityId: product.id,
      action: 'ORDER_BLOCKED_LABEL_FRAMES',
      payload: {
        brandId: product.brandId,
        productId: product.id,
        failingFrames: failing.map((c) => ({ kind: c.kind, issues: c.issues.map((i) => i.code) })),
        surface: 'checkout-wizard',
      },
    })
    const kinds = [...new Set(failing.map((c) => c.kind.replace(/_/g, ' ').toLowerCase()))].join(', ')
    return {
      ok: false,
      error:
        `This label is missing required elements for its packaging: ${kinds}. ` +
        `Open the Design Studio and add them before ordering.`,
    }
  }

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

  // --- 2b. Variety-pack flavor composition -----------------------------------
  // Two paths:
  //   • NEW pack model (docs/VARIETY_PACK_MODEL.md): state.production.pack carries
  //     a chosen pack SIZE (variant), per-pack flavor slots, and a PACK COUNT. We
  //     validate the pack with composePack, derive per-flavor ORDER totals as
  //     packCount × slot units, and snapshot the per-pack price + basis.
  //   • LEGACY model: state.production.flavors splits the whole order qty across
  //     flavors (validatePackSelection). Kept for in-progress drafts.
  // Either way we write OrderItemFlavor rows (per-flavor aggregate qty) and snapshot
  // the flavor name + Statement of Identity at order time.
  let flavorRows: Array<{ flavorPresetId: string; qty: number; flavorName: string; soiSnapshot: string | null; designVersionId: string | null }> = []
  // Pack-structure + price snapshot (null for non-pack / legacy items).
  let packPersist: {
    packVariantId: string
    packCount: number
    packUnitsPerPack: number
    pricingBasisSnapshot: PackPricingBasis
    pricePerPackCentsSnapshot: number
  } | null = null
  // The basis-aware pack-priced subtotal (cents) — reconciled with the production
  // cost below so the order is never under-funded.
  let packPricedSubtotalCents = 0
  // Per-flavor list price (cents) for the configuration snapshot / channel variants
  // (pack path only; legacy leaves it empty → null price downstream).
  const flavorPriceByPreset = new Map<string, number | null>()

  const packRules = product.productTemplateId
    ? await prisma.productTemplate.findUnique({
        where: { id: product.productTemplateId },
        select: { maxFlavorsPerPack: true, packingProfile: { select: { flavorMode: true } } },
      })
    : null

  const packSel = state.production.pack
  if (packSel && packSel.packVariantId && packSel.packCount > 0) {
    // ── NEW pack model ────────────────────────────────────────────────────────
    // Cast-guarded read of the chosen variant's pack columns + template rules +
    // per-flavor prices (the generated client may not type them pre-migration).
    const matrix = await readPackOrderInputs(product.productTemplateId, packSel.packVariantId)
    const unitsPerPack = matrix.unitsPerPack ?? packSel.unitsPerPack
    const choices = packSel.slots.map((s) => ({ flavorPresetId: s.flavorPresetId, units: s.units }))
    const composed = composePack({ unitsPerPack }, choices, {
      minFlavorsPerPack: matrix.minFlavors ?? 1,
      maxFlavorsPerPack: packRules?.maxFlavorsPerPack ?? null,
      fillRule: (matrix.fillRule ?? 'CREATOR_CHOOSES') as PackFlavorFillRule,
    })
    if (!composed.ok) {
      return { ok: false, error: composed.errors[0]?.message ?? 'Adjust your variety pack in step 2 before paying.' }
    }
    const basis: PackPricingBasis = (matrix.pricingBasis ?? 'PER_FLAVOR') as PackPricingBasis
    const pricePerPack = packPriceCents(
      basis,
      { pricePerPackCents: matrix.pricePerPackCents ?? null },
      composed.slots,
      matrix.pool,
    )
    packPricedSubtotalCents = orderTotalCents(pricePerPack, packSel.packCount)
    for (const p of matrix.pool) flavorPriceByPreset.set(p.flavorPresetId, p.unitPriceCents)
    packPersist = {
      packVariantId: packSel.packVariantId,
      packCount: packSel.packCount,
      packUnitsPerPack: unitsPerPack,
      pricingBasisSnapshot: basis,
      pricePerPackCentsSnapshot: pricePerPack,
    }

    // Per-flavor ORDER total = packCount × that slot's per-pack units.
    const presetIds = composed.slots.map((s) => s.flavorPresetId)
    const presets = await prisma.flavorPreset.findMany({
      where: { id: { in: presetIds } },
      select: { id: true, name: true, statementOfIdentity: true },
    })
    const byId = new Map(presets.map((p) => [p.id, p]))
    const dvByFlavor = await resolveFlavorDesignVersions(product.id, presetIds)
    flavorRows = composed.slots.map((s) => ({
      flavorPresetId: s.flavorPresetId,
      qty: packSel.packCount * s.units,
      flavorName: byId.get(s.flavorPresetId)?.name ?? 'Flavor',
      soiSnapshot: byId.get(s.flavorPresetId)?.statementOfIdentity ?? null,
      designVersionId: dvByFlavor.get(s.flavorPresetId) ?? null,
    }))
  } else if (packRules?.packingProfile?.flavorMode === 'MULTI') {
    // ── LEGACY model (split the order quantity) ───────────────────────────────
    const picks = state.production.flavors ?? []
    const validation = validatePackSelection(picks, {
      maxFlavors: packRules.maxFlavorsPerPack,
      minPerFlavor: 1,
      capacity: qty,
    })
    if (!validation.ok) {
      return { ok: false, error: validation.errors[0]?.message ?? 'Adjust your variety-pack flavors in step 2 before paying.' }
    }
    const chosen = picks.filter((p) => p.qty > 0)
    const presets = await prisma.flavorPreset.findMany({
      where: { id: { in: chosen.map((p) => p.flavorPresetId) } },
      select: { id: true, name: true, statementOfIdentity: true },
    })
    const byId = new Map(presets.map((p) => [p.id, p]))
    const dvByFlavor = await resolveFlavorDesignVersions(product.id, chosen.map((p) => p.flavorPresetId))
    flavorRows = chosen.map((p) => ({
      flavorPresetId: p.flavorPresetId,
      qty: p.qty,
      flavorName: byId.get(p.flavorPresetId)?.name ?? 'Flavor',
      soiSnapshot: byId.get(p.flavorPresetId)?.statementOfIdentity ?? null,
      designVersionId: dvByFlavor.get(p.flavorPresetId) ?? null,
    }))
  }

  // --- 3. Resolve ship-to + warehouse-partner ID -----------------------------
  //        L1b passes the template so the resolver can (a) run the scored FC
  //        pick from the pinned manufacturer (L4a weighted band, V1 nearest-
  //        eligible below 3 nodes) and (b) server-re-check
  //        HOLD_AT_MANUFACTURER eligibility.
  const shipTo = await resolveShipTo({
    user,
    productId: product.id,
    draftState: state,
    template: product.productTemplate,
  })
  if (!shipTo.ok) return { ok: false, error: shipTo.error }

  // --- 4. Find routing (existing @ilaunchify/orders) -------------------------
  // B4 — pass real matching context from the product's brand so routing scores
  // proximity (brand operating region) + cert (brand's primary target market),
  // not capacity alone. Both null-safe → the scorer omits any absent dimension.
  const primaryMarket = await prisma.brandTargetMarket.findFirst({
    where: { brandId: product.brandId, isPrimary: true },
    select: { marketId: true },
  })
  const routing = await findRouting({
    productId: product.id,
    quantity: qty,
    templateId: product.productTemplateId,
    destinationRegionId: product.brand.operatingRegionId,
    targetMarketId: primaryMarket?.marketId ?? null,
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

  // Reconcile — pick the higher of the candidates so partner cost is never under-
  // funded. The wizard UI showed productionSubtotalCents; if dispatch math comes
  // out higher we treat the gap as a 'platform absorbs' line (V1 simplification;
  // V2 reconciles partner pricing properly). For a NEW pack-model order the
  // creator-facing basis-aware pack price (packPricedSubtotalCents) is the amount
  // the creator agreed to pay, so it also enters the reconcile — the booked
  // subtotal is the max of all three, never below the priced pack total.
  const productionTotalCents = Math.max(
    productionSubtotalCents,
    dispatchSubtotal,
    packPricedSubtotalCents,
  )

  // Admin-tunable order policy (fees + shipping), resolved for THIS creator's tier
  // so scoped overrides (tier/market/region) take effect.
  const creatorTier = await getCreatorTier(user.id)
  const orderSettings = await resolveOrderSettings({ creatorTier })

  // --- 6. Shipping — Phase L2 / L5: try the SAME live carrier quote the Step-4
  //        estimate used (rate + OrderSettings.firstLegMarginBps margin) against
  //        the resolved concrete ship-to, so the number the creator saw is the
  //        number that books. quoteCarrierShipping returns null on ANY failure
  //        (gate off, no key, non-US / placeholder address, gateway timeout, no
  //        eligible rate) → fall back silently to the admin-tunable flat rate /
  //        V1 per-unit tiers. HOLD orders have no ship leg at order time
  //        (estimateFlatShipping already returns 0 for them).
  let baseShippingCents = estimateFlatShipping(qty, state.fulfillment.shipToType, orderSettings)
  // CHANNEL_INBOUND carries a placeholder ship-to (the channel assigns FCs at
  // plan confirmation) — never send it to the carrier API; the flat estimate
  // stands until the SP-API plan resolves real destinations.
  if (
    shipTo.data.shipToType !== 'HOLD_AT_MANUFACTURER' &&
    shipTo.data.shipToType !== 'CHANNEL_INBOUND'
  ) {
    const carrierQuote = await quoteCarrierShipping({
      productId: product.id,
      quantity: qty,
      destination: {
        name: shipTo.data.contactName,
        street1: shipTo.data.addressLine1,
        street2: shipTo.data.addressLine2,
        city: shipTo.data.city,
        state: shipTo.data.state,
        zip: shipTo.data.postalCode,
        country: shipTo.data.country,
      },
    })
    if (carrierQuote) baseShippingCents = carrierQuote.shippingCents
  }
  const freeThreshold = orderSettings.freeShippingThresholdCents
  const shippingCents =
    freeThreshold != null && productionTotalCents >= freeThreshold ? 0 : baseShippingCents

  // --- 7. Platform fee (admin-tunable; falls back to PLATFORM_FEE_BPS) --------
  const feeBps = orderSettings.productionFeeBps ?? PLATFORM_FEE_BPS
  const feeBase = productionTotalCents + shippingCents
  const platformFeeCents = Math.floor(feeBase * (feeBps / 10000))
  const grossTotalCents = productionTotalCents + shippingCents + platformFeeCents

  // --- 7b. Sample credit (Pavel 2026-06-10) — a paid sample mints credit toward
  //         the creator's first production order. Decision: platform-funded +
  //         partner-whole. The only Stripe-Connect-clean way to keep the partner
  //         whole is to offset the PLATFORM FEE (application_fee can't go
  //         negative), so per-order credit is capped at platformFeeCents and any
  //         excess ROLLS OVER to the next order (no credit lost). Result: the
  //         creator sees a lower platform fee, the partner still receives
  //         productionTotal + shipping. Cast-guarded (SampleCredit post-dates the
  //         generated client until the migration).
  let sampleCreditAppliedCents = 0
  let consumedCredits: Array<{ id: string; newRemainingCents: number; fullyUsed: boolean }> = []
  const sampleSettings = await getSampleSettings()
  if (sampleSettings.creditBackEnabled && product.productTemplateId && platformFeeCents > 0) {
    const credits = await (prisma as unknown as {
      sampleCredit: { findMany: (a: unknown) => Promise<Array<{ id: string; remainingCents: number; status: SampleCreditEntry['status']; expiresAt: Date | null }>> }
    }).sampleCredit
      .findMany({
        where: { creatorUserId: user.id, brandId: product.brandId, productTemplateId: product.productTemplateId, status: 'AVAILABLE' },
        orderBy: { createdAt: 'asc' }, // FIFO — spend oldest first
        select: { id: true, remainingCents: true, status: true, expiresAt: true },
      })
      .catch(() => [] as Array<{ id: string; remainingCents: number; status: SampleCreditEntry['status']; expiresAt: Date | null }>)
    const applied = applySampleCredit(
      platformFeeCents,
      credits.map((c) => ({ id: c.id, remainingCents: c.remainingCents, status: c.status, expiresAt: c.expiresAt })),
    )
    sampleCreditAppliedCents = applied.appliedCents
    consumedCredits = applied.consumed.map((c) => ({ id: c.id, newRemainingCents: c.newRemainingCents, fullyUsed: c.fullyUsed }))
  }
  const applicationFeeCents = platformFeeCents - sampleCreditAppliedCents
  const totalCents = grossTotalCents - sampleCreditAppliedCents

  // --- Creator Product Configuration snapshot (docs/CREATOR_PRODUCT_CONFIGURATION.md) ---
  // The immutable "order of the creator", assembled from the pieces resolved above and
  // stored on the OrderItem so the partner manifest + channel listing read THIS instead
  // of re-deriving from the template pool. Recipe = the product's final RecipeIngredient
  // rows (replaceable swaps + optional activations already baked in via `source`).
  const recipeIngredients = product.recipe
    ? await prisma.recipeIngredient.findMany({
        where: { recipeId: product.recipe.id },
        orderBy: { position: 'asc' },
        include: {
          ingredient: {
            select: { labelDeclarationName: true, allergenFlags: true, bioengineeredStatus: true },
          },
        },
      })
    : []
  const configuration = buildCreatorConfiguration({
    flavors: flavorRows.map((f) => ({
      flavorPresetId: f.flavorPresetId,
      name: f.flavorName,
      statementOfIdentity: f.soiSnapshot,
      qty: f.qty,
      unitPriceCents: flavorPriceByPreset.get(f.flavorPresetId) ?? null,
      lockedDesignVersionId: f.designVersionId,
    })),
    recipe: product.recipe
      ? {
          servingSizeG: Number(product.recipe.servingSizeG),
          servingsPerContainer: Number(product.recipe.servingsPerContainer),
          ingredients: recipeIngredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            labelDeclarationName: ri.ingredient.labelDeclarationName ?? null,
            weightG: Number(ri.weightG),
            position: ri.position,
            source: ri.source ?? null,
            filledSlotId: ri.filledSlotId ?? null,
            allergenFlags: ri.ingredient.allergenFlags ?? [],
            bioengineeredStatus: ri.ingredient.bioengineeredStatus ?? null,
          })),
        }
      : null,
    variant: { id: packPersist?.packVariantId ?? null, containerFormat: null, netQuantity: null },
    options: {
      substrateSlug: state.production.substrateSlug,
      packagingMaterialSlug: state.production.packagingMaterialSlug,
      finishPartnerFinishIds: state.production.finishPartnerFinishIds,
      dieCutTemplateId: null,
    },
    pricing: {
      basis: packPersist?.pricingBasisSnapshot ?? null,
      pricePerPackCents: packPersist?.pricePerPackCentsSnapshot ?? null,
    },
    lockedPhraseIds: [],
  })

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

  // L1b — HOLD orders attach a StorageAgreement inside the order txn; the id
  // surfaces here for the post-commit audit entry.
  let storageAgreementId: string | null = null
  // L3a — CHANNEL_INBOUND orders attach a DRAFT ChannelInboundPlan inside the
  // txn; the id surfaces for the post-commit audit entry. The placement-splits
  // decision (§7.2 optimizer) is PURE, so it's computed here on V1 estimates:
  // Amazon's minimal-split placement fee ≈ $0.30/unit; one freight leg from
  // the shipping quote when we have one, else a $400 LTL-leg fallback; Amazon
  // typically assigns 4 destinations under optimized splits. Real per-leg
  // figures replace these when placement options come back from SP-API.
  let channelInboundPlanId: string | null = null
  const channelFreightPerDestinationCents = shippingCents > 0 ? shippingCents : 40_000
  const channelPlacement: PlacementDecision | null =
    shipTo.data.shipToType === 'CHANNEL_INBOUND' && shipTo.data.channelInbound
      ? decidePlacementSplits({
          units: qty,
          minimalSplitFeePerUnitCents: 30,
          freightPerDestinationCents: channelFreightPerDestinationCents,
          optimizedDestinationCount: 4,
        })
      : null

  const order = await createOrderWithNumber((orderNumber) => prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      // orderNumber post-dates the generated client (cast-guarded). The @unique
      // retry lives in createOrderWithNumber.
      data: {
        orderNumber,
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
      } as Parameters<typeof tx.order.create>[0]['data'],
    })
    const orderItem = await tx.orderItem.create({
      data: {
        orderId: created.id,
        productId: product.id,
        quantity: qty,
        unitPriceCents: Math.round(productionTotalCents / qty),
        totalCents: productionTotalCents,
        designVersionId: lockedDesignVersionId,
        // Creator Product Configuration snapshot (cast-guarded — the column post-dates
        // the generated client until db:push). Always written.
        configurationSnapshot: configuration as unknown as object,
        // Variety-pack structure snapshot (cast-guarded — these columns post-date
        // the generated client until the migration). Null for non-pack items.
        ...(packPersist
          ? ({
              packVariantId: packPersist.packVariantId,
              packCount: packPersist.packCount,
              packUnitsPerPack: packPersist.packUnitsPerPack,
              pricingBasisSnapshot: packPersist.pricingBasisSnapshot,
              pricePerPackCentsSnapshot: packPersist.pricePerPackCentsSnapshot,
            } as Record<string, unknown>)
          : {}),
      } as Parameters<typeof tx.orderItem.create>[0]['data'],
    })

    // Variety-pack composition — one OrderItemFlavor per distinct flavor (Slice 1).
    // Cast-guarded: the model post-dates the generated client until the migration.
    if (flavorRows.length > 0) {
      await (tx as unknown as { orderItemFlavor: { createMany: (a: unknown) => Promise<unknown> } }).orderItemFlavor.createMany({
        data: flavorRows.map((f) => ({
          orderItemId: orderItem.id,
          flavorPresetId: f.flavorPresetId,
          qty: f.qty,
          flavorName: f.flavorName,
          soiSnapshot: f.soiSnapshot,
        })),
      })
    }

    // L1b — HOLD_AT_MANUFACTURER attaches a StorageAgreement (LOGISTICS §4).
    // V1 simplification: startedAt = order time. V1.1 moves the storage-clock
    // start to the dispatch DELIVERED hook — the clock legally starts when the
    // finished run lands in storage, and the free grace days count from there.
    // Fee schedule is snapshotted at agreement time (legal reproducibility —
    // the partner can reprice later without touching live agreements).
    if (shipTo.data.shipToType === 'HOLD_AT_MANUFACTURER' && shipTo.data.hold) {
      const agreement = await tx.storageAgreement.create({
        data: {
          orderId: created.id,
          partnerServiceId: shipTo.data.hold.partnerServiceId,
          mode: shipTo.data.hold.mode,
          status: 'ACTIVE',
          startedAt: new Date(),
          unitsRemaining: qty,
          feeSnapshotJson: {
            ...shipTo.data.hold.feeSnapshot,
            referralFeeBps: orderSettings.warehouseReferralFeeBps,
          } as unknown as object,
        },
      })
      storageAgreementId = agreement.id
    }

    // L3a — CHANNEL_INBOUND attaches a DRAFT ChannelInboundPlan (LOGISTICS §7.2).
    // externalPlanId is 'pending-spapi' until Amazon developer credentials land:
    // the L3b confirm flow calls createInboundPlan, writes the real inboundPlanId
    // + channel-assigned FC addresses into destinationsJson, and flips DRAFT →
    // CONFIRMED (manifest becomes immutable — channels fine deviations).
    if (
      shipTo.data.shipToType === 'CHANNEL_INBOUND' &&
      shipTo.data.channelInbound &&
      channelPlacement
    ) {
      const plan = await tx.channelInboundPlan.create({
        data: {
          orderId: created.id,
          channelConnectionId: shipTo.data.channelInbound.channelConnectionId,
          externalPlanId: 'pending-spapi',
          placementChoice: channelPlacement.choice,
          feesJson: {
            source: 'V1_ESTIMATE', // stubbed pre-SP-API figures, see comment above
            inputs: {
              units: qty,
              minimalSplitFeePerUnitCents: 30,
              freightPerDestinationCents: channelFreightPerDestinationCents,
              optimizedDestinationCount: 4,
            },
            decision: channelPlacement,
            gateSnapshot: shipTo.data.channelInbound.gateSnapshot,
            fnsku: shipTo.data.channelInbound.fnsku,
          } as unknown as object,
          status: 'DRAFT',
        },
        select: { id: true },
      })
      channelInboundPlanId = plan.id
    }

    // Consume the applied sample credit. The `status: 'AVAILABLE'` guard in the
    // where-clause makes this a no-op if a concurrent order already spent it
    // (no double-spend). Fully-used rows flip to APPLIED + link this order.
    for (const c of consumedCredits) {
      await (tx as unknown as { sampleCredit: { updateMany: (a: unknown) => Promise<unknown> } }).sampleCredit.updateMany({
        where: { id: c.id, status: 'AVAILABLE' },
        data: c.fullyUsed
          ? { remainingCents: c.newRemainingCents, status: 'APPLIED', appliedOrderId: created.id }
          : { remainingCents: c.newRemainingCents },
      })
    }

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
  }))

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
      platformFeeCents,
      sampleCreditAppliedCents,
      totalCents,
      shipToType: shipTo.data.shipToType,
      orderNumber: (order as { orderNumber?: string | null }).orderNumber ?? null,
      surface: 'checkout-wizard',
      // Variety-pack structure (null for non-pack items) — recorded for
      // reproducibility alongside the snapshot columns on OrderItem.
      ...(packPersist
        ? {
            packVariantId: packPersist.packVariantId,
            packCount: packPersist.packCount,
            packUnitsPerPack: packPersist.packUnitsPerPack,
            pricingBasis: packPersist.pricingBasisSnapshot,
            pricePerPackCents: packPersist.pricePerPackCentsSnapshot,
          }
        : {}),
    },
  })

  // --- 11.aa L1b — FC award trail + StorageAgreement audit --------------------
  //          FcAwardLog needs the real orderId, so it lands post-commit.
  //          Best-effort: the explainability trail must never fail an
  //          already-created order.
  if (shipTo.data.fcAward) {
    await prisma.fcAwardLog
      .create({
        data: {
          partnerServiceId: shipTo.data.fcAward.partnerServiceId,
          orderId: order.id,
          scoreJson: shipTo.data.fcAward.scoreJson as unknown as object,
        },
      })
      .catch(() => {/* rotation-fairness trail only — never blocks the order */})
  }
  //          StorageAgreement creation is a mutating action → AuditLog row.
  //          Logged against the Order entity: 'StorageAgreement' isn't in
  //          AUDIT_ENTITY_TYPES yet (packages/audit owns that list — L1c).
  if (storageAgreementId && shipTo.data.hold) {
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'STORAGE_AGREEMENT_CREATED',
      toValue: 'ACTIVE',
      payload: {
        storageAgreementId,
        partnerServiceId: shipTo.data.hold.partnerServiceId,
        mode: shipTo.data.hold.mode,
        unitsRemaining: qty,
        feeSnapshot: shipTo.data.hold.feeSnapshot,
        referralFeeBps: orderSettings.warehouseReferralFeeBps,
        surface: 'checkout-wizard',
      },
    })
  }
  //          L3a — ChannelInboundPlan creation is a mutating action → AuditLog
  //          row. Logged against the Order entity: 'ChannelInboundPlan' isn't
  //          in AUDIT_ENTITY_TYPES yet (packages/audit owns that list — same
  //          precedent as StorageAgreement above).
  if (channelInboundPlanId && shipTo.data.channelInbound && channelPlacement) {
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'CHANNEL_INBOUND_PLAN_CREATED',
      toValue: 'DRAFT',
      payload: {
        channelInboundPlanId,
        channelConnectionId: shipTo.data.channelInbound.channelConnectionId,
        channelCode: shipTo.data.channelInbound.channelCode,
        inboundChannel: shipTo.data.channelInbound.inboundChannel,
        externalPlanId: 'pending-spapi',
        placementChoice: channelPlacement.choice,
        minimalTotalCents: channelPlacement.minimalTotalCents,
        optimizedTotalCents: channelPlacement.optimizedTotalCents,
        fnsku: shipTo.data.channelInbound.fnsku,
        gateSnapshot: shipTo.data.channelInbound.gateSnapshot,
        surface: 'checkout-wizard',
      },
    })
  }

  // --- 11.a Per-flavor labels Phase 4 — snapshot each flavor's working design
  //          onto its OrderItemFlavor so production carries the right per-flavor
  //          artwork. POST-COMMIT + best-effort: a not-yet-migrated
  //          `designVersionId` column can never abort the order transaction.
  if (flavorRows.some((f) => f.designVersionId)) {
    try {
      const item = await prisma.orderItem.findFirst({ where: { orderId: order.id }, select: { id: true } })
      if (item) {
        const oif = (prisma as unknown as {
          orderItemFlavor: { updateMany: (a: unknown) => Promise<unknown> }
        }).orderItemFlavor
        for (const f of flavorRows) {
          if (!f.designVersionId) continue
          await oif.updateMany({
            where: { orderItemId: item.id, flavorPresetId: f.flavorPresetId },
            data: { designVersionId: f.designVersionId },
          })
        }
      }
    } catch {
      // designVersionId column not migrated yet — the snapshot is best-effort.
    }
  }

  // --- 11.b G6.b — create the recurring ProductionSubscription if the ----
  //          creator accepted Subscribe & save at Step 3. Fails soft:
  //          if Stripe Subscription creation throws, we keep the day-1
  //          Order intact (the creator still pays for that one-time
  //          run) and surface the subscription error in internalNotes.
  //          The creator can resubscribe later from their dashboard.
  const sub = state.subscription
  if (sub.offerAccepted && sub.cadence) {
    const discountBp = Math.max(0, Math.min(10_000, sub.discountBp))
    // Recurring runs use the GROSS total — the sample credit is a one-time
    // first-order benefit and must not discount every subscription run.
    const perRunUnitCents = Math.max(
      0,
      Math.round(grossTotalCents * (10_000 - discountBp) / 10_000),
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
          subtotalCentsAtCreation: grossTotalCents,
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
      applicationFeeCents,
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
  shipToType: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER' | 'HOLD_AT_MANUFACTURER' | 'CHANNEL_INBOUND'
  shipToPartnerServiceId: string | null
  contactName: string
  contactPhone: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string | null
  postalCode: string
  country: string
  /** L1b — set for HOLD orders; drives StorageAgreement creation in the txn. */
  hold?: {
    partnerServiceId: string
    mode: 'ON_DEMAND' | 'STOCK_RELEASE'
    feeSnapshot: {
      billingUnit: string | null
      rateCents: number | null
      graceDays: number | null
      minMonthlyCents: number | null
      pickFeeCents: number | null
      packFeeCents: number | null
    }
  }
  /** L4a — scored FC award (V1.5 weighted band; the scorer itself falls back
   *  to V1 nearest-eligible below 3 eligible nodes — `algorithm` in the payload
   *  records which ran). Written to FcAwardLog post-commit. */
  fcAward?: {
    partnerServiceId: string
    scoreJson: ReturnType<typeof buildScoredAwardPayload>
  }
  /** L3a — set for CHANNEL_INBOUND orders; drives ChannelInboundPlan creation
   *  in the order txn. gateSnapshot records what passed at placement time. */
  channelInbound?: {
    channelConnectionId: string
    channelCode: string
    inboundChannel: InboundChannel
    fnsku: string
    gateSnapshot: {
      storageClass: string
      hazmatClass: string
      meltable: boolean
      shelfLifeDays: number | null
      daysUntilCheckIn: number
      channelMinShelfLifeDays: number
    }
  }
}

/** The ProductTemplate slice resolveShipTo needs — owner-pinned manufacturer
 *  + the L0 logistics flags. Structural, so the full Prisma row satisfies it. */
interface ShipToTemplate {
  id: string
  manufacturerServiceId: string | null
  storageClass: string
  hazmatClass: string
  labelingType: string
  // L3a — channel-inbound gate inputs
  meltable: boolean
  leadTimeFirstRunDays: number | null
  leadTimeRepeatDays: number | null
}

async function resolveShipTo({
  user,
  productId,
  draftState,
  template,
}: {
  user: { id: string }
  productId: string
  draftState: CheckoutDraftState
  template: ShipToTemplate | null
}): Promise<Result<ShipToResolved>> {
  const f = draftState.fulfillment

  if (f.shipToType === 'CLOSEST_WAREHOUSE' || f.shipToType === 'SPECIFIC_WAREHOUSE') {
    let warehouseId = f.warehousePartnerServiceId
    let fcAward: ShipToResolved['fcAward']
    if (!warehouseId && f.shipToType === 'CLOSEST_WAREHOUSE') {
      // L4a — FC selection Phases 2–3: weighted scoring + rotation inside the
      // indifference band (docs/LOGISTICS_AND_FULFILLMENT.md §5). The scorer
      // internally falls back to V1 nearest-eligible below 3 eligible nodes;
      // scoreJson.algorithm records which path ran. Weights are admin-tunable
      // on the OrderSettings singleton; FcAwardLog history (last 90 days)
      // feeds the rotation-fairness dimension. Cold classes stay admin-gated
      // (L1 lock) and are re-checked server-side here.
      const storageClass = template?.storageClass ?? 'AMBIENT'
      if (!(await isStorageClassEnabled(storageClass))) {
        return {
          ok: false,
          error: 'No cold-storage fulfillment center is available yet for this product.',
        }
      }
      const [origin, warehouses] = await Promise.all([
        template?.manufacturerServiceId
          ? prisma.partnerService.findUnique({
              where: { id: template.manufacturerServiceId },
              select: {
                facilityLat: true,
                facilityLng: true,
                partner: { select: { state: true } },
              },
            })
          : Promise.resolve(null),
        prisma.partnerService.findMany({
          where: { type: 'WAREHOUSE', status: 'ACTIVE' },
          select: {
            id: true,
            storageClasses: true,
            hazmatAccepted: true,
            fcCertifications: true,
            weeklyPalletCapacity: true,
            facilityLat: true,
            facilityLng: true,
            partner: { select: { companyName: true, city: true, state: true } },
            // P1 blackout enforcement — active window today = hard-excluded (fc-selector)
            blackoutDates: {
              where: { startsOn: { lte: new Date() }, endsOn: { gte: new Date() } },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ])
      const candidates: FcCandidate[] = warehouses.map((w) => ({
        partnerServiceId: w.id,
        partnerName: w.partner.companyName,
        city: w.partner.city,
        state: w.partner.state,
        storageClasses: w.storageClasses,
        hazmatAccepted: w.hazmatAccepted,
        fcCertifications: w.fcCertifications,
        weeklyPalletCapacity: w.weeklyPalletCapacity,
        facilityLat: w.facilityLat,
        facilityLng: w.facilityLng,
        blackedOut: w.blackoutDates.length > 0,
      }))
      const [weights, awardHistory] = await Promise.all([
        readFcScoringWeights(),
        readFcAwardHistory(candidates.map((c) => c.partnerServiceId)),
      ])
      const selection = scoreAndSelectFc(
        candidates,
        {
          storageClass,
          hazmatClass: template?.hazmatClass ?? 'NONE',
          domain: template?.labelingType ?? 'FOOD',
          pallets: 0, // pallet count unknown pre-manifest — skip the capacity filter
          originLat: origin?.facilityLat ?? null,
          originLng: origin?.facilityLng ?? null,
          originState: origin?.partner.state ?? null,
        },
        {
          weights,
          history: awardHistory.history,
          totalRecentAwards: awardHistory.totalRecentAwards,
        },
      )
      if (selection.winner) {
        warehouseId = selection.winner.ranked.candidate.partnerServiceId
        fcAward = {
          partnerServiceId: warehouseId,
          scoreJson: buildScoredAwardPayload(selection),
        }
      }
      if (!warehouseId) {
        // Legacy fallback — first ACTIVE warehouse keeps the order moving when
        // no node carries the typed L0 eligibility fields yet (pre-L0 rows
        // have empty storageClasses and rank ineligible). No award log: the
        // fallback is not an algorithmic pick.
        const closest = await prisma.partnerService.findFirst({
          where: { type: 'WAREHOUSE', status: 'ACTIVE' },
          select: { id: true },
        })
        warehouseId = closest?.id ?? null
      }
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
        ...(fcAward ? { fcAward } : {}),
      },
    }
  }

  if (f.shipToType === 'HOLD_AT_MANUFACTURER') {
    // L1b — server-side re-check of everything the destination card promised
    // (NEVER trust the client). Runs the same pure resolver the card payload
    // came from: admin gate (destination:HOLD_AT_MANUFACTURER), partner
    // offersStorage, storage-class fit (incl. the cold-class admin gate),
    // shelf-life vs the partner's dwell policy.
    const svc = template?.manufacturerServiceId
      ? await prisma.partnerService.findFirst({
          where: { id: template.manufacturerServiceId, status: 'ACTIVE' },
          select: {
            id: true,
            offersStorage: true,
            onDemandEnabled: true,
            canShipParcel: true,
            storageClasses: true,
            maxDwellDays: true,
            storageBillingUnit: true,
            storageRateCents: true,
            storageFreeGraceDays: true,
            storageMinMonthlyCents: true,
            pickFeeCents: true,
            packFeeCents: true,
            partner: true,
          },
        })
      : null
    const storageClass = template?.storageClass ?? 'AMBIENT'
    const [gates, classEnabled, shelf] = await Promise.all([
      getLogisticsSettings(),
      isStorageClassEnabled(storageClass),
      template
        ? prisma.productTemplateVariant.aggregate({
            where: { productTemplateId: template.id },
            _min: { shelfLifeDays: true },
          })
        : Promise.resolve(null),
    ])
    const holdOption = resolveDestinationOptions({
      product: {
        storageClass,
        hazmatClass: template?.hazmatClass ?? 'NONE',
        domain: template?.labelingType ?? 'FOOD',
      },
      manufacturer: svc
        ? {
            offersStorage: svc.offersStorage,
            onDemandEnabled: svc.onDemandEnabled,
            canShipParcel: svc.canShipParcel,
            // A gated-off cold class reads as "cannot store this temperature
            // class" — same construction listDestinationOptions uses.
            storageClasses: classEnabled
              ? svc.storageClasses
              : svc.storageClasses.filter((c) => c !== storageClass),
            maxDwellDays: svc.maxDwellDays,
            productShelfLifeDays: shelf?._min.shelfLifeDays ?? null,
          }
        : null,
      gates,
      // Only the HOLD option is read below — the other cards' inputs are moot.
      eligibleWarehouseCount: 0,
      hasConnectedChannel: false,
    }).find((o) => o.type === 'HOLD_AT_MANUFACTURER')
    if (!svc || holdOption?.enabled !== true) {
      return {
        ok: false,
        error: holdOption?.disabledReason ?? 'Storage at the manufacturer is not available yet.',
      }
    }

    // Storage mode — validate against capability; default to what's offered.
    const onDemandAvailable = svc.onDemandEnabled && svc.canShipParcel
    if (f.storageMode === 'ON_DEMAND' && !onDemandAvailable) {
      return {
        ok: false,
        error: 'This manufacturer cannot ship parcels on demand — choose stock release instead.',
      }
    }
    const mode: 'ON_DEMAND' | 'STOCK_RELEASE' =
      f.storageMode ?? (onDemandAvailable ? 'ON_DEMAND' : 'STOCK_RELEASE')

    // Ship-to = the producing partner's own address (the goods never move;
    // the manifest still needs a concrete address block for documents).
    return {
      ok: true,
      data: {
        shipToType: 'HOLD_AT_MANUFACTURER',
        shipToPartnerServiceId: svc.id,
        contactName: svc.partner.companyName,
        contactPhone: svc.partner.contactPhone,
        addressLine1: svc.partner.addressLine1 ?? 'Address on file',
        addressLine2: svc.partner.addressLine2,
        city: svc.partner.city ?? 'Unknown',
        state: svc.partner.state,
        postalCode: svc.partner.postalCode ?? '00000',
        country: svc.partner.country,
        hold: {
          partnerServiceId: svc.id,
          mode,
          feeSnapshot: {
            billingUnit: svc.storageBillingUnit,
            rateCents: svc.storageRateCents,
            graceDays: svc.storageFreeGraceDays,
            minMonthlyCents: svc.storageMinMonthlyCents,
            pickFeeCents: svc.pickFeeCents,
            packFeeCents: svc.packFeeCents,
          },
        },
      },
    }
  }

  if (f.shipToType === 'CHANNEL_INBOUND') {
    // L3a — server-side re-check of EVERY gate the destination card promised
    // (NEVER trust the client): destination gate + per-channel LogisticsSetting
    // gate + the pure channel gates (temp / meltable window / shelf-life / DG)
    // + FNSKU presence + connection ownership.
    if (!f.channelConnectionId) {
      return { ok: false, error: 'Pick which channel connection this run ships into.' }
    }
    // Gate 1 — destination-level admin gate (mirrors resolveDestinationOptions).
    if (!(await isLogisticsEnabled('destination:CHANNEL_INBOUND'))) {
      return { ok: false, error: 'Shipping directly into a sales channel is coming soon.' }
    }
    // Ownership fence — the connection must be THIS creator's and CONNECTED.
    const conn = await prisma.channelConnection.findFirst({
      where: {
        id: f.channelConnectionId,
        creatorUserId: user.id,
        status: 'CONNECTED',
        channel: { enabled: true },
      },
      select: {
        id: true,
        channel: { select: { code: true, displayName: true } },
        productLinks: { where: { productId }, select: { fnsku: true } },
      },
    })
    if (!conn) {
      return {
        ok: false,
        error: 'This channel connection is unavailable — reconnect it in Settings → Channels.',
      }
    }
    const inboundChannel = channelInboundForCode(conn.channel.code)
    if (!inboundChannel) {
      return {
        ok: false,
        error: `${conn.channel.displayName} has no direct inbound program — ship to a fulfillment center instead.`,
      }
    }
    // Gate 2 — per-channel admin gate (flipping channel_inbound:AMAZON_FBA on
    // later is the ONLY thing that changes; no schema/UI change needed).
    if (!(await isLogisticsEnabled(`channel_inbound:${inboundChannel}`))) {
      return {
        ok: false,
        error: `Inbound shipping into ${conn.channel.displayName} isn't enabled yet.`,
      }
    }
    // Gate 3 — FNSKU must be captured before an FBA-bound run can book.
    const fnsku = conn.productLinks[0]?.fnsku ?? null
    if (!fnsku) {
      return { ok: false, error: 'Add the FNSKU for this product in Settings → Channels first.' }
    }
    // Gate 4 — the pure channel gates, re-run with fresh server-side inputs.
    const [shelfAgg, settingsRow] = await Promise.all([
      template
        ? prisma.productTemplateVariant.aggregate({
            where: { productTemplateId: template.id },
            _min: { shelfLifeDays: true },
          })
        : Promise.resolve(null),
      prisma.orderSettings
        .findUnique({ where: { id: 'default' }, select: { channelMinShelfLifeDays: true } })
        .catch(() => null),
    ])
    const shelfLifeDays = shelfAgg?._min.shelfLifeDays ?? null
    const channelMinShelfLifeDays = settingsRow?.channelMinShelfLifeDays ?? 105
    // Production lead (first-run figure when set, else repeat, else the 28-day
    // platform default) + 7-day transit fallback until real SP-API transit data.
    const daysUntilCheckIn =
      (template?.leadTimeFirstRunDays ?? template?.leadTimeRepeatDays ?? 28) + 7
    const gate = evaluateChannelInboundGates({
      channel: inboundChannel,
      storageClass: template?.storageClass ?? 'AMBIENT',
      hazmatClass: template?.hazmatClass ?? 'NONE',
      meltable: template?.meltable ?? false,
      shelfLifeDays,
      daysUntilCheckIn,
      channelMinShelfLifeDays,
      checkInDate: new Date(Date.now() + daysUntilCheckIn * 24 * 60 * 60 * 1000),
      // V1: no DG-program enrollment capture exists yet, so hazmat SKUs always
      // fail this gate — flips when readinessJson capture lands (Phase L3b+).
      dgProgramApproved: false,
    })
    if (!gate.eligible) {
      return { ok: false, error: gate.reasons[0] ?? 'This product cannot ship into the channel.' }
    }

    // Ship-to is a PLACEHOLDER block — the channel assigns its receiving FC(s)
    // only when the inbound plan is confirmed via SP-API; the real addresses
    // land in ChannelInboundPlan.destinationsJson at that point, and the
    // manifest/labels are regenerated from there. Until then the Order still
    // needs a concrete address shape for documents + display.
    return {
      ok: true,
      data: {
        shipToType: 'CHANNEL_INBOUND',
        shipToPartnerServiceId: null,
        contactName: `${conn.channel.displayName} fulfillment network`,
        contactPhone: null,
        addressLine1: 'Assigned by channel at inbound plan confirmation',
        addressLine2: null,
        city: 'TBD',
        state: null,
        postalCode: '00000',
        country: 'US',
        channelInbound: {
          channelConnectionId: conn.id,
          channelCode: conn.channel.code,
          inboundChannel,
          fnsku,
          gateSnapshot: {
            storageClass: template?.storageClass ?? 'AMBIENT',
            hazmatClass: template?.hazmatClass ?? 'NONE',
            meltable: template?.meltable ?? false,
            shelfLifeDays,
            daysUntilCheckIn,
            channelMinShelfLifeDays,
          },
        },
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

/** Channel.code → the shipping package's InboundChannel vocabulary. Null for
 *  channels with no factory→FC inbound program. Duplicated from
 *  fulfillment-actions ('use server' files can only export async actions). */
function channelInboundForCode(code: string): InboundChannel | null {
  if (code === 'amazon') return 'AMAZON_FBA'
  if (code === 'walmart') return 'WALMART_WFS'
  if (code === 'tiktok') return 'TIKTOK_FBT'
  return null
}

// -----------------------------------------------------------------------------
// L4a — FC scoring inputs (weights + award history). Duplicated in
// fulfillment-actions.ts ('use server' files can only export async actions,
// and these must never be client-invokable endpoints).
// -----------------------------------------------------------------------------

/** Spec §5 starting weights — used when the singleton row / fields are missing. */
const FC_WEIGHT_DEFAULTS: FcScoringWeights = {
  costWeightPct: 35,
  distanceWeightPct: 15,
  slaWeightPct: 15,
  capacityWeightPct: 15,
  rotationWeightPct: 10,
  storageMatchWeightPct: 10,
  rotationBandPct: 5,
}

/** OrderSettings.fc*WeightPct aren't surfaced by getOrderSettings() yet — read
 *  them straight off the singleton (channelMinShelfLifeDays pattern). */
async function readFcScoringWeights(): Promise<FcScoringWeights> {
  const row = await prisma.orderSettings
    .findUnique({
      where: { id: 'default' },
      select: {
        fcCostWeightPct: true,
        fcDistanceWeightPct: true,
        fcSlaWeightPct: true,
        fcCapacityWeightPct: true,
        fcRotationWeightPct: true,
        fcStorageMatchWeightPct: true,
        fcRotationBandPct: true,
      },
    })
    .catch(() => null)
  return {
    costWeightPct: row?.fcCostWeightPct ?? FC_WEIGHT_DEFAULTS.costWeightPct,
    distanceWeightPct: row?.fcDistanceWeightPct ?? FC_WEIGHT_DEFAULTS.distanceWeightPct,
    slaWeightPct: row?.fcSlaWeightPct ?? FC_WEIGHT_DEFAULTS.slaWeightPct,
    capacityWeightPct: row?.fcCapacityWeightPct ?? FC_WEIGHT_DEFAULTS.capacityWeightPct,
    rotationWeightPct: row?.fcRotationWeightPct ?? FC_WEIGHT_DEFAULTS.rotationWeightPct,
    storageMatchWeightPct:
      row?.fcStorageMatchWeightPct ?? FC_WEIGHT_DEFAULTS.storageMatchWeightPct,
    rotationBandPct: row?.fcRotationBandPct ?? FC_WEIGHT_DEFAULTS.rotationBandPct,
  }
}

const FC_AWARD_HISTORY_DAYS = 90

/** FcAwardLog rows for the candidate nodes over the last 90 days, grouped into
 *  the scorer's {awardCount, lastAwardedAt} shape. Best-effort: an empty
 *  history just means the rotation dimension renormalizes away. */
async function readFcAwardHistory(
  partnerServiceIds: string[],
): Promise<{ history: Record<string, FcAwardHistoryEntry>; totalRecentAwards: number }> {
  if (partnerServiceIds.length === 0) return { history: {}, totalRecentAwards: 0 }
  const since = new Date(Date.now() - FC_AWARD_HISTORY_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.fcAwardLog
    .groupBy({
      by: ['partnerServiceId'],
      where: { partnerServiceId: { in: partnerServiceIds }, awardedAt: { gte: since } },
      _count: { _all: true },
      _max: { awardedAt: true },
    })
    .catch(
      () =>
        [] as Array<{
          partnerServiceId: string
          _count: { _all: number }
          _max: { awardedAt: Date | null }
        }>,
    )
  const history: Record<string, FcAwardHistoryEntry> = {}
  let totalRecentAwards = 0
  for (const r of rows) {
    history[r.partnerServiceId] = {
      awardCount: r._count._all,
      lastAwardedAt: r._max.awardedAt ?? null,
    }
    totalRecentAwards += r._count._all
  }
  return { history, totalRecentAwards }
}

function estimateFlatShipping(
  qty: number,
  shipToType: NonNullable<CheckoutDraftState['fulfillment']['shipToType']>,
  settings: { flatShippingBaseCents: number; flatShippingPerUnitCents: number },
): number {
  if (qty <= 0) return 0
  // L1b — HOLD orders have no ship leg at order time; storage bills monthly
  // via the StorageAgreement, not as checkout shipping.
  if (shipToType === 'HOLD_AT_MANUFACTURER') return 0
  // Dock-delivery discount: warehouse partners AND channel FCs take palletized
  // freight at commercial docks (CHANNEL_INBOUND quotes flat until the channel
  // assigns concrete FC addresses at plan confirmation).
  const mode =
    shipToType === 'CLOSEST_WAREHOUSE' ||
    shipToType === 'SPECIFIC_WAREHOUSE' ||
    shipToType === 'CHANNEL_INBOUND'
      ? 0.78
      : 1.0
  // Admin-configured flat rate takes precedence; otherwise the V1 per-unit tiers.
  if (settings.flatShippingBaseCents > 0 || settings.flatShippingPerUnitCents > 0) {
    return Math.round((settings.flatShippingBaseCents + settings.flatShippingPerUnitCents * qty) * mode)
  }
  let perUnit: number
  if (qty < 100) perUnit = 95
  else if (qty < 500) perUnit = 72
  else if (qty < 2500) perUnit = 58
  else perUnit = 44
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

// -----------------------------------------------------------------------------
// Variety-pack helpers (docs/VARIETY_PACK_MODEL.md, step 4)
// -----------------------------------------------------------------------------

/**
 * Resolve, per flavor, its working DesignVersion (version 1) so the order can
 * snapshot the right per-flavor artwork (per-flavor labels Phase 4). Null entries
 * are omitted from the returned Map (the flavor falls back to the base design).
 */
async function resolveFlavorDesignVersions(
  productId: string,
  flavorPresetIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (flavorPresetIds.length === 0) return out
  const versions = await prisma.designVersion.findMany({
    where: {
      version: 1,
      design: { productId, flavorPresetId: { in: flavorPresetIds } },
    },
    select: { id: true, design: { select: { flavorPresetId: true } } },
  })
  for (const dv of versions) {
    if (dv.design.flavorPresetId) out.set(dv.design.flavorPresetId, dv.id)
  }
  return out
}

/**
 * Cast-guarded read of the additive pack columns needed to PRICE + validate a
 * pack order at order time: the chosen variant's `unitsPerPack` + `pricePerPackCents`,
 * the template's `minFlavorsPerPack` / `flavorFillRule` / `pricingBasis`, and the
 * per-flavor `unitPriceCents` pool. Mirrors readPackModel in marketing/pricing.ts.
 * Returns empty defaults on any failure (pre-migration / missing columns) so the
 * caller falls back to the snapshot the client sent (packSel.unitsPerPack) and a
 * PER_FLAVOR default basis — the order still places.
 */
async function readPackOrderInputs(
  templateId: string | null,
  variantId: string,
): Promise<{
  unitsPerPack: number | null
  pricePerPackCents: number | null
  minFlavors: number | null
  fillRule: PackFlavorFillRule | null
  pricingBasis: PackPricingBasis | null
  pool: Array<{ flavorPresetId: string; unitPriceCents: number | null }>
}> {
  const empty = {
    unitsPerPack: null,
    pricePerPackCents: null,
    minFlavors: null,
    fillRule: null as PackFlavorFillRule | null,
    pricingBasis: null as PackPricingBasis | null,
    pool: [] as Array<{ flavorPresetId: string; unitPriceCents: number | null }>,
  }
  if (!templateId) return empty
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          minFlavorsPerPack: number | null
          flavorFillRule: PackFlavorFillRule | null
          pricingBasis: PackPricingBasis | null
          variants: Array<{ id: string; unitsPerPack: number | null; pricePerPackCents: number | null }>
          flavorPresets: Array<{ id: string; unitPriceCents: number | null }>
        } | null>
      }
    }).productTemplate.findUnique({
      where: { id: templateId },
      select: {
        minFlavorsPerPack: true,
        flavorFillRule: true,
        pricingBasis: true,
        variants: { select: { id: true, unitsPerPack: true, pricePerPackCents: true } },
        flavorPresets: { where: { status: 'ACTIVE' }, select: { id: true, unitPriceCents: true } },
      },
    })
    if (!t) return empty
    const v = (t.variants ?? []).find((x) => x.id === variantId)
    return {
      unitsPerPack: v?.unitsPerPack ?? null,
      pricePerPackCents: v?.pricePerPackCents ?? null,
      minFlavors: t.minFlavorsPerPack ?? null,
      fillRule: t.flavorFillRule ?? null,
      pricingBasis: t.pricingBasis ?? null,
      pool: (t.flavorPresets ?? []).map((f) => ({
        flavorPresetId: f.id,
        unitPriceCents: f.unitPriceCents ?? null,
      })),
    }
  } catch {
    return empty
  }
}
