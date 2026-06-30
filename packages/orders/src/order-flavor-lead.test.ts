import { describe, it, expect } from 'vitest'
import { effectiveFlavorLeadDays, resolveOrderLeadDays } from './multi-flavor-lead'

// Mirrors the locked per-flavor lead model (packages/ui/src/lib/lead.ts):
// the global standard is the floor; a flavor override can only raise it; the
// order lead = max(standard, max effective flavor lead) + (N-1)*changeover.

describe('effectiveFlavorLeadDays', () => {
  it('null override → the standard floor', () => {
    expect(effectiveFlavorLeadDays(null, 10)).toBe(10)
    expect(effectiveFlavorLeadDays(undefined, 7)).toBe(7)
  })
  it('override below the floor is ignored (floor governs)', () => {
    expect(effectiveFlavorLeadDays(5, 10)).toBe(10)
  })
  it('override above the floor raises it', () => {
    expect(effectiveFlavorLeadDays(14, 10)).toBe(14)
  })
  it('clamps negatives / fractions to whole non-negative days', () => {
    expect(effectiveFlavorLeadDays(-3, 0)).toBe(0)
    expect(effectiveFlavorLeadDays(12.9, 10)).toBe(12)
  })
})

describe('resolveOrderLeadDays', () => {
  it('no flavors (single-recipe / non-pack) → the standard floor', () => {
    expect(resolveOrderLeadDays({ standardLeadDays: 10, flavorLeadDays: [], changeoverDays: 1 })).toBe(10)
  })
  it('single flavor adds no changeover', () => {
    expect(resolveOrderLeadDays({ standardLeadDays: 10, flavorLeadDays: [14], changeoverDays: 2 })).toBe(14)
  })
  it('all flavors at/below floor → floor + (N-1)*changeover', () => {
    // max effective = 10 (floor); 3 flavors → +2*1 = 12
    expect(resolveOrderLeadDays({ standardLeadDays: 10, flavorLeadDays: [null, 8, 5], changeoverDays: 1 })).toBe(12)
  })
  it('a slow flavor lifts the band, then changeover stacks', () => {
    // max effective = max(10, 10, 18, 10) = 18; 3 flavors → +2*2 = 22
    expect(resolveOrderLeadDays({ standardLeadDays: 10, flavorLeadDays: [null, 18, 5], changeoverDays: 2 })).toBe(22)
  })
  it('changeover of 0 → pure max band', () => {
    expect(resolveOrderLeadDays({ standardLeadDays: 7, flavorLeadDays: [9, 12, 7], changeoverDays: 0 })).toBe(12)
  })
})
