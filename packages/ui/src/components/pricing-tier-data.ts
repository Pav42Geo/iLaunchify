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
  /** Numeric lower bound — used for footnote savings calc. `null` for sample row. */
  bandMin: number | null
  prices: Record<TierKey, number>
}

/**
 * Generates a plausible tier × quantity-band table scaled around a base price.
 * Useful for V1 demo before real pricing data flows from the routing engine.
 */
export function buildSamplePricingRows(basePrice: number): PricingTierRow[] {
  const tiers = (mul: number): Record<TierKey, number> => ({
    maker: round(basePrice * mul),
    builder: round(basePrice * mul * 0.88),
    agency: round(basePrice * mul * 0.78),
  })
  return [
    { band: 'Sample', bandMin: null, prices: tiers(2.5) },
    { band: '50 – 99', bandMin: 50, prices: tiers(1.85) },
    { band: '100 – 249', bandMin: 100, prices: tiers(1.65) },
    { band: '250 – 499', bandMin: 250, prices: tiers(1.5) },
    { band: '500 – 999', bandMin: 500, prices: tiers(1.35) },
    { band: '1,000 – 2,499', bandMin: 1000, prices: tiers(1.2) },
    { band: '2,500+', bandMin: 2500, prices: tiers(1.05) },
  ]
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
