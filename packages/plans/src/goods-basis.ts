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

/**
 * Which number the goods line prices on. Snapshot this onto the order.
 *
 * There are exactly TWO, and both are authored by a partner through the platform.
 * That is not a coincidence, it is the rule (LOCKED, Pavel 2026-07-16): "kill
 * hardcoded prices because this is something that we cannot decide as an
 * operator/admin, that price should be added by any of the co-packers/
 * manufacturers through the platform when they formulate their price."
 *
 * COST_BUILDUP was the third member until 2026-07-16 and it FAILED that rule: it
 * was `8c + Substrate.baseUnitCostCents + PackagingMaterial.baseUnitCostCents`,
 * i.e. a literal we typed plus an admin catalog, never the manufacturer's price.
 * It billed ~54c/unit for products quoted at $4-$5/unit. It is gone. When there is
 * no partner-authored price, `resolveGoods` returns null and the caller must
 * REFUSE, because there is no honest number to charge.
 */
export type GoodsBasis =
  | 'PACK_PRICE' // the creator-agreed pack price (ProductTemplateVariant / FlavorPreset)
  | 'TIER_PRICE' // the manufacturer's volume band (ProductTemplatePricingTier)

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
   * NON-PACK: the manufacturer's volume band x qty (`tierGoodsCents`, from
   * ProductTemplatePricingTier). THE number the PDP quotes, so THE number we bill.
   * null/omitted = no manufacturer authored a band for this product, which (absent
   * a pack price) means there is no price at all and resolveGoods returns null.
   */
  tierGoodsCents?: number | null
  /**
   * NON-PACK ONLY: the selected FlavorPreset's `priceDeltaCents` extended over the
   * order (perUnitDeltaCents x qty). Folded into the TIER_PRICE goods so the charge
   * equals the PDP, which shows `unitGoodsCents = bandUnit + flavorDeltaCents` and
   * bills `unitGoodsCents x qty`. The manufacturer authors the delta on the preset,
   * the creator pays it, so per the fee-base rule it belongs in the goods line, not
   * a separate add-on. IGNORED on pack orders: a pack's per-flavor price is already
   * inside PACK_PRICE (FlavorPreset.unitPriceCents), so applying it here too would
   * double-count. Default 0 ⇒ inert (existing callers are byte-identical).
   */
  flavorDeltaTotalCents?: number
}

/**
 * Resolve the goods line by DECLARED basis (never by max, and never by invention).
 *
 * The order of preference IS the argument:
 *   1. PACK_PRICE - a pack order prices on the price the creator agreed to.
 *   2. TIER_PRICE - a non-pack order prices on the manufacturer's volume band,
 *                   which is exactly what the PDP quoted them.
 *   3. null       - NO partner authored a price for this product. There is no
 *                   third basis. The caller must refuse.
 *
 * RETURNING NULL IS THE POINT. This used to fall back to a catalog buildup, which
 * meant a product nobody had priced still produced a number, and that number went
 * on a real invoice (~54c/unit against $4-5/unit quotes). A missing price is not a
 * cheap price. The null forces every caller through tsc to say what happens, and
 * the honest answer is "we cannot sell this yet".
 *
 * Known populations that land here TODAY (both real, both must refuse):
 *   - a PUBLISHED ProductTemplate with zero ProductTemplatePricingTier rows (no
 *     publish gate requires them),
 *   - a co-created product, which is TEMPLATE-LESS by design
 *     (packages/orders/src/recipe-materialize.ts) and whose price is supposed to
 *     come from the collaboration room's agreed terms.
 *
 * Charging a creator more than they agreed (which the retired Math.max could do) is
 * not a legitimate remedy for a mispriced template; see costFloorBreach.
 */
export function resolveGoods(input: GoodsBasisInput): ResolvedGoods | null {
  if (input.isPackOrder) {
    return { goodsCents: Math.max(0, Math.round(input.packPricedSubtotalCents)), basis: 'PACK_PRICE' }
  }
  if (input.tierGoodsCents != null) {
    // Fold the non-pack flavor delta into goods, mirroring the PDP's
    // `Math.max(0, bandUnit + flavorDeltaCents) x qty`. Summing the extended band
    // and the extended delta is the same arithmetic ((bandUnit + delta) x qty),
    // clamped once at the bottom so a discount flavor can never drive goods below 0.
    const deltaTotal = Math.round(input.flavorDeltaTotalCents ?? 0)
    return { goodsCents: Math.max(0, Math.round(input.tierGoodsCents) + deltaTotal), basis: 'TIER_PRICE' }
  }
  return null
}

export interface ProductionComposition {
  goods: ResolvedGoods
  /** finishUnit x qty + finishSetup. Creator-picked, so an add-on under BOTH bases. */
  finishesCents: number
  /** Decoration on the priced primary container (PartnerPackagingOffering tiers). */
  decorationCents: number
  /** Component-upgrade surcharges (PackagingComponentVariant.baseSurchargePerUnit). */
  componentsCents: number
  /**
   * CP-3.2 — co-packer fill/assembly operations (loadCopackQuoteCents). Optional
   * so existing callers are unchanged; a caller passes it only when the co-pack
   * flag is ON and the order has a pinned co-packer + an assembly (CARTON/SHIPPER).
   * Partner-set + creator-paid ⇒ production ⇒ in the fee base.
   */
  coPackingCents?: number
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
  if (c.coPackingCents && c.coPackingCents > 0) {
    lines.push({ kind: 'COPACKING', label: 'Co-packing', cents: c.coPackingCents })
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
