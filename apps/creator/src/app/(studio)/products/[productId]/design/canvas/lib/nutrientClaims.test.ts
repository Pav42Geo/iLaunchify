import { describe, it, expect } from 'vitest'
import { suggestNutrientClaims } from './nutrientClaims'
import type { NutritionPanelData, NutritionRow } from '@ilaunchify/ui'

// Type-only import above erases at runtime, so these tests run without loading
// the @ilaunchify/ui package — the claim engine is pure.

function data(over: Partial<NutritionPanelData> = {}): NutritionPanelData {
  return {
    servingsPerContainer: 10,
    servingSize: '1 scoop',
    calories: 100,
    rows: [],
    footnote: '',
    ...over,
  }
}
const row = (label: string, value: string, dvPercent?: number | null): NutritionRow => ({
  label,
  value,
  dvPercent,
})
const claims = (d: NutritionPanelData) => suggestNutrientClaims(d).map((c) => c.claim)

describe('suggestNutrientClaims — calories (21 CFR 101.60(b))', () => {
  it('Calorie free under 5 cal', () => {
    expect(claims(data({ calories: 3 }))).toContain('Calorie free')
  })
  it('Low calorie at the 40 cal limit, not Calorie free', () => {
    const c = claims(data({ calories: 40 }))
    expect(c).toContain('Low calorie')
    expect(c).not.toContain('Calorie free')
  })
  it('no calorie claim above 40', () => {
    const c = claims(data({ calories: 120 }))
    expect(c).not.toContain('Low calorie')
    expect(c).not.toContain('Calorie free')
  })
})

describe('suggestNutrientClaims — sodium tiers (21 CFR 101.61(b))', () => {
  it('Low sodium at/under 140mg', () => {
    expect(claims(data({ rows: [row('Sodium', '120mg', 5)] }))).toContain('Low sodium')
  })
  it('Very low sodium at/under 35mg', () => {
    expect(claims(data({ rows: [row('Sodium', '30mg', 1)] }))).toContain('Very low sodium')
  })
  it('Sodium free under 5mg', () => {
    expect(claims(data({ rows: [row('Sodium', '2mg', 0)] }))).toContain('Sodium free')
  })
  it('no sodium claim above 140mg', () => {
    expect(claims(data({ rows: [row('Sodium', '400mg', 17)] }))).not.toContain('Low sodium')
  })
})

describe('suggestNutrientClaims — fat + protein + sugar', () => {
  it('Low fat at/under 3g; Fat free under 0.5g', () => {
    expect(claims(data({ rows: [row('Total Fat', '2g', 3)] }))).toContain('Low fat')
    expect(claims(data({ rows: [row('Total Fat', '0g', 0)] }))).toContain('Fat free')
  })
  it('no fat claim above 3g', () => {
    expect(claims(data({ rows: [row('Total Fat', '10g', 13)] }))).not.toContain('Low fat')
  })
  it('Excellent source of protein at >= 20% DV', () => {
    expect(claims(data({ rows: [row('Protein', '25g', 50)] }))).toContain(
      'Excellent source of protein',
    )
  })
  it('Good source of protein in the 10-19% DV band', () => {
    expect(claims(data({ rows: [row('Protein', '6g', 12)] }))).toContain('Good source of protein')
  })
  it('No added sugars when addedSugarG is 0', () => {
    expect(claims(data({ addedSugarG: 0 }))).toContain('No added sugars')
  })
})

describe('suggestNutrientClaims — every result carries a CFR citation', () => {
  it('attaches a 21 CFR citation to each claim', () => {
    const out = suggestNutrientClaims(data({ calories: 3, addedSugarG: 0 }))
    expect(out.length).toBeGreaterThan(0)
    for (const c of out) expect(c.cfr).toMatch(/^21 CFR/)
  })
})
