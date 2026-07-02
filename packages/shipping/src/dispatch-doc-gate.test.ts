import { describe, expect, it } from 'vitest'

import { evaluateDispatchDocGate } from './dispatch-doc-gate'
import { buildReceivingChecklist } from './receiving-checklist'

describe('evaluateDispatchDocGate', () => {
  it('food parcel: COA gates shipping; packing slip does not (platform-generated)', () => {
    const blocked = evaluateDispatchDocGate({
      domain: 'FOOD', storageClass: 'AMBIENT', hazmatClass: 'NONE', mode: 'PARCEL', uploadedDocTypes: [],
    })
    expect(blocked.canShip).toBe(false)
    expect(blocked.missing).toEqual(['COA'])
    const ok = evaluateDispatchDocGate({
      domain: 'FOOD', storageClass: 'AMBIENT', hazmatClass: 'NONE', mode: 'PARCEL', uploadedDocTypes: ['COA'],
    })
    expect(ok.canShip).toBe(true)
  })

  it('frozen food freight: COA + logger + washout all gate', () => {
    const r = evaluateDispatchDocGate({
      domain: 'FOOD', storageClass: 'FROZEN', hazmatClass: 'NONE', mode: 'LTL', uploadedDocTypes: ['COA'],
    })
    expect(r.canShip).toBe(false)
    expect(r.missing.sort()).toEqual(['TEMP_LOGGER', 'WASHOUT_CERT'])
  })

  it('flammable cosmetic: SDS gates; nothing else', () => {
    const r = evaluateDispatchDocGate({
      domain: 'COSMETIC', storageClass: 'AMBIENT', hazmatClass: 'LQ_FLAMMABLE', mode: 'PARCEL', uploadedDocTypes: [],
    })
    expect(r.missing).toEqual(['SDS'])
  })
})

describe('buildReceivingChecklist', () => {
  const base = {
    destinationType: 'WAREHOUSE_PARTNER' as const,
    mode: 'LTL' as const,
    storageClass: 'AMBIENT' as const,
    hazmatClass: 'NONE' as const,
    lotTracked: true,
    lines: [{ sku: 'S1', gtin: '00012345678905', quantity: 100, lotNumber: 'L1', expiryDate: '2027-01-01' }],
  }

  it('FC freight: ASN label + pallet spec + appointment present', () => {
    const keys = buildReceivingChecklist(base).map((i) => i.key)
    expect(keys).toContain('asn-label')
    expect(keys).toContain('pallet-spec')
    expect(keys).toContain('appointment')
    expect(keys).toContain('lot-per-carton')
  })

  it('frozen adds pre-cool/logger/seal for shipper and temp/seal checks for receiver', () => {
    const items = buildReceivingChecklist({ ...base, storageClass: 'FROZEN' })
    const keys = items.map((i) => i.key)
    for (const k of ['precool', 'logger-placed', 'seal', 'recv-temp', 'recv-seal']) {
      expect(keys).toContain(k)
    }
    expect(items.find((i) => i.key === 'temp-mark')!.label).toContain('KEEP FROZEN')
  })

  it('parcel to creator address: no ASN/pallet/appointment/seal items', () => {
    const keys = buildReceivingChecklist({ ...base, destinationType: 'CREATOR_ADDRESS', mode: 'PARCEL' }).map((i) => i.key)
    expect(keys).not.toContain('asn-label')
    expect(keys).not.toContain('pallet-spec')
    expect(keys).not.toContain('seal')
  })

  it('LQ cosmetics get the Limited Quantity item', () => {
    const keys = buildReceivingChecklist({ ...base, hazmatClass: 'LQ_FLAMMABLE', lotTracked: false }).map((i) => i.key)
    expect(keys).toContain('lq-mark')
    expect(keys).not.toContain('lot-per-carton')
  })
})
