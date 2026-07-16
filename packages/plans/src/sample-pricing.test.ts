// PP-0d pins: a SAMPLE is priced like every other order (Pavel 2026-07-16,
// "add tier rate for sample orders too, this is not different than any other order").
// Throw-based, runs under scripts/run-vitest-suites.mjs.
//
// WHAT THIS GUARDS. Before PP-0d a sample had its own everything:
//   - its own fee table   (OrderSettings.samplePlatformFeeBps, a THIRD one)
//   - its own default     (0 bps: samples carried no platform fee at all)
//   - its own rounding    (Math.floor, where every other path rounds)
//   - its own expression, hand-copied into TWO files (sample-actions.ts and
//     SampleCheckout.tsx) that had to be kept in sync by a human
//   - and it ignored creator tier, so an Agency creator paid a Maker's fee
//
// All five are the same bug wearing five hats: a money rule that lives in more
// than one place. These pins assert the sample now differs from a production
// order in exactly ONE way (what is in the cart) and in no other way.

import { computeOrderPricing } from './order-pricing'
import { creatorFeeCents } from './creator-fee-math'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

const SAMPLE_SUBTOTAL = 48_00
const SAMPLE_SHIPPING = 9_95

/** Exactly what sample-actions.ts builds. */
function priceSample(feeBps: number, bounds?: { minCents?: number | null; maxCents?: number | null }) {
  return computeOrderPricing({
    production: [{ kind: 'PRODUCT', label: 'Sample', cents: SAMPLE_SUBTOTAL }],
    shippingCents: SAMPLE_SHIPPING,
    feeBps,
    feeBounds: bounds,
  })
}

// ── the tier rate applies, and it is the SAME ladder as production ──────────
{
  const maker = priceSample(1500)
  const builder = priceSample(1200)
  const agency = priceSample(800)
  assert(maker.platformFeeCents === 7_20, 'Maker pays 15% on a sample: 48.00 -> 7.20')
  assert(builder.platformFeeCents === 5_76, 'Builder pays 12%')
  assert(agency.platformFeeCents === 3_84, 'Agency pays 8%')
  assert(
    maker.platformFeeCents > builder.platformFeeCents && builder.platformFeeCents > agency.platformFeeCents,
    'tier still buys a better rate on a sample: it is not a special case',
  )
  // The bug this replaces: a flat samplePlatformFeeBps meant every tier paid the
  // same. If these ever converge again, the third fee table is back.
  assert(maker.platformFeeCents !== agency.platformFeeCents, 'an Agency creator must NOT pay a Maker fee')
}

// ── the old default was 0: samples were free of platform fee ───────────────
{
  const old = priceSample(0)
  assert(old.platformFeeCents === 0, 'samplePlatformFeeBps defaulted to 0, so samples carried no fee')
  assert(priceSample(1500).platformFeeCents > old.platformFeeCents, 'PP-0d is a real price change, not a refactor')
}

// ── the sample subtotal IS the fee base; shipping is NOT ────────────────────
// The locked fee-base rule does not bend for samples: the sample is partner-set
// and creator-paid, so it is in the base. Shipping is carrier-quoted by us, so
// it never is.
{
  const p = priceSample(1500)
  assert(p.feeBaseCents === SAMPLE_SUBTOTAL, 'fee base = the sample subtotal alone')
  assert(p.shippingCents === SAMPLE_SHIPPING, 'shipping passes through')
  const noShip = computeOrderPricing({
    production: [{ kind: 'PRODUCT', label: 'Sample', cents: SAMPLE_SUBTOTAL }],
    feeBps: 1500,
  })
  assert(noShip.platformFeeCents === p.platformFeeCents, 'shipping NEVER changes a sample fee either')
  assert(p.totalCents === SAMPLE_SUBTOTAL + 7_20 + SAMPLE_SHIPPING, 'total = sample + fee + shipping')
}

// ── ROUNDING: the sample path rounds now, like everything else ──────────────
// It used Math.floor. Pick a base where floor and round genuinely differ, or the
// pin proves nothing.
{
  const base = 3_33 // 333 * 1500 / 10000 = 49.95 -> round 50, floor 49
  const rounded = creatorFeeCents(base, 1500)
  assert(rounded === 50, 'creatorFeeCents ROUNDS (50), it does not floor (49)')
  assert(Math.floor((base * 1500) / 10000) === 49, 'and the old sample expression really did floor')
  assert(rounded !== Math.floor((base * 1500) / 10000), 'so this is a real behavioural fix, not a no-op')
}

// ── bounds apply to samples too (they were dropped entirely before) ─────────
{
  const floored = priceSample(1500, { minCents: 100_00 })
  assert(floored.platformFeeCents === 100_00, 'a FeeRule floor clamps a sample fee up')
  const capped = priceSample(1500, { maxCents: 1_00 })
  assert(capped.platformFeeCents === 1_00, 'a FeeRule cap clamps a sample fee down')
}

// ── one price, paid at order time: nothing is deferred ─────────────────────
// Pavel 2026-07-16: "Real sample prices which the creator pays when he order it",
// rejecting the "price will be calculated in the real orders" model. So the total
// is fully determined HERE, from this cart alone. Nothing about a future
// production order can enter it. (The SampleCredit that this payment mints is a
// discount on a LATER order and never reaches back into this one.)
{
  const p = priceSample(1500)
  assert(
    p.totalCents === p.productionSubtotalCents + p.platformFeeCents + p.shippingCents,
    'the sample total is closed over its own cart: no deferred component',
  )
}

// eslint-disable-next-line no-console
console.log('sample-pricing: all pins passed')
