import { describe, it, expect } from 'vitest'
import type { ProductionManifest } from './manifest'
import {
  roleForDispatchType,
  buildProductPassport,
  stripFinishCost,
  scopeShipTo,
  scopeManifestForRole,
  scopeManifestForDispatchType,
} from './partner-packet'

// A fully-populated manifest so every redaction path has something to strip.
function fullManifest(overrides: Partial<ProductionManifest> = {}): ProductionManifest {
  return {
    manifestVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    orderId: 'order_1',
    orderDispatchId: 'disp_1',
    dispatchType: 'PRODUCT',
    quantity: 1000,
    brandName: 'Acme Nutrition',
    productName: 'Daily Greens',
    designVersionId: 'dv_1',
    designVersion: 3,
    substrate: { slug: 'bopp-white', name: 'BOPP White', category: 'FILM', sustainabilityTier: 'STANDARD' },
    packaging: { slug: 'pouch-standup', name: 'Stand-up Pouch', topology: 'POUCH', sustainabilityTier: 'STANDARD', foodSafe: true },
    finishes: [
      { partnerFinishId: 'pf_1', finishSlug: 'soft-touch', finishName: 'Soft Touch', category: 'SURFACE', pricingMode: 'PER_UNIT', basePriceCents: 5000, perUnitPriceCents: 8 },
    ],
    dieCut: { slug: 'pouch-6x9', name: 'Pouch 6x9', category: 'POUCH', widthMm: 152, heightMm: 229, bleedMm: 3, safeAreaMm: 4 },
    components: [
      { componentId: 'c_1', tier: 'PRIMARY', role: 'LABEL', packagingTypeId: 'pt_1', packagingTypeName: 'Pouch', decorationMethod: 'FLEXO', dielineId: 'dl_1' },
    ],
    pack: null,
    flavors: [
      { flavorName: 'Berry', qty: 600, statementOfIdentity: 'Berry Daily Greens', leadTimeDays: null },
      { flavorName: 'Citrus', qty: 400, statementOfIdentity: 'Citrus Daily Greens', leadTimeDays: null },
    ],
    recipe: {
      servingSizeG: 30,
      servingsPerContainer: 10,
      ingredients: [
        { ingredientId: 'i_1', labelDeclarationName: 'Spirulina', weightG: 200, position: 0, source: 'CURATED', filledSlotId: null, allergenFlags: [], bioengineeredStatus: null },
      ],
    },
    perFlavorRecipes: [
      { flavorPresetId: 'fp_1', ingredients: [{ ingredientId: 'i_2', labelDeclarationName: 'Blueberry', weightG: 12, position: 0, source: 'CURATED', filledSlotId: null, allergenFlags: [], bioengineeredStatus: null }] },
    ],
    production: { leadTimeDays: 14, standardLeadDays: 14, changeoverDays: 1, flavorCount: 2, basis: 'MULTI_FLAVOR' },
    shipTo: {
      type: 'CREATOR_ADDRESS',
      contactName: 'Pavel G',
      addressLine1: '123 Main St',
      addressLine2: 'Suite 4',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
      warehousePartnerServiceId: null,
    },
    partnerActionItems: [],
    ...overrides,
  }
}

describe('roleForDispatchType', () => {
  it('maps every dispatch type', () => {
    expect(roleForDispatchType('PRODUCT')).toBe('MANUFACTURER')
    expect(roleForDispatchType('LABEL')).toBe('PRINTER')
    expect(roleForDispatchType('COPACKING')).toBe('COPACKER')
    expect(roleForDispatchType('WAREHOUSE')).toBe('WAREHOUSE')
    expect(roleForDispatchType('INBOUND')).toBe('WAREHOUSE')
  })
  it('falls back to MANUFACTURER for unknown types', () => {
    expect(roleForDispatchType('SOMETHING_NEW')).toBe('MANUFACTURER')
  })
})

describe('buildProductPassport', () => {
  it('carries identity but never recipe, finishes, or street address', () => {
    const p = buildProductPassport(fullManifest())
    expect(p.brandName).toBe('Acme Nutrition')
    expect(p.productName).toBe('Daily Greens')
    expect(p.quantity).toBe(1000)
    expect(p.designVersion).toBe(3)
    expect(p.dieCut?.slug).toBe('pouch-6x9')
    // flavor IDENTITY only
    expect(p.flavors).toEqual([
      { flavorName: 'Berry', qty: 600, statementOfIdentity: 'Berry Daily Greens' },
      { flavorName: 'Citrus', qty: 400, statementOfIdentity: 'Citrus Daily Greens' },
    ])
    // region only — no street
    expect(p.shipRegion).toEqual({ type: 'CREATOR_ADDRESS', city: 'Austin', state: 'TX', country: 'US' })
    // no leaked sensitive fields
    expect(p as unknown as Record<string, unknown>).not.toHaveProperty('recipe')
    expect(p as unknown as Record<string, unknown>).not.toHaveProperty('finishes')
    expect(JSON.stringify(p)).not.toContain('123 Main St')
    expect(JSON.stringify(p)).not.toContain('Spirulina')
  })
})

