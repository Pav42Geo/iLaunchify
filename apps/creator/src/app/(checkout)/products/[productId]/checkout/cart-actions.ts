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

import { prisma, Prisma, getSampleSettings, resolveOrderSettings, getLogisticsSettings, isLogisticsEnabled, isStorageClassEnabled } from '@ilaunchify/db'
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
  mapRecipeIngredients,
  composeFlavorUnitPrices,
  resolveFlavorRecipe,
  type FlavorExtra,
  resolveDestinationOptions,
  scoreAndSelectFc,
  loadFcSelectionPolicy,
  buildScoredAwardPayload,
  applyFulfillmentPreference,
  applyLearnedFulfillmentSignal,
  resolveFulfillmentPreference,
  PUBLIC_FC_PARTNER_FILTER,
  type FcCandidate,
  type FcScoringWeights,
  type FcAwardHistoryEntry,
  type SampleCreditEntry,
  recordCapacityRiskAtCheckout,
  recordOrderVelocityAtCheckout,
  evaluateCapacityGateForCheckout,
  type CapacityGateInfo,
  assertOrderTransition,
  resolveOrderApplication,
  broadcastCapabilityRequestsForTemplate,
  resolveOrderCopackCents,
  assessOverrunShadow,
} from '@ilaunchify/orders'
import { loadLearnedFulfillmentAdjustment, recordFcOverrideSignal } from './afe-learning'
import { resolvePackSubtotal } from './pack-pricing'
import {
  checkTemplateStock,
  consumeTemplateInventory,
  notifyTemplateStockAlerts,
  reverseTemplateInventory,
  type StockAlertBundle,
} from '@ilaunchify/orders/template-inventory-db'
import { BASE_FLAVOR_KEY, type FlavorNeed } from '@ilaunchify/orders/template-inventory'
import { resolveTierGoodsCents } from './tier-pricing'
import {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  creatorFeeCents,
  computeOrderPricing,
  resolveGoods,
  composeProductionLines,
  costFloorBreach,
  priceComponents,
  COMPONENT_PRICING_SELECT,
} from '@ilaunchify/plans'
import {
  createCheckoutSession,
  createProductionSubscription,
  getOrCreateCreatorCustomer,
} from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchToPartnerService } from '@ilaunchify/notifications'
import {
  validatePackSelection,
  type PricingBasis as PackPricingBasis,
} from '@ilaunchify/ui'
import type { CheckoutDraftState } from './types'
import { checkProductRestrictions } from './restriction-actions'
import { quoteCarrierShipping } from './fulfillment-actions'
import { computeFcLabelingContext } from './labeling-actions'
import { estimateLabelHopCents } from './shipping-hops'
import { loadProductLabelCompliance } from '@/lib/dieline-compliance'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }


export interface PlaceOrderOptions {
  /** DS-69-style ack payload. Set when blocking compliance findings remain
   *  and the creator has consciously opted to proceed. */
  complianceAck: {
    acknowledged: boolean
    acknowledgedAt: string
    blockingFindingIds: string[]
  } | null
  /** Risk Center capacity gate (M5-prep). Set when the gate fired and the
   *  creator chose to proceed with a realistic extended ETA. Split/reduce is
   *  handled client-side by changing the quantity — no bypass needed. */
  capacityAck?: {
    choice: 'EXTENDED_ETA'
    suggestedEtaMonth: string | null
    acknowledgedAt: string
  } | null
  /** PS-3 (PRINT_PROVIDER_SELECTION §4). Set when the creator's pinned print
   *  provider failed routing validation and the creator consciously accepted
   *  the auto-routed provider instead. Never silent — the gate below fires
   *  first, always before payment. */
  pinnedPrintAck?: {
    acknowledgedAt: string
  } | null
}

/** placeOrder failure that carries the capacity-gate options for the UI. */
export type PlaceOrderCapacityGate = {
  ok: false
  error: string
  capacityGate: CapacityGateInfo
}

/** PS-3 — placeOrder failure carrying the pinned-printer reroute notice. */
export type PinnedPrintGateInfo = {
  /** The provider the creator picked on the marketplace card (name may be
   *  null if the service row vanished entirely). */
  pinnedProviderName: string | null
  /** Where auto-routing would send the print job instead. */
  autoProviderName: string | null
}
export type PlaceOrderPinnedPrintGate = {
  ok: false
  error: string
  pinnedPrintGate: PinnedPrintGateInfo
}

export async function placeOrderFromCheckoutDraft(
  productId: string,
  options: PlaceOrderOptions,
): Promise<
  Result<{ checkoutUrl: string; orderId: string }> | PlaceOrderCapacityGate | PlaceOrderPinnedPrintGate
