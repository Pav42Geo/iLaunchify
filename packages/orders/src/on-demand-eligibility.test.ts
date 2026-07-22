// Pure-core tests for the on-demand full-service gate
// (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md). Spec-anchored: each case
// maps to a leak path or an allowed single-partner bind from the decision doc.

import { describe, it, expect } from 'vitest'
import {
  evaluateOnDemandEligibility,
  describeOnDemandIneligibility,
  checkSinglePartnerPlan,
  assertSinglePartnerPlan,
  type OnDemandEligibilitySnapshot,
  type OnDemandIneligibleReason,
  type SinglePartnerPlanInput,
} from './on-demand-eligibility'

const MFR_PARTNER = 'partner-mfr'
const MFR_SERVICE = 'svc-mfr'

function snap(over: Partial<OnDemandEligibilitySnapshot> = {}): OnDemandEligibilitySnapshot {
  // Baseline: a full-service manufacturer, nothing external. Eligible.
  return {
    manufacturerServiceId: MFR_SERVICE,
    manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'IN_HOUSE', canShipParcel: true },
    productPrintSourcingMode: null,
    pinnedPrintPartnerId: null,
    offeringPrintPartnerIds: [],
    nominatedPrintServiceId: null,
    dieCutTemplateId: null,
    ownerHasDieCutPress: false,
    coPackerServiceId: null,
    ...over,
  }
}

function reasonsOf(s: OnDemandEligibilitySnapshot): OnDemandIneligibleReason[] {
  const r = evaluateOnDemandEligibility(s)
  return r.eligible ? [] : r.reasons
}

describe('evaluateOnDemandEligibility', () => {
  it('full-service manufacturer is eligible and returns the pinned service id', () => {
    const r = evaluateOnDemandEligibility(snap())
    expect(r).toEqual({ eligible: true, manufacturerServiceId: MFR_SERVICE })
  })

  it('no pinned manufacturer fails closed with the single covering reason', () => {
    expect(reasonsOf(snap({ manufacturerServiceId: null }))).toEqual(['NO_PINNED_MANUFACTURER'])
    // Stale pin: id present but the service did not resolve. Same reason.
    expect(reasonsOf(snap({ manufacturerService: null }))).toEqual(['NO_PINNED_MANUFACTURER'])
  })

  it('EXTERNAL_ALLOWED alone stays eligible (routing self-labels when nothing external is selected)', () => {
    expect(
      reasonsOf(snap({ manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'EXTERNAL_ALLOWED', canShipParcel: true } })),
    ).toEqual([])
  })

  it('EXTERNAL_REQUIRED disqualifies (self-label fallback is forbidden for the product)', () => {
    expect(
      reasonsOf(snap({ manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'EXTERNAL_REQUIRED', canShipParcel: true } })),
    ).toEqual(['EXTERNAL_PRINT_REQUIRED'])
  })

  it('product printSourcingMode override wins over the service default', () => {
    // Service says EXTERNAL_REQUIRED but the product overrides to IN_HOUSE: eligible.
    expect(
      reasonsOf(
        snap({
          manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'EXTERNAL_REQUIRED', canShipParcel: true },
          productPrintSourcingMode: 'IN_HOUSE',
        }),
      ),
    ).toEqual([])
    // And the reverse: product forces EXTERNAL_REQUIRED on an IN_HOUSE service.
    expect(reasonsOf(snap({ productPrintSourcingMode: 'EXTERNAL_REQUIRED' }))).toEqual(['EXTERNAL_PRINT_REQUIRED'])
  })

  it('pinned print pick at ANOTHER partner disqualifies; the owner’s own press does not', () => {
    expect(reasonsOf(snap({ pinnedPrintPartnerId: 'partner-other' }))).toEqual(['EXTERNAL_PRINT_PIN'])
    expect(reasonsOf(snap({ pinnedPrintPartnerId: MFR_PARTNER }))).toEqual([])
  })

  it('selection-bound print offering owned by another partner disqualifies; own-partner offering is fine', () => {
    expect(reasonsOf(snap({ offeringPrintPartnerIds: ['partner-other'] }))).toEqual(['EXTERNAL_PRINT_OFFERING'])
    expect(reasonsOf(snap({ offeringPrintPartnerIds: [MFR_PARTNER] }))).toEqual([])
  })

  it('an active print nomination disqualifies (nominations always point off-partner)', () => {
    expect(reasonsOf(snap({ nominatedPrintServiceId: 'svc-nominee' }))).toEqual(['ACTIVE_PRINT_NOMINATION'])
  })

  it('die-cut without the owner’s own press disqualifies; with it, eligible', () => {
    expect(reasonsOf(snap({ dieCutTemplateId: 'dc-1', ownerHasDieCutPress: false }))).toEqual([
      'DIE_CUT_WITHOUT_OWN_PRESS',
    ])
    expect(reasonsOf(snap({ dieCutTemplateId: 'dc-1', ownerHasDieCutPress: true }))).toEqual([])
  })

  it('a pinned co-packer disqualifies (second dispatch by construction)', () => {
    expect(reasonsOf(snap({ coPackerServiceId: 'svc-copack' }))).toEqual(['COPACK_LEG_PRESENT'])
  })

  it('freight-only manufacturer disqualifies (parcel per consumer order)', () => {
    expect(
      reasonsOf(snap({ manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'IN_HOUSE', canShipParcel: false } })),
    ).toEqual(['MANUFACTURER_CANNOT_SHIP_PARCEL'])
  })

  it('reasons accumulate: the creator sees the full fix list, not the first failure', () => {
    const reasons = reasonsOf(
      snap({
        manufacturerService: { partnerId: MFR_PARTNER, labelingMode: 'EXTERNAL_REQUIRED', canShipParcel: false },
        pinnedPrintPartnerId: 'partner-other',
        coPackerServiceId: 'svc-copack',
      }),
    )
    expect(reasons).toEqual([
      'EXTERNAL_PRINT_REQUIRED',
      'EXTERNAL_PRINT_PIN',
      'COPACK_LEG_PRESENT',
      'MANUFACTURER_CANNOT_SHIP_PARCEL',
    ])
    expect(describeOnDemandIneligibility(reasons)).toContain('parcel')
  })
})

