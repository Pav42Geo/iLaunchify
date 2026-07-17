// The ONE volume-band picker: which of a manufacturer's price tiers applies to a
// quantity. PURE. No prisma, no I/O.
//
// WHY THIS EXISTS (Blocker 2, 2026-07-16). The PDP quoted the manufacturer's real
// band price (ProductTemplatePricingTier.perUnitCostCents) while `placeOrder`
// billed `8c + substrate + packaging`: it never read the tiers at ALL. On seeded
// data that is a 500-unit run quoted at $3,076 and charged $310: **89.9% of the
// quote never collected.** And it only bit the NON-PACK path, which is exactly the
// single-flavour white-label product an N=1 full-service manufacturer sells. The
// pack path was correct, so demos seeded with variety packs looked fine.
//
// PP-0 unified `computeOrderPricing` (the fee/total wrapper) across every surface,
// and that was true but insufficient: the wrapper agreed while its `production`
// INPUT was built from two different sources. **The unification landed one layer
// above the divergence.** This file is that layer.
//
// So: one picker, called by the PDP, the estimate and the charge. Anything else is
// how we got here.

/** A manufacturer price tier, as ProductTemplatePricingTier stores it. */
export interface PricingBandInput {
  /** ProductTemplatePricingTier.minQty: the band's lower bound. */
  minQty: number | null
  /** ProductTemplatePricingTier.perUnitCostCents: the manufacturer's PRE-FEE price. */
  perUnitCents: number
}

/**
 * THE KERNEL: the index of the band that applies to `quantity`, or null when the
 * quantity is below every band's lower bound.
 *
 * Takes bare lower bounds rather than rows so that EVERY caller can share it
 * without agreeing on a row shape. That is not fussiness: there were FOUR hand-
 * rolled copies of this loop (the PDP bulk matcher, the PDP on-demand matcher,
 * PricingTierModal, and the tier read) across three packages, over two different
 * row types (`{bandMin}` in @ilaunchify/ui, `{minQty}` in the DB). A shared
 * function that demanded one shape would have been adopted by some of them, which
 * is how you end up with four copies and a fifth "shared" one.
 *
 * The rule is the LAST eligible band IN INPUT ORDER:
 *
 *     const eligible = rows.filter((r) => r.bandMin !== null && r.bandMin <= qty)
 *     eligible[eligible.length - 1]
 *
 * ORDER IS THE CALLER'S JOB: pass bands ordered by `sortOrder`, which is how the
 * DB stores them and how the PDP reads them. "Last eligible in sortOrder" equals
 * "the highest volume break at or below the quantity" only while sortOrder ascends
 * with minQty. That holds for every seeded template, and it is a property of the
 * DATA, not of this function. Do NOT re-sort here: sorting would silently disagree
 * with the PDP for a mis-ordered template, and quote-equals-charge is worth more
 * than being clever about someone's bad data.
 *
 * THE BELOW-MOQ FALLBACK IS DELIBERATELY NOT HERE, because the two callers want
 * different answers and both are right:
 *   - the PDP / the charge fall back to the FIRST band (quote the smallest break,
 *     never $0),
 *   - PricingTierModal wants null (highlight no row).
 * A kernel that picked one would have silently changed the other's behaviour.
 */
export function pickPricingBandIndex(
  bandMins: readonly (number | null | undefined)[],
  /**
   * TOTAL UNITS. **NOT PACKS.** (LOCKED, Pavel 2026-07-16.)
   *
   * A 4-pack order of 500 packs is 2,000 units and belongs in the 1,000-unit
   * band. Callers pricing a pack order MUST convert first: `packCount *
   * unitsPerPack`. Use `bandUnitsForPackOrder` below rather than doing the
   * multiply inline, so the conversion is named at every call site.
   *
   * THIS PARAMETER USED TO BE CALLED `quantity`, AND THAT WAS THE BUG. The PDP
   * labels its input "Packs" in pack mode and passed it straight in. "Quantity"
   * is true of both scales, so nothing looked wrong at the call site: a creator
   * buying 2,000 units got quoted the 500-unit price ($12,300 vs $10,580, ~$1,720
   * over) and lost the volume break they had earned. The name was the bug's
   * hiding place, so the name is now the fix.
   */
  totalUnits: number,
): number | null {
  let found: number | null = null
  for (let i = 0; i < bandMins.length; i++) {
    const min = bandMins[i]
    if (min !== null && min !== undefined && min <= totalUnits) found = i
  }
  return found
}

/**
 * Convert a pack order to the UNITS its band is priced in.
 *
 * Exists to be a NAME rather than a multiply. `pickPricingBandIndex(packCount *
 * unitsPerPack)` inline is correct today and silently wrong the moment someone
 * copies the call and drops the `*`. A named conversion is a question the next
 * reader has to answer ("units of what?"), where a bare `quantity` is not.
 *
 * Non-pack orders pass their unit count straight through (unitsPerPack = 1).
 */
export function bandUnitsForPackOrder(packCount: number, unitsPerPack: number): number {
  return Math.max(0, Math.floor(packCount)) * Math.max(1, Math.floor(unitsPerPack))
}

/**
 * The PRICING wrapper: the band an ORDER prices on.
 *
 * Falls back to the first band when the quantity is below every lower bound, so a
 * below-MOQ quantity is priced at the smallest break rather than $0. Same rule the
 * PDP applies, which is the entire point.
 *
 * Returns null only for an empty band list.
 */
export function pickPricingBand(
  bands: readonly PricingBandInput[],
  /** TOTAL UNITS, not packs. See pickPricingBandIndex. */
  totalUnits: number,
): PricingBandInput | null {
  if (bands.length === 0) return null
  const idx = pickPricingBandIndex(bands.map((b) => b.minQty), totalUnits)
  return bands[idx ?? 0]!
}

/**
 * The GOODS line for a non-pack order: the manufacturer's band price x quantity.
 * Pre-fee by construction (perUnitCostCents is the manufacturer's price, and the
 * tier rate is applied later by computeOrderPricing over the whole fee base).
 *
 * Returns null when the template has no tiers, so the caller must decide what that
 * means rather than being handed a silent 0.
 */
export function tierGoodsCents(
  bands: readonly PricingBandInput[],
  /** TOTAL UNITS: both the band lookup AND the multiply are per-unit. */
  totalUnits: number,
): number | null {
  const band = pickPricingBand(bands, totalUnits)
  if (!band) return null
  return Math.max(0, Math.round(band.perUnitCents) * Math.max(0, Math.floor(totalUnits)))
}
