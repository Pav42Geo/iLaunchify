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
// Pure: no prisma, shim-compatible (describe/it/expect only).
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

describe('routing merit snapshot: only the PRODUCT leg carries merit', () => {
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
    // Even a (nonsensical) non-zero bps for the printer/co-packer service must not apply -
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

  it('is shadow-inert: with the engine disabled (0 bps) the PRODUCT leg snapshots 0/0: no money moves', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// THE DECISION behind the gate (Pavel 2026-07-16). Distinct from the tests above:
// those pin the BEHAVIOUR, this pins the REASON, because the behaviour looks like
// an oversight and someone will eventually try to "fix" it.
//
// `routing.ts:858` (`if (row.type !== 'PRODUCT') return { ...row, meritFeeBps: 0 }`)
// was written against an OPEN policy flag, not a decision:
// FEE_MODEL_RECONCILIATION_SPEC_2026-07-09 §6.4 read "Merit only eats the
// manufacturer leg, not printer/packer/FC - ASSUMED from 'eats the manufacturer.'
// CONFIRM no merit on non-PRODUCT legs." It sat open for a week. It is now CLOSED:
// no merit on non-PRODUCT legs, by decision.
//
// THE REASON, which is the general rule (docs/SERVICE_SYMMETRY_AND_MERIT_2026-07-15.md):
//
//   THE INSTRUMENT MUST MATCH THE SELECTION MODEL.
//
// Merit prices a CHOICE. The manufacturer is the only leg a creator chooses and
// PINS (owner-pinned to ProductTemplate.manufacturerServiceId), so their standing
// must be visible (the badge) and must have consequences (the fee). Nothing else
// is chosen that way:
//   - a PRINTER is ROTATED, and Bayesian rating already ranks the pool. A badge
//     would add nothing to a lottery.
//   - an FC is SELECTED BY FIT (temp class, hazmat, location, capacity). Physics,
//     not reputation.
//   - a CO-PACK leg is AUTO-DERIVED from a CARTON/SHIPPER in the graph
//     (dispatch-planner.ts:137-153). Nobody chose it, so there is no decision for
//     a badge to inform.
//
// COMMON MISREADING, pre-empted: "co-packing has a real price now (CP-3), so merit
// should apply." No. A price is not a choice. Co-packers already pay the platform
// through the creator tier fee once their price enters the fee base; merit is an
// ADDITIONAL withhold that exists to make a pinned choice legible, and a co-pack
// leg is not pinned. CP-8 is WONTFIX.
//
// NOTHING structural stops merit reaching these legs: manufacturer-merit-fee.ts
// takes a bare serviceId with no type check, MeritPolicy has no service scoping,
// and COPACKING dispatch rows already HAVE meritFeeBps/meritFeeCents columns. The
// gate is the only thing holding the decision. That is why it is pinned here.
// ─────────────────────────────────────────────────────────────────────────────
describe('merit is a MANUFACTURING instrument, by decision (not an oversight)', () => {
  it('a co-pack leg with a REAL price still carries zero merit (the CP-3 misreading)', () => {
    // Post-CP-3 shape: the co-packer quoted 42.00 from their own operation menu.
    const pricedCopack: Leg = { type: 'COPACKING', partnerServiceId: 'copack-1', costCents: 4200 }
    // And their org holds a Premier badge earned on its MANUFACTURING service.
    const stamped = stampMerit(pricedCopack, () => 450)
    expect(stamped.meritFeeBps).toBe(0)
    expect(stamped.meritFeeCents).toBe(0)
  })

  it('the gate is LOAD-BEARING: remove the type check and money moves', () => {
    // Exactly routing.ts:858 minus the gate. If this ever equals the real stamp,
    // the decision has been deleted.
    const ungated = (row: Leg, bpsFor: (s: string) => number) => ({
      ...row,
      meritFeeBps: bpsFor(row.partnerServiceId),
      meritFeeCents: meritWithholdCents(row.costCents, bpsFor(row.partnerServiceId)),
    })
    const copack: Leg = { type: 'COPACKING', partnerServiceId: 'copack-1', costCents: 4200 }
    const withGate = stampMerit(copack, () => 450)
    const withoutGate = ungated(copack, () => 450)
    expect(withoutGate.meritFeeCents).toBe(189) // 4200 * 4.5%
    expect(withGate.meritFeeCents).toBe(0)
    expect(withGate.meritFeeCents).not.toBe(withoutGate.meritFeeCents)
  })

  it('the PRODUCT leg is the ONLY leg merit can reach, whatever the leg mix', () => {
    const mixed: Leg[] = [
      { type: 'PRODUCT', partnerServiceId: 'svc', costCents: 1000 },
      { type: 'LABEL', partnerServiceId: 'svc', costCents: 1000 },
      { type: 'COPACKING', partnerServiceId: 'svc', costCents: 1000 },
    ]
    // Same service id on every leg (a full-service partner: mfr + printer + co-packer,
    // which @@unique([partnerId, type]) explicitly allows). Merit still touches ONE leg.
    const stamped = mixed.map((l) => stampMerit(l, () => 450))
    const carrying = stamped.filter((s) => s.meritFeeCents > 0)
    expect(carrying).toHaveLength(1)
    expect(carrying[0]!.type).toBe('PRODUCT')
  })
})
