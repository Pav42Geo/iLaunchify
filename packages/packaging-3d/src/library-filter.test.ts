import { describe, it, expect } from 'vitest'
import {
  SIZE_BUCKETS,
  sizeBucketFor,
  matchesFilter,
  filterLibrary,
  facetCounts,
  type MockupLibraryItem,
} from './library-filter'

describe('sizeBucketFor', () => {
  it('buckets by the longest edge', () => {
    expect(sizeBucketFor({ widthMm: 60, heightMm: 60, depthMm: 60 })).toBe('mini')
    expect(sizeBucketFor({ widthMm: 100, heightMm: 40 })).toBe('small')
    expect(sizeBucketFor({ widthMm: 200 })).toBe('medium')
    expect(sizeBucketFor({ heightMm: 300 })).toBe('large')
    expect(sizeBucketFor({ heightMm: 900 })).toBe('xl')
  })

  it('returns null without usable dims', () => {
    expect(sizeBucketFor(null)).toBeNull()
    expect(sizeBucketFor({})).toBeNull()
    expect(sizeBucketFor({ widthMm: 0 })).toBeNull()
  })

  it('bucket ranges are contiguous and cover the top', () => {
    expect(SIZE_BUCKETS[SIZE_BUCKETS.length - 1]?.maxMm).toBe(Infinity)
  })
})

const items: MockupLibraryItem[] = [
  { id: 'a', structuralType: 'SINGLE_UNIT', categorySlug: 'supplements', styleTags: ['minimalist', 'clinical'], kind: 'STANDARD_RENDER', isPremium: false, designAware: true, sizeBucket: 'small' },
  { id: 'b', structuralType: 'SINGLE_UNIT', categorySlug: 'supplements', styleTags: ['bold'], kind: 'SCENE_2D', isPremium: true, designAware: true, sizeBucket: 'small' },
  { id: 'c', structuralType: 'MULTI_UNIT_SAME', categorySlug: 'snacks', styleTags: ['minimalist'], kind: 'AI_SCENE', isPremium: true, designAware: false, sizeBucket: 'large' },
]

describe('matchesFilter / filterLibrary', () => {
  it('filters by structural type + category', () => {
    expect(filterLibrary(items, { structuralType: 'SINGLE_UNIT' }).map((i) => i.id)).toEqual(['a', 'b'])
    expect(filterLibrary(items, { categorySlug: 'snacks' }).map((i) => i.id)).toEqual(['c'])
  })

  it('style tags are any-of (OR)', () => {
    expect(filterLibrary(items, { styleTags: ['minimalist'] }).map((i) => i.id)).toEqual(['a', 'c'])
    expect(filterLibrary(items, { styleTags: ['bold', 'clinical'] }).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('premium + designAware + kind filters', () => {
    expect(filterLibrary(items, { premiumOnly: true }).map((i) => i.id)).toEqual(['b', 'c'])
    expect(filterLibrary(items, { designAwareOnly: true }).map((i) => i.id)).toEqual(['a', 'b'])
    expect(filterLibrary(items, { kind: 'STANDARD_RENDER' }).map((i) => i.id)).toEqual(['a'])
  })

  it('query matches title or style tags', () => {
    expect(matchesFilter(items[0]!, { query: 'CLINICAL' })).toBe(true)
    expect(matchesFilter(items[0]!, { query: 'nope' })).toBe(false)
  })

  it('combines facets (AND across facets)', () => {
    expect(filterLibrary(items, { structuralType: 'SINGLE_UNIT', premiumOnly: true }).map((i) => i.id)).toEqual(['b'])
  })
})

describe('facetCounts', () => {
  it('counts each facet value across all items', () => {
    const f = facetCounts(items)
    expect(f.structuralType).toEqual({ SINGLE_UNIT: 2, MULTI_UNIT_SAME: 1 })
    expect(f.categorySlug).toEqual({ supplements: 2, snacks: 1 })
    expect(f.styleTags.minimalist).toBe(2)
    expect(f.kind).toEqual({ STANDARD_RENDER: 1, SCENE_2D: 1, AI_SCENE: 1 })
  })

  it('narrows counts to a base filter (faceted search behaviour)', () => {
    const f = facetCounts(items, { categorySlug: 'supplements' })
    expect(f.structuralType).toEqual({ SINGLE_UNIT: 2 })
    expect(f.kind).toEqual({ STANDARD_RENDER: 1, SCENE_2D: 1 })
  })
})
