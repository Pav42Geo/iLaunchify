import { describe, it, expect } from 'vitest'
import { calculateLabel, resolveGeometry, sumBatch, type IngredientInput } from './engine'
import { toPanelData, perContainerPanel, assessSimplified } from './panel-adapter'
import {
  roundCalories, roundFat, roundGramMacro, roundCholSodium, roundMicro,
  roundServingsPerContainer, formatServingsPerContainer, formatNetWeight,
} from './rounding'

// A clean reference ingredient: 100 g carries exactly these per-100g values.
const REF: IngredientInput = {
  id: 'ref', name: 'Reference', quantity: 100, unit: 'g',
  per100g: {
    calories: 100, protein: 10, totalFat: 5, saturatedFat: 2, sodium: 200,
    totalCarbohydrate: 20, dietaryFiber: 4, totalSugars: 5, calcium: 100,
  },
}

describe('per-serving basis (by serving size)', () => {
  const r = calculateLabel([REF], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })
  it('splits the recipe into total servings = yield / serving', () => {
    expect(r.geometry.rawMassG).toBe(100)
    expect(r.geometry.yieldG).toBe(100)
    expect(r.geometry.totalServings).toBe(2) // 100 / 50
    expect(r.geometry.servingsPerContainer).toBe(2)
  })
  it('per serving = batch ÷ total servings, FDA-rounded', () => {
    expect(r.perServing.calories).toBe(50)        // 100 / 2
    expect(r.perServing.totalFat.amount).toBe(2.5) // 5 / 2
    expect(r.perServing.protein.amount).toBe(5)
    expect(r.perServing.sodium.amount).toBe(100)
    expect(r.perServing.totalCarbohydrate.amount).toBe(10)
    expect(r.perServing.dietaryFiber.amount).toBe(2)
  })
  it('%DV is computed from exact values', () => {
    expect(r.perServing.totalFat.dv).toBe(3)   // 2.5/78 = 3.2 → 3
    expect(r.perServing.sodium.dv).toBe(4)     // 100/2300 = 4.3 → 4
    expect(r.perServing.dietaryFiber.dv).toBe(7) // 2/28 = 7.1 → 7
    expect(r.perServing.calcium.dv).toBe(4)    // 50/1300 = 3.8 → 4
  })
})

describe('by package size resolves identically', () => {
  it('derives serving size from package and gives the same total servings', () => {
    const r = calculateLabel([REF], { basis: 'package', packageSizeG: 100, numPackages: 1, servingsPerPackage: 2 })
    expect(r.geometry.servingSizeG).toBe(50)   // 100 / 2
    expect(r.geometry.totalServings).toBe(2)   // 2 × 1
    expect(r.geometry.netWeightG).toBe(100)
    expect(r.perServing.calories).toBe(50)
  })
})

describe('moisture loss concentrates nutrients (water only)', () => {
  const base = { basis: 'serving' as const, servingSizeG: 50, servingsPerPackage: 1 }
  it('0% moisture → 50 cal/serving; 50% moisture → 100 cal/serving', () => {
    const dry = calculateLabel([REF], { ...base, moistureLossPct: 0 })
    expect(dry.geometry.totalServings).toBe(2) // yield 100 / 50
    expect(dry.perServing.calories).toBe(50)

    const baked = calculateLabel([REF], { ...base, moistureLossPct: 50 })
    expect(baked.geometry.yieldG).toBe(50)
    expect(baked.geometry.totalServings).toBe(1) // yield 50 / 50
    expect(baked.perServing.calories).toBe(100)  // same nutrients, fewer servings
  })
})

describe('FDA rounding rules', () => {
  it('calories', () => {
    expect(roundCalories(4)).toBe(0)
    expect(roundCalories(7)).toBe(5)
    expect(roundCalories(52)).toBe(50)
    expect(roundCalories(237)).toBe(240)
  })
  it('fat', () => {
    expect(roundFat(0.4)).toBe(0)
    expect(roundFat(2.7)).toBe(2.5)
    expect(roundFat(6.2)).toBe(6)
  })
  it('cholesterol / sodium', () => {
    expect(roundCholSodium(4)).toBe(0)
    expect(roundCholSodium(143)).toBe(140)
    expect(roundCholSodium(100)).toBe(100)
  })
  it('macros + micros', () => {
    expect(roundGramMacro(0.4)).toBe(0)
    expect(roundGramMacro(4.3)).toBe(4.5)
    expect(roundMicro(1.74)).toBeCloseTo(1.7)
  })
})

