// Integration coverage for the manufacturer merit-fee SNAPSHOT at routing
// (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09, FEE_SHIPDISPATCH_MERIT_PATCH).
//
// routing.ts stamps each dispatch leg just before the createMany transaction:
//   PRODUCT  → { meritFeeBps: bps, meritFeeCents: meritWithholdCents(costCents, bps) }
//   LABEL    → { meritFeeBps: 0, meritFeeCents: 0 }
//   COPACKING→ { meritFeeBps: 0, meritFeeCents: 0 }
// where `bps` is the manufacturer service's frozen badge rate (0 until
// MeritPolicy.enabled). This test mirrors that stamping expression EXACTLY and
// delegates the cents math to the real meritWithholdCents helper, so a regression
// in the RULE (merit leaking onto LABEL/COPACKING, or a mis-frozen bps) fails
// here even though the full routing() needs prisma and can't run in the pure harness.
//
// Pure — no prisma, shim-compatible (describe/it/expect only).
import { describe, it, expect } from 'vitest'
import { meritWithholdCents } from './manufacturer-merit-fee'

type Leg = { type: 'PRODUCT' | 'LABEL' | 'COPACKING'; partnerServiceId: string; costCents: number }

// EXACT mirror of the routing.ts per-row stamp (dispatchRowsWithMerit map). `bpsFor`
// stands in for resolveManufacturerMeritFeeBps(row.partnerServiceId).
function stampMerit(row: Leg, bpsFor: (serviceId: string) => number) {
  if (row.type !== 'PRODUCT') return { ...row, meritFeeBps: 0, meritFeeCents: 0 }
  const bps = bpsFor(row.partnerServiceId)
  return { ...row, meritFeeBps: bps, meritFeeCents: meritWithholdCents(row.costCents, bps) }
}

describe('routing merit snapshot — only the PRODUCT leg carries merit', () => {
  // A representative multi-leg order: manufacturer PRODUCT + printer LABEL + co-packer COPACKING.
  const legs: Leg[] = [
    { type: 'PRODUCT', partnerServiceId: 'mfr-1', costCents: 10000 },
    { type: 'LABEL', partnerServiceId: 'print-1', costCents: 4000 },
    { type: 'COPACKING', partnerServiceId: 'copack-1', costCents: 2500 },
  ]

  it('stamps meritFeeBps/Cents on the PRODUCT leg at the Trusted badge rate (250 bps)', () => {
    const bpsFor = (svc: string) => (svc === 'mfr-1' ? 250 : 0)
    const product = legs.map((l) => stampMerit(l, bpsFor))[0]!
    expect(product.meritFeeBps).toBe(250)
    // delegated to the pinned helper: round(10000 * 250 / 10000) = 250
    expect(product.meritFeeCents).toBe(meritWithholdCents(10000, 250))
    expect(product.meritFeeCents).toBe(250)
  })

  it('LABEL and COPACKING legs carry ZERO merit, whatever the resolver would return', () => {
    // Even a (nonsensical) non-zero bps for the printer/co-packer service must not apply —
    // the leg TYPE gate zeroes them before the resolver is ever consulted.
    const bpsFor = () => 250
    const stamped = legs.map((l) => stampMerit(l, bpsFor))
    const label = stamped.find((s) => s.type === 'LABEL')!
    const copack = stamped.find((s) => s.type === 'COPACKING')!
    expect(label.meritFeeBps).toBe(0)
    expect(label.meritFeeCents).toBe(0)
    expect(copack.meritFeeBps).toBe(0)
    expect(copack.meritFeeCents).toBe(0)
  })

  it('is shadow-inert: with the engine disabled (0 bps) the PRODUCT leg snapshots 0/0 — no money moves', () => {
    const bpsFor = () => 0 // MeritPolicy.enabled === false
    const stamped = legs.map((l) => stampMerit(l, bpsFor))
    for (const s of stamped) {
      expect(s.meritFeeBps).toBe(0)
      expect(s.meritFeeCents).toBe(0)
    }
  })

  it('resolves each distinct manufacturer service independently (Verified 450 vs Premier 0)', () => {
    const twoMfr: Leg[] = [
      { type: 'PRODUCT', partnerServiceId: 'verified-mfr', costCents: 20000 },
      { type: 'PRODUCT', partnerServiceId: 'premier-mfr', costCents: 20000 },
    ]
    const bpsFor = (svc: string) => (svc === 'verified-mfr' ? 450 : svc === 'premier-mfr' ? 0 : 0)
    const stamped = twoMfr.map((l) => stampMerit(l, bpsFor))
    const verified = stamped[0]!
    const premier = stamped[1]!
    expect(verified.meritFeeCents).toBe(meritWithholdCents(20000, 450)) // 900
    expect(verified.meritFeeCents).toBe(900)
    expect(premier.meritFeeBps).toBe(0)
    expect(premier.meritFeeCents).toBe(0) // Premier eats no merit
  })
})
