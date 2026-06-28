// Verifies the live "Contains" allergen recompute on the demo Adaptogen Tonic:
//   • base recipe → Coconut (the flavor slot's base carries it)
//   • swap Flavor → Citrus → Coconut REMOVED
//   • tick Whey add-on → Milk ADDED
//   • both at once → Milk, no Coconut

import { describe, it, expect } from 'vitest'
import { composeContainsAllergens, type ContainsIngredient, type ContainsAddOn } from './contains-allergens'

const INGREDIENTS: ContainsIngredient[] = [
  { id: 'slot-0' }, // water
  { id: 'slot-1', replacements: [{ id: 'rep-stevia' }, { id: 'rep-monk' }] }, // sweetener (no allergens)
  { id: 'slot-2', replacements: [{ id: 'rep-turmeric' }, { id: 'rep-reishi' }] }, // adaptogen
  {
    id: 'slot-3',
    allergens: ['Coconut'],
    replacements: [
      { id: 'rep-citrus', allergens: [] },
      { id: 'rep-berry', allergens: [] },
    ],
  }, // flavor — base carries Coconut
  { id: 'slot-4' }, // citric acid
  { id: 'slot-5' }, // salt
]

const ADDONS: ContainsAddOn[] = [
  { id: 'opt-collagen' },
  { id: 'opt-whey', allergens: ['Milk'] },
  { id: 'opt-theanine' },
]

describe('composeContainsAllergens', () => {
  it('base recipe contains Coconut (flavor slot base)', () => {
    expect(composeContainsAllergens(INGREDIENTS, ADDONS, {})).toEqual(['Coconut'])
  })

  it('swapping Flavor → Citrus removes Coconut', () => {
    const out = composeContainsAllergens(INGREDIENTS, ADDONS, { replacements: { 'slot-3': 'rep-citrus' } })
    expect(out).toEqual([])
  })

  it('ticking the Whey add-on adds Milk', () => {
    const out = composeContainsAllergens(INGREDIENTS, ADDONS, { addOnIds: ['opt-whey'] })
    expect(out).toEqual(['Coconut', 'Milk'])
  })

  it('swap citrus + add whey → Milk only (Coconut removed)', () => {
    const out = composeContainsAllergens(INGREDIENTS, ADDONS, {
      replacements: { 'slot-3': 'rep-citrus' },
      addOnIds: ['opt-whey'],
    })
    expect(out).toEqual(['Milk'])
  })

  it('non-allergen swap leaves Coconut intact', () => {
    const out = composeContainsAllergens(INGREDIENTS, ADDONS, { replacements: { 'slot-1': 'rep-stevia' } })
    expect(out).toEqual(['Coconut'])
  })
})
