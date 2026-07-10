import { describe, it, expect } from 'vitest'
import { normalizeRecipeRows, parseAmountToGrams, slugifyTitle } from './recipe-materialize'

describe('recipe-materialize — parseAmountToGrams', () => {
  it('parses plain gram amounts', () => {
    expect(parseAmountToGrams('9g')).toBe(9)
    expect(parseAmountToGrams('9 g')).toBe(9)
    expect(parseAmountToGrams('0.25g')).toBe(0.25)
    expect(parseAmountToGrams('1,5g')).toBe(1.5)
  })

  it('converts kg and mg to grams', () => {
    expect(parseAmountToGrams('0.5kg')).toBe(500)
    expect(parseAmountToGrams('250mg')).toBe(0.25)
  })

  it('accepts per-serving notation as the gram figure', () => {
    expect(parseAmountToGrams('9g/serv')).toBe(9)
    expect(parseAmountToGrams('9 g / serving')).toBe(9)
  })

  it('refuses what it cannot honestly convert', () => {
    expect(parseAmountToGrams('88%')).toBeNull() // % needs total weight
    expect(parseAmountToGrams('trace')).toBeNull()
    expect(parseAmountToGrams('2 scoops')).toBeNull()
    expect(parseAmountToGrams('')).toBeNull()
    expect(parseAmountToGrams('-5g')).toBeNull()
  })
})

describe('recipe-materialize — normalizeRecipeRows', () => {
  it('extracts trimmed rows and drops nameless ones', () => {
    expect(
      normalizeRecipeRows({
        rows: [
          { name: '  Spring water ', amount: '88%', note: 'Base' },
          { name: '', amount: '9g', note: 'ghost' },
          { name: 'Monk fruit', amount: '0.25%' },
        ],
      }),
    ).toEqual([
      { name: 'Spring water', amount: '88%', note: 'Base' },
      { name: 'Monk fruit', amount: '0.25%', note: '' },
    ])
  })

  it('dedupes by case-insensitive name — last occurrence wins', () => {
    const rows = normalizeRecipeRows({
      rows: [
        { name: 'Whey isolate', amount: '8g', note: '' },
        { name: 'whey isolate', amount: '9g', note: 'revised' },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amount).toBe('9g')
  })

  it('tolerates junk payloads', () => {
    expect(normalizeRecipeRows(null)).toEqual([])
    expect(normalizeRecipeRows({})).toEqual([])
    expect(normalizeRecipeRows({ rows: 'nope' })).toEqual([])
    expect(normalizeRecipeRows({ fields: [{ label: 'x' }] })).toEqual([])
  })
})

describe('recipe-materialize — slugifyTitle', () => {
  it('slugifies titles and caps length', () => {
    expect(slugifyTitle('Passion-fruit Protein Water!')).toBe('passion-fruit-protein-water')
    expect(slugifyTitle('  Ünïcode  &  symbols  ')).toBe('ncode-symbols')
    expect(slugifyTitle('x'.repeat(100))).toHaveLength(60)
  })

  it('falls back on empty input', () => {
    expect(slugifyTitle('!!!')).toBe('co-created-product')
  })
})
