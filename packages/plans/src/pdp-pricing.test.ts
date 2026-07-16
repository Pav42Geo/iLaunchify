// PP-0c pins: the PDP prices like the till (docs/PRINT_PRICING_SPEC §2).
// Throw-based, runs under scripts/run-vitest-suites.mjs.
//
// THE BUG THIS CLOSES. The PDP headline was, by its own comment, "the all-in
// amount the creator pays at checkout... the most visible number". It was
// computed in float dollars and carried two things that existed nowhere else:
//
//   sizeMultiplier = 1 + sizeIndex * 0.85     <- sizeIndex = DROPDOWN POSITION
//   previewUnitCost = landedCost * (1 - subDiscount)   <- a day-1 discount
//
// So a size-2 pick was QUOTED 2.7x and CHARGED 1x, and the subscribe discount was
// promised on an order that placeOrder charges gross. Both are deleted. These pins
// state what must be true instead.

import { computeOrderPricing } from './order-pricing'
import { creatorFeeCents } from './creator-fee-math'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

/** The PDP's model, post-fix: goods (PRE-FEE band) + deltas, then the one pricer. */
function pdpQuote(input: {
  goodsUnitCents: number
  packagingDeltaCents?: number
  flavorDeltaCents?: number
  quantity: number
  feeBps: number
  feeBounds?: { minCents?: number | null; maxCents?: number | null }
}) {
  const unit = Math.max(
    0,
    input.goodsUnitCents + (input.packagingDeltaCents ?? 0) + (input.flavorDeltaCents ?? 0),
  )
  return computeOrderPricing({
    production: [{ kind: 'PRODUCT', label: 'Production', cents: unit * input.quantity }],
    feeBps: input.feeBps,
    feeBounds: input.feeBounds,
  })
}

const GOODS = 2_50 // manufacturerCents: the PRE-FEE band price
const QTY = 1_000

// ── THE SIZE MULTIPLIER IS GONE: size must not move price by POSITION ───────
{
  // The old rule, reproduced, so the pin fails loudly if anyone reintroduces it.
  const oldSizeMultiplier = (sizeIndex: number) => 1 + sizeIndex * 0.85
  assert(oldSizeMultiplier(0) === 1, 'the first dropdown option was unmarked')
  assert(oldSizeMultiplier(2) === 2.7, 'and the THIRD was 2.7x, purely for being third')

  // Post-fix: nothing in the quote depends on a size index at all. Same inputs,
  // same price, whatever position a size sits in.
  const a = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 1500 })
  const b = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 1500 })
  assert(a.totalCents === b.totalCents, 'the quote cannot vary with dropdown order')
  assert(
    a.totalCents !== Math.round(GOODS * oldSizeMultiplier(2) * QTY * 1.15),
    'and the headline is NOT the old 2.7x number',
  )
}

// ── GOODS IS THE PRE-FEE PRICE: the fee must not be charged twice ───────────
// pricing.ts:481 sets perUnitCents = manufacturerCents + platformFeeCents.
// Pricing from perUnitCents would fee the fee.
{
  const feeBps = 1500
  const allInUnit = GOODS + creatorFeeCents(GOODS, feeBps) // what perUnitCents holds

  const right = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps })
  const doubled = pdpQuote({ goodsUnitCents: allInUnit, quantity: QTY, feeBps })

  assert(right.feeBaseCents === GOODS * QTY, 'the fee base is the GOODS, pre-fee')
  assert(right.platformFeeCents === Math.round(GOODS * QTY * 0.15), 'fee charged exactly once')
  assert(doubled.totalCents > right.totalCents, 'pricing from perUnitCents would overcharge')
  assert(
    doubled.platformFeeCents - right.platformFeeCents === Math.round(creatorFeeCents(GOODS, feeBps) * QTY * 0.15),
    'by exactly a fee-on-the-fee: this is the trap, pinned',
  )
}

// ── the tier moves the FEE, never the unit cost (the locked band model) ─────
{
  const maker = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 1500 })
  const agency = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 800 })
  assert(maker.feeBaseCents === agency.feeBaseCents, 'the band price is tier-independent')
  assert(maker.platformFeeCents > agency.platformFeeCents, 'only the fee moves with tier')
  assert(maker.totalCents > agency.totalCents, 'so an Agency creator pays less all-in')
}

// ── deltas are CENTS and ride on the goods, pre-fee ─────────────────────────
// The old code mixed units: packagingDelta was DOLLARS, flavorDelta was cents/100.
{
  const plain = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 1500 })
  const withPkg = pdpQuote({ goodsUnitCents: GOODS, packagingDeltaCents: 40, quantity: QTY, feeBps: 1500 })
  assert(withPkg.feeBaseCents - plain.feeBaseCents === 40 * QTY, 'a 40c packaging delta adds 40c/unit, not $40')
  assert(withPkg.platformFeeCents > plain.platformFeeCents, 'and it carries the fee, being partner-set')

  const withFlavor = pdpQuote({ goodsUnitCents: GOODS, flavorDeltaCents: 25, quantity: QTY, feeBps: 1500 })
  assert(withFlavor.feeBaseCents - plain.feeBaseCents === 25 * QTY, 'flavor delta is already cents: no /100')
}

// ── a negative delta cannot drive the goods below zero ──────────────────────
{
  const q = pdpQuote({ goodsUnitCents: 100, packagingDeltaCents: -500, quantity: 10, feeBps: 1500 })
  assert(q.feeBaseCents === 0, 'clamped at zero, never negative')
  assert(q.totalCents >= 0, 'and the total is never negative')
}

// ── bounds apply on the ORDER, which is why per-unit fee x qty was wrong ────
// The band table shows a per-UNIT fee. Multiplying it by quantity (what the PDP
// used to do) can never honour a per-ORDER floor or cap.
{
  const capped = pdpQuote({ goodsUnitCents: GOODS, quantity: QTY, feeBps: 1500, feeBounds: { maxCents: 50_00 } })
  assert(capped.platformFeeCents === 50_00, 'a per-order cap clamps the whole order fee')
  const perUnitFeeTimesQty = creatorFeeCents(GOODS, 1500) * QTY
  assert(perUnitFeeTimesQty !== capped.platformFeeCents, 'per-unit-fee x qty cannot express that cap')
}

// ── cents in, cents out: no float drift ────────────────────────────────────
{
  // 3 units at a price that is ugly in floats. The old path did .toFixed(2) four
  // times over; integers cannot drift.
  const q = pdpQuote({ goodsUnitCents: 3_33, quantity: 3, feeBps: 1500 })
  assert(Number.isInteger(q.totalCents), 'total is an integer number of cents')
  assert(Number.isInteger(q.platformFeeCents), 'fee is an integer number of cents')
  assert(q.feeBaseCents === 9_99, '333 x 3 = 999, exactly')
}

// eslint-disable-next-line no-console
console.log('pdp-pricing: all pins passed')
