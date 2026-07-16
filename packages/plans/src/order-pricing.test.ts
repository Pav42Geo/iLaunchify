// PP-0 pins for the ONE order-pricing function (docs/PRINT_PRICING_SPEC §2).
// Same throw-based convention as creator-fee.test.ts (no vitest import; runs anywhere).
//
// These pins encode the LOCKED fee-base rule (CLAUDE.md, Pavel 2026-07-15):
//   a component is in the base IFF a partner/creator SETS its price AND KEEPS the
//   proceeds.
// If someone later adds a partner-priced line outside `production`, or slips shipping
// into the base, these fail. That is the point: this is the arbitrage guard.

import { computeOrderPricing, pricingDelta, type PricingInput } from './order-pricing'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

/** A realistic cart: every partner-set line present, plus shipping + tax outside. */
const cart: PricingInput = {
  production: [
    { kind: 'PRODUCT', label: 'Production', cents: 100_00 },
    { kind: 'DECORATION', label: 'Decoration', cents: 20_00 },
    { kind: 'COMPONENTS', label: 'Component upgrades', cents: 10_00 },
    { kind: 'PACKAGING', label: 'Packaging', cents: 15_00 },
    { kind: 'PRINTING', label: 'Label printing', cents: 5_00 },
  ],
  fcLabelingCents: 10_00,
  shippingCents: 40_00,
  taxCents: 7_00,
  feeBps: 1500, // Maker
}

// ── the canonical formula ────────────────────────────────────────────────────
{
  const p = computeOrderPricing(cart)
  assert(p.productionSubtotalCents === 150_00, 'production subtotal sums every partner-set line')
  assert(p.feeBaseCents === 160_00, 'fee base = production subtotal + FC labeling')
  assert(p.platformFeeCents === 24_00, 'fee = 15% of 160.00 = 24.00')
  // total = 150 + 10 + 24 + 40 + 7
  assert(p.totalCents === 231_00, 'total = production + fcLabeling + fee + shipping + tax')
}

// ── THE RULE: decoration + component upgrades ARE in the base ────────────────
// This is the exact bug PP-0 fixes: the estimate showed them, the charge dropped
// them, so they were missing from BOTH the price and the fee base.
{
  const without = computeOrderPricing({
    ...cart,
    production: cart.production.filter((l) => l.kind !== 'DECORATION' && l.kind !== 'COMPONENTS'),
  })
  const p = computeOrderPricing(cart)
  assert(p.feeBaseCents - without.feeBaseCents === 30_00, 'decoration+components raise the FEE BASE')
  assert(p.platformFeeCents > without.platformFeeCents, 'and therefore the platform fee')
  assert(p.totalCents - without.totalCents === 30_00 + 4_50, 'creator pays the lines AND the tier fee on them')
}

// ── THE RULE: shipping is OUT of the base (we quote it, we keep the margin) ──
// Charging the fee on shipping would tax our own markup (double-dip).
{
  const noShip = computeOrderPricing({ ...cart, shippingCents: 0 })
  const p = computeOrderPricing(cart)
  assert(p.feeBaseCents === noShip.feeBaseCents, 'shipping NEVER changes the fee base')
  assert(p.platformFeeCents === noShip.platformFeeCents, 'shipping NEVER changes the platform fee')
  assert(p.totalCents - noShip.totalCents === 40_00, 'shipping passes through at cost to the total')
}

// ── THE RULE: tax is never in the base, and rides last ───────────────────────
{
  const noTax = computeOrderPricing({ ...cart, taxCents: 0 })
  const p = computeOrderPricing(cart)
  assert(p.feeBaseCents === noTax.feeBaseCents, 'tax NEVER changes the fee base')
  assert(p.platformFeeCents === noTax.platformFeeCents, 'tax NEVER changes the platform fee')
  assert(p.totalCents - noTax.totalCents === 7_00, 'tax is additive only')
}