describe('checkSinglePartnerPlan / assertSinglePartnerPlan (gate 4, C2.2)', () => {
  function plan(over: Partial<SinglePartnerPlanInput> = {}): SinglePartnerPlanInput {
    // Baseline: manufacturer self-labels (same service), no co-pack. Valid.
    return {
      manufacturingServiceId: 'svc-mfr',
      manufacturingUserId: 'user-mfr',
      labelPrintingServiceId: 'svc-mfr',
      labelPrintingUserId: 'user-mfr',
      coPackerServiceId: null,
      ...over,
    }
  }

  it('self-label plan passes', () => {
    expect(checkSinglePartnerPlan(plan())).toEqual({ ok: true })
    expect(() => assertSinglePartnerPlan(plan())).not.toThrow()
  })

  it('the owner’s OWN print service (different service, same partner) passes', () => {
    const p = plan({ labelPrintingServiceId: 'svc-mfr-press', labelPrintingUserId: 'user-mfr' })
    expect(checkSinglePartnerPlan(p)).toEqual({ ok: true })
  })

  it('an external print leg fails: this is the line that makes rotation unreachable', () => {
    const p = plan({ labelPrintingServiceId: 'svc-rotated-printer', labelPrintingUserId: 'user-printer' })
    const v = checkSinglePartnerPlan(p)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violation).toBe('EXTERNAL_PRINT_LEG')
    expect(() => assertSinglePartnerPlan(p)).toThrow(/single-partner plan/)
  })

  it('a co-pack leg fails even when print is in-house', () => {
    const p = plan({ coPackerServiceId: 'svc-copack' })
    const v = checkSinglePartnerPlan(p)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.violation).toBe('COPACK_LEG')
    expect(() => assertSinglePartnerPlan(p)).toThrow(/COPACK_LEG/)
  })
})
