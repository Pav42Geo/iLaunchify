// Unit tests for the sample-quote engine (sample-quote.ts).
//
// Pre-checkout pricing for sample orders: per-flavor units and/or a flat sampler
// set, with sample-specific MOQ and a creditable amount toward the first
// production order. These pin the pricing, the MOQ rules (sampler set bypasses
// the per-unit MOQ), the per-flavor cap, and the credit cap.

import { describe, it, expect } from 'vitest'
import { quoteSample, hasSamplerSet, type SampleOption } from './sample-quote'

function opt(over: Partial<SampleOption> = {}): SampleOption {
  return {
    kind: 'UNBRANDED',
    perFlavorCents: 500,
    samplerSetCents: 2000,
    sampleMoq: 1,
    maxUnitsPerFlavor: null,
    leadTimeDays: 7,
    creditTowardFirstOrder: false,
    creditCapCents: null,
    ...over,
  }
}

describe('hasSamplerSet', () => {
  it('is true only when a positive sampler price is set', () => {
    expect(hasSamplerSet(opt({ samplerSetCents: 2000 }))).toBe(true)
    expect(hasSamplerSet(opt({ samplerSetCents: null }))).toBe(false)
    expect(hasSamplerSet(opt({ samplerSetCents: 0 }))).toBe(false)
  })
})

describe('quoteSample — sampler set', () => {
  it('prices a single bundle and bypasses the per-unit MOQ', () => {
    const q = quoteSample(opt({ samplerSetCents: 2000, sampleMoq: 5 }), { mode: 'SAMPLER_SET', unitsByFlavor: {} }, true)
    expect(q.unitCount).toBe(1)
    expect(q.subtotalCents).toBe(2000)
    expect(q.meetsMoq).toBe(true) // sampler set is one bundle — MOQ 5 doesn't apply
    expect(q.errors).toEqual([])
    expect(q.lines).toEqual([{ label: 'All-flavors sampler set', qty: 1, unitCents: 2000, totalCents: 2000 }])
  })

  it('errors when no sampler price is set', () => {
    const q = quoteSample(opt({ samplerSetCents: null }), { mode: 'SAMPLER_SET', unitsByFlavor: {} }, true)
    expect(q.subtotalCents).toBe(0)
    expect(q.errors).toContain('No sampler-set price is set for this sample.')
  })
})

describe('quoteSample — per flavor', () => {
  it('prices units across flavors and sums the subtotal', () => {
    const q = quoteSample(
      opt({ perFlavorCents: 500 }),
      { mode: 'PER_FLAVOR', unitsByFlavor: { Berry: 2, Citrus: 1 } },
      true,
    )
    expect(q.unitCount).toBe(3)
    expect(q.subtotalCents).toBe(1500)
    expect(q.lines).toEqual([
      { label: 'Berry', qty: 2, unitCents: 500, totalCents: 1000 },
      { label: 'Citrus', qty: 1, unitCents: 500, totalCents: 500 },
    ])
    expect(q.errors).toEqual([])
  })

  it('labels single-flavor lines generically', () => {
    const q = quoteSample(opt(), { mode: 'PER_FLAVOR', unitsByFlavor: { default: 1 } }, false)
    expect(q.lines[0]!.label).toBe('Sample unit')
  })

  it('floors fractional qty and skips non-positive units', () => {
    const q = quoteSample(opt(), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 2.9, B: 0, C: -3 } }, true)
    expect(q.unitCount).toBe(2) // 2.9 → 2; B and C skipped
    expect(q.lines).toHaveLength(1)
  })

  it('errors when no per-unit price is set', () => {
    const q = quoteSample(opt({ perFlavorCents: null }), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 1 } }, true)
    expect(q.errors).toContain('No per-unit sample price is set.')
  })

  it('errors when nothing is selected', () => {
    const q = quoteSample(opt(), { mode: 'PER_FLAVOR', unitsByFlavor: {} }, true)
    expect(q.errors).toContain('Pick at least one unit to sample.')
  })

  it('flags exceeding the per-flavor cap', () => {
    const q = quoteSample(opt({ maxUnitsPerFlavor: 2 }), { mode: 'PER_FLAVOR', unitsByFlavor: { Berry: 3 } }, true)
    expect(q.errors.some((e) => e.includes('max 2 units per flavor'))).toBe(true)
  })

  it('enforces the per-unit MOQ', () => {
    const below = quoteSample(opt({ sampleMoq: 3 }), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 2 } }, true)
    expect(below.meetsMoq).toBe(false)
    expect(below.errors.some((e) => e.includes('Minimum 3 units'))).toBe(true)
    const ok = quoteSample(opt({ sampleMoq: 3 }), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 3 } }, true)
    expect(ok.meetsMoq).toBe(true)
    expect(ok.errors).toEqual([])
  })
})

describe('quoteSample — credit toward first order', () => {
  it('is zero when crediting is off', () => {
    const q = quoteSample(opt({ creditTowardFirstOrder: false }), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 2 } }, true)
    expect(q.creditEnabled).toBe(false)
    expect(q.creditableCents).toBe(0)
  })

  it('credits the full subtotal when uncapped', () => {
    const q = quoteSample(opt({ creditTowardFirstOrder: true, perFlavorCents: 500 }), { mode: 'PER_FLAVOR', unitsByFlavor: { A: 2 } }, true)
    expect(q.creditableCents).toBe(1000)
  })

  it('caps the credit at creditCapCents', () => {
    const q = quoteSample(
      opt({ creditTowardFirstOrder: true, creditCapCents: 600, perFlavorCents: 500 }),
      { mode: 'PER_FLAVOR', unitsByFlavor: { A: 3 } }, // subtotal 1500
      true,
    )
    expect(q.creditableCents).toBe(600)
  })
})