describe('servings-per-container rounding + display', () => {
  it('rounds per FDA bands', () => {
    expect(roundServingsPerContainer(1.1)).toBe(1)
    expect(roundServingsPerContainer(3.4)).toBe(3.5)
    expect(roundServingsPerContainer(7.2)).toBe(7)
  })
  it('prefixes "about" for non-round', () => {
    expect(formatServingsPerContainer(2)).toBe('2')
    expect(formatServingsPerContainer(2.2)).toBe('about 2')
  })
})

describe('net weight (front-of-pack, not in panel)', () => {
  it('formats dual', () => {
    expect(formatNetWeight(200)).toBe('7.1 oz (200 g)')
  })
})

describe('Atwater fallback when calories absent', () => {
  it('computes 4/4/9 (+2 fiber)', () => {
    const ing: IngredientInput = {
      id: 'a', name: 'a', quantity: 100, unit: 'g',
      per100g: { protein: 10, totalCarbohydrate: 20, dietaryFiber: 5, totalFat: 5 },
    }
    const { batch } = sumBatch([ing])
    // 4*10 + 4*(20-5) + 2*5 + 9*5 = 40 + 60 + 10 + 45 = 155
    expect(batch.calories).toBe(155)
  })
})

describe('density-aware volume conversion', () => {
  it('uses density for ml', () => {
    const oil: IngredientInput = {
      id: 'oil', name: 'oil', quantity: 100, unit: 'ml', densityGPerMl: 0.92,
      per100g: { calories: 884, totalFat: 100 },
    }
    const g = resolveGeometry(sumBatch([oil]).rawMassG, { basis: 'serving', servingSizeG: 92, servingsPerPackage: 1 })
    expect(g.rawMassG).toBeCloseTo(92) // 100 ml × 0.92
    expect(g.totalServings).toBeCloseTo(1)
  })
})

describe('panel adapter → NutritionFactsRenderer PanelData', () => {
  const r = calculateLabel([REF], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })
  const panel = toPanelData(r, { suggestedServing: '1 piece' })
  it('produces a calories row + serving strings', () => {
    expect(panel.format).toBe('STANDARD')
    expect(panel.servingSize).toBe('1 piece (50g)')
    expect(panel.servingsPerContainer).toBe('2')
    expect(panel.rows[0]).toMatchObject({ id: 'calories', amount: 50 })
    expect(panel.rows.find((x) => x.id === 'sodium')).toMatchObject({ amount: 100, percentDailyValue: 4, unit: 'mg' })
  })
})

describe('perContainerPanel scales per-serving → whole container', () => {
  // REF batch: calories 100, fat 5g, sodium 200mg, carb 20g, fiber 4g.
  // basis serving, servingSizeG 50, servingsPerPackage 2:
  //   yield 100g, netWeight 50×2=100g, packagesMade = 100/100 = 1.
  // So one container = the whole batch = 2 servings.
  const r = calculateLabel([REF], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })
  const serving = toPanelData(r)
  const container = perContainerPanel(r)

  const amt = (panel: typeof serving, id: string): number => {
    const row = panel.rows.find((x) => x.id === id)
    if (!row) throw new Error(`missing row ${id}`)
    return typeof row.amount === 'number' ? row.amount : Number(row.amount)
  }

  it('same row ids/labels/order as toPanelData', () => {
    expect(container.rows.map((x) => x.id)).toEqual(serving.rows.map((x) => x.id))
    expect(container.format).toBe('STANDARD')
  })

  it('per-container Calories ≈ 2× per-serving (within rounding)', () => {
    // per serving 50 cal → per container 100 cal.
    expect(amt(serving, 'calories')).toBe(50)
    expect(amt(container, 'calories')).toBe(100)
  })

  it('macros scale ~2× with the container', () => {
    // fat 5g batch ÷ 2 servings = 2.5/serving; whole container = 5g.
    expect(amt(serving, 'totalFat')).toBe(2.5)
    expect(amt(container, 'totalFat')).toBe(5)
    // sodium 200mg batch ÷ 2 = 100/serving; container = 200mg.
    expect(amt(serving, 'sodium')).toBe(100)
    expect(amt(container, 'sodium')).toBe(200)
    // carb 20g ÷ 2 = 10/serving; container = 20g.
    expect(amt(serving, 'totalCarbohydrate')).toBe(10)
    expect(amt(container, 'totalCarbohydrate')).toBe(20)
  })

  it('%DV recomputed against container amounts', () => {
    const sodiumRow = container.rows.find((x) => x.id === 'sodium')
    // 200 / 2300 = 8.7 → 9%
    expect(sodiumRow?.percentDailyValue).toBe(9)
  })

  it('multi-package container = packageSize, not whole batch', () => {
    // basis package, 100g/pkg, 4 packages, 2 servings/pkg.
    // batch is one REF (100g) → packagesMade = numPackages = 4.
    // per-container = batch / 4 = 25 cal. (one PACKAGE, not the whole run.)
    const r2 = calculateLabel([REF], { basis: 'package', packageSizeG: 100, numPackages: 4, servingsPerPackage: 2 })
    const c2 = perContainerPanel(r2)
    expect(amt(c2, 'calories')).toBe(25) // 100 batch / 4 packages
  })
})

