import { describe, expect, it } from 'vitest'

import { computeColdPack } from './cold-pack'
import { requiredDocsFor } from './required-docs'

describe('requiredDocsFor — domain × storageClass × hazmat', () => {
  it('ambient food parcel: packing slip + COA', () => {
    expect(
      requiredDocsFor({ domain: 'FOOD', storageClass: 'AMBIENT', hazmatClass: 'NONE', mode: 'PARCEL' }),
    ).toEqual(['COA', 'PACKING_SLIP'])
  })

  it('frozen food freight: + BOL, temp logger, washout cert', () => {
    expect(
      requiredDocsFor({ domain: 'FOOD', storageClass: 'FROZEN', hazmatClass: 'NONE', mode: 'LTL' }),
    ).toEqual(['BOL', 'COA', 'PACKING_SLIP', 'TEMP_LOGGER', 'WASHOUT_CERT'])
  })

  it('flammable cosmetic parcel: SDS required, no COA mandate', () => {
    expect(
      requiredDocsFor({ domain: 'COSMETIC', storageClass: 'AMBIENT', hazmatClass: 'LQ_FLAMMABLE', mode: 'PARCEL' }),
    ).toEqual(['PACKING_SLIP', 'SDS'])
  })

  it('supplements always carry a COA (SIDI norm)', () => {
    expect(
      requiredDocsFor({ domain: 'DIETARY_SUPPLEMENT', storageClass: 'PROTECT_HEAT', hazmatClass: 'NONE', mode: 'PARCEL' }),
    ).toContain('COA')
  })

  it('chilled pet food parcel: temp logger but no washout (no trailer)', () => {
    const docs = requiredDocsFor({ domain: 'PET_PRODUCT', storageClass: 'CHILLED', hazmatClass: 'NONE', mode: 'PARCEL' })
    expect(docs).toContain('TEMP_LOGGER')
    expect(docs).not.toContain('WASHOUT_CERT')
  })
})

describe('computeColdPack', () => {
  it('frozen 2-day: 1:1 dry ice, flags air limit above 5.5 lb', () => {
    const spec = computeColdPack({ storageClass: 'FROZEN', productWeightLb: 10, transitDays: 1, summer: false })
    expect(spec.coolantType).toBe('DRY_ICE')
    expect(spec.coolantWeightLb).toBe(10)
    expect(spec.dryIceOverAirLimit).toBe(true)
  })

  it('frozen 3-day summer: 1.5:1 ratio +30%, 2" wall', () => {
    const spec = computeColdPack({ storageClass: 'FROZEN', productWeightLb: 10, transitDays: 2, summer: true })
    expect(spec.coolantWeightLb).toBe(20) // ceil(ceil(10*1.5)*1.3)
    expect(spec.insulationWallIn).toBe(2)
  })

  it('meltable off-season needs no coolant; summer gets a light gel pack-out', () => {
    expect(computeColdPack({ storageClass: 'PROTECT_HEAT', productWeightLb: 8, transitDays: 2, summer: false }).coolantType).toBe('NONE')
    const summer = computeColdPack({ storageClass: 'PROTECT_HEAT', productWeightLb: 8, transitDays: 2, summer: true })
    expect(summer.coolantType).toBe('GEL_PACK')
    expect(summer.coolantWeightLb).toBe(2)
  })

  it('ambient: nothing', () => {
    expect(computeColdPack({ storageClass: 'AMBIENT', productWeightLb: 8, transitDays: 3, summer: true }).coolantType).toBe('NONE')
  })
})
