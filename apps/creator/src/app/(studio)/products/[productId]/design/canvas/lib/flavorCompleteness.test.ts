import { describe, it, expect } from 'vitest'
import { checkFlavorCompleteness } from './flavorCompleteness'

const FLAVORS = [
  { id: 'a', name: 'Strawberry' },
  { id: 'b', name: 'Chocolate' },
]

describe('checkFlavorCompleteness', () => {
  it('is complete when every selected flavor has a label and no aggregate needed', () => {
    const r = checkFlavorCompleteness({ flavors: FLAVORS, savedFlavorIds: ['a', 'b'], needsAggregate: false, aggregateSaved: false })
    expect(r).toEqual({ complete: true, missingFlavors: [], missingAggregate: false })
  })

  it('lists flavors still missing a label', () => {
    const r = checkFlavorCompleteness({ flavors: FLAVORS, savedFlavorIds: ['a'], needsAggregate: false, aggregateSaved: false })
    expect(r.complete).toBe(false)
    expect(r.missingFlavors).toEqual(['Chocolate'])
  })

  it('requires the aggregate label when needed', () => {
    const r = checkFlavorCompleteness({ flavors: FLAVORS, savedFlavorIds: ['a', 'b'], needsAggregate: true, aggregateSaved: false })
    expect(r).toEqual({ complete: false, missingFlavors: [], missingAggregate: true })
  })

  it('is complete when the aggregate is also saved', () => {
    const r = checkFlavorCompleteness({ flavors: FLAVORS, savedFlavorIds: ['a', 'b'], needsAggregate: true, aggregateSaved: true })
    expect(r.complete).toBe(true)
  })

  it('only counts the SELECTED flavors (subset), not any others', () => {
    // Creator selected 2 flavors; both have labels → complete, regardless of the template pool.
    const r = checkFlavorCompleteness({ flavors: FLAVORS, savedFlavorIds: ['a', 'b', 'zzz-unselected'], needsAggregate: false, aggregateSaved: false })
    expect(r.complete).toBe(true)
  })

  it('empty selection with no aggregate is trivially complete', () => {
    const r = checkFlavorCompleteness({ flavors: [], savedFlavorIds: [], needsAggregate: false, aggregateSaved: false })
    expect(r).toEqual({ complete: true, missingFlavors: [], missingAggregate: false })
  })
})
