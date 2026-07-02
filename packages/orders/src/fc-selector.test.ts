import { describe, expect, it } from 'vitest'

import { haversineMiles, rankFulfillmentCenters, selectNearestEligibleFc } from './fc-selector'
import type { FcCandidate, FcSelectionInput } from './fc-selector'

const fc = (over: Partial<FcCandidate>): FcCandidate => ({
  partnerServiceId: over.partnerServiceId ?? 'fc',
  partnerName: 'FC',
  city: null,
  state: null,
  storageClasses: ['AMBIENT', 'PROTECT_HEAT'],
  hazmatAccepted: [],
  fcCertifications: ['FDA_REGISTERED'],
  weeklyPalletCapacity: 100,
  facilityLat: null,
  facilityLng: null,
  ...over,
})

// Chicago manufacturer; NJ vs TX fulfillment centers — Pavel's canonical case.
const chicago = { originLat: 41.88, originLng: -87.63, originState: 'IL' }
const nj = fc({ partnerServiceId: 'nj', state: 'NJ', facilityLat: 40.73, facilityLng: -74.17 })
const tx = fc({ partnerServiceId: 'tx', state: 'TX', facilityLat: 32.78, facilityLng: -96.8 })

const base: FcSelectionInput = {
  storageClass: 'AMBIENT',
  hazmatClass: 'NONE',
  domain: 'FOOD',
  pallets: 4,
  ...chicago,
}

describe('rankFulfillmentCenters — Phase-1 hard filters', () => {
  it('storage class is hard: ambient-only FC never gets a frozen shipment', () => {
    const { winner } = selectNearestEligibleFc([nj], { ...base, storageClass: 'FROZEN' })
    expect(winner).toBeNull()
  })

  it('food domains require FDA_REGISTERED', () => {
    const uncertified = fc({ partnerServiceId: 'u', fcCertifications: [] })
    const ranked = rankFulfillmentCenters([uncertified], base)
    expect(ranked[0]!.eligible).toBe(false)
    expect(ranked[0]!.exclusionReason).toContain('FDA')
    // …but cosmetics don't
    expect(rankFulfillmentCenters([uncertified], { ...base, domain: 'COSMETIC' })[0]!.eligible).toBe(true)
  })

  it('hazmat must be accepted; capacity caps apply', () => {
    const ranked = rankFulfillmentCenters([nj], { ...base, hazmatClass: 'LQ_FLAMMABLE' })
    expect(ranked[0]!.eligible).toBe(false)
    const small = fc({ partnerServiceId: 's', weeklyPalletCapacity: 2 })
    expect(rankFulfillmentCenters([small], base)[0]!.exclusionReason).toContain('capacity')
  })
})

describe('nearest-eligible selection (Chicago → NJ, not TX)', () => {
  it('haversine sanity: Chicago→NJ ≈ 710 mi, Chicago→Dallas ≈ 800 mi', () => {
    const toNj = haversineMiles(41.88, -87.63, 40.73, -74.17)
    const toTx = haversineMiles(41.88, -87.63, 32.78, -96.8)
    expect(toNj).toBeGreaterThan(600)
    expect(toNj).toBeLessThan(800)
    expect(toTx).toBeGreaterThan(toNj)
  })

  it('picks NJ over TX from Chicago', () => {
    const { winner, ranked } = selectNearestEligibleFc([tx, nj], base)
    expect(winner!.candidate.partnerServiceId).toBe('nj')
    expect(ranked.map((r) => r.candidate.partnerServiceId)).toEqual(['nj', 'tx'])
  })

  it('falls back to same-state, then stable id order when coordinates are missing', () => {
    const noCoordsIl = fc({ partnerServiceId: 'b-il', state: 'IL' })
    const noCoordsGa = fc({ partnerServiceId: 'a-ga', state: 'GA' })
    const { ranked } = selectNearestEligibleFc([noCoordsGa, noCoordsIl], base)
    expect(ranked.map((r) => r.candidate.partnerServiceId)).toEqual(['b-il', 'a-ga'])
    // known distance beats unknown
    const { winner } = selectNearestEligibleFc([noCoordsIl, tx], base)
    expect(winner!.candidate.partnerServiceId).toBe('tx')
  })

  it('ineligible nodes sort after eligible ones but stay visible (admin view)', () => {
    const frozenOnly = fc({ partnerServiceId: 'cold', storageClasses: ['FROZEN'], facilityLat: 41.9, facilityLng: -87.6 })
    const { ranked } = selectNearestEligibleFc([frozenOnly, nj], base)
    expect(ranked[0]!.candidate.partnerServiceId).toBe('nj')
    expect(ranked[1]!.eligible).toBe(false)
  })
})
