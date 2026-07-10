// Integration coverage for the creator tier-fee WIRING at checkout + channel reorder
// (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09, FEE_CREATOR_CHECKOUT_PATCH).
//
// The creator-fee.test.ts pin-tests lock the pure math (15/12/8, fallback, rounding,
// bounds). This file locks the COMPOSITION the charge paths perform — the part the
// audit found drifting — which the pure helpers alone don't express:
//   1. fee base = production subtotal + FC labeling, shipping EXCLUDED (Pavel 2026-07-09)
//   2. the Order snapshot (platformFeeBps/Source) is the SAME feeBps used to compute
//      the charge — "fee shown == fee charged", no drift
//   3. Maker → 1500 bps / TIER_RULE; the retired flat 5% never appears
//
// cart-actions.ts / route-actions.ts need prisma (resolveCreatorFeeBps), so they can't
// run in the pure harness; this mirrors their fee block EXACTLY using the pure core.
// Pure — no prisma, shim-compatible (describe/it/expect only).
import { describe, it, expect } from 'vitest'
import { creatorFeeFromRule, creatorFeeCents, type FeeRuleBounds } from './creator-fee'

const rule = (ratePercent: number | null) => ({
  ratePercent,
  flatCents: null,
  minCents: null,
  maxCents: null,
  notes: null,
})

// EXACT mirror of the cart-actions.ts §7 fee block. resolveCreatorFeeBps is the
// prisma seam; creatorFeeFromRule(rule(tierPercent)) stands in for it here.
function checkoutOrder(
  input: { productionSubtotalCents: number; fcLabelingCents: number; shippingCents: number; sampleCreditCents?: number },
  tierPercent: number | null,
  bounds: FeeRuleBounds = {},
) {
  const { feeBps, source } = creatorFeeFromRule(rule(tierPercent))
  const feeBase = input.productionSubtotalCents + input.fcLabelingCents // shipping NOT in base
  const platformFeeCents = creatorFeeCents(feeBase, feeBps, bounds)
  const applicationFeeCents = platformFeeCents - (input.sampleCreditCents ?? 0) // what Stripe charges
  return {
    // snapshotted onto Order.platformFeeBps/Cents/Source
    snapshot: { platformFeeBps: feeBps, platformFeeCents, platformFeeSource: source },
    applicationFeeCents,
  }
}

describe('creator fee at checkout — Maker order snapshot + shown==charged', () => {
  it('a Maker order of production subtotal $X is charged round(X × 1500/10000)', () => {
    // $250.00 production, no FC labeling, $30 shipping (excluded from the base).
    const { snapshot, applicationFeeCents } = checkoutOrder(
      { productionSubtotalCents: 25000, fcLabelingCents: 0, shippingCents: 3000 },
      15,
    )
    expect(snapshot.platformFeeCents).toBe(3750) // round(25000 * 1500 / 10000)
    expect(applicationFeeCents).toBe(3750) // fee shown == fee charged (no sample credit)
  })

  it('snapshots platformFeeBps = 1500 and platformFeeSource = TIER_RULE for a Maker', () => {
    const { snapshot } = checkoutOrder({ productionSubtotalCents: 25000, fcLabelingCents: 0, shippingCents: 0 }, 15)
    expect(snapshot.platformFeeBps).toBe(1500)
    expect(snapshot.platformFeeSource).toBe('TIER_RULE')
    expect(snapshot.platformFeeBps).not.toBe(500) // the retired flat 5% is gone
  })

  it('FC labeling joins the fee base; shipping never does', () => {
    // base = 20000 + 5000 = 25000 → 3750, regardless of a $30 shipping leg.
    const withShip = checkoutOrder(
      { productionSubtotalCents: 20000, fcLabelingCents: 5000, shippingCents: 3000 },
      15,
    )
    const noShip = checkoutOrder(
      { productionSubtotalCents: 20000, fcLabelingCents: 5000, shippingCents: 0 },
      15,
    )
    expect(withShip.snapshot.platformFeeCents).toBe(3750)
    expect(noShip.snapshot.platformFeeCents).toBe(3750) // shipping excluded → identical fee
  })

  it('honors a FeeRule minCents floor (e.g. 100¢) on a tiny order', () => {
    // $1.00 base × 15% = 15¢, floored to the rule's 100¢ minimum.
    const { snapshot, applicationFeeCents } = checkoutOrder(
      { productionSubtotalCents: 100, fcLabelingCents: 0, shippingCents: 0 },
      15,
      { minCents: 100 },
    )
    expect(snapshot.platformFeeCents).toBe(100)
    expect(applicationFeeCents).toBe(100)
  })

  it('Builder 12% and Agency 8% resolve their own rates; fee shown == fee charged', () => {
    const builder = checkoutOrder({ productionSubtotalCents: 25000, fcLabelingCents: 0, shippingCents: 0 }, 12)
    const agency = checkoutOrder({ productionSubtotalCents: 25000, fcLabelingCents: 0, shippingCents: 0 }, 8)
    expect(builder.snapshot.platformFeeBps).toBe(1200)
    expect(builder.snapshot.platformFeeCents).toBe(3000)
    expect(builder.applicationFeeCents).toBe(3000)
    expect(agency.snapshot.platformFeeBps).toBe(800)
    expect(agency.snapshot.platformFeeCents).toBe(2000)
    expect(agency.applicationFeeCents).toBe(2000)
  })

  it('channel reorder base = subtotal only (no FC/shipping legs at that stage)', () => {
    // route-actions.ts: creatorFeeCents(subtotalCents, feeBps, bounds).
    const subtotalCents = 25000
    const { snapshot } = checkoutOrder({ productionSubtotalCents: subtotalCents, fcLabelingCents: 0, shippingCents: 0 }, 15)
    expect(snapshot.platformFeeCents).toBe(3750)
  })
})
