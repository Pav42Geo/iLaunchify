import { describe, it, expect } from 'vitest'
import {
  PBR_MATERIAL_KINDS,
  PBR_PRESETS,
  getPbrPreset,
  isPbrMaterialKind,
  resolvePbrMaterialKind,
  resolvePbrPreset,
} from './pbr-presets'

describe('preset coverage + ranges', () => {
  it('has a preset for every kind, self-consistent', () => {
    for (const kind of PBR_MATERIAL_KINDS) {
      const p = getPbrPreset(kind)
      expect(p.kind).toBe(kind)
      expect(p.label.length).toBeGreaterThan(0)
    }
  })

  it('keeps normalized params within [0,1]', () => {
    for (const kind of PBR_MATERIAL_KINDS) {
      const p = PBR_PRESETS[kind]
      for (const v of [p.roughness, p.metalness, p.clearcoat, p.clearcoatRoughness, p.transmission, p.sheen, p.sheenRoughness]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(p.ior).toBeGreaterThan(1)
      expect(p.envMapIntensity).toBeGreaterThanOrEqual(0)
    }
  })

  it('encodes the physics that make each finish read right', () => {
    expect(PBR_PRESETS.GLOSS_LAMINATE.clearcoat).toBeGreaterThan(PBR_PRESETS.MATTE_LAMINATE.clearcoat)
    expect(PBR_PRESETS.GLOSS_LAMINATE.roughness).toBeLessThan(PBR_PRESETS.MATTE_LAMINATE.roughness)
    expect(PBR_PRESETS.METAL.metalness).toBeGreaterThan(0.5)
    expect(PBR_PRESETS.GLASS.transmission).toBeGreaterThan(0.5)
    expect(PBR_PRESETS.SHRINK_FILM.transmission).toBeGreaterThan(0)
    expect(PBR_PRESETS.SOFT_TOUCH.sheen).toBeGreaterThan(0)
    expect(PBR_PRESETS.KRAFT.suggestedBaseColorHex).toBeDefined()
  })
})

describe('isPbrMaterialKind', () => {
  it('accepts known kinds, rejects others', () => {
    expect(isPbrMaterialKind('GLASS')).toBe(true)
    expect(isPbrMaterialKind('WOOD')).toBe(false)
    expect(isPbrMaterialKind(7)).toBe(false)
  })
})

describe('resolvePbrMaterialKind', () => {
  it('prefers explicit finish keywords over substrate category', () => {
    // soft-touch beats matte beats gloss; keyword beats category
    expect(resolvePbrMaterialKind({ slug: 'soft-touch-matte-lam' })).toBe('SOFT_TOUCH')
    expect(resolvePbrMaterialKind({ name: 'Matte Laminate Label' })).toBe('MATTE_LAMINATE')
    expect(resolvePbrMaterialKind({ slug: 'gloss-bopp', substrateCategory: 'PAPER_UNCOATED' })).toBe('GLOSS_LAMINATE')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(resolvePbrMaterialKind({ name: '  KRAFT  ' })).toBe('KRAFT')
    expect(resolvePbrMaterialKind({ slug: 'Clear-Glass-Jar' })).toBe('GLASS')
  })

  it('falls back to substrate category when no keyword matches', () => {
    expect(resolvePbrMaterialKind({ substrateCategory: 'FILM_METALLIC' })).toBe('METAL')
    expect(resolvePbrMaterialKind({ substrateCategory: 'film_clear' })).toBe('SHRINK_FILM')
    expect(resolvePbrMaterialKind({ substrateCategory: 'KRAFT_RECYCLED' })).toBe('KRAFT')
  })

  it('defaults to UNCOATED_PAPER when nothing matches', () => {
    expect(resolvePbrMaterialKind({})).toBe('UNCOATED_PAPER')
    expect(resolvePbrMaterialKind({ slug: 'mystery', substrateCategory: 'NONSENSE' })).toBe('UNCOATED_PAPER')
    expect(resolvePbrMaterialKind({ slug: null, name: null, substrateCategory: null })).toBe('UNCOATED_PAPER')
  })

  it('resolvePbrPreset returns the matching preset', () => {
    expect(resolvePbrPreset({ slug: 'metallic-foil' }).kind).toBe('METAL')
  })
})
