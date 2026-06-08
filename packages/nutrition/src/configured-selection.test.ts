import { describe, it, expect } from 'vitest'
import { calculateLabel, type IngredientInput } from './engine'
import { resolveConfiguredSelection, type RecipeRow, type OptionOverlay } from './index'

// Base recipe: a sweetened, caffeinated drink base. 100 g sugar + 900 g water.
const SUGAR: RecipeRow = {
  id: 'sugar', name: 'Cane sugar', category: 'base', quantity: 100, unit: 'g',
  per100g: { calories: 387, totalCarbohydrate: 100, totalSugars: 100 },
}
const WATER: RecipeRow = {
  id: 'water', name: 'Water', category: 'base', quantity: 900, unit: 'g', per100g: {},
}
const STEVIA: IngredientInput = {
  id: 'stevia', name: 'Stevia', quantity: 100, unit: 'g',
  per100g: { calories: 0, totalCarbohydrate: 0, totalSugars: 0 },
}
const CAFFEINE: IngredientInput = {
  id: 'caffeine', name: 'Caffeine', quantity: 1, unit: 'g', per100g: { calories: 0 },
}
const rows: RecipeRow[] = [SUGAR, WATER]
const geo = { basis: 'package' as const, servingsPerPackage: 1, packageSizeG: 1000, numPackages: 1 }

describe('resolveConfiguredSelection', () => {
  it('SWAP fills the bound slot (keeps slot id, swaps contents)', () => {
    const swap: OptionOverlay[] = [{ op: 'SWAP', slotId: 'sugar', ingredient: STEVIA }]
    const list = resolveConfiguredSelection(rows, [], swap)
    expect(list.map((i) => i.id).sort()).toEqual(['sugar', 'water'])
    expect(list.find((i) => i.id === 'sugar')?.name).toBe('Stevia')
  })

  it('SWAP to stevia recomputes the Facts panel (sugars + calories drop)', () => {
    const base = calculateLabel(resolveConfiguredSelection(rows), geo)
    const stevia = calculateLabel(
      resolveConfiguredSelection(rows, [], [{ op: 'SWAP', slotId: 'sugar', ingredient: STEVIA }]),
      geo,
    )
    expect(base.perServing.totalSugars.amount).toBeGreaterThan(0)
    expect(stevia.perServing.totalSugars.amount).toBe(0)
    expect(stevia.perServing.calories).toBeLessThan(base.perServing.calories)
  })

  it('ADD appends an ingredient; REMOVE drops a slot', () => {
    expect(resolveConfiguredSelection(rows, [], [{ op: 'ADD', ingredient: CAFFEINE }]).map((i) => i.id).sort())
      .toEqual(['caffeine', 'sugar', 'water'])
    expect(resolveConfiguredSelection(rows, [], [{ op: 'REMOVE', slotId: 'sugar' }]).map((i) => i.id))
      .toEqual(['water'])
  })

  it('option overlay wins over flavor overlay on the same slot', () => {
    const flavor: OptionOverlay[] = [{ op: 'SWAP', slotId: 'sugar', ingredient: { ...STEVIA, name: 'Honey' } }]
    const option: OptionOverlay[] = [{ op: 'SWAP', slotId: 'sugar', ingredient: { ...STEVIA, name: 'Stevia' } }]
    const list = resolveConfiguredSelection(rows, flavor, option)
    expect(list.find((i) => i.id === 'sugar')?.name).toBe('Stevia') // option applied last
  })
})
