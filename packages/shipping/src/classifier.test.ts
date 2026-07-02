import { describe, expect, it } from 'vitest'

import { classifyShipment, freightClassFromDensity } from './classifier'
import type { ClassifierInput } from './types'

const carton = (weightLb: number) => ({ lengthIn: 12, widthIn: 12, heightIn: 12, weightLb })

const base: ClassifierInput = {
  domain: 'FOOD',
  storageClass: 'AMBIENT',
  hazmatClass: 'NONE',
  meltable: false,
  cartons: [carton(20)],
}

describe('classifyShipment — mode', () => {
  it('small ambient shipment is PARCEL', () => {
    expect(classifyShipment(base).mode).toBe('PARCEL')
  })

  it('crosses to LTL above the carton cutover', () => {
    const cartons = Array.from({ length: 9 }, () => carton(20))
    expect(classifyShipment({ ...base, cartons }).mode).toBe('LTL')
    expect(classifyShipment({ ...base, cartons, parcelToLtlCartonCutover: 12 }).mode).toBe('PARCEL')
  })

  it('any carton over 150 lb forces LTL', () => {
    expect(classifyShipment({ ...base, cartons: [carton(151)] }).mode).toBe('LTL')
  })

  it('pallets ⇒ LTL; >14 pallets ⇒ FTL', () => {
    expect(classifyShipment({ ...base, palletCount: 3 }).mode).toBe('LTL')
    expect(classifyShipment({ ...base, palletCount: 15 }).mode).toBe('FTL')
  })
})

describe('classifyShipment — temp class hard consequences', () => {
  it('frozen parcel gets dry ice, ≤2-day SLA, Mon–Wed ship days', () => {
    const c = classifyShipment({ ...base, storageClass: 'FROZEN' })
    expect(c.coolantType).toBe('DRY_ICE')
    expect(c.maxTransitDays).toBe(2)
    expect(c.allowedShipDays).toEqual([1, 2, 3])
  })

  it('chilled parcel gets gel packs and ≤2-day SLA', () => {
    const c = classifyShipment({ ...base, storageClass: 'CHILLED' })
    expect(c.coolantType).toBe('GEL_PACK')
    expect(c.maxTransitDays).toBe(2)
  })

  it('frozen freight uses reefer equipment, not parcel coolant', () => {
    const c = classifyShipment({ ...base, storageClass: 'FROZEN', palletCount: 4 })
    expect(c.coolantType).toBe('NONE')
    expect(c.maxTransitDays).toBeNull()
  })
})

describe('classifyShipment — hazmat', () => {
  it('LQ flammable cosmetics are ground-only', () => {
    expect(classifyShipment({ ...base, domain: 'COSMETIC', hazmatClass: 'LQ_FLAMMABLE' }).groundOnly).toBe(true)
  })
  it('aerosols are ground-only', () => {
    expect(classifyShipment({ ...base, domain: 'COSMETIC', hazmatClass: 'AEROSOL_2_1' }).groundOnly).toBe(true)
  })
})

describe('freightClassFromDensity — NMFC breaks', () => {
  it('maps density bands', () => {
    expect(freightClassFromDensity(52)).toBe('50')
    expect(freightClassFromDensity(16)).toBe('70')
    expect(freightClassFromDensity(9.5)).toBe('100')
    expect(freightClassFromDensity(0.8)).toBe('500')
  })

  it('computes for LTL shipments', () => {
    // 100 lb in one 12"×12"×12" carton = 100 lb/cu ft ⇒ densest break, class 50
    const c = classifyShipment({ ...base, palletCount: 2, cartons: [carton(100)] })
    expect(c.freightClass).toBe('50')
    // parcel legs carry no NMFC class
    expect(classifyShipment(base).freightClass).toBeNull()
  })
})