> {
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
      // Variant carries the chosen size (containerFormat), die-cut, and net-quantity
      // label string — feeds the configuration snapshot's variant/options.
      variant: { select: { containerFormat: true, dieCutTemplateId: true, netContentDisplay: true } },
      recipe: {
        include: {
          complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
          // Final recipe rows (swaps/optionals baked in) → the snapshot base recipe.
          ingredients: {
            orderBy: { position: 'asc' },
            include: {
              ingredient: {
                select: {
                  id: true,
                  name: true,
                  labelDeclarationName: true,
                  allergenFlags: true,
                  allergens: true,
                  bioengineeredStatus: true,
                },
              },
            },
          },
        },
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
  // #30 (2026-07-19): label stock (substrate) is required ONLY for a PRESSURE-SENSITIVE
  // LABEL. Every other decoration (direct print, shrink sleeve, in-mold, ...) prints on
  // the container directly, so there is no label stock to set — requiring one would
  // strand a direct-print order. Read the PDP-picked decoration off the PRIMARY container.
  // #38: packagingMaterialSlug is no longer required at all (the container IS the packaging).
  const primaryContainer = await prisma.packagingComponent.findFirst({
    where: { productId: product.id, tier: 'PRIMARY', role: 'CONTAINER' },
    select: { decorationMethod: true },
    orderBy: { displayOrder: 'asc' },
  })
  const labelStockRequired = primaryContainer?.decorationMethod === 'PRESSURE_SENSITIVE_LABEL'
  if (labelStockRequired && !state.production.substrateSlug) {
    return {
      ok: false,
      error: 'Set your label stock in the Design Studio (Material tab) before placing your order.',
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
  // NON-PACK single flavor: the whole-order price delta (perUnitDelta × qty) the
  // selected FlavorPreset carries. Folded into goods below via resolveGoods so the
  // charge equals the PDP (which shows bandUnit + flavorDeltaCents). Stays 0 for
  // pack orders and whenever the selection can't be resolved (degrades to base).
  let nonPackFlavorDeltaTotalCents = 0

  const packRules = product.productTemplateId
    ? await prisma.productTemplate.findUnique({
        where: { id: product.productTemplateId },
        select: { maxFlavorsPerPack: true, packingProfile: { select: { flavorMode: true } } },
      })
    : null

  const packSel = state.production.pack
  if (packSel && packSel.packVariantId && packSel.packCount > 0) {
    // ── NEW pack model ────────────────────────────────────────────────────────
    // Resolved through ./pack-pricing, the SAME call estimateProductionCost makes.
    // This math used to live inline here, in a 'use server' file the estimate could
    // not import, so the estimate priced COST_BUILDUP while this priced PACK_PRICE
    // and the creator was quoted one number and charged another.
    const packQuote = await resolvePackSubtotal({
      productTemplateId: product.productTemplateId,
      pack: packSel,
      maxFlavorsPerPack: packRules?.maxFlavorsPerPack ?? null,
      validateComposition: true, // the charge enforces it; the estimate only reads a price
    })
    if (!packQuote.ok) return { ok: false, error: packQuote.error }
    if (!packQuote.isPack) return { ok: false, error: 'Adjust your variety pack in step 2 before paying.' }

    const { packPricedSubtotalCents: packSubtotal, pricePerPackCents: pricePerPack, unitsPerPack, basis } = packQuote
    packPricedSubtotalCents = packSubtotal
    for (const p of packQuote.pool) flavorPriceByPreset.set(p.flavorPresetId, p.unitPriceCents)
    packPersist = {
      packVariantId: packSel.packVariantId,
      packCount: packSel.packCount,
      packUnitsPerPack: unitsPerPack,
      pricingBasisSnapshot: basis,
      pricePerPackCentsSnapshot: pricePerPack,
    }

    // Per-flavor ORDER total = packCount × that slot's per-pack units.
    const composed = { slots: packQuote.slots }
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
  } else {
    // ── NON-PACK single flavor ────────────────────────────────────────────────
    // The creator picked ONE flavor on the PDP; it lives on
    // Product.selectedFlavorPresetIds (launch records it). Record it as one
    // OrderItemFlavor (so the order + manifest name the flavor + its SoI) and let
    // its priceDeltaCents flow into goods, matching the PDP's bandUnit +
    // flavorDeltaCents. GUARDED: only when EXACTLY ONE active preset resolves;
    // otherwise we do nothing and the order degrades to today's behaviour (base
    // flavor, no delta, no OrderItemFlavor). "Exactly one" mirrors the PDP, which
    // shows a single flavorId for a non-pack product.
    const selectedIds = product.selectedFlavorPresetIds ?? []
    if (selectedIds.length === 1) {
      const preset = await prisma.flavorPreset.findFirst({
        where: { id: selectedIds[0]!, status: 'ACTIVE' },
        select: { id: true, name: true, statementOfIdentity: true, priceDeltaCents: true },
      })
      if (preset) {
        const dvByFlavor = await resolveFlavorDesignVersions(product.id, [preset.id])
        flavorRows = [
          {
            flavorPresetId: preset.id,
            qty,
            flavorName: preset.name,
            soiSnapshot: preset.statementOfIdentity ?? null,
            designVersionId: dvByFlavor.get(preset.id) ?? null,
          },
        ]
        // Same arithmetic the PDP does: perUnit delta × the order quantity. Clamped
        // to non-negative goods inside resolveGoods (a discount flavor can't go < 0).
        nonPackFlavorDeltaTotalCents = Math.round((preset.priceDeltaCents ?? 0) * qty)
      }
    }
  }

  // --- 2c. Manufacturer stock guard (I3, MANUFACTURER_INVENTORY spec 4b) -----
  // WHOLE-ORDER base units per flavor, from the SAME composition the pricer
  // prices (flavorRows: packCount x slot units for packs, qty for non-pack), so
  // pricing and inventory can never disagree. Flavorless orders consume the
  // template's base row. This check fails fast with "only N left" BEFORE any
  // Stripe object exists; the conditional decrement inside the order
  // transaction below is the authority under concurrency.
  const inventoryNeeds: FlavorNeed[] =
    flavorRows.length > 0
      ? flavorRows.map((f) => ({ flavorPresetId: f.flavorPresetId, units: f.qty }))
      : [{ flavorPresetId: BASE_FLAVOR_KEY, units: qty * Math.max(1, packSel?.unitsPerPack ?? 1) }]
  const stockCheck = await checkTemplateStock(prisma, product.productTemplateId, inventoryNeeds)
  if (!stockCheck.ok) return { ok: false, error: stockCheck.reason }

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
  // PS-3 step 0 (PRINT_PROVIDER_SELECTION §4): the creator's manual printer
  // pick from the marketplace cards — template-scoped, resolved per creator.
  // findRouting hard-filter-validates it; on failure the result carries
  // pinnedPrintUnavailable (surfaced by the fuller PS-3 checkout pre-flight).
  const pinnedSelection = product.productTemplateId
    ? await prisma.productPrintSelection
        .findUnique({
          where: {
            creatorUserId_productTemplateId: {
              creatorUserId: user.id,
              productTemplateId: product.productTemplateId,
            },
          },
          select: { partnerServiceId: true },
        })
        .catch(() => null)
    : null
  const routing = await findRouting({
    productId: product.id,
    quantity: qty,
    templateId: product.productTemplateId,
    destinationRegionId: product.brand.operatingRegionId,
    targetMarketId: primaryMarket?.marketId ?? null,
    pinnedPrintServiceId: pinnedSelection?.partnerServiceId ?? null,
    // SR-2 — sticky reorders: the engine keeps this creator's repeat orders of
    // the same product on the SAME printer (color consistency) when possible.
    creatorUserId: user.id,
  })
  if (!routing.ok) return { ok: false, error: routing.message }

  // --- 4a-bis. PS-3 pinned-printer gate (PRINT_PROVIDER_SELECTION §4) ---------
  //             The creator picked a printer on the marketplace card, but it
  //             failed routing's hard filters right now (blackout, deactivated,
  //             Stripe hold, no ACTIVE offering). We NEVER silently reroute a
  //             manual pick — surface both names and let the creator consciously
  //             accept the auto-routed provider (or bail and re-pick).
  if (routing.pinnedPrintUnavailable && !options.pinnedPrintAck) {
    const [pinnedSvc, autoSvc] = await Promise.all([
      pinnedSelection?.partnerServiceId
        ? prisma.partnerService.findUnique({
            where: { id: pinnedSelection.partnerServiceId },
            select: { partner: { select: { companyName: true } } },
          })
        : Promise.resolve(null),
      prisma.partnerService.findUnique({
        where: { id: routing.labelPrintingServiceId },
        select: { partner: { select: { companyName: true } } },
      }),
    ])
    return {
      ok: false,
      error: 'Your selected print provider is currently unavailable.',
      pinnedPrintGate: {
        pinnedProviderName: pinnedSvc?.partner.companyName ?? null,
        autoProviderName: autoSvc?.partner.companyName ?? null,
      },
    }
  }

  // --- 4a-ter. PS-3c FC labeling fee (§8.1a) ----------------------------------
  //             Server-side re-derivation of the SAME eligibility the checkout
  //             badge used (shared computeFcLabelingContext — badge and charge
  //             can never disagree). The flag is ignored unless the ship-to FC
  //             holds a verified RELABEL offer for this order's method AND the
  //             order actually needs downstream application.
  // Shared PS-3c/PS-3d context: FC labeling eligibility + whether an external
  // label freight hop exists at all (badge, fee, and shipping breakdown all
  // derive from this ONE call).
  const labelingCtx = await computeFcLabelingContext({
    productId: product.id,
    printSourcingMode: product.printSourcingMode ?? null,
    manufacturerServiceId: product.productTemplate?.manufacturerServiceId ?? null,
  })
  let fcLabelingCents = 0
  let fcLabelingFeePerUnitCents: number | null = null
  if (
    state.fulfillment.labelingAtFc === true &&
    shipTo.data.shipToType === 'WAREHOUSE_PARTNER' &&
    shipTo.data.shipToPartnerServiceId
  ) {
    const offer = labelingCtx.needsExternalApplication
      ? labelingCtx.offers.find(
          (o) => o.partnerServiceId === shipTo.data.shipToPartnerServiceId,
        )
      : undefined
    if (offer) {
      const physicalUnits = qty * Math.max(1, packPersist?.packUnitsPerPack ?? 1)
      if (physicalUnits < offer.minUnits) {
        return {
          ok: false,
          error: `This center's labeling line has a ${offer.minUnits.toLocaleString()}-unit minimum — increase the run or untick "Finalize labeling at this center".`,
        }
      }
      fcLabelingFeePerUnitCents = offer.feeCentsPerUnit
      fcLabelingCents = offer.feeCentsPerUnit * physicalUnits
    }
    // No verified offer → the flag is stale (FC changed, admin unverified, or
    // the manufacturer applies after all). Proceed WITHOUT the fee — the
    // default path (labels finish at the manufacturer) still stands.
  }

  // --- 4a2. PS-7 §8.4 honey-problem backstop (behind graph:enforce_checkout_gate,
  //          ships OFF → advisory). The order's application point is unresolved when
  //          the manufacturer/co-packer can't self-apply (labelingCtx.needsExternalApplication)
  //          AND the chosen ship-to FC can't relabel this method (under
  //          graph:checkout_allow_fc_relabel). Then: block "temporarily unavailable",
  //          reuse the PS-8 machinery (pause template + broadcast RFQ + audit), notify —
  //          no creator-facing fix-it (2026-07-11 decision). Fails soft: a hiccup in the
  //          pause/broadcast never lets an unresolved order through — the block stands.
  const graphGates = await getLogisticsSettings()
  if (graphGates['graph:enforce_checkout_gate'] && product.productTemplateId) {
    const chosenFcCovers =
      labelingCtx.needsExternalApplication &&
      shipTo.data.shipToType === 'WAREHOUSE_PARTNER' &&
      labelingCtx.offers.some((o) => o.partnerServiceId === shipTo.data.shipToPartnerServiceId)
    const app = resolveOrderApplication({
      needsExternalApplication: labelingCtx.needsExternalApplication,
      decorationMethod: labelingCtx.decorationMethod ?? '',
      shipToFcRelabelMethods: chosenFcCovers ? [labelingCtx.decorationMethod ?? ''] : [],
      allowFcRelabel: graphGates['graph:checkout_allow_fc_relabel'] === true,
    })
    if (!app.resolved) {
      try {
        await prisma.productTemplate.update({
          where: { id: product.productTemplateId },
          data: { status: 'PAUSED' },
        })
        const rfq = await broadcastCapabilityRequestsForTemplate(product.productTemplateId, {
          reason: 'CHECKOUT_UNRESOLVED',
        })
        await logAuditAs(user, {
          entityType: 'ProductTemplate',
          entityId: product.productTemplateId,
          action: 'PRODUCT_TEMPLATE_PAUSED_APPLICATION_UNRESOLVED',
          toValue: 'PAUSED',
          payload: {
            productId: product.id,
            decorationMethod: labelingCtx.decorationMethod,
            requestsOpen: rfq.requestsOpen,
            notified: rfq.notified,
          },
        })
        // Tell the manufacturer their template was paused + how to fix it (the
        // pause-side counterpart to COVERAGE_RESTORED). PS-8b's coverage-drop pause
        // reuses this same event via reason:'coverage_drop' (task_cc70cd51).
        if (product.productTemplate?.manufacturerServiceId) {
          await dispatchToPartnerService(product.productTemplate.manufacturerServiceId, {
            event: 'MANUFACTURER_TEMPLATE_PAUSED',
            audience: 'partner',
            data: { productName: product.name, reason: 'application_gap', href: '/products' },
          }).catch(() => {})
        }
      } catch {
        // Pause/broadcast is best-effort; the order block below is the hard gate.
      }
      return {
        ok: false,
        error:
          'This product is temporarily unavailable while we line up label application. We’ll email you the moment it’s back.',
      }
    }
  }

  // --- 4b. Risk Center capacity gate (M5-prep) --------------------------------
  //         Inert until CAPACITY_OVERCOMMIT is promoted to GATE on
  //         /risk/detectors. When it fires, the creator gets the three honest
  //         options (reduce-to-fit / extended ETA / ops) BEFORE paying — the
  //         platform never knowingly sells a date it can't deliver. An
  //         EXTENDED_ETA ack proceeds; the ack is audited post-commit.
  const unitsPerQtyStep = Math.max(1, packPersist?.packUnitsPerPack ?? 1)
  if (!options.capacityAck) {
    const gate = await evaluateCapacityGateForCheckout({
      partnerServiceId: routing.manufacturingServiceId,
      orderUnits: qty * unitsPerQtyStep,
      qtyUnitSize: unitsPerQtyStep,
    })
    if (gate) {
      return {
        ok: false,
        error:
          'This order exceeds the manufacturer’s realistic capacity for this month — pick an option below.',
        capacityGate: gate,
      }
    }
  }

  // --- 5. Cost calculation. V1: pull substrate + packaging + finish baselines
  //        from the typed catalogs (G3 standardisation). Real partner pricing
  //        replaces this when the partner-side editors light up (Phase F2 +
  //        G3.1).
  const [substrate, packaging, finishApps, componentRows] = await Promise.all([
    // #30 — substrateSlug is optional now (only a pressure-sensitive label uses stock).
    // Guard the lookup; null -> labelUnitCents keeps only its 8c anchor, which feeds the
    // dispatch COST estimate + floor reporting, never the creator's charge.
    state.production.substrateSlug
      ? prisma.substrate.findUnique({ where: { slug: state.production.substrateSlug } })
      : Promise.resolve(null),
    // #38 — packagingMaterialSlug is optional now (packaging is the PDP container).
    // Only look it up when present; null -> packagingUnitCents 0, which affects only
    // the dispatch COST estimate + floor reporting, never the creator's charge (that
    // is `goods`, the band/pack price via resolveGoods).
    state.production.packagingMaterialSlug
      ? prisma.packagingMaterial.findUnique({ where: { slug: state.production.packagingMaterialSlug } })
      : Promise.resolve(null),
    state.production.finishPartnerFinishIds.length
      ? prisma.partnerFinish.findMany({
          where: { id: { in: state.production.finishPartnerFinishIds } },
          select: { basePriceCents: true, perUnitPriceCents: true },
        })
      : Promise.resolve([] as Array<{ basePriceCents: number; perUnitPriceCents: number }>),
    // The rows Decoration + Component upgrades price from. Both are CHARGED as of
    // the PP-0 flip (2026-07-16): partner-set + creator-paid, so both belong in the
    // production subtotal and therefore in the fee base. Priced via the same
    // @ilaunchify/plans helper the estimate uses, so the two cannot disagree.
    prisma.packagingComponent.findMany({
      where: { productId: product.id },
      select: COMPONENT_PRICING_SELECT,
    }),
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

  // Decoration + component upgrades, via the SAME helper the estimate uses
  // (@ilaunchify/plans priceComponents). Both are partner-set and creator-paid, so
  // per the LOCKED fee-base rule both belong in the production subtotal and the fee
  // base. Until 2026-07-16 the summary SHOWED them and this charge DROPPED them.
  const { decorationUnitCents, componentsUnitCents } = priceComponents(componentRows, qty)
  const decorationCents = decorationUnitCents * qty
  const componentsCents = componentsUnitCents * qty

  // Cost-basis estimate for partner transfers (@ilaunchify/orders returns a
  // per-dispatch breakdown). This is a COST: it funds the partner legs. It is NOT
  // a price input (see the reconcile note below).
  const referenceUnit = Math.max(1, Math.round(productionUnitCents))
  const dispatchCosts = estimateDispatchCosts({
    productId: product.id,
    quantity: qty,
    unitPriceCents: referenceUnit,
  })
  const dispatchSubtotal =
    dispatchCosts.manufacturerCostCents + dispatchCosts.printProviderCostCents

  // ─── PP-0 FLIP (2026-07-16): the charge now prices through the ONE function ──
  //
  // WAS: productionTotalCents = Math.max(productionSubtotal, dispatchSubtotal,
  //      packPricedSubtotalCents), with decoration + components missing entirely.
  //
  // That max compared three INCOMMENSURABLE numbers (two COSTS and one list PRICE),
  // so `productionTotalCents` had no stable meaning, and partner COST leaked into
  // the creator's PRICE. Three findings retired it (docs/PRINT_PRICING_SPEC §2.2):
  //
  //   1. The dispatch arm was DEAD, unconditionally. dispatchSubtotal is 0.38 x
  //      (productionUnitCents x qty), while productionSubtotal IS productionUnitCents
  //      x qty + setup. Because labelUnitCents starts at the hardcoded 8c anchor,
  //      the unit is ALWAYS >= 8, so 38% of it can never reach 100% of it. There is
  //      no zero-cost product. Verified over 144 shapes by scripts/pp0-delta-report.mjs.
  //   2. The comment claimed the platform absorbed any gap. It did not: the CREATOR
  //      paid the max. Harmless only BECAUSE the arm was dead.
  //   3. Cost and price must never share an expression. The legitimate kernel
  //      ("never fund below partner cost") survives as costFloorBreach, which
  //      REPORTS to ops and adds nothing to any bill.
  //
  // NOW: a DECLARED basis. A pack order prices on the price the creator agreed to;
  // a legacy non-pack order prices on the catalog buildup. Add-ons are composed
  // exactly once by the single composer, whatever the basis.
  // BLOCKER 2 (2026-07-16): the non-pack goods basis. Until today this branch had
  // NO read of `pricingTiers` at all, so a run the PDP quoted at $3,076 (500 x
  // $5.35, the manufacturer's band) was charged $310 (8c label + 4c substrate +
  // 42c packaging). 89.9% of the quote never collected, on exactly the single-SKU
  // white-label product an N=1 full-service manufacturer sells.
  // BANDS COUNT UNITS, `qty` COUNTS PACKS on a pack order (see line ~493:
  // `physicalUnits = qty * packUnitsPerPack`). Convert, or a 500x4 order asks the
  // 500-UNIT band about 500 PACKS and lands two breaks too low (Blocker 5).
  //
  // Latent rather than live TODAY, because a pack order takes the PACK_PRICE branch
  // and never reads tierGoods. That is exactly why it must be fixed now: the value
  // is already wrong, it is merely unused, and the next person to touch resolveGoods
  // inherits a loaded gun. The PDP does the identical conversion (bandUnits), and
  // these two agreeing is the whole point of the day.
  const bandUnits = qty * Math.max(1, packPersist?.packUnitsPerPack ?? 1)
  const tierGoods = await resolveTierGoodsCents(product.productTemplateId, bandUnits)
  const goods = resolveGoods({
    isPackOrder: packPersist != null,
    packPricedSubtotalCents,
    // The band the PDP showed. Same picker, same order, same number.
    tierGoodsCents: tierGoods,
    // Non-pack only: the selected flavor's delta, folded into goods exactly as the
    // PDP folds it into unitGoodsCents. 0 for pack orders (resolveGoods ignores it
    // on the PACK_PRICE arm) and whenever no single flavor resolved above.
    flavorDeltaTotalCents: nonPackFlavorDeltaTotalCents,
  })
  // NO PARTNER PRICE, NO SALE (Pavel's rule, 2026-07-16). This used to fall back to
  // `(labelUnitCents + packagingUnitCents) * qty`: the 8c literal on line 620 plus
  // the admin substrate/packaging catalog, i.e. ~54c/unit that NO manufacturer ever
  // authored. It went on real invoices. A missing price is not a cheap price, so we
  // refuse rather than invent one.
  //
  // Two real populations reach here, and both SHOULD be refused today:
  //   - a PUBLISHED template with zero pricing tiers (nothing gates that yet),
  //   - a co-created product, template-less by design, whose price belongs to the
  //     collaboration room's agreed terms and does not exist as a charge yet.
  if (!goods) {
    console.error(
      `[PP-0 no-price] REFUSED order: product=${productId} template=${product.productTemplateId ?? 'NONE'} ` +
        `qty=${qty} pack=${packPersist != null}. No ProductTemplatePricingTier and no pack price.`,
    )
    return {
      ok: false,
      error:
        'This product has no published price from its manufacturer yet, so it cannot be ordered. Please contact support.',
    }
  }
  // CP-3.2 (SHADOW, flag OFF by default): the co-packer's fill/assembly price for
  // this order, or 0. resolveOrderCopackCents is the SAME seam the estimate and PDP
  // call, so shown === charged, and CP-6 pays the same co-packer this prices.
  const coPackingCents = await resolveOrderCopackCents({
    productTemplateId: product.productTemplateId,
    isAssembly: packPersist != null,
    qty: bandUnits,
    unitsPerPack: packPersist?.packUnitsPerPack,
  })
  const productionLines = composeProductionLines({
    goods,
    finishesCents: finishUnitCents * qty + finishSetupCents,
    decorationCents,
    componentsCents,
    coPackingCents,
  })
  const productionTotalCents = productionLines.reduce((s, l) => s + l.cents, 0)

  // MB overrun-into-price SHADOW (log-only, changes no bill). If this product has a
  // batch basis, compute what the overrun policy WOULD add and log the delta, so we can
  // watch it on real orders before ever flipping the charge onto billed units. Fully
  // guarded: any error (incl. the pre-MB-1 client missing the columns) is swallowed.
  await logOverrunShadow(product.productTemplateId, product.id, bandUnits, goods.goodsCents).catch(() => {})

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
  // PS-3d (Pavel 2026-07-06) — the printer→applier label freight hop bills to
  // the creator's SHIPPING line: one combined figure here, the breakdown lives
  // in the estimate UI + internalNotes. Free-shipping threshold covers the
  // combined total (free shipping means free shipping).
  const labelHopCents = labelingCtx.externalLabelHop
    ? estimateLabelHopCents(qty * Math.max(1, packPersist?.packUnitsPerPack ?? 1))
    : 0
  baseShippingCents += labelHopCents
  const freeThreshold = orderSettings.freeShippingThresholdCents
  const shippingCents =
    freeThreshold != null && productionTotalCents >= freeThreshold ? 0 : baseShippingCents

  // --- 7. Platform fee — creator SUBSCRIPTION-TIER rate (FEE_MODEL_RECONCILIATION_SPEC
  //        2026-07-09). 15/12/8%, admin-editable in Tiers & Plans (FeeRule). Retires the
  //        flat 5% + manufacturer-merit-on-the-creator model: merit now eats the
  //        MANUFACTURER's payout, not this charge. Fee base = production subtotal + FC
  //        labeling (a production service); shipping is NOT in the base (Pavel 2026-07-09).
  const { feeBps, source: platformFeeSource } = await resolveCreatorFeeBps(creatorTier)
  const feeBounds = await resolveCreatorFeeBounds(creatorTier)

  // PP-0 FLIP: the charge IS the pricer's output now. Every quote surface (the
  // marketplace PDP, the configurator, the checkout estimate, the sample flow)
  // calls this same function, so "what we showed" and "what we charge" are the
  // same expression rather than two expressions that happen to agree.
  const priced = computeOrderPricing({
    production: productionLines,
    fcLabelingCents,
    shippingCents,
    taxCents: 0, // G5; never in the fee base regardless
    feeBps,
    feeBounds,
  })
  const feeBase = priced.feeBaseCents
  const platformFeeCents = priced.platformFeeCents
  const grossTotalCents = priced.totalCents

  // The legitimate kernel of the retired max, kept as a REPORT. If a template is
  // priced below partner cost, ops needs to know, but the creator must not be
  // silently billed a cost they never agreed to: they did not make the pricing
  // mistake. This adds nothing to any total.
  const breach = costFloorBreach(priced.productionSubtotalCents, dispatchSubtotal)
  if (breach) {
    console.warn(
      `[PP-0 cost-floor] creator=${user.id} basis=${goods.basis} ` +
        `production=${breach.productionSubtotalCents} partnerCost=${breach.partnerCostCents} ` +
        `shortfall=${breach.shortfallCents} (reported only, charge unaffected)`,
    )
  }

  // (The PP-0 shadow that used to sit here is gone: it computed what the unified
  //  pricer WOULD charge so the delta could be measured before flipping. The
  //  pricer IS the charge now, so a shadow of itself would be a tautology. The
  //  delta it existed to answer is in scripts/pp0-delta-report.mjs, which runs the
  //  old expression against the new one over every cart shape: `pnpm pp0:delta`.)

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
  // The immutable "order of the creator", assembled via the @ilaunchify/orders toolkit
  // and stored on the OrderItem so the partner manifest + channel listing read THIS
  // instead of re-deriving from the template pool.
  //
  // Base recipe = the product's final RecipeIngredient rows (swaps/optionals baked in).
  // weightG is a Prisma Decimal → coerce to number for the pure mapper.
  const baseIngredients = mapRecipeIngredients(
    (product.recipe?.ingredients ?? []).map((ri) => ({
      weightG: Number(ri.weightG),
      position: ri.position,
      source: ri.source,
      filledSlotId: ri.filledSlotId,
      ingredient: ri.ingredient,
    })),
  )
  // Per-flavor extras (→ each flavor's final recipe) + price deltas, in one query.
  const flavorMeta = flavorRows.length
    ? await prisma.flavorPreset.findMany({
        where: { id: { in: flavorRows.map((f) => f.flavorPresetId) } },
        select: { id: true, extras: true, priceDeltaCents: true },
      })
    : []
  const extrasByFlavor = new Map<string, FlavorExtra[]>(
    flavorMeta.map((f) => [f.id, (Array.isArray(f.extras) ? f.extras : []) as unknown as FlavorExtra[]]),
  )
  const deltaByFlavor = new Map(flavorMeta.map((f) => [f.id, f.priceDeltaCents]))
  // Base per-unit price for non-PER_FLAVOR bases = pack price ÷ units per pack.
  const baseUnitCents = packPersist
    ? Math.round(packPersist.pricePerPackCentsSnapshot / Math.max(1, packPersist.packUnitsPerPack))
    : null
  const perFlavorPrice = composeFlavorUnitPrices(
    packPersist?.pricingBasisSnapshot ?? null,
    baseUnitCents,
    flavorRows.map((f) => ({
      flavorPresetId: f.flavorPresetId,
      unitPriceCents: flavorPriceByPreset.get(f.flavorPresetId) ?? null,
      priceDeltaCents: deltaByFlavor.get(f.flavorPresetId) ?? null,
    })),
  )
  const configuration = buildCreatorConfiguration({
    flavors: flavorRows.map((f) => ({
      flavorPresetId: f.flavorPresetId,
      name: f.flavorName,
      statementOfIdentity: f.soiSnapshot,
      qty: f.qty,
      unitPriceCents: perFlavorPrice[f.flavorPresetId] ?? null,
      lockedDesignVersionId: f.designVersionId,
      // Each selected flavor's FINAL recipe = base + that flavor's extras.
      recipeIngredients: resolveFlavorRecipe(baseIngredients, extrasByFlavor.get(f.flavorPresetId) ?? []),
    })),
    recipe: product.recipe
      ? {
          servingSizeG: Number(product.recipe.servingSizeG),
          servingsPerContainer: Number(product.recipe.servingsPerContainer),
          ingredients: baseIngredients,
        }
      : null,
    variant: {
      id: product.variantId ?? null,
      containerFormat: product.variant?.containerFormat ?? null,
      netQuantity: product.variant?.netContentDisplay ?? null,
    },
    options: {
      substrateSlug: state.production.substrateSlug,
      packagingMaterialSlug: state.production.packagingMaterialSlug,
      finishPartnerFinishIds: state.production.finishPartnerFinishIds,
      dieCutTemplateId: product.variant?.dieCutTemplateId ?? null,
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
    fcLabelingCents,
    fcLabelingFeePerUnitCents,
    fcLabelingPartnerServiceId:
      fcLabelingCents > 0 ? (shipTo.data.shipToPartnerServiceId ?? null) : null,
    labelHopCents,
    shippingCents,
  })

  // Phase G8 — lock the exact DesignVersion sold so the partner-side
  // production bundle is deterministic. Null when the product has no
  // saved design yet (legacy edge — order goes through with the bundle
  // marked FAILED for admin to follow up).
  const lockedDesign = await prisma.design.findFirst({
    // isActiveAlternate — never lock a draft alternate into production (versioning v2 §3.2).
    where: { productId: product.id, isActiveAlternate: true },
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

  // I3: a stockout INSIDE the transaction rolls the order back before any
  // Stripe object exists and surfaces as a normal checkout error, not a 500.
  let stockError: string | null = null
  let stockAlerts: StockAlertBundle | null = null
  const buildOrderTxn = (orderNumber: string) => prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      // orderNumber post-dates the generated client (cast-guarded). The @unique
      // retry lives in createOrderWithNumber.
      data: {
        orderNumber,
        brandId: product.brandId,
        creatorUserId: user.id,
        status: 'PENDING_PAYMENT',
        // PS-3c — subtotal carries the FC labeling fee (production service).
        subtotalCents: productionTotalCents + fcLabelingCents,
        shippingCents,
        taxCents: 0,
        totalCents,
        // Creator tier-fee snapshot (FEE_MODEL_RECONCILIATION_SPEC) — frozen so a
        // historical order reproduces regardless of later FeeRule edits.
        platformFeeBps: feeBps,
        platformFeeCents,
        platformFeeSource,
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
        // Creator Product Configuration snapshot — always written. (Cast = structured
        // interface → Prisma Json input, not a pre-push guard.)
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

    // I3: consume manufacturer stock INSIDE the order transaction, BEFORE any
    // charge exists. The conditional decrement serializes concurrent orders on
    // the same stock: the loser affects 0 rows, we throw, and the whole order
    // rolls back (caught below and surfaced as a normal checkout error).
    const consumedStock = await consumeTemplateInventory(tx, {
      productTemplateId: product.productTemplateId,
      needs: inventoryNeeds,
      orderId: created.id,
      actorUserId: user.id,
    })
    if (!consumedStock.ok) throw new Error(`NOT_ENOUGH_STOCK:${consumedStock.reason}`)
    stockAlerts = consumedStock.alerts

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
  })
  // CockroachDB serializes the concurrent stock decrement by ABORTING the loser
  // with a retryable write-conflict (Prisma P2034) rather than blocking
  // (observed in pnpm inventory:race, 2026-07-27). ONE retry turns that raw
  // conflict into the clean rejection: the rerun re-reads stock and fails with
  // the proper "only N left" message (or simply succeeds when stock allows).
  const isWriteConflict = (err: unknown): boolean =>
    (err as { code?: string } | null)?.code === 'P2034' ||
    (err instanceof Error && err.message.includes('write conflict or a deadlock'))
  const order = await createOrderWithNumber(buildOrderTxn)
    .catch((err: unknown) => (isWriteConflict(err) ? createOrderWithNumber(buildOrderTxn) : Promise.reject(err)))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('NOT_ENOUGH_STOCK:')) {
        stockError = msg.slice('NOT_ENOUGH_STOCK:'.length)
        return null
      }
      throw err
    })
  if (!order || stockError) {
    return { ok: false, error: stockError ?? 'Not enough stock to place this order.' }
  }
  // I4: fire PARTNER_STOCK_ALERT transitions now that the decrement committed.
  if (stockAlerts) void notifyTemplateStockAlerts(prisma, stockAlerts).catch(() => {})

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
      subtotalCents: productionTotalCents + fcLabelingCents,
      fcLabelingCents,
      shippingCents,
      platformFeeCents,
      platformFeeBps: feeBps,
      platformFeeSource,
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
  //          FcAssignmentLog needs the real orderId, so it lands post-commit.
  //          Best-effort: the explainability trail must never fail an
  //          already-created order.
  if (shipTo.data.fcAward) {
    await prisma.fcAssignmentLog
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

  // --- 11.ab Risk Center M1 — CAPACITY_OVERCOMMIT evaluation (MONITOR).
  //           POST-COMMIT + best-effort: while the detector is in shadow mode
  //           a risk-engine failure must never fail an already-created order.
  //           When admin promotes the detector to GATE (M5), the returned
  //           decision drives the split / extended-ETA UX — wired then.
  //           Units = packs × units-per-pack for pack items (true production units).
  await recordCapacityRiskAtCheckout({
    orderId: order.id,
    partnerServiceId: routing.manufacturingServiceId,
    orderUnits: qty * Math.max(1, packPersist?.packUnitsPerPack ?? 1),
  }).catch(() => {/* MONITOR mode — never blocks checkout */})
  // M4 — ORDER_VELOCITY: new-account bursts + outsized first orders.
  await recordOrderVelocityAtCheckout({
    orderId: order.id,
    creatorUserId: user.id,
    totalCents,
  }).catch(() => {/* MONITOR mode — never blocks checkout */})
  // M5-prep — the creator consciously accepted a realistic extended ETA at the
  // capacity gate: record the informed consent (legal reproducibility).
  if (options.capacityAck) {
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'ORDER_CAPACITY_ETA_ACKED',
      payload: {
        choice: options.capacityAck.choice,
        suggestedEtaMonth: options.capacityAck.suggestedEtaMonth,
        acknowledgedAt: options.capacityAck.acknowledgedAt,
        orderUnits: qty * unitsPerQtyStep,
      },
    }).catch(() => {/* best-effort */})
  }
  // SR-2 — the rotation engine picked this printer (commodity shop, not a
  // deliberate binding): persist the full decision to PrintAwardLog now that
  // the order exists. Best-effort — analytics must never abort an order.
  if (routing.printAwardDecision) {
    await prisma.printAwardLog
      .create({
        data: {
          partnerServiceId: routing.labelPrintingServiceId,
          orderId: order.id,
          decisionJson: routing.printAwardDecision as Prisma.InputJsonValue,
        },
      })
      .catch(() => {/* best-effort */})
  }
  // PS-3 — the creator consciously accepted auto-routing after their pinned
  // print provider failed validation: record the informed consent.
  if (options.pinnedPrintAck && routing.pinnedPrintUnavailable) {
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'ORDER_PINNED_PRINT_REROUTE_ACKED',
      payload: {
        pinnedPartnerServiceId: pinnedSelection?.partnerServiceId ?? null,
        routedPartnerServiceId: routing.labelPrintingServiceId,
        acknowledgedAt: options.pinnedPrintAck.acknowledgedAt,
      },
    }).catch(() => {/* best-effort */})
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
    // Rollback: the order was just created at PENDING_PAYMENT, so
    // PENDING_PAYMENT→CANCELLED is a verified-legal edge — the assert documents
    // it and cannot throw here.
    assertOrderTransition('PENDING_PAYMENT', 'CANCELLED')
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        internalNotes: `${internalNotes}\n\nStripe error: ${(err as Error).message}`,
      },
    })
    // I3: put the consumed manufacturer stock back (idempotent, best-effort:
    // a failed reversal must never block the cancellation path).
    await reverseTemplateInventory(prisma, {
      productTemplateId: product.productTemplateId,
      orderId: order.id,
      actorUserId: user.id,
    }).catch(() => {})
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'ORDER_CANCELLED_CHECKOUT_ERROR',
      fromValue: 'PENDING_PAYMENT',
      toValue: 'CANCELLED',
      payload: { reason: 'stripe_session_error', message: (err as Error).message },
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
   *  records which ran). Written to FcAssignmentLog post-commit. */
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
      // on the OrderSettings singleton; FcAssignmentLog history (last 90 days)
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
          where: { type: 'WAREHOUSE', status: 'ACTIVE', ...PUBLIC_FC_PARTNER_FILTER },
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
      const [weights, awardHistory, fcRotationPolicy, prefProduct, prefProfile] = await Promise.all([
        readFcScoringWeights(),
        readFcAwardHistory(candidates.map((c) => c.partnerServiceId)),
        loadFcSelectionPolicy(),
        // AFE — per-product override + account-wide default (resolved below).
        prisma.product.findUnique({ where: { id: productId }, select: { fulfillmentPreferenceOverride: true } }),
        prisma.creatorProfile.findUnique({ where: { userId: user.id }, select: { fulfillmentPreference: true } }),
      ])
      // AFE P1 — tilt admin weights toward the creator's fulfillment preference;
      // re-ranks eligible FCs only, never overrides a hard filter. MUST mirror the
      // display-side tilt in fulfillment-actions.ts so the shown pick == the paid pick.
      const fulfillmentPref = resolveFulfillmentPreference(
        prefProduct?.fulfillmentPreferenceOverride ?? null,
        prefProfile?.fulfillmentPreference ?? null,
      )
      // AFE P2: learned tilt on top of the declared preference (shadow-inert
      // unless admin-enabled). MUST mirror fulfillment-actions so shown == paid.
      const learnedAdj = await loadLearnedFulfillmentAdjustment(user.id)
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
          weights: applyLearnedFulfillmentSignal(applyFulfillmentPreference(weights, fulfillmentPref), learnedAdj),
          history: awardHistory.history,
          totalRecentAwards: awardHistory.totalRecentAwards,
          rotationPolicy: fcRotationPolicy,
        },
      )
      if (selection.winner) {
        warehouseId = selection.winner.ranked.candidate.partnerServiceId
        fcAward = {
          partnerServiceId: warehouseId,
          // AFE P2c — record the engine's contribution (declared + learned tilt) on
          // the award for observability.
          scoreJson: buildScoredAwardPayload(selection, {
            preference: fulfillmentPref,
            learnedLean: learnedAdj.lean,
            learnedAdjustmentPct: learnedAdj.adjustmentPct,
          }),
        }
      }
      if (!warehouseId) {
        // Legacy fallback — first ACTIVE warehouse keeps the order moving when
        // no node carries the typed L0 eligibility fields yet (pre-L0 rows
        // have empty storageClasses and rank ineligible). No award log: the
        // fallback is not an algorithmic pick.
        const closest = await prisma.partnerService.findFirst({
          where: { type: 'WAREHOUSE', status: 'ACTIVE', ...PUBLIC_FC_PARTNER_FILTER },
          select: { id: true },
        })
        warehouseId = closest?.id ?? null
      }
    }
    if (!warehouseId) return { ok: false, error: 'No eligible warehouse partner.' }
    const warehouse = await prisma.partnerService.findFirst({
      where: { id: warehouseId, type: 'WAREHOUSE', status: 'ACTIVE', ...PUBLIC_FC_PARTNER_FILTER },
      include: { partner: true },
    })
    if (!warehouse) return { ok: false, error: 'Warehouse partner unavailable.' }
    // AFE P2b-write — the creator explicitly picked a specific center: record the
    // override to feed the learned signal. Best-effort + fully guarded internally,
    // so it can never affect the order.
    if (f.shipToType === 'SPECIFIC_WAREHOUSE') {
      await recordFcOverrideSignal({
        userId: user.id,
        pickedWarehouseId: warehouse.id,
        manufacturerServiceId: template?.manufacturerServiceId ?? null,
        storageClass: template?.storageClass ?? 'AMBIENT',
        hazmatClass: template?.hazmatClass ?? 'NONE',
        domain: template?.labelingType ?? 'FOOD',
      })
    }
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
  balancingWeightPct: 10,
  storageMatchWeightPct: 10,
  balancingBandPct: 5,
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
        fcBalancingWeightPct: true,
        fcStorageMatchWeightPct: true,
        fcBalancingBandPct: true,
      },
    })
    .catch(() => null)
  return {
    costWeightPct: row?.fcCostWeightPct ?? FC_WEIGHT_DEFAULTS.costWeightPct,
    distanceWeightPct: row?.fcDistanceWeightPct ?? FC_WEIGHT_DEFAULTS.distanceWeightPct,
    slaWeightPct: row?.fcSlaWeightPct ?? FC_WEIGHT_DEFAULTS.slaWeightPct,
    capacityWeightPct: row?.fcCapacityWeightPct ?? FC_WEIGHT_DEFAULTS.capacityWeightPct,
    balancingWeightPct: row?.fcBalancingWeightPct ?? FC_WEIGHT_DEFAULTS.balancingWeightPct,
    storageMatchWeightPct:
      row?.fcStorageMatchWeightPct ?? FC_WEIGHT_DEFAULTS.storageMatchWeightPct,
    balancingBandPct: row?.fcBalancingBandPct ?? FC_WEIGHT_DEFAULTS.balancingBandPct,
  }
}

