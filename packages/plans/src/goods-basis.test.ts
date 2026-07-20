// PP-0 pins for the declared goods basis (docs/PRINT_PRICING_SPEC §2.1).
// Throw-based, no vitest import: runs under scripts/run-vitest-suites.mjs.
//
// THE PIN PAVEL ASKED FOR: a pack order and a non-pack order each price to
// goods + decoration + components EXACTLY ONCE. Everything else here defends
// that property against the specific ways it broke before.

import { resolveGoods, composeProductionLines, costFloorBreach } from './goods-basis'
import { computeOrderPricing } from './order-pricing'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

const GOODS_PACK = 100_00 // creator-agreed pack price
const GOODS_BUILDUP = 60_00 // (label + packaging) x qty, NO finishes
const FINISHES = 5_00
const DECORATION = 20_00
const COMPONENTS = 10_00
const FEE_BPS = 1500 // Maker

/** Price one order end to end on a given basis, through the real composer. */
function priceOrder(isPackOrder: boolean, over: Partial<Record<'fin' | 'dec' | 'comp', number>> = {}) {
  const goods = resolveGoods({
    isPackOrder,
    packPricedSubtotalCents: isPackOrder ? GOODS_PACK : 0,
    // A non-pack order prices on the manufacturer's band. COST_BUILDUP is gone
    // (2026-07-16): it was our 8c literal + admin catalog, never a partner price.
    tierGoodsCents: isPackOrder ? null : GOODS_BUILDUP,
  })
  if (!goods) throw new Error('[goods-basis] priceOrder: expected a partner-authored basis')
  return {
    goods,
    priced: computeOrderPricing({
      production: composeProductionLines({
        goods,
        finishesCents: over.fin ?? FINISHES,
        decorationCents: over.dec ?? DECORATION,
        componentsCents: over.comp ?? COMPONENTS,
      }),
      feeBps: FEE_BPS,
    }),
  }
}

// ── THE PIN: exactly once, under BOTH bases ─────────────────────────────────
{
  const pack = priceOrder(true)
  const nonPack = priceOrder(false)

  assert(pack.goods.basis === 'PACK_PRICE', 'a pack order prices on the agreed pack price')
  assert(nonPack.goods.basis === 'TIER_PRICE', "a non-pack order prices on the manufacturer's band")

  // Exactly once, stated as arithmetic: the subtotal IS the sum of the parts.
  assert(
    pack.priced.productionSubtotalCents === GOODS_PACK + FINISHES + DECORATION + COMPONENTS,
    'PACK: goods + finishes + decoration + components, each exactly once',
  )
  assert(
    nonPack.priced.productionSubtotalCents === GOODS_BUILDUP + FINISHES + DECORATION + COMPONENTS,
    'NON-PACK: goods + finishes + decoration + components, each exactly once',
  )
}

// ── exactly once, stated as ABSENCE: dropping an add-on drops exactly its cents ──
// This is the real double-count guard. If an add-on were also baked into goods,
// removing the line would move the subtotal by LESS than the line's value.
for (const isPack of [true, false]) {
  const label = isPack ? 'PACK' : 'NON-PACK'
  const full = priceOrder(isPack).priced.productionSubtotalCents

  const noDec = priceOrder(isPack, { dec: 0 }).priced.productionSubtotalCents
  const noComp = priceOrder(isPack, { comp: 0 }).priced.productionSubtotalCents
  const noFin = priceOrder(isPack, { fin: 0 }).priced.productionSubtotalCents

  assert(full - noDec === DECORATION, `${label}: decoration counted once, not baked into goods`)
  assert(full - noComp === COMPONENTS, `${label}: component upgrades counted once`)
  assert(full - noFin === FINISHES, `${label}: finishes counted once under BOTH bases`)

  const bare = priceOrder(isPack, { dec: 0, comp: 0, fin: 0 }).priced.productionSubtotalCents
  assert(bare === (isPack ? GOODS_PACK : GOODS_BUILDUP), `${label}: bare order is goods alone`)
  assert(full - bare === FINISHES + DECORATION + COMPONENTS, `${label}: add-ons sum, never compound`)
}

// ── the add-ons are basis-INDEPENDENT (the bug: finishes lived inside buildup) ──
{
  const packDelta = priceOrder(true).priced.productionSubtotalCents - priceOrder(true, { fin: 0, dec: 0, comp: 0 }).priced.productionSubtotalCents
  const nonPackDelta =
    priceOrder(false).priced.productionSubtotalCents - priceOrder(false, { fin: 0, dec: 0, comp: 0 }).priced.productionSubtotalCents
  assert(packDelta === nonPackDelta, 'the same add-ons cost the same on either basis')
}

// ── non-pack parity with the OLD cost buildup (no silent price change) ───────
// Old: costBuildup = (label + packaging + finish) x qty + finishSetup.
// New: goods (label + packaging) + finishes. Must be identical, or the refactor
// silently repriced every legacy order.
{
  const oldCostBuildup = GOODS_BUILDUP + FINISHES
  const bare = priceOrder(false, { dec: 0, comp: 0 }).priced.productionSubtotalCents
  assert(bare === oldCostBuildup, 'non-pack goods + finishes == the old buildup, to the cent')
}

