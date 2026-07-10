import { describe, it, expect } from 'vitest'
import {
  FALCPA_ALLERGEN_ORDER,
  buildIngredientStatement,
  formatFalcpaContains,
} from './mandatory-statements'

describe('mandatory-statements — ingredient statement (21 CFR 101.4)', () => {
  it('orders by descending weight using declaration names', () => {
    expect(
      buildIngredientStatement([
        { declarationName: 'Whey Protein Isolate', grams: 9 },
        { declarationName: 'Water', grams: 312 },
        { declarationName: 'Passion Fruit Juice Concentrate', grams: 17 },
        { declarationName: 'Monk Fruit Extract', grams: 0.9 },
      ]),
    ).toBe('Water, Passion Fruit Juice Concentrate, Whey Protein Isolate, Monk Fruit Extract')
  })

  it('keeps input order on exact ties (stable sort)', () => {
    expect(
      buildIngredientStatement([
        { declarationName: 'A', grams: 5 },
        { declarationName: 'B', grams: 5 },
      ]),
    ).toBe('A, B')
  })

  it('returns null for empty input', () => {
    expect(buildIngredientStatement([])).toBeNull()
  })
})

describe('mandatory-statements — FALCPA Contains', () => {
  it('maps flags to display names in canonical order regardless of input order', () => {
    expect(formatFalcpaContains([['sesame'], ['milk'], ['wheat']])).toBe('Milk, Wheat, Sesame')
  })

  it('dedupes across ingredients and normalizes case + soy aliases', () => {
    expect(formatFalcpaContains([['MILK', 'soybeans'], ['milk', 'soy']])).toBe('Milk, Soy')
  })

  it('returns null with no flagged allergens (never an empty Contains line)', () => {
    expect(formatFalcpaContains([[], null, undefined, ['unknown_flag']])).toBeNull()
  })

  it('covers the full Big-9 order', () => {
    const all = formatFalcpaContains([
      ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'milk', 'wheat', 'soybeans', 'sesame'],
    ])
    expect(all).toBe(FALCPA_ALLERGEN_ORDER.join(', '))
  })
})
