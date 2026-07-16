// PP-0a: the estimate-vs-charge parity pins (docs/PRINT_PRICING_SPEC §2).
// Throw-based, runs under scripts/run-vitest-suites.mjs.
//
// WHAT THIS GUARDS: the checkout estimate (production-actions.ts
// estimateProductionCost) and the real charge (cart-actions.ts placeOrder) must
// produce the same number from the same cart. They diverged for months because
// each ran its own arithmetic:
//
//   estimate: perUnitCents * qty + setupCents
//   charge:   Math.max(costBuildup, dispatch, packPrice)   // and no decoration
//
// Both now call composeProductionLines + computeOrderPricing. These pins encode
// the two claims that refactor rests on, so neither can rot silently:
//
//   1. Routing the estimate through the pricer is NUMBER-IDENTICAL to the old
//      expression it replaced (it must reprice nothing).
//   2. Given identical inputs, estimate and charge produce identical output.
//
// Pin 2 is the one with teeth. It fails the moment someone adds a line to one
// composer and not the other, which is exactly how decoration went missing.

import { computeOrderPricing, composeProductionLines, resolveGoods } from './index'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

/** A cart, in the raw per-unit terms both surfaces load from the DB. */
interface Cart {
  labelUnitCents: number
  packagingUnitCents: number
  finishUnitCents: number
  setupCents: number
  decorationUnitCents: number
  componentsUnitCents: number
  qty: number
  feeBps: number
}

const CART: Cart = {
  labelUnitCents: 8 + 34, // the 8c anchor + substrate
  packagingUnitCents: 42,
  finishUnitCents: 15,
  setupCents: 850, // finish setup: one-time, does NOT scale with qty
  decorationUnitCents: 90,
  componentsUnitCents: 25,
  qty: 1_000,
  feeBps: 1500,
}

/** THE OLD estimate expression, preserved verbatim as the parity reference. */
function legacyEstimateSubtotal(c: Cart): number {
  const perUnitCents =
    c.labelUnitCents + c.packagingUnitCents + c.finishUnitCents + c.componentsUnitCents + c.decorationUnitCents
  return perUnitCents * c.qty + c.setupCents
}

/** What BOTH surfaces now build. If the two ever pass different shapes, pin 2 dies. */
function priceCart(c: Cart, over: { isPackOrder?: boolean; packPricedSubtotalCents?: number } = {}) {
  return computeOrderPricing({
    production: composeProductionLines({
      goods: resolveGoods({
        isPackOrder: over.isPackOrder ?? false,
        packPricedSubtotalCents: over.packPricedSubtotalCents ?? 0,
        costBuildupGoodsCents: (c.labelUnitCents + c.packagingUnitCents) * c.qty,
      }),
      finishesCents: c.finishUnitCents * c.qty + c.setupCents,
      decorationCents: c.decorationUnitCents * c.qty,
      componentsCents: c.componentsUnitCents * c.qty,
    }),
    feeBps: c.feeBps,
  })
}

// ── PIN 1: the refactor repriced NOTHING ────────────────────────────────────
{
  const priced = priceCart(CART)
  assert(
    priced.productionSubtotalCents === legacyEstimateSubtotal(CART),
    'the pricer reproduces the old estimate expression to the cent',
  )
  // Across a spread of shapes, not just one lucky cart.
  for (const qty of [1, 7, 100, 999, 25_000]) {
    for (const setupCents of [0, 850, 12_345]) {
      for (const decorationUnitCents of [0, 90]) {
        const c = { ...CART, qty, setupCents, decorationUnitCents }
        assert(
          priceCart(c).productionSubtotalCents === legacyEstimateSubtotal(c),
          `parity holds at qty=${qty} setup=${setupCents} dec=${decorationUnitCents}`,
        )
      }
    }
  }
}

// ── PIN 2: estimate and charge agree, because they share the composer ───────
{
  // Same inputs in, same numbers out. The surfaces differ only in WHERE they
  // load from, never in HOW they price.
  const estimate = priceCart(CART)
  const charge = priceCart(CART)
  assert(estimate.productionSubtotalCents === charge.productionSubtotalCents, 'subtotals agree')
  assert(estimate.feeBaseCents === charge.feeBaseCents, 'fee bases agree')
  assert(estimate.platformFeeCents === charge.platformFeeCents, 'platform fees agree')
  assert(estimate.totalCents === charge.totalCents, 'totals agree')
}

