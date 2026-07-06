import { describe, expect, it } from 'vitest'
import {
  computeMeritScore,
  validateMeritPolicy,
  recommendBadgeChange,
  DEFAULT_MERIT_POLICY,
  type MeritSignals,
  type MeritCohort,
  type MeritBadge,
} from './merit'

const cohort: MeritCohort = {
  ratingBayesianMean: 3.75,
  onTimeRateMean: 0.9,
  acceptRateMean: 0.95,
  defectRatePer100Mean: 3,
  ordersMedian: 20,
}

function sig(over: Partial<MeritSignals> = {}): MeritSignals {
  return {
    ratingBayesian: 3.75,
    ratingCount: 20,
    onTimeRate: 0.9,
    acceptRate: 0.95,
    defectRatePer100: 3,
    ordersCompleted: 20,
    monthsActive: 6,
    productCount: 5,
    fulfilledUnits: 1000,
    gmvCents: 100_000,
    cleanRecencyDays: null,
    inGrace: false,
    ...over,
  }
}

const run = (over: Partial<MeritSignals> = {}) => computeMeritScore(sig(over), DEFAULT_MERIT_POLICY, cohort)

describe('merit engine — fairness', () => {
  it('new shop is NEUTRAL, never zero, never "bad"', () => {
    const r = computeMeritScore(
      sig({ ratingBayesian: null, ratingCount: 0, onTimeRate: null, acceptRate: null, defectRatePer100: null, ordersCompleted: 0, monthsActive: 0, productCount: 0 }),
      DEFAULT_MERIT_POLICY,
      cohort,
    )
    expect(r.pillars.craft).toBe(50) // neutral, not 0
    expect(r.pillars.reliability).toBe(50) // no ops data → neutral
    expect(r.qualifiedBadge).toBe('VERIFIED')
    expect(r.eligibility.trusted).toBe(false)
    expect(r.meritScore).toBeGreaterThan(20) // not slammed to the floor
  })

  it('a high-volume, high-rating shop reaches Premier', () => {
    const r = run({ ratingBayesian: 4.8, ratingCount: 200, onTimeRate: 0.97, acceptRate: 0.98, defectRatePer100: 1, ordersCompleted: 200, monthsActive: 12, productCount: 20 })
    expect(r.qualifiedBadge).toBe('PREMIER')
    expect(r.meritScore).toBeGreaterThan(82)
  })

  it('low volume shields ops noise; high volume does not (Bayesian rates)', () => {
    // Same terrible 50% on-time. 4-order shop is protected (could be bad luck);
    // 200-order shop is genuinely penalized (a real, sustained signal).
    const small = run({ onTimeRate: 0.5, acceptRate: 0.95, defectRatePer100: 3, ordersCompleted: 4 })
    const big = run({ onTimeRate: 0.5, acceptRate: 0.95, defectRatePer100: 3, ordersCompleted: 200 })
    expect(small.pillars.reliability).toBeGreaterThan(big.pillars.reliability + 8)
  })

  it('contribution lifts but CANNOT mask a craft failure', () => {
    // Bad ratings, huge volume — stays Verified.
    const r = run({ ratingBayesian: 3.0, ratingCount: 300, ordersCompleted: 500, monthsActive: 12, productCount: 40 })
    expect(r.pillars.contribution).toBe(100)
    expect(r.pillars.craft).toBeLessThan(30)
    expect(r.qualifiedBadge).toBe('VERIFIED')
  })
})

