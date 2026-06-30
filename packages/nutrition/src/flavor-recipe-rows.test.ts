import { describe, it, expect } from 'vitest'
import { calculateLabel } from './engine'
import { publicSelection, previewSelection } from './index'
import {
  flavorRecipeRows,
  type FlavorRecipeSlotInput,
  type FlavorRecipeOptionalInput,
  type ResolvedIngredientData,
} from './flavor-recipe-rows'

// A flavor's independent recipe: 100 g cane sugar + 900 g water, the sugar slot
// swappable for stevia, plus an optional 1 g caffeine premix.
const DATA: Record<string, ResolvedIngredientData> = {
  sugar: { name: 'Cane sugar', per100g: { calories: 387, totalCarbohydrate: 100, totalSugars: 100 } },
  water: { name: 'Water', per100g: {} },
  stevia: { name: 'Stevia', per100g: { calories: 0, totalCarbohydrate: 0, totalSugars: 0 } },
  caffeine: { name: 'Caffeine', per100g: { calories: 0 } },
}
const resolveIngredientData = (id: string) => DATA[id]

const SLOTS: FlavorRecipeSlotInput[] = [
  {
    id: 'slot-sugar',
    baseIngredientId: 'sugar',
    weightG: 100,
    displayOrder: 0,
    allowReplacement: true,
    replacements: [{ id: 'rep-stevia', ingredientId: 'stevia', displayOrder: 0 }],
  },
  { id: 'slot-water', baseIngredientId: 'water', weightG: 900, displayOrder: 1 },
]
const OPTIONALS: FlavorRecipeOptionalInput[] = [
  { id: 'opt-caffeine', ingredientId: 'caffeine', weightG: 1, displayOrder: 0 },
]
const geo = { basis: 'package' as const, servingsPerPackage: 1, packageSizeG: 1000, numPackages: 1 }

describe('flavorRecipeRows', () => {
  it('emits base parents + replaceable children (parentId) + optional rows', () => {
    const rows = flavorRecipeRows(SLOTS, OPTIONALS, { resolveIngredientData })
    expect(rows.map((r) => r.id)).toEqual(['slot-sugar', 'rep-stevia', 'slot-water', 'opt-caffeine'])
    // base parents
    expect(rows.find((r) => r.id === 'slot-sugar')).toMatchObject({
      name: 'Cane sugar', quantity: 100, unit: 'g', category: 'base', parentId: undefined, selected: true,
    })
    expect(rows.find((r) => r.id === 'slot-water')).toMatchObject({ name: 'Water', quantity: 900, category: 'base' })
    // replaceable child inherits parent weight, points to parent, not selected by default
    expect(rows.find((r) => r.id === 'rep-stevia')).toMatchObject({
      name: 'Stevia', quantity: 100, unit: 'g', category: 'base', parentId: 'slot-sugar', selected: false,
    })
    // optional, not ticked by default
    expect(rows.find((r) => r.id === 'opt-caffeine')).toMatchObject({
      name: 'Caffeine', quantity: 1, category: 'optional', selected: false,
    })
  })

  it('publicSelection = base parents only (consumer label)', () => {
    const rows = flavorRecipeRows(SLOTS, OPTIONALS, { resolveIngredientData })
    expect(publicSelection(rows).map((i) => i.id)).toEqual(['slot-sugar', 'slot-water'])
  })

  it('default flavor recipe Facts: 390 kcal (label-rounded from 387), 100 g sugar', () => {
    const rows = flavorRecipeRows(SLOTS, OPTIONALS, { resolveIngredientData })
    const label = calculateLabel(publicSelection(rows), geo)
    // 387 kcal/100g × 100 g = 387 kcal → FDA label-rounds to nearest 5 = 390;
    // 100 g sugar across the 1000 g package.
    expect(label.perServing.calories).toBe(390)
    expect(label.perServing.totalSugars.amount).toBe(100)
  })

  it('chosenReplacementId swaps stevia in for the preview: sugars + calories drop to 0', () => {
    const swapped = SLOTS.map((s) =>
      s.id === 'slot-sugar' ? { ...s, chosenReplacementId: 'rep-stevia' } : s,
    )
    const rows = flavorRecipeRows(swapped, OPTIONALS, { resolveIngredientData })
    // parent now deselected, child selected
    expect(rows.find((r) => r.id === 'slot-sugar')?.selected).toBe(false)
    expect(rows.find((r) => r.id === 'rep-stevia')?.selected).toBe(true)
    const label = calculateLabel(previewSelection(rows), geo)
    expect(label.perServing.totalSugars.amount).toBe(0)
    expect(label.perServing.calories).toBe(0)
  })

  it('a selected optional is added in the preview but not the public label', () => {
    const optOn = OPTIONALS.map((o) => ({ ...o, selected: true }))
    const rows = flavorRecipeRows(SLOTS, optOn, { resolveIngredientData })
    expect(publicSelection(rows).map((i) => i.id)).toEqual(['slot-sugar', 'slot-water'])
    expect(previewSelection(rows).map((i) => i.id)).toEqual(['slot-sugar', 'slot-water', 'opt-caffeine'])
  })

  it('respects displayOrder and a replacement weight override', () => {
    const slots: FlavorRecipeSlotInput[] = [
      { id: 'a', baseIngredientId: 'water', weightG: 10, displayOrder: 2 },
      {
        id: 'b', baseIngredientId: 'sugar', weightG: 30, displayOrder: 1,
        chosenReplacementId: 'b-rep',
        replacements: [{ id: 'b-rep', ingredientId: 'stevia', weightGOverride: 1, displayOrder: 0 }],
      },
    ]
    const rows = flavorRecipeRows(slots, [], { resolveIngredientData })
    // slot b (order 1) emitted before slot a (order 2); child follows its parent
    expect(rows.map((r) => r.id)).toEqual(['b', 'b-rep', 'a'])
    // override weight 1 g, not the slot's 30 g
    expect(rows.find((r) => r.id === 'b-rep')?.quantity).toBe(1)
  })

  it('unknown ingredient id → empty-nutrient row (no throw)', () => {
    const rows = flavorRecipeRows(
      [{ id: 's', baseIngredientId: 'missing', weightG: 5 }],
      [],
      { resolveIngredientData },
    )
    expect(rows[0]).toMatchObject({ id: 's', name: '', per100g: {}, quantity: 5, category: 'base' })
  })
})