const FC_AWARD_HISTORY_DAYS = 90

/** FcAssignmentLog rows for the candidate nodes over the last 90 days, grouped into
 *  the scorer's {awardCount, lastAwardedAt} shape. Best-effort: an empty
 *  history just means the rotation dimension renormalizes away. */
async function readFcAwardHistory(
  partnerServiceIds: string[],
): Promise<{ history: Record<string, FcAwardHistoryEntry>; totalRecentAwards: number }> {
  if (partnerServiceIds.length === 0) return { history: {}, totalRecentAwards: 0 }
  const since = new Date(Date.now() - FC_AWARD_HISTORY_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.fcAssignmentLog
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
  fcLabelingCents?: number
  fcLabelingFeePerUnitCents?: number | null
  fcLabelingPartnerServiceId?: string | null
  labelHopCents?: number
  shippingCents?: number
}): string {
  const lines: string[] = []
  if (args.promo) lines.push(`Promo: ${args.promo}`)
  lines.push(
    `Wizard production subtotal: ${args.productionSubtotalCents}c · Dispatch basis: ${args.dispatchSubtotal}c · Booked: ${args.productionTotalCents}c`,
  )
  // PS-3c (§8.1a) — the creator explicitly chose FC labeling; manifest
  // generation + the dispatch label leg read this application point.
  if (args.fcLabelingCents && args.fcLabelingCents > 0) {
    lines.push(
      `FC labeling: ${args.fcLabelingCents}c (${args.fcLabelingFeePerUnitCents}c/unit) at PartnerService ${args.fcLabelingPartnerServiceId} — creator opted in at checkout`,
    )
  }
  // PS-3d — booked shipping is ONE combined figure; record the hop split
  // (label freight bills to the creator's shipping line, Pavel 2026-07-06).
  if (args.labelHopCents && args.labelHopCents > 0) {
    const booked = args.shippingCents ?? 0
    const goods = Math.max(0, booked - args.labelHopCents)
    lines.push(
      booked === 0
        ? `Shipping hops: labels printer→applier ${args.labelHopCents}c waived (free-shipping threshold)`
        : `Shipping hops: labels printer→applier ${args.labelHopCents}c + finished goods ${goods}c = booked ${booked}c`,
    )
  }
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

// readPackOrderInputs moved to ./pack-pricing (2026-07-16) so the ESTIMATE can
// import it too. A 'use server' file may only export async functions, which is
// why the estimate could not share this and priced the wrong basis.

// MB overrun-into-price SHADOW logger (private, log-only, changes no bill). Reads the
// product's batch size (override → line default) + the manufacturer's overrunPolicyPct,
// runs assessOverrunShadow, and logs the delta between what the charge bills today (qty)
// and what the overrun policy WOULD bill. Cast-guarded for the pre-MB-1 client; the
// caller wraps this in .catch, so it can never affect an order. Not exported (a 'use
// server' file may only export async functions — this stays private).
async function logOverrunShadow(
  productTemplateId: string | null,
  productId: string,
  bandUnits: number,
  goodsCents: number,
): Promise<void> {
  if (!productTemplateId || bandUnits <= 0) return
  const p = prisma as unknown as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<{ unitsPerBatch: number | null; manufacturerServiceId: string | null; manufacturingLine: { unitsPerBatch: number | null } | null } | null>
    }
    partnerManufacturingConfig: { findUnique: (a: unknown) => Promise<{ overrunPolicyPct: number | null } | null> }
  }
  const tpl = await p.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { unitsPerBatch: true, manufacturerServiceId: true, manufacturingLine: { select: { unitsPerBatch: true } } },
  })
  const unitsPerBatch = tpl?.unitsPerBatch ?? tpl?.manufacturingLine?.unitsPerBatch ?? 0
  if (!tpl || unitsPerBatch <= 0) return
  const cfg = tpl.manufacturerServiceId
    ? await p.partnerManufacturingConfig.findUnique({ where: { partnerServiceId: tpl.manufacturerServiceId }, select: { overrunPolicyPct: true } })
    : null
  const shadow = assessOverrunShadow({
    unitsPerBatch,
    qtyUnits: bandUnits,
    overrunPolicyPct: cfg?.overrunPolicyPct ?? null,
    unitPriceCents: Math.round(goodsCents / bandUnits),
  })
  if (shadow && shadow.deltaUnits > 0) {
    console.log(
      `[MB overrun shadow] product=${productId} qty=${bandUnits} batch=${unitsPerBatch} -> produced ${shadow.producedUnits}, ` +
        `overrun ${shadow.overrunUnits}, policy ${shadow.appliedPolicyPct}% -> billed ${shadow.billedUnits} ` +
        `(+${shadow.deltaUnits} units / +${shadow.deltaCents}c). Charge unchanged (${goodsCents}c).`,
    )
  }
}