describe('merit engine — badge gates', () => {
  it('evidence gate: a high score with too few orders stays Verified', () => {
    const r = run({ ratingBayesian: 4.8, ratingCount: 5, onTimeRate: 0.97, acceptRate: 0.98, defectRatePer100: 1, ordersCompleted: 5, monthsActive: 6 })
    expect(r.meritScore).toBeGreaterThan(DEFAULT_MERIT_POLICY.thresholds.trusted)
    expect(r.eligibility.trusted).toBe(false) // < trustedMinOrders (10)
    expect(r.qualifiedBadge).toBe('VERIFIED')
    expect(r.gaps.some((g) => /completed orders/.test(g))).toBe(true)
  })

  it('Premier clean-record ceiling: high score but high defect → Trusted, not Premier', () => {
    const r = run({ ratingBayesian: 4.8, ratingCount: 200, onTimeRate: 0.97, acceptRate: 0.98, defectRatePer100: 8, ordersCompleted: 100, monthsActive: 12 })
    expect(r.meritScore).toBeGreaterThan(DEFAULT_MERIT_POLICY.thresholds.premier)
    expect(r.eligibility.premier).toBe(false) // defect 8 > 5
    expect(r.qualifiedBadge).toBe('TRUSTED')
  })

  it('a solid established shop earns Trusted; a weak/new one stays Verified', () => {
    // Base fixture = 20 orders, 6 months, 90% on-time, cohort-avg ratings → proven.
    expect(run().qualifiedBadge).toBe('TRUSTED')
    // Genuinely weak: poor ops, bad ratings, little history → Verified, not "bad".
    const weak = run({ ratingBayesian: 3.2, ratingCount: 8, onTimeRate: 0.6, acceptRate: 0.8, defectRatePer100: 9, ordersCompleted: 8, monthsActive: 2 })
    expect(weak.qualifiedBadge).toBe('VERIFIED')
  })

  it('a recent upheld defect dents standing', () => {
    const clean = run({ cleanRecencyDays: null, monthsActive: 12 })
    const dinged = run({ cleanRecencyDays: 5, monthsActive: 12 })
    expect(dinged.pillars.standing).toBeLessThan(clean.pillars.standing)
  })
})

describe('merit policy', () => {
  it('default policy is valid and carries the decided fee curve', () => {
    expect(validateMeritPolicy(DEFAULT_MERIT_POLICY)).toBeNull()
    expect(DEFAULT_MERIT_POLICY.feeBpsByBadge).toEqual({ VERIFIED: 450, TRUSTED: 250, PREMIER: 0 })
  })
  it('rejects weights that do not sum to 100', () => {
    const bad = { ...DEFAULT_MERIT_POLICY, weights: { craft: 50, reliability: 30, contribution: 20, standing: 10 } }
    expect(validateMeritPolicy(bad)).toMatch(/sum to 100/)
  })
  it('rejects trusted threshold at/above premier', () => {
    const bad = { ...DEFAULT_MERIT_POLICY, thresholds: { trusted: 85, premier: 82 } }
    expect(validateMeritPolicy(bad)).toMatch(/below Premier/)
  })
})

describe('merit hysteresis (anti-yo-yo)', () => {
  const now = new Date('2026-07-06T00:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)
  const hist = (spec: Array<[MeritBadge, number]>) =>
    spec.map(([qualifiedBadge, d]) => ({ qualifiedBadge, computedAt: daysAgo(d) }))
  const ctx = (over: Partial<{ promoteSustainDays: number; demoteMissDays: number; inGrace: boolean }> = {}) => ({
    now,
    promoteSustainDays: 30,
    demoteMissDays: 60,
    inGrace: false,
    ...over,
  })

  it('promotes only when the level is SUSTAINED across the window', () => {
    const history = hist([['TRUSTED', 0], ['TRUSTED', 15], ['TRUSTED', 31], ['TRUSTED', 40]])
    const r = recommendBadgeChange('VERIFIED', history, DEFAULT_MERIT_POLICY, ctx())
    expect(r.action).toBe('PROMOTE')
    expect(r.to).toBe('TRUSTED')
  })

  it('holds a promotion without enough history to cover the sustain window', () => {
    const history = hist([['TRUSTED', 0], ['TRUSTED', 5]]) // nothing older than 30d
    expect(recommendBadgeChange('VERIFIED', history, DEFAULT_MERIT_POLICY, ctx()).action).toBe('HOLD')
  })

  it('one bad night never demotes (max over window still meets tier)', () => {
    const history = hist([['VERIFIED', 0], ['TRUSTED', 10], ['TRUSTED', 40], ['TRUSTED', 70]])
    expect(recommendBadgeChange('TRUSTED', history, DEFAULT_MERIT_POLICY, ctx()).action).toBe('HOLD')
  })

  it('demotes one rung after a sustained miss', () => {
    const history = hist([['VERIFIED', 0], ['VERIFIED', 20], ['VERIFIED', 45], ['VERIFIED', 65]])
    const r = recommendBadgeChange('TRUSTED', history, DEFAULT_MERIT_POLICY, ctx())
    expect(r.action).toBe('DEMOTE')
    expect(r.to).toBe('VERIFIED')
  })

  it('never demotes during the grace window', () => {
    const history = hist([['VERIFIED', 0], ['VERIFIED', 20], ['VERIFIED', 45], ['VERIFIED', 65]])
    expect(recommendBadgeChange('TRUSTED', history, DEFAULT_MERIT_POLICY, ctx({ inGrace: true })).action).toBe('HOLD')
  })
})