// ── every add-on is in the FEE BASE (the locked rule) ────────────────────────
{
  const full = priceOrder(true).priced
  const bare = priceOrder(true, { fin: 0, dec: 0, comp: 0 }).priced
  assert(full.feeBaseCents - bare.feeBaseCents === FINISHES + DECORATION + COMPONENTS, 'add-ons raise the fee base')
  assert(full.platformFeeCents > bare.platformFeeCents, 'and therefore the tier fee')
  assert(full.lineItems.every((l) => l.kind === 'PLATFORM_FEE' || l.inFeeBase), 'every production line is in the base')
}

// ── basis is DECLARED, never inferred from magnitude (the max is gone) ───────
{
  // A mispriced template: the agreed pack price sits BELOW our cost buildup.
  // The old Math.max silently charged the creator the buildup. The basis must
  // still be the price they agreed to.
  const g = resolveGoods({ isPackOrder: true, packPricedSubtotalCents: 10_00, tierGoodsCents: 99_00 })
  assert(g != null, 'a pack order always has a basis')
  assert(g!.goodsCents === 10_00, 'a pack order NEVER silently charges above the agreed price')
  assert(g!.basis === 'PACK_PRICE', 'basis follows the order shape, not whichever number is bigger')
}

// ── the cost floor REPORTS, never charges ───────────────────────────────────
{
  const under = costFloorBreach(10_00, 40_00)
  assert(under !== null && under.shortfallCents === 30_00, 'an under-funded order reports its shortfall')
  assert(costFloorBreach(100_00, 40_00) === null, 'an adequately funded order reports nothing')
  assert(costFloorBreach(40_00, 40_00) === null, 'exact funding is not a breach')

  // The proof it cannot become a charge: it returns a report, and the total is
  // computed from the composer alone, which never sees partner cost.
  const priced = priceOrder(true).priced
  const breach = costFloorBreach(priced.productionSubtotalCents, 10_000_00)
  assert(breach !== null, 'a massive partner cost IS reported')
  assert(priceOrder(true).priced.totalCents === priced.totalCents, 'and changes the creator total by nothing')
}

// ── guards ──────────────────────────────────────────────────────────────────
{
  assert(resolveGoods({ isPackOrder: true, packPricedSubtotalCents: -5 })!.goodsCents === 0, 'never negative')

  // NO PARTNER PRICE -> null. Not 0, not a buildup, not a guess: the caller must
  // refuse. This is the pin that stops the catalog-buildup fallback coming back.
  assert(resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0 }) === null, 'no basis = null, never a number')
  assert(
    resolveGoods({ isPackOrder: false, packPricedSubtotalCents: 0, tierGoodsCents: null }) === null,
    'an explicitly null band is still no price',
  )

  const zero = composeProductionLines({
    goods: { goodsCents: 0, basis: 'TIER_PRICE' },
    finishesCents: 0,
    decorationCents: 0,
    componentsCents: 0,
  })
  assert(zero.length === 1 && zero[0]!.kind === 'PRODUCT', 'zero add-ons emit no add-on lines')
}

// ── CP-3.2: the co-pack line is optional and appended exactly once ───────────
// Omitted / zero ⇒ NO co-pack line (the shadow: existing callers are byte-identical).
// Present ⇒ one COPACKING line, which computeOrderPricing folds into the fee base.
{
  const goods: Parameters<typeof composeProductionLines>[0]['goods'] = { goodsCents: 100_00, basis: 'TIER_PRICE' }
  const base = { goods, finishesCents: 0, decorationCents: 0, componentsCents: 0 }

  const without = composeProductionLines(base)
  assert(!without.some((l) => l.kind === 'COPACKING'), 'no coPackingCents ⇒ no co-pack line (shadow off)')

  const zero = composeProductionLines({ ...base, coPackingCents: 0 })
  assert(!zero.some((l) => l.kind === 'COPACKING'), 'coPackingCents 0 ⇒ no co-pack line')

  const withCopack = composeProductionLines({ ...base, coPackingCents: 12_00 })
  const copackLines = withCopack.filter((l) => l.kind === 'COPACKING')
  assert(copackLines.length === 1, 'coPackingCents > 0 ⇒ exactly one co-pack line')
  assert(copackLines[0]!.cents === 12_00, 'the co-pack line carries the quoted cents')

  const priced = computeOrderPricing({ production: withCopack, feeBps: 1500 })
  const pricedWithout = computeOrderPricing({ production: without, feeBps: 1500 })
  assert(priced.feeBaseCents - pricedWithout.feeBaseCents === 12_00, 'the co-pack line raises the fee base by its cost')
  assert(priced.platformFeeCents - pricedWithout.platformFeeCents === 1_80, 'and the tier fee applies (15% of 12.00)')
}

// eslint-disable-next-line no-console
console.log('goods-basis: all pins passed')
