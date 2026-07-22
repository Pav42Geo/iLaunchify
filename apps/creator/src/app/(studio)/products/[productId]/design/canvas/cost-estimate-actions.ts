'use server'

// Studio Cost Summary — dynamic all-in subtotal (HANDOFF-TO-CODE-studio-cost-
// summary-subtotal, Pavel 2026-07-21). The Product panel prices a quantity the
// creator types, instead of showing a rate card.
//
// ONE PRICER (PP-0): this action does NOT price anything itself. It loads the
// creator's CheckoutDraft — the shared Studio<->checkout store (see
// material-actions.ts) — and forwards quantity + the draft's selections
// (substrate, packaging material, finishes, pack) into the SAME
// estimateProductionCost the checkout rail calls. Studio subtotal == checkout
// Step 2 for the same quantity by construction, pack basis included.

import { prisma } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
import { loadOnDemandEligibility } from '@ilaunchify/orders'
import { resolveCreatorFeeBps, creatorFeeCents } from '@ilaunchify/plans'
import { estimateProductionCost } from '../../../../../(checkout)/products/[productId]/checkout/production-actions'
import type { CheckoutDraftState } from '../../../../../(checkout)/products/[productId]/checkout/types'

export interface StudioEstimate {
  /** Quantity actually priced, in UNITS (pack orders: packCount × unitsPerPack). */
  quantity: number
  /** All-in subtotal before shipping + tax (fee folded in, Option C). */
  totalCents: number
  /** round(totalCents / quantity) — same derivation as checkout Step 2. */
  perUnitCents: number
  /** Pack meta so the panel can step in whole packs. */
  isPack: boolean
  unitsPerPack: number
  /** §4b.3 — DISPLAY-ONLY on-demand unit price (all-in, Option C), present when
   *  the product passes the full-service gate AND the manufacturer authored
   *  ON_DEMAND bands. Band 1 by the LOCKED velocity rule (§4b.5): selection is
   *  by trailing-30-day volume, which is 0 pre-launch. Null for pack products
   *  (per-unit on-demand is incoherent for packs) and when ineligible. */
  onDemand: { unitCents: number } | null
}

type Result = { ok: true; data: StudioEstimate } | { ok: false; error: string }

export async function estimateStudioSubtotal(input: {
  productId: string
  /**
   * Desired quantity in UNITS. Null = "use the draft's saved quantity" (the
   * creator's last checkout quantity for this product); the caller falls back
   * to the MOQ when the returned quantity is 0.
   */
  quantity: number | null
}): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, productTemplateId: true },
  })
  if (!product) return { ok: false, error: 'NOT_YOUR_PRODUCT' }

  const draft = await prisma.checkoutDraft.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId: input.productId } },
    select: { state: true },
  })
  const production = (draft?.state as unknown as CheckoutDraftState | undefined)?.production

  const draftPack = production?.pack ?? null
  const isPack = !!(draftPack && draftPack.packVariantId && draftPack.unitsPerPack > 0)
  const unitsPerPack = isPack ? draftPack.unitsPerPack : 1

  // §4b.3 — display-only on-demand unit price. Fail-soft to null: this line is
  // informational and must never block the bulk estimate. NOT a second pricer:
  // it reads the manufacturer's authored ON_DEMAND band + the ONE fee SSOT,
  // exactly what the PDP's on-demand headline shows.
  const onDemand = isPack
    ? null
    : await (async (): Promise<{ unitCents: number } | null> => {
        try {
          if (!product.productTemplateId) return null
          const eligibility = await loadOnDemandEligibility(product.id, user.id)
          if (!eligibility.eligible) return null
          // Velocity rule (§4b.5, LOCKED): band by trailing-30-day volume, which
          // is 0 for a product still in the Studio → band 1.
          const band = await prisma.productTemplatePricingTier.findFirst({
            where: { productTemplateId: product.productTemplateId, fulfillmentMode: 'ON_DEMAND' },
            orderBy: { sortOrder: 'asc' },
            select: { perUnitCostCents: true },
          })
          if (!band) return null
          const tier = await getCreatorTier(user.id)
          const { feeBps } = await resolveCreatorFeeBps(tier)
          return { unitCents: band.perUnitCostCents + creatorFeeCents(band.perUnitCostCents, feeBps) }
        } catch {
          return null
        }
      })()

  let units = Math.max(0, Math.floor(input.quantity ?? production?.quantity ?? 0))
  if (units <= 0) {
    // Nothing to price yet — hand the (possibly draft-derived) zero back so the
    // panel seeds its input from the MOQ and re-asks.
    return { ok: true, data: { quantity: 0, totalCents: 0, perUnitCents: 0, isPack, unitsPerPack, onDemand } }
  }

  // Pack orders price on packCount (resolvePackSubtotal); mirror ProductionStep's
  // writePack: quantity carries total units, the pack carries the authoritative
  // count. Whole packs only — a partial pack is not an orderable thing.
  const packCount = isPack ? Math.max(1, Math.round(units / unitsPerPack)) : 0
  if (isPack) units = packCount * unitsPerPack

  const result = await estimateProductionCost({
    productId: input.productId,
    quantity: units,
    substrateSlug: production?.substrateSlug ?? null,
    packagingMaterialSlug: production?.packagingMaterialSlug ?? null,
    finishPartnerFinishIds: production?.finishPartnerFinishIds ?? [],
    pack: isPack ? { ...draftPack, packCount } : null,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const totalCents = result.data.totalBeforeShippingAndTaxCents
  return {
    ok: true,
    data: {
      quantity: units,
      totalCents,
      // Same per-unit derivation as ProductionStep: total / units, never a sum
      // of the retired catalog buildup parts.
      perUnitCents: units > 0 ? Math.round(totalCents / units) : 0,
      isPack,
      unitsPerPack,
      onDemand,
    },
  }
}
