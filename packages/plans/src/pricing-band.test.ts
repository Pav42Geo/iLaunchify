// Blocker 2 pins: the PDP's quote and placeOrder's charge resolve the SAME band.
//
// WHY THIS FILE EXISTS, AND WHY THE LAST PIN FILE DID NOT CATCH THIS.
// estimate-charge-parity.test.ts pins estimate === charge. It PASSES, and it was
// USELESS here: the estimate and the charge both priced off the catalog buildup,
// so they agreed with each other while both disagreed with the PDP by 89.9%. I
// verified the wrong equality. The creator's number comes from the PDP, so THAT is
// the equality worth pinning.
//
// Throw-based (no vitest import) - run by scripts/run-vitest-suites.mjs.

import { pickPricingBand, pickPricingBandIndex, tierGoodsCents } from './pricing-band'
import { resolveGoods } from './goods-basis'
import { computeOrderPricing } from './order-pricing'
import { creatorFeeCents } from './creator-fee-math'

function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`[pricing-band] ${what}: got ${a}, want ${e}`)
}

// The seeded shape that produced the live bug: 5 bands, descending unit price.
const BANDS = [
  { minQty: 100, perUnitCents: 700 },
  { minQty: 250, perUnitCents: 600 },
  { minQty: 500, perUnitCents: 535 },
  { minQty: 1000, perUnitCents: 480 },
  { minQty: 2500, perUnitCents: 420 },
]

// ── 1. The kernel picks the highest break at or below the quantity ────────────
eq(pickPricingBandIndex(BANDS.map((b) => b.minQty), 500), 2, 'exact band boundary')
eq(pickPricingBandIndex(BANDS.map((b) => b.minQty), 999), 2, 'mid-band stays on the lower break')
eq(pickPricingBandIndex(BANDS.map((b) => b.minQty), 1000), 3, 'next boundary steps up')
eq(pickPricingBandIndex(BANDS.map((b) => b.minQty), 999_999), 4, 'above every break')

// ── 2. The two below-MOQ fallbacks are DIFFERENT and both deliberate ──────────
// The kernel says null (PricingTierModal highlights no row)...
eq(pickPricingBandIndex(BANDS.map((b) => b.minQty), 50), null, 'below MOQ: kernel = null')
// ...while the PRICING wrapper falls back to the first band, because a quote of $0
// is worse than a quote at the smallest break. The PDP does `?? 0` for the same
// reason. If these ever converge, someone has broken one of the two callers.
eq(pickPricingBand(BANDS, 50)?.perUnitCents, 700, 'below MOQ: pricing falls back to first band')

// A null minQty (the synthetic "Sample" row) is never eligible.
eq(pickPricingBandIndex([null, 100, 250], 500), 2, 'null minQty is skipped')
eq(pickPricingBandIndex([null], 500), null, 'only a null band = no match')

// ── 3. Empty bands return null, NOT 0 ─────────────────────────────────────────
// This is the whole reason tierGoodsCents is nullable. A silent 0 here would have
// billed a free order; null makes the caller refuse instead of inventing one.
eq(pickPricingBand([], 500), null, 'no bands = null')
eq(tierGoodsCents([], 500), null, 'no bands = null goods, never 0')

// ── 4. THE REGRESSION ITSELF: PDP total === charge total ──────────────────────
// The PDP computes (docs: ProductDetailConfigurator):
//     goods = matchedRow.manufacturerCents * quantity   -> computeOrderPricing
// placeOrder computes:
//     goods = resolveGoods({tierGoodsCents}).goodsCents  -> computeOrderPricing
// Same band, same arithmetic, same total. Before today the charge arm read no
// bands at all and produced $310.50 against this $3,076.25.
{
  const QTY = 500
  const FEE_BPS = 1500 // Maker

  // --- the PDP arm, transcribed from the component ---
  const matchedRow = pickPricingBand(BANDS, QTY)!
  const pdpGoodsUnitCents = matchedRow.perUnitCents // = row.manufacturerCents, PRE-fee
  const pdpTotal = computeOrderPricing({
    production: [{ kind: 'PRODUCT', label: 'Production', cents: pdpGoodsUnitCents * QTY }],
    feeBps: FEE_BPS,
  }).totalCents

  // --- the charge arm, transcribed from cart-actions ---
  const goods = resolveGoods({
    isPackOrder: false,
    packPricedSubtotalCents: 0,
    tierGoodsCents: tierGoodsCents(BANDS, QTY),
  })!
  eq(goods.basis, 'TIER_PRICE', 'a non-pack order prices on the band, not the buildup')
  const chargeTotal = computeOrderPricing({
    production: [{ kind: 'PRODUCT', label: 'Production', cents: goods.goodsCents }],
    feeBps: FEE_BPS,
  }).totalCents

  eq(chargeTotal, pdpTotal, 'PDP quote === charge')
  eq(pdpTotal, 307_625, 'the real seeded number: 500 x $5.35 + 15% = $3,076.25')

  // And the size of the hole this closes, kept as a number so nobody re-opens it
  // believing it was small: the old buildup arm.
  const oldTotal = 8 * QTY + creatorFeeCents(8 * QTY, FEE_BPS)
  eq(oldTotal, 4_600, 'the retired buildup charged $46.00 for a $3,076.25 quote')
  // ...and the buildup basis no longer EXISTS, so it cannot come back by default.
  eq(resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0 }), null, 'no band = no price at all')
}

// ── 5. PACK_PRICE still wins over the band ────────────────────────────────────
// A pack order prices on the price the creator agreed to. The band must not
// out-rank it, or threading tiers in would have quietly repriced every pack order.
{
  const goods = resolveGoods({ isPackOrder: true, packPricedSubtotalCents: 12_000, tierGoodsCents: 999_999 })!
  eq(goods.basis, 'PACK_PRICE', 'pack orders ignore the band')
  eq(goods.goodsCents, 12_000, 'pack orders charge the agreed pack price')
}

// ── 6. NO TIERS = NO PRICE = NO SALE (COST_BUILDUP deleted 2026-07-16) ────────
// The buildup was `8c + Substrate + PackagingMaterial`: our literal plus an admin
// catalog, never a manufacturer's price. It billed ~54c/unit on products quoted at
// $4-5/unit. A missing price is not a cheap price.
{
  eq(
    resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0, tierGoodsCents: null }),
    null,
    'no tiers = null, so the caller MUST refuse',
  )
  eq(resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0 }), null, 'omitted band = null too')
}

// A tierGoods of 0 is a REAL price (a free band), not "missing". Only null is
// missing. If this ever flips to falsy-checking, a $0 band silently bills the
// buildup instead. (There is no buildup any more, but the reasoning stands.)
{
  const goods = resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0, tierGoodsCents: 0 })!
  eq(goods.basis, 'TIER_PRICE', 'tierGoods=0 is a price, not a missing value')
  eq(goods.goodsCents, 0, 'and it is honoured')
}

console.log('[pricing-band] OK - PDP quote === charge across bands, fallbacks, pack + no-tier')