describe('simplified format (21 CFR 101.9(f))', () => {
  // A nutritionally-empty ingredient: every per-serving value rounds to 0, so all
  // 15 core nutrients are insignificant → simplified format is eligible.
  const EMPTY: IngredientInput = {
    id: 'empty', name: 'Empty', quantity: 100, unit: 'g', per100g: {},
  }
  const empty = calculateLabel([EMPTY], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })

  it('assessSimplified: all-zero food is eligible, full statement, every omittable id', () => {
    const a = assessSimplified(empty)
    expect(a.eligible).toBe(true)
    expect(a.insignificantIds).toEqual([
      'saturatedFat', 'transFat', 'cholesterol', 'dietaryFiber', 'totalSugars',
      'addedSugars', 'vitaminD', 'calcium', 'iron', 'potassium',
    ])
    expect(a.statement).toBe(
      'Not a significant source of saturated fat, trans fat, cholesterol, dietary fiber, ' +
      'total sugars, added sugars, vitamin D, calcium, iron and potassium.',
    )
  })

  it('REF (significant fat/sodium/carb/calcium) is NOT eligible', () => {
    // REF per serving: 50 cal, 2.5g fat, 100mg sodium, 10g carb, 2g fiber,
    // 5g protein, calcium ~4%DV — many significant nutrients, far fewer than 8
    // round to zero.
    const r = calculateLabel([REF], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })
    expect(assessSimplified(r).eligible).toBe(false)
  })

  it('toPanelData simplified=true on eligible food drops insignificant rows + sets nsSource', () => {
    const panel = toPanelData(empty, { simplified: true })
    const ids = panel.rows.map((x) => x.id)
    // The always-declared five are retained (even at zero).
    expect(ids).toContain('calories')
    expect(ids).toContain('totalFat')
    expect(ids).toContain('sodium')
    expect(ids).toContain('totalCarbohydrate')
    expect(ids).toContain('protein')
    // The insignificant omittable rows are dropped.
    expect(ids).not.toContain('saturatedFat')
    expect(ids).not.toContain('cholesterol')
    expect(ids).not.toContain('dietaryFiber')
    expect(ids).not.toContain('addedSugars')
    expect(ids).not.toContain('calcium')
    expect(ids).not.toContain('iron')
    expect(ids).not.toContain('potassium')
    expect(panel.nsSource).toBe(
      'Not a significant source of saturated fat, trans fat, cholesterol, dietary fiber, ' +
      'total sugars, added sugars, vitamin D, calcium, iron and potassium.',
    )
  })

  it('simplified=false (default) keeps the full row set + no nsSource', () => {
    const panel = toPanelData(empty)
    const ids = panel.rows.map((x) => x.id)
    expect(ids).toContain('saturatedFat')
    expect(ids).toContain('calcium')
    expect(panel.nsSource).toBeUndefined()
  })

  it('simplified=true on an INELIGIBLE food is a no-op (full rows, no nsSource)', () => {
    const r = calculateLabel([REF], { basis: 'serving', servingSizeG: 50, servingsPerPackage: 2 })
    const panel = toPanelData(r, { simplified: true })
    expect(panel.rows.map((x) => x.id)).toContain('saturatedFat')
    expect(panel.nsSource).toBeUndefined()
  })
})
