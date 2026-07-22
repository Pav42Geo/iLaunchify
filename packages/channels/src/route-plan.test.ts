// C2.2 route-plan goldens (pure; runs under real vitest on-Mac and under the
// sandbox shim via scripts/run-vitest-suites.mjs).

import { describe, it, expect } from 'vitest'
import {
  planChannelOrderRouting,
  trailingUnits,
  bandSelectionUnits,
  utcDayStartMs,
  withinDailySpendCap,
  withinDailyCapacity,
  type RoutePlanLine,
} from './route-plan'

const line = (over: Partial<RoutePlanLine>): RoutePlanLine => ({
  mapped: true,
  productId: 'p1',
  flavorPresetId: null,
  mode: 'ON_DEMAND',
  quantity: 1,
  ...over,
})

describe('planChannelOrderRouting', () => {
  it('refuses an empty order', () => {
    const plan = planChannelOrderRouting([])
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toMatch(/no lines/)
  })

  it('refuses unmapped lines (the router is the last stop before money)', () => {
    const plan = planChannelOrderRouting([line({}), line({ mapped: false, productId: null })])
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toMatch(/not linked/)
    expect(plan.productionJobs).toHaveLength(0)
  })

  it('refuses non-positive quantities', () => {
    const plan = planChannelOrderRouting([line({ quantity: 0 })])
    expect(plan.ok).toBe(false)
    expect(plan.refusal).toMatch(/quantity/)
  })

  it('aggregates ON_DEMAND lines per product with a per-flavor split', () => {
    const plan = planChannelOrderRouting([
      line({ flavorPresetId: 'fA', quantity: 2 }),
      line({ flavorPresetId: 'fB', quantity: 1 }),
      line({ flavorPresetId: 'fA', quantity: 1 }),
      line({ productId: 'p2', flavorPresetId: null, quantity: 3 }),
    ])
    expect(plan.ok).toBe(true)
    expect(plan.productionJobs).toHaveLength(2)
    const p1 = plan.productionJobs.find((j) => j.productId === 'p1')!
    expect(p1.units).toBe(4)
    expect(p1.flavors).toEqual([
      { flavorPresetId: 'fA', units: 3 },
      { flavorPresetId: 'fB', units: 1 },
    ])
    const p2 = plan.productionJobs.find((j) => j.productId === 'p2')!
    expect(p2.units).toBe(3)
    expect(plan.stockJobs).toHaveLength(0)
  })

  it('sends BULK lines to stock jobs (no production order), two branches one router', () => {
    const plan = planChannelOrderRouting([
      line({ mode: 'BULK', quantity: 2 }),
      line({ mode: 'BULK', productId: 'p2', quantity: 1 }),
      line({ mode: 'ON_DEMAND', productId: 'p3', quantity: 1 }),
    ])
    expect(plan.ok).toBe(true)
    expect(plan.stockJobs).toEqual([
      { productId: 'p1', units: 2 },
      { productId: 'p2', units: 1 },
    ])
    expect(plan.productionJobs).toHaveLength(1)
    expect(plan.productionJobs[0]!.productId).toBe('p3')
  })
})

describe('velocity-band selection input (gate doc §4b.5, LOCKED 2026-07-21)', () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.UTC(2026, 6, 22, 12, 0, 0)

  it('sums only units inside the trailing 30-day window', () => {
    const rows = [
      { placedAtMs: now - 1 * DAY, units: 2 },
      { placedAtMs: now - 29 * DAY, units: 5 },
      { placedAtMs: now - 31 * DAY, units: 100 }, // outside the window
      { placedAtMs: now + 1 * DAY, units: 7 }, // clock skew: ignored
    ]
    expect(trailingUnits(rows, now)).toBe(7)
  })

  it('ignores non-positive unit rows', () => {
    expect(trailingUnits([{ placedAtMs: now, units: 0 }, { placedAtMs: now, units: -3 }], now)).toBe(0)
  })

  it('bandSelectionUnits = trailing + order units (a qty-1 order with 250 trailing units earns the 100+ band)', () => {
    expect(bandSelectionUnits(250, 1)).toBe(251)
    expect(bandSelectionUnits(0, 2)).toBe(2)
    expect(bandSelectionUnits(-5, 1)).toBe(1)
  })
})

describe('per-day guards (park, never fail)', () => {
  it('utcDayStartMs buckets by UTC midnight', () => {
    const t = Date.UTC(2026, 6, 22, 23, 59, 59)
    expect(utcDayStartMs(t)).toBe(Date.UTC(2026, 6, 22))
    expect(utcDayStartMs(Date.UTC(2026, 6, 22))).toBe(Date.UTC(2026, 6, 22))
  })

  it('spend cap: under, exactly at, and over', () => {
    expect(withinDailySpendCap({ spentTodayCents: 10_000, nextChargeCents: 5_000, capCents: 50_000 }).ok).toBe(true)
    expect(withinDailySpendCap({ spentTodayCents: 45_000, nextChargeCents: 5_000, capCents: 50_000 }).ok).toBe(true)
    const over = withinDailySpendCap({ spentTodayCents: 45_001, nextChargeCents: 5_000, capCents: 50_000 })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toMatch(/spending cap/)
  })

  it('spend cap disabled when null or non-positive', () => {
    expect(withinDailySpendCap({ spentTodayCents: 1e9, nextChargeCents: 1e9, capCents: null }).ok).toBe(true)
    expect(withinDailySpendCap({ spentTodayCents: 1e9, nextChargeCents: 1e9, capCents: 0 }).ok).toBe(true)
  })

  it('capacityPerDay: partner consent is enforced, null = uncapped', () => {
    expect(withinDailyCapacity({ unitsRoutedToday: 3, orderUnits: 2, capacityPerDay: 5 }).ok).toBe(true)
    const over = withinDailyCapacity({ unitsRoutedToday: 5, orderUnits: 1, capacityPerDay: 5 })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toMatch(/capacity/)
    expect(withinDailyCapacity({ unitsRoutedToday: 1e6, orderUnits: 1, capacityPerDay: null }).ok).toBe(true)
  })
})