// ── FC labeling IS in the base (locked: it is a production service) ──────────
{
  const noFc = computeOrderPricing({ ...cart, fcLabelingCents: 0 })
  const p = computeOrderPricing(cart)
  assert(p.feeBaseCents - noFc.feeBaseCents === 10_00, 'FC labeling joins the fee base')
  assert(p.platformFeeCents - noFc.platformFeeCents === 1_50, 'and is taxed at the tier rate')
}

// ── tier drives the fee, nothing else ───────────────────────────────────────
{
  const maker = computeOrderPricing({ ...cart, feeBps: 1500 })
  const builder = computeOrderPricing({ ...cart, feeBps: 1200 })
  const agency = computeOrderPricing({ ...cart, feeBps: 800 })
  assert(maker.platformFeeCents === 24_00, 'Maker 15% of 160.00')
  assert(builder.platformFeeCents === 19_20, 'Builder 12% of 160.00')
  assert(agency.platformFeeCents === 12_80, 'Agency 8% of 160.00')
  assert(
    maker.feeBaseCents === builder.feeBaseCents && builder.feeBaseCents === agency.feeBaseCents,
    'tier changes the RATE, never the BASE',
  )
}

// ── every line declares its own fee-base membership honestly ────────────────
{
  const p = computeOrderPricing(cart)
  const inBase = p.lineItems.filter((l) => l.inFeeBase).reduce((s, l) => s + l.cents, 0)
  assert(inBase === p.feeBaseCents, 'the lines marked inFeeBase sum to exactly the fee base')
  const shipping = p.lineItems.find((l) => l.kind === 'SHIPPING')
  const tax = p.lineItems.find((l) => l.kind === 'TAX')
  const fee = p.lineItems.find((l) => l.kind === 'PLATFORM_FEE')
  assert(shipping?.inFeeBase === false, 'shipping line is marked out of base')
  assert(tax?.inFeeBase === false, 'tax line is marked out of base')
  assert(fee?.inFeeBase === false, 'the fee is never in its own base')
}

// ── ARBITRAGE GUARD: a partner-set setup fee must sit INSIDE production ─────
// The scenario the rule exists to catch: a printer quotes a low unit price and a fat
// setup fee. If SETUP is in `production` the take rate is unharmed.
{
  const lowUnitFatSetup = computeOrderPricing({
    ...cart,
    production: [
      { kind: 'PRODUCT', label: 'Production', cents: 100_00 },
      { kind: 'DECORATION', label: 'Decoration', cents: 2_00 }, // slashed
      { kind: 'COMPONENTS', label: 'Component upgrades', cents: 10_00 },
      { kind: 'PACKAGING', label: 'Packaging', cents: 15_00 },
      { kind: 'PRINTING', label: 'Label printing', cents: 5_00 },
      { kind: 'SETUP', label: 'Plates + tooling', cents: 18_00 }, // margin moved here
    ],
  })
  const honest = computeOrderPricing(cart)
  assert(
    lowUnitFatSetup.feeBaseCents === honest.feeBaseCents,
    'shifting margin into a SETUP fee does NOT shrink the fee base',
  )
  assert(
    lowUnitFatSetup.platformFeeCents === honest.platformFeeCents,
    'so the take rate is identical: the arbitrage vector is closed',
  )
}

// ── shadow delta: what PP-0 will surface before the charge ever changes ─────
{
  const p = computeOrderPricing(cart)
  // The live path drops decoration (20.00) + components (10.00) and the fee on them.
  const liveTotal = 231_00 - 30_00 - 4_50
  const d = pricingDelta(p, liveTotal)
  assert(d.deltaCents === 34_50, 'delta = the dropped lines + the fee on them')
  assert(d.underCharging === true, 'positive delta means the creator is UNDER-charged today')
}

// zero-cart sanity
{
  const p = computeOrderPricing({ production: [], feeBps: 1500 })
  assert(p.totalCents === 0 && p.feeBaseCents === 0, 'empty cart prices to zero')
}

// eslint-disable-next-line no-console
console.log('order-pricing: all pins passed')
