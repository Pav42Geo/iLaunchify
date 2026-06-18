import { describe, it, expect } from 'vitest'
import { scopeDispatchComponents, type ManifestComponent } from './manifest'

const comp = (over: Partial<ManifestComponent> & { id: string }): ManifestComponent => ({
  tier: 'PRIMARY',
  role: 'LABEL',
  decorationMethod: 'CMYK_DIGITAL',
  dielineId: null,
  packagingTypeId: 'pt-1',
  packagingTypeName: 'Label',
  partnerServiceId: null,
  ...over,
})

const ids = (cs: ManifestComponent[]) => cs.map((c) => c.id).sort()

describe('scopeDispatchComponents — PRODUCT', () => {
  it('never carries components (production, not decoration)', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'PRODUCT',
      partnerServiceId: 'svc-1',
      components: [comp({ id: 'a' }), comp({ id: 'b', role: 'CARTON', decorationMethod: 'NONE' })],
    })
    expect(out).toEqual([])
  })
})

describe('scopeDispatchComponents — LABEL', () => {
  it('returns only the decorated components whose offering is this partnerService', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'LABEL',
      partnerServiceId: 'printer-A',
      components: [
        comp({ id: 'mine', partnerServiceId: 'printer-A' }),
        comp({ id: 'theirs', partnerServiceId: 'printer-B' }),
        comp({ id: 'undecorated', decorationMethod: 'NONE', partnerServiceId: 'printer-A' }),
      ],
    })
    expect(ids(out)).toEqual(['mine'])
  })

  it('self-label fallback: when no decorated component matches, covers ALL decorated', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'LABEL',
      partnerServiceId: 'owner-svc', // owner self-labels; no component points at it
      components: [
        comp({ id: 'd1', partnerServiceId: 'printer-A' }),
        comp({ id: 'd2', partnerServiceId: null }),
        comp({ id: 'carton', role: 'CARTON', decorationMethod: 'NONE' }),
      ],
    })
    expect(ids(out)).toEqual(['d1', 'd2']) // both decorated, carton excluded
  })

  it('excludes NONE-decoration components even on the self-label fallback', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'LABEL',
      partnerServiceId: 'owner-svc',
      components: [comp({ id: 'plain', decorationMethod: 'NONE' })],
    })
    expect(out).toEqual([])
  })
})

describe('scopeDispatchComponents — COPACKING', () => {
  it('returns the CARTON/SHIPPER components this assembler packs', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'COPACKING',
      partnerServiceId: 'assembler-A',
      components: [
        comp({ id: 'carton', role: 'CARTON', decorationMethod: 'NONE', partnerServiceId: 'assembler-A' }),
        comp({ id: 'shipper', role: 'SHIPPER', decorationMethod: 'NONE', partnerServiceId: 'assembler-B' }),
        comp({ id: 'label', role: 'LABEL', partnerServiceId: 'assembler-A' }),
      ],
    })
    expect(ids(out)).toEqual(['carton'])
  })

  it('self-assembly fallback: no matching assembler → covers all CARTON/SHIPPER', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'COPACKING',
      partnerServiceId: 'mfg-self', // manufacturer self-assembles
      components: [
        comp({ id: 'carton', role: 'CARTON', decorationMethod: 'NONE', partnerServiceId: null }),
        comp({ id: 'shipper', role: 'SHIPPER', decorationMethod: 'NONE', partnerServiceId: null }),
        comp({ id: 'label', role: 'LABEL' }),
      ],
    })
    expect(ids(out)).toEqual(['carton', 'shipper'])
  })

  it('no assembly components → empty', () => {
    const out = scopeDispatchComponents({
      dispatchType: 'COPACKING',
      partnerServiceId: 'assembler-A',
      components: [comp({ id: 'label', role: 'LABEL' })],
    })
    expect(out).toEqual([])
  })
})