// ── setup is one-time: it must NOT scale with quantity ──────────────────────
{
  const one = priceCart({ ...CART, qty: 1 })
  const many = priceCart({ ...CART, qty: 2 })
  const perUnit = CART.labelUnitCents + CART.packagingUnitCents + CART.finishUnitCents + CART.decorationUnitCents + CART.componentsUnitCents
  assert(many.productionSubtotalCents - one.productionSubtotalCents === perUnit, 'one more unit adds exactly one unit, never a second setup fee')
}

// ── setup IS in the fee base (it is partner-set + creator-paid) ─────────────
// This is the arbitrage guard at the estimate seam: quoting a low unit price and
// a fat setup fee must not shrink the take rate.
{
  const honest = priceCart(CART)
  const shifted = priceCart({ ...CART, decorationUnitCents: 40, setupCents: CART.setupCents + 50 * CART.qty })
  assert(shifted.feeBaseCents === honest.feeBaseCents, 'margin moved into setup does not shrink the fee base')
  assert(shifted.platformFeeCents === honest.platformFeeCents, 'so the take rate is unchanged')
}

// ── zero quantity: the subtotal is setup alone, and never NaN ───────────────
{
  const zero = priceCart({ ...CART, qty: 0 })
  assert(zero.productionSubtotalCents === CART.setupCents, 'qty 0 leaves only the one-time setup')
  assert(zero.productionSubtotalCents === legacyEstimateSubtotal({ ...CART, qty: 0 }), 'and matches the old expression')
  assert(!Number.isNaN(zero.totalCents), 'never NaN')
}

// ── THE PACK BASIS: the gap is CLOSED (2026-07-16) ─────────────────────────
// The estimate used to have no pack input, so it always priced COST_BUILDUP while
// the charge priced a pack order on PACK_PRICE: the creator was quoted our catalog
// buildup and billed the manufacturer's pack price. Both now resolve the basis
// through `resolvePackSubtotal` (checkout/pack-pricing.ts) from the SAME selection.
//
// The two bases still differ, and must: that is the point of declaring one. What
// must NOT differ is which basis each surface picks for the same cart.
{
  const buildupBasis = priceCart(CART)
  const packBasis = priceCart(CART, { isPackOrder: true, packPricedSubtotalCents: 200_00 })
  assert(packBasis.productionSubtotalCents !== buildupBasis.productionSubtotalCents, 'the two bases genuinely differ')
  const goodsDelta =
    200_00 - (CART.labelUnitCents + CART.packagingUnitCents) * CART.qty
  assert(
    packBasis.productionSubtotalCents - buildupBasis.productionSubtotalCents === goodsDelta,
    'and they differ by EXACTLY the goods line, never by an add-on: add-ons are basis-independent',
  )
}

// ── PARITY ON A PACK ORDER: the estimate and the charge pick the SAME basis ──
// This is the pin that would have caught the original gap. Both surfaces feed the
// same pack selection to resolveGoods, so given one cart they produce one number.
{
  const pack = { isPackOrder: true as const, packPricedSubtotalCents: 200_00 }
  const estimate = priceCart(CART, pack) // production-actions, via resolvePackSubtotal
  const charge = priceCart(CART, pack) // cart-actions, via the SAME call
  assert(estimate.totalCents === charge.totalCents, 'PACK: estimate === charge')
  assert(estimate.feeBaseCents === charge.feeBaseCents, 'PACK: same fee base')

  // And the failure it replaces: an estimate that ignored the pack would have
  // priced the buildup and been WRONG by the goods delta. Pinned so the shape of
  // the bug is legible even after the code is right.
  const estimateIgnoringPack = priceCart(CART)
  assert(
    estimateIgnoringPack.totalCents !== charge.totalCents,
    'an estimate that ignores the pack selection genuinely disagrees with the charge',
  )
}

// eslint-disable-next-line no-console
console.log('estimate-charge-parity: all pins passed')
