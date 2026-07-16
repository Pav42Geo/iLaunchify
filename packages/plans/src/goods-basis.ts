// PP-0 (docs/PRINT_PRICING_SPEC_2026-07-15.md §2.1) - the declared goods basis.
//
// WHY THIS EXISTS: `placeOrder` reconciled with
//   productionTotalCents = Math.max(costBuildup, dispatchSubtotal, packPrice)
// which maxes three INCOMMENSURABLE numbers: two cost estimates and one list
// price. The result has no stable meaning, which is why "does the pack price
// already include decoration?" could not be answered by reading the code. It
// also mixed COST (what we pay partners) into PRICE (what the creator pays).
//
// The fix is to say out loud which basis an order prices on, then SUM. A pack
// order prices on the price the creator agreed to; a legacy non-pack order
// prices on the catalog buildup. A branch states that; a max hides it.
//
// TWO FINDINGS the max was concealing (2026-07-15):
//   1. The dispatch arm was DEAD. dispatchSubtotal = 0.38 x (productionUnitCents
//      x qty) (30% mfr + 8% printer), while costBuildup IS productionUnitCents x
//      qty + finishSetup. 38% of X cannot exceed X, so that arm never won for any
//      product with a nonzero unit cost. It only won for a zero-cost product,
//      where it invented a charge from nothing.
//   2. The comment said the platform absorbed any gap. It did not: the creator
//      paid the max. Harmless only BECAUSE the arm was dead. When V1.5 makes
//      dispatch real, that arm goes live and silently bills creators our partner
//      COST instead of the price they agreed to. Cost and price must never share
//      an expression. That is why costFloorBreach below REPORTS and never adds.
//
// PURE. No prisma, no I/O.

import type { PricingInput } from './order-pricing'

/** Which number the goods line prices on. Snapshot this onto the order. */
export type GoodsBasis =
  | 'PACK_PRICE' // the creator-agreed pack price (ProductTemplateVariant / FlavorPreset)
  | 'COST_BUILDUP' // legacy non-pack: our catalog buildup (substrate + packaging)

export interface ResolvedGoods {
  goodsCents: number
  basis: GoodsBasis
}

export interface GoodsBasisInput {
  /** True when the order booked a pack variant (packPersist != null). */
  isPackOrder: boolean
  /** The creator-agreed pack price extended over packCount. 0 when not a pack order. */
  packPricedSubtotalCents: number
  /**
   * Catalog buildup for the BASE goods ONLY: (labelUnit + packagingUnit) x qty.
   * Finishes are deliberately NOT in here. They are creator-picked at checkout, so
   * they are an add-on under BOTH bases and are composed once, below. Folding them
   * into the buildup is what made them basis-dependent.
   */
  costBuildupGoodsCents: number
}

/**
 * Resolve the goods line by DECLARED basis (never by max).
 *
 * Pack orders price on PACK_PRICE because that is the number the creator agreed to
 * pay. Charging them more than that (which the old max could do) is not a legitimate
 * remedy for a mispriced template; see costFloorBreach.
 */
export function resolveGoods(input: GoodsBasisInput): ResolvedGoods {
  if (input.isPackOrder) {
    return { goodsCents: Math.max(0, Math.round(input.packPricedSubtotalCents)), basis: 'PACK_PRICE' }
  }
  return { goodsCents: Math.max(0, Math.round(input.costBuildupGoodsCents)), basis: 'COST_BUILDUP' }
}

export interface ProductionComposition {
  goods: ResolvedGoods
  /** finishUnit x qty + finishSetup. Creator-picked, so an add-on under BOTH bases. */
  finishesCents: number
  /** Decoration on the priced primary container (PartnerPackagingOffering tiers). */
  decorationCents: number
  /** Component-upgrade surcharges (PackagingComponentVariant.baseSurchargePerUnit). */
  componentsCents: number
}

/**
 * Compose the production lines. THE "EXACTLY ONCE" GUARANTEE LIVES HERE.
 *
 * Every creator-picked add-on is appended exactly once, independent of basis,
 * because there is one composer and each add-on is one append. Callers must not
 * hand-roll this array: that is precisely how decoration ended up shown-but-not-
 * charged (the summary composed one list, the charge composed another).
 *
 * Why an add-on cannot double-count against PACK_PRICE (verified 2026-07-15):
 * decoration and component upgrades are priced from PartnerPackagingOffering /
 * PackagingComponentVariant, set by the DECORATOR partner and chosen by the creator
 * per launch. The pack price is ProductTemplateVariant.pricePerPackCents /
 * FlavorPreset.unitPriceCents, authored by the MANUFACTURER on the template before
 * any creator picked anything. A template price authored earlier cannot embed a
 * decoration chosen later, and a "surcharge" is additive over a base by definition.
 */
export function composeProductionLines(c: ProductionComposition): PricingInput['production'] {
  const lines: PricingInput['production'] = [{ kind: 'PRODUCT', label: 'Production', cents: c.goods.goodsCents }]
  if (c.finishesCents > 0) lines.push({ kind: 'FINISHES', label: 'Finishes', cents: c.finishesCents })
  if (c.decorationCents > 0) lines.push({ kind: 'DECORATION', label: 'Decoration', cents: c.decorationCents })
  if (c.componentsCents > 0) {
    lines.push({ kind: 'COMPONENTS', label: 'Component upgrades', cents: c.componentsCents })
  }
  return lines
}

/**
 * The legitimate kernel of the old max, kept as a REPORT and never as a charge.
 *
 * The max existed to stop an order being funded below partner cost (a manufacturer
 * pricing a pack under our production estimate). That risk is real. Silently
 * charging the creator the cost is the wrong remedy: they never agreed to it, and
 * it is unbounded by anything they saw. So this returns a breach for ops to act on
 * and DOES NOT touch the creator's total.
 *
 * Returns null when funding is adequate.
 */
export function costFloorBreach(
  productionSubtotalCents: number,
  partnerCostCents: number,
): { shortfallCents: number; productionSubtotalCents: number; partnerCostCents: number } | null {
  const shortfallCents = Math.round(partnerCostCents) - Math.round(productionSubtotalCents)
  if (shortfallCents <= 0) return null
  return {
    shortfallCents,
    productionSubtotalCents: Math.round(productionSubtotalCents),
    partnerCostCents: Math.round(partnerCostCents),
  }
}
