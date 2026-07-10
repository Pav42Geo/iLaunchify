// Pin-tests for the creator platform-fee SSOT (FEE_MODEL_RECONCILIATION_SPEC).
// Pure — no prisma. Locks the 15/12/8 numbers, the fallback, the bounds, and the
// unified rounding so the flat-5% / floor-vs-round drift the audit found cannot
// silently return.
import { describe, it, expect } from 'vitest'
import { creatorFeeFromRule, creatorFeeCents, CREATOR_FEE_FALLBACK_BPS } from './creator-fee'

const rule = (ratePercent: number | null, extra: Record<string, number | null> = {}) => ({
  ratePercent,
  flatCents: null,
  minCents: null,
  maxCents: null,
  notes: null,
  ...extra,
})

describe('creatorFeeFromRule — tier rate → bps', () => {
  it('maps Maker 15% / Builder 12% / Agency 8% to bps', () => {
    expect(creatorFeeFromRule(rule(15)).feeBps).toBe(1500)
    expect(creatorFeeFromRule(rule(12)).feeBps).toBe(1200)
    expect(creatorFeeFromRule(rule(8)).feeBps).toBe(800)
  })
  it('source is TIER_RULE when a rate is present', () => {
    expect(creatorFeeFromRule(rule(15)).source).toBe('TIER_RULE')
  })
  it('falls back to Maker 15% (FALLBACK) when the rule or its rate is missing', () => {
    expect(creatorFeeFromRule(null)).toEqual({ feeBps: 1500, source: 'FALLBACK' })
    expect(creatorFeeFromRule(rule(null))).toEqual({ feeBps: 1500, source: 'FALLBACK' })
    expect(CREATOR_FEE_FALLBACK_BPS).toBe(1500)
  })
  it('NEVER returns the retired flat 5% (500 bps)', () => {
    expect(creatorFeeFromRule(null).feeBps).not.toBe(500)
  })
})

describe('creatorFeeCents — fee math', () => {
  it('is a straight percent of the base', () => {
    expect(creatorFeeCents(10_000, 1500)).toBe(1500) // 15% of $100.00
    expect(creatorFeeCents(10_000, 1200)).toBe(1200)
    expect(creatorFeeCents(10_000, 800)).toBe(800)
  })
  it('rounds (not floors) — the unified rounding rule', () => {
    // 333 × 1500bps = 49.95 → round → 50 (floor would give 49)
    expect(creatorFeeCents(333, 1500)).toBe(50)
  })
  it('honors the min floor', () => {
    expect(creatorFeeCents(100, 1500, { minCents: 100 })).toBe(100) // 15c → floored up to 100
  })
  it('honors the max ceiling', () => {
    expect(creatorFeeCents(1_000_000, 1500, { maxCents: 5000 })).toBe(5000)
  })
  it('adds a flat component when set', () => {
    expect(creatorFeeCents(10_000, 1500, { flatCents: 50 })).toBe(1550)
  })
  it('never returns negative', () => {
    expect(creatorFeeCents(0, 1500)).toBe(0)
  })
})
