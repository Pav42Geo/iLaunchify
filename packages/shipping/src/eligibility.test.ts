import { describe, expect, it } from 'vitest'

import { classifyShipment } from './classifier'
import { eligibleCarrierServices, inMeltablePause } from './eligibility'
import type { CarrierServiceRuleRow, ClassifierInput } from './types'

const rule = (over: Partial<CarrierServiceRuleRow>): CarrierServiceRuleRow => ({
  id: over.id ?? 'r',
  carrier: 'UPS',
  serviceLevel: 'GROUND',
  modes: ['PARCEL'],
  storageClasses: ['AMBIENT', 'PROTECT_HEAT'],
  hazmatAllowed: [],
  maxWeightLb: 150,
  maxTransitDays: 5,
  groundOnly: true,
  seasonalWindowJson: null,
  priority: 100,
  active: true,
  ...over,
})

const base: ClassifierInput = {
  domain: 'FOOD',
  storageClass: 'AMBIENT',
  hazmatClass: 'NONE',
  meltable: false,
  cartons: [{ lengthIn: 12, widthIn: 12, heightIn: 12, weightLb: 20 }],
}

describe('eligibility — hard filters (never traded for cost)', () => {
  it('a service without the storage class NEVER passes (no silent cross-class fallback)', () => {
    const frozen = classifyShipment({ ...base, storageClass: 'FROZEN' })
    const ambientOnly = [rule({ id: 'cheap-ambient', priority: 1 })]
    expect(eligibleCarrierServices(ambientOnly, frozen)).toEqual([])
  })

  it('frozen parcel requires a ≤2-day-capable service', () => {
    const frozen = classifyShipment({ ...base, storageClass: 'FROZEN' })
    const rules = [
      rule({ id: 'ground-5day', storageClasses: ['FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxTransitDays: 5 }),
      rule({ id: '2day', serviceLevel: '2DAY', storageClasses: ['FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxTransitDays: 2, groundOnly: false }),
    ]
    expect(eligibleCarrierServices(rules, frozen).map((r) => r.id)).toEqual(['2day'])
  })

  it('hazmat must be explicitly allowed; LQ flammables only match ground rules', () => {
    const lq = classifyShipment({ ...base, domain: 'COSMETIC', hazmatClass: 'LQ_FLAMMABLE' })
    const rules = [
      rule({ id: 'air', serviceLevel: '2DAY', groundOnly: false, hazmatAllowed: ['LQ_FLAMMABLE'] }),
      rule({ id: 'ground-no-hazmat' }),
      rule({ id: 'ground-lq', hazmatAllowed: ['LQ_FLAMMABLE'] }),
    ]
    expect(eligibleCarrierServices(rules, lq).map((r) => r.id)).toEqual(['ground-lq'])
  })

  it('weight cap and inactive rules filter out; priority orders the fallback chain', () => {
    const c = classifyShipment(base)
    const rules = [
      rule({ id: 'second', priority: 20 }),
      rule({ id: 'first', priority: 10 }),
      rule({ id: 'inactive', priority: 1, active: false }),
      rule({ id: 'tiny-cap', priority: 1, maxWeightLb: 10 }),
    ]
    expect(eligibleCarrierServices(rules, c).map((r) => r.id)).toEqual(['first', 'second'])
  })
})

describe('eligibility — seasonal windows', () => {
  const meltableWindow = { meltablePause: { from: '04-15', to: '10-15' } }

  it('meltable pause blocks in-window ship dates', () => {
    expect(inMeltablePause(meltableWindow, new Date('2026-07-02T12:00:00'))).toBe(true)
    expect(inMeltablePause(meltableWindow, new Date('2026-12-01T12:00:00'))).toBe(false)
  })

  it('meltable shipment is blocked in the pause window, allowed outside it', () => {
    const c = classifyShipment({ ...base, storageClass: 'PROTECT_HEAT', meltable: true })
    const rules = [rule({ id: 'r1', seasonalWindowJson: meltableWindow })]
    expect(
      eligibleCarrierServices(rules, c, { meltable: true, plannedShipDate: new Date('2026-07-02T12:00:00') }),
    ).toEqual([])
    expect(
      eligibleCarrierServices(rules, c, { meltable: true, plannedShipDate: new Date('2026-11-20T12:00:00') }).map((r) => r.id),
    ).toEqual(['r1'])
  })

  it('frozen parcel respects Mon–Wed ship days', () => {
    const frozen = classifyShipment({ ...base, storageClass: 'FROZEN' })
    const rules = [
      rule({ id: '2day', serviceLevel: '2DAY', storageClasses: ['FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxTransitDays: 2, groundOnly: false }),
    ]
    const monday = new Date('2026-07-06T12:00:00')
    const friday = new Date('2026-07-03T12:00:00')
    expect(eligibleCarrierServices(rules, frozen, { plannedShipDate: monday }).length).toBe(1)
    expect(eligibleCarrierServices(rules, frozen, { plannedShipDate: friday }).length).toBe(0)
  })
})
