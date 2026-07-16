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
  /** Lead time for THIS quantity band (days). Production time scales with volume —
   *  500 ≠ 50,000 — so lead time is per-band, not flat. Null/omitted ⇒ fall back to
   *  the packaging/template default. From ProductTemplatePricingTier.leadTimeDays. */
  leadTimeDays?: number | null
  // ---- P3 breakdown (present when prices are computed with a real fee) ----
  /** Manufacturer unit cost in cents (the band price, pre-fee). */
  manufacturerCents?: number
  /** Platform fee in cents applied to this unit at the viewer's tier. */
  platformFeeCents?: number
  /** The platform-fee percent used (e.g. 15 for Maker), for the breakdown line. */
  feePercent?: number
}

/**
 * ─── buildSamplePricingRows() WAS HERE. DO NOT BRING IT BACK. ────────────────
 *
 * It generated "a plausible quantity-band table scaled around a base price":
 *
 *     base x 2.5 (sample) / 1.85 (50+) / 1.65 (100+) / 1.5 (250+)
 *          / 1.35 (500+) / 1.2 (1,000+) / 1.05 (2,500+)
 *
 * DELETED 2026-07-16 under the LOCKED rule (Pavel): "kill hardcoded prices because
 * this is something that we cannot decide as an operator/admin, that price should
 * be added by any of the co-packers/manufacturers through the platform when they
 * formulate their price." Every multiplier above was ours. No manufacturer ever
 * agreed to sell at 1.35x anything.
 *
 * It was not merely cosmetic. `getPricingTierRows` fell through to it whenever a
 * ProductTemplate had no ProductTemplatePricingTier rows, and NO publish gate
 * required any. So a real, buyable template quoted `priceFloor x 1.35 x qty` on the
 * PDP while placeOrder billed a ~54c/unit catalog buildup: the same 86-90%
 * quote-vs-charge hole that Blocker 2 had just closed one level down. "Plausible"
 * is precisely the problem: a number that looks right is never questioned.
 *
 * The replacement is ABSENCE. getPricingTierRows returns []; the PDP renders
 * "Pricing not published yet" and hides the launch + sample CTAs; the checkout
 * estimate and placeOrder both refuse (@ilaunchify/plans resolveGoods -> null).
 * A product nobody has priced cannot be sold. That is the whole point.
 *
 * If you need a demo catalog with prices, SEED them
 * (packages/db/prisma/seed-pricing-bridge.ts already does): seeded rows are real
 * DB rows a partner could have authored, and they flow through the real path.
 */
