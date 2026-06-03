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
   * All-in creator per-unit price, in cents = manufacturer unit cost (set by the
   * volume band) + the creator's tier-discounted platform fee. Production
   * shipping is NOT included — it's destination/qty-dependent and estimated at
   * checkout (partner-managed carriers, V1).
   *
   * Per the LOCKED model (MARKETPLACE_MANAGEMENT_PLAN §6): the band sets the
   * manufacturer unit cost; the creator's tier moves the FEE, not the unit cost.
   * So the manufacturer portion is one-price-per-band, and the fee portion is the
   * only tier-dependent piece of this total.
   */
  perUnitCents: number
  /** Hard floor — promos/discounts cannot dip below. Omitted by the synthetic fallback. */
  perUnitFloorCents?: number
  // ---- P3 breakdown (present when prices are computed with a real fee) ----
  /** Manufacturer unit cost in cents (the band price, pre-fee). */
  manufacturerCents?: number
  /** Platform fee in cents applied to this unit at the viewer's tier. */
  platformFeeCents?: number
  /** The platform-fee percent used (e.g. 15 for Maker), for the breakdown line. */
  feePercent?: number
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
