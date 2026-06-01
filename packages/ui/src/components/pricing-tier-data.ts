/**
 * Pricing-tier data shapes + the sample-data generator.
 *
 * Lives in a non-'use client' module so server components can call
 * `buildSamplePricingRows()` to assemble the rows that get passed as props
 * to <PricingTierModal /> (which is a client component).
 */

export type TierKey = 'maker' | 'builder' | 'agency'

export interface PricingTierRow {
  /** Display label for the quantity band (e.g., "50 – 99", "Sample"). */
  band: string
  /** Numeric lower bound — used to match the visitor's quantity. `null` for sample row. */
  bandMin: number | null
  /**
   * Tier-independent per-unit price, in cents. Per the LOCKED pricing model
   * (MARKETPLACE_MANAGEMENT_PLAN §6): the volume tier sets the unit price; a
   * creator's Builder/Agency tier discounts the platform *fee*, NOT this unit
   * cost. So one price per band, the same for every creator tier.
   */
  perUnitCents: number
  /** Hard floor — promos/discounts cannot dip below. Omitted by the synthetic fallback. */
  perUnitFloorCents?: number
}

/**
 * Generates a plausible quantity-band table scaled around a base price.
 * Synthetic fallback — used only when a ProductTemplate has no real
 * ProductTemplatePricingTier rows yet (see getPricingTierRows). One price per
 * band per the locked model; creator-tier differences are fee-side, not here.
 */
export function buildSamplePricingRows(basePrice: number): PricingTierRow[] {
  const cents = (mul: number): number => Math.round(basePrice * mul * 100)
  return [
    { band: 'Sample', bandMin: null, perUnitCents: cents(2.5) },
    { band: '50 – 99', bandMin: 50, perUnitCents: cents(1.85) },
    { band: '100 – 249', bandMin: 100, perUnitCents: cents(1.65) },
    { band: '250 – 499', bandMin: 250, perUnitCents: cents(1.5) },
    { band: '500 – 999', bandMin: 500, perUnitCents: cents(1.35) },
    { band: '1,000 – 2,499', bandMin: 1000, perUnitCents: cents(1.2) },
    { band: '2,500+', bandMin: 2500, perUnitCents: cents(1.05) },
  ]
}
