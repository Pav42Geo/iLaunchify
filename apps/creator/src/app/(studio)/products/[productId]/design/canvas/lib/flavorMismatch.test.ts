import { describe, it, expect } from 'vitest'
import { detectFlavorMismatch, type FlavorRef } from './flavorMismatch'

const POOL: FlavorRef[] = [
  { name: 'Strawberry' },
  { name: 'Chocolate', statementOfIdentity: 'Rich Cocoa Blend' },
  { name: 'Vanilla' },
]

describe('detectFlavorMismatch', () => {
  it('passes clean art that only mentions the active flavor', () => {
    const w = detectFlavorMismatch('Strawberry', ['Strawberry', 'Net wt 12 oz', 'Made with real fruit'], POOL)
    expect(w).toEqual([])
  })

  it('flags a wrong flavor name on the active surface', () => {
    const w = detectFlavorMismatch('Strawberry', ['Chocolate flavored drink'], POOL)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ matchedFlavor: 'Chocolate', kind: 'name' })
  })

  it('flags a wrong statement-of-identity', () => {
    const w = detectFlavorMismatch('Strawberry', ['Rich Cocoa Blend'], POOL)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ matchedFlavor: 'Chocolate', kind: 'soi' })
  })

  it('matches whole words only (chocolatey is not Chocolate)', () => {
    const w = detectFlavorMismatch('Strawberry', ['chocolatey goodness'], POOL)
    expect(w).toEqual([])
  })

  it('is case-insensitive', () => {
    const w = detectFlavorMismatch('Strawberry', ['VANILLA SWIRL'], POOL)
    expect(w).toHaveLength(1)
    expect(w[0]?.matchedFlavor).toBe('Vanilla')
  })

  it('does not flag a sibling whose name is contained in the active flavor name', () => {
    const pool: FlavorRef[] = [{ name: 'Mint Chip' }, { name: 'Mint' }, { name: 'Chocolate' }]
    const w = detectFlavorMismatch('Mint Chip', ['Mint Chip', 'Cool & creamy'], pool)
    expect(w).toEqual([])
  })

  it('dedupes repeated (text, flavor) matches', () => {
    const w = detectFlavorMismatch('Strawberry', ['Chocolate', 'Chocolate'], POOL)
    expect(w).toHaveLength(1)
  })

  it('reports multiple distinct wrong flavors', () => {
    const w = detectFlavorMismatch('Strawberry', ['Chocolate', 'Vanilla'], POOL)
    expect(w.map((x) => x.matchedFlavor).sort()).toEqual(['Chocolate', 'Vanilla'])
  })

  it('ignores empty/whitespace text and short flavor tokens', () => {
    const pool: FlavorRef[] = [{ name: 'Strawberry' }, { name: 'X' }]
    const w = detectFlavorMismatch('Strawberry', ['', '   ', 'X marks the spot'], pool)
    expect(w).toEqual([])
  })
})
