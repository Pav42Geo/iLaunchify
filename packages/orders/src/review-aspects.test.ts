import { describe, expect, it } from 'vitest'
import {
  REVIEW_ASPECTS,
  resolveAspectPartners,
  availableAspects,
  resolveOneAspect,
  visibilityForRole,
  shouldOfferAttributionFork,
  validateReanchorRating,
  applyAttributionOutcome,
  applyOfferedAspects,
  DEFAULT_ATTRIBUTION_CONTROLS,
  REANCHOR_TRIGGER_MAX_STARS,
  type OrderLeg,
} from './review-aspects'

// A full 4-leg order: manufacturer + printer + co-packer + FC.
const FULL: OrderLeg[] = [
  { role: 'MANUFACTURER', partnerServiceId: 'mfr-1' },
  { role: 'PRINTER', partnerServiceId: 'prn-1' },
  { role: 'COPACKER', partnerServiceId: 'cop-1' },
  { role: 'WAREHOUSE', partnerServiceId: 'fc-1' },
]

describe('resolveAspectPartners', () => {
  it('always offers PRODUCT with no partner', () => {
    const product = resolveAspectPartners([]).find((r) => r.aspect === 'PRODUCT')
    expect(product).toEqual({ aspect: 'PRODUCT', partnerServiceId: null, role: null, visibility: 'PUBLIC' })
  })

  it('routes each aspect to the right leg on a full order', () => {
    const map = Object.fromEntries(resolveAspectPartners(FULL).map((r) => [r.aspect, r]))
    expect(map.PRINTING).toMatchObject({ partnerServiceId: 'prn-1', role: 'PRINTER', visibility: 'PUBLIC' })
    expect(map.PACKAGING).toMatchObject({ partnerServiceId: 'cop-1', role: 'COPACKER', visibility: 'ADMIN_SELF' })
    expect(map.FULFILLMENT).toMatchObject({ partnerServiceId: 'fc-1', role: 'WAREHOUSE', visibility: 'ADMIN_SELF' })
  })

  it('falls back PACKAGING → manufacturer when there was no co-pack leg', () => {
    const legs: OrderLeg[] = [
      { role: 'MANUFACTURER', partnerServiceId: 'mfr-1' },
      { role: 'PRINTER', partnerServiceId: 'prn-1' },
    ]
    const pkg = resolveOneAspect(legs, 'PACKAGING')
    expect(pkg).toMatchObject({ partnerServiceId: 'mfr-1', role: 'MANUFACTURER', visibility: 'PUBLIC' })
  })

  it('does not offer an aspect with no responsible partner', () => {
    const legs: OrderLeg[] = [{ role: 'MANUFACTURER', partnerServiceId: 'mfr-1' }]
    const aspects = availableAspects(legs)
    expect(aspects).toContain('PRODUCT')
    expect(aspects).toContain('PACKAGING') // falls back to manufacturer
    expect(aspects).not.toContain('PRINTING') // no printer leg
    expect(aspects).not.toContain('FULFILLMENT') // no FC leg
  })

  it('first leg of a role wins and blanks are ignored', () => {
    const legs: OrderLeg[] = [
      { role: 'PRINTER', partnerServiceId: '' },
      { role: 'PRINTER', partnerServiceId: 'prn-real' },
      { role: 'PRINTER', partnerServiceId: 'prn-second' },
    ]
    expect(resolveOneAspect(legs, 'PRINTING')?.partnerServiceId).toBe('prn-real')
  })

  it('registry order is the chip display order', () => {
    expect(REVIEW_ASPECTS.map((a) => a.aspect)).toEqual(['PRODUCT', 'PRINTING', 'PACKAGING', 'FULFILLMENT'])
  })
})

describe('visibilityForRole', () => {
  it('printer + manufacturer public; co-packer + FC admin/self', () => {
    expect(visibilityForRole('PRINTER')).toBe('PUBLIC')
    expect(visibilityForRole('MANUFACTURER')).toBe('PUBLIC')
    expect(visibilityForRole('COPACKER')).toBe('ADMIN_SELF')
    expect(visibilityForRole('WAREHOUSE')).toBe('ADMIN_SELF')
  })
})

describe('shouldOfferAttributionFork', () => {
  it('offers only when low stars AND a partner aspect is tagged', () => {
    expect(shouldOfferAttributionFork(2, ['PRINTING'])).toBe(true)
    expect(shouldOfferAttributionFork(REANCHOR_TRIGGER_MAX_STARS, ['PACKAGING'])).toBe(true)
    expect(shouldOfferAttributionFork(4, ['PRINTING'])).toBe(false) // happy path — never interrogate
    expect(shouldOfferAttributionFork(1, ['PRODUCT'])).toBe(false) // no partner tagged → nothing to re-anchor
    expect(shouldOfferAttributionFork(1, [])).toBe(false)
  })
})

describe('validateReanchorRating', () => {
  it('accepts a whole star >= original', () => {
    expect(validateReanchorRating(2, 5).ok).toBe(true)
    expect(validateReanchorRating(2, 2).ok).toBe(true)
  })
  it('rejects below original (no lowering under cover of re-anchor)', () => {
    expect(validateReanchorRating(3, 2).ok).toBe(false)
  })
  it('rejects out-of-range / non-integer', () => {
    expect(validateReanchorRating(2, 0).ok).toBe(false)
    expect(validateReanchorRating(2, 6).ok).toBe(false)
    expect(validateReanchorRating(2, 4.5).ok).toBe(false)
  })
})

describe('applyAttributionOutcome', () => {
  it('PRODUCT keeps the star, routes note, no re-anchor', () => {
    const r = applyAttributionOutcome({ outcome: 'PRODUCT', originalRating: 2 })
    expect(r).toEqual({ ok: true, result: { productRating: 2, reanchored: false, openPartnerRating: false, routeNote: true } })
  })

  it('MIX keeps the star, routes note, opens partner rating', () => {
    const r = applyAttributionOutcome({ outcome: 'MIX', originalRating: 2 })
    expect(r.ok && r.result).toMatchObject({ productRating: 2, reanchored: false, openPartnerRating: true, routeNote: true })
  })

  it('PARTNER re-anchors to the product-only star and flags reanchored', () => {
    const r = applyAttributionOutcome({ outcome: 'PARTNER', originalRating: 2, newProductRating: 5 })
    expect(r.ok && r.result).toMatchObject({ productRating: 5, reanchored: true, openPartnerRating: true, routeNote: true })
  })

  it('PARTNER requires a new rating and enforces the floor', () => {
    expect(applyAttributionOutcome({ outcome: 'PARTNER', originalRating: 2 }).ok).toBe(false)
    expect(applyAttributionOutcome({ outcome: 'PARTNER', originalRating: 3, newProductRating: 2 }).ok).toBe(false)
  })
})

describe('applyOfferedAspects (admin control)', () => {
  it('filters to the admin-offered set but always keeps PRODUCT', () => {
    const resolved = resolveAspectPartners(FULL)
    const kept = applyOfferedAspects(resolved, ['PRINTING']).map((r) => r.aspect)
    expect(kept).toContain('PRODUCT')
    expect(kept).toContain('PRINTING')
    expect(kept).not.toContain('PACKAGING')
    expect(kept).not.toContain('FULFILLMENT')
  })

  it('default controls offer the three partner aspects', () => {
    expect(DEFAULT_ATTRIBUTION_CONTROLS.offeredAspects).toEqual(['PACKAGING', 'PRINTING', 'FULFILLMENT'])
  })
})
