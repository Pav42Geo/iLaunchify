import { describe, it, expect } from 'vitest'
import { bindFlavorToDesign, flavorTokenOf } from './flavorBind'

// A minimal Fabric toObject()-shaped design: a shared base with a statement-of-
// identity text + a brand-accent-filled shape, one nested inside a group.
const BRAND_ACCENT = '#FF2E63'
function baseDesign() {
  return {
    version: '6',
    objects: [
      { customRole: 'statement-of-identity', text: 'Whey Protein Powder', fill: '#000' },
      { customType: 'shape', fill: BRAND_ACCENT },
      {
        type: 'group',
        objects: [{ customRole: 'statement-of-identity', text: 'Whey Protein Powder', fill: '#000' }],
      },
    ],
  }
}

const STRAWBERRY = { name: 'Strawberry', statementOfIdentity: 'Strawberry Whey Protein', swatchHex: '#E33' }

describe('bindFlavorToDesign — Bind (managed/locked flavor tokens)', () => {
  it('swaps SoI text to the flavor SoI and locks it as a managed token', () => {
    const out = bindFlavorToDesign(baseDesign(), STRAWBERRY, BRAND_ACCENT) as {
      objects: Array<{ text?: string; editable?: boolean; customData?: { flavorToken?: string } }>
    }
    const soi = out.objects[0]!
    expect(soi.text).toBe('Strawberry Whey Protein')
    // BIND: not free text — editable false + tagged so the live canvas can lock it.
    expect(soi.editable).toBe(false)
    expect(soi.customData?.flavorToken).toBe('soi')
  })

  it('recolors the brand accent to the swatch and tags it an accent token', () => {
    const out = bindFlavorToDesign(baseDesign(), STRAWBERRY, BRAND_ACCENT) as {
      objects: Array<{ fill?: string; customData?: { flavorToken?: string } }>
    }
    const accent = out.objects[1]!
    expect(accent.fill).toBe('#E33')
    expect(accent.customData?.flavorToken).toBe('accent')
  })

  it('recurses into groups and never mutates the base', () => {
    const base = baseDesign()
    const out = bindFlavorToDesign(base, STRAWBERRY, BRAND_ACCENT) as {
      objects: Array<{ objects?: Array<{ text?: string; editable?: boolean }> }>
    }
    expect(out.objects[2]!.objects![0]!.text).toBe('Strawberry Whey Protein')
    expect(out.objects[2]!.objects![0]!.editable).toBe(false)
    // base untouched (pure)
    expect(base.objects[0]!.text).toBe('Whey Protein Powder')
    expect((base.objects[0] as { editable?: boolean }).editable).toBeUndefined()
  })
})

describe('flavorTokenOf', () => {
  it('reads the stamped marker', () => {
    expect(flavorTokenOf({ customData: { flavorToken: 'soi' } })).toBe('soi')
    expect(flavorTokenOf({ customData: { flavorToken: 'accent' } })).toBe('accent')
  })
  it('infers soi from the statement-of-identity role when unmarked', () => {
    expect(flavorTokenOf({ customRole: 'statement-of-identity' })).toBe('soi')
  })
  it('returns null for ordinary objects', () => {
    expect(flavorTokenOf({ customRole: 'headline', customData: { foo: 'bar' } })).toBeNull()
    expect(flavorTokenOf({})).toBeNull()
  })
})