describe('stripFinishCost', () => {
  it('removes all pricing fields', () => {
    const stripped = stripFinishCost(fullManifest().finishes)
    expect(stripped).toEqual([{ partnerFinishId: 'pf_1', finishSlug: 'soft-touch', finishName: 'Soft Touch', category: 'SURFACE' }])
    expect(JSON.stringify(stripped)).not.toContain('5000')
    expect(JSON.stringify(stripped)).not.toContain('PER_UNIT')
  })
})

describe('scopeShipTo', () => {
  it('gives the full address to the final shipper', () => {
    const s = scopeShipTo(fullManifest().shipTo, 'COPACKER', true)
    expect(s.redacted).toBe(false)
    expect(s.addressLine1).toBe('123 Main St')
    expect(s.postalCode).toBe('78701')
  })
  it('always gives the full address to a WAREHOUSE regardless of flag', () => {
    const s = scopeShipTo(fullManifest().shipTo, 'WAREHOUSE', false)
    expect(s.redacted).toBe(false)
    expect(s.addressLine1).toBe('123 Main St')
  })
  it('redacts street/postal/contact for an intermediate hop, keeps region', () => {
    const s = scopeShipTo(fullManifest().shipTo, 'MANUFACTURER', false)
    expect(s.redacted).toBe(true)
    expect(s.contactName).toBeNull()
    expect(s.addressLine1).toBeNull()
    expect(s.addressLine2).toBeNull()
    expect(s.postalCode).toBeNull()
    expect(s.city).toBe('Austin')
    expect(s.state).toBe('TX')
    expect(s.country).toBe('US')
  })
})

describe('scopeManifestForRole — MANUFACTURER', () => {
  const packet = scopeManifestForRole(fullManifest(), 'MANUFACTURER')
  it('gets the formulation + per-flavor recipes + packaging + flavor splits', () => {
    expect(packet.recipe?.ingredients[0]?.labelDeclarationName).toBe('Spirulina')
    expect(packet.perFlavorRecipes).toHaveLength(1)
    expect(packet.packaging?.slug).toBe('pouch-standup')
    expect(packet.flavors).toHaveLength(2)
  })
  it('gets NO substrate, finishes, or components', () => {
    expect(packet.substrate).toBeNull()
    expect(packet.finishes).toEqual([])
    expect(packet.components).toEqual([])
  })
  it('redacts the address (not the final shipper)', () => {
    expect(packet.shipTo.redacted).toBe(true)
    expect(packet.shipTo.addressLine1).toBeNull()
  })
})

describe('scopeManifestForRole — PRINTER', () => {
  const packet = scopeManifestForRole(fullManifest(), 'PRINTER')
  it('gets substrate + cost-stripped finishes + components, but NO recipe', () => {
    expect(packet.substrate?.slug).toBe('bopp-white')
    expect(packet.finishes).toEqual([{ partnerFinishId: 'pf_1', finishSlug: 'soft-touch', finishName: 'Soft Touch', category: 'SURFACE' }])
    expect(packet.components).toHaveLength(1)
    expect(packet.recipe).toBeNull()
    expect(packet.perFlavorRecipes).toEqual([])
    expect(packet.packaging).toBeNull()
  })
  it('never leaks the recipe or finish pricing in serialized form', () => {
    const json = JSON.stringify(packet)
    expect(json).not.toContain('Spirulina')
    expect(json).not.toContain('perUnitPriceCents')
    expect(json).not.toContain('123 Main St')
  })
})

describe('scopeManifestForRole — COPACKER', () => {
  const packet = scopeManifestForRole(fullManifest(), 'COPACKER', { isFinalShipper: true })
  it('gets packaging + components + flavor splits, but NO recipe/finishes', () => {
    expect(packet.packaging?.slug).toBe('pouch-standup')
    expect(packet.components).toHaveLength(1)
    expect(packet.flavors).toHaveLength(2)
    expect(packet.recipe).toBeNull()
    expect(packet.finishes).toEqual([])
  })
  it('as the final shipper, gets the full address', () => {
    expect(packet.shipTo.redacted).toBe(false)
    expect(packet.shipTo.addressLine1).toBe('123 Main St')
  })
})

describe('scopeManifestForRole — WAREHOUSE', () => {
  const packet = scopeManifestForRole(fullManifest(), 'WAREHOUSE')
  it('gets the full inbound address + flavor splits, no production content', () => {
    expect(packet.shipTo.redacted).toBe(false)
    expect(packet.shipTo.addressLine1).toBe('123 Main St')
    expect(packet.flavors).toHaveLength(2)
    expect(packet.recipe).toBeNull()
    expect(packet.substrate).toBeNull()
    expect(packet.packaging).toBeNull()
    expect(packet.finishes).toEqual([])
    expect(packet.components).toEqual([])
  })
})

describe('scopeManifestForDispatchType', () => {
  it('resolves the role from the dispatch type', () => {
    expect(scopeManifestForDispatchType(fullManifest(), 'LABEL').role).toBe('PRINTER')
    expect(scopeManifestForDispatchType(fullManifest(), 'PRODUCT').role).toBe('MANUFACTURER')
  })
})

describe('passport is identical across roles', () => {
  it('every role sees the same shared passport', () => {
    const m = fullManifest()
    const mfg = scopeManifestForRole(m, 'MANUFACTURER').passport
    const prn = scopeManifestForRole(m, 'PRINTER').passport
    const cop = scopeManifestForRole(m, 'COPACKER').passport
    expect(prn).toEqual(mfg)
    expect(cop).toEqual(mfg)
  })
})
