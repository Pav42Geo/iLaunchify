// MM-5 fee-resolution tests. The badge sets the platform production-fee cut, but
// ONLY when the engine is enabled — the whole point of shadow mode is that
// pricing does not move until Pavel flips the switch.

import { describe, it, expect } from 'vitest'
import { resolveManufacturerFeeBps, feeBpsToPct, resolveActivePromo, addMonths, addDays, addDuration } from './merit-fee'

const policy = { feeBpsByBadge: { VERIFIED: 450, TRUSTED: 250, PREMIER: 0 } as const }

describe('resolveManufacturerFeeBps', () => {
  it('returns the BASE rate untouched while the engine is disabled (shadow)', () => {
    for (const badge of ['VERIFIED', 'TRUSTED', 'PREMIER'] as const) {
      const r = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge, policy, enabled: false })
      expect(r.bps).toBe(500)
      expect(r.source).toBe('BASE')
    }
  })

  it('resolves from the badge once enabled — Verified 450 · Trusted 250 · Premier 0', () => {
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'VERIFIED', policy, enabled: true }).bps).toBe(450)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'TRUSTED', policy, enabled: true }).bps).toBe(250)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'PREMIER', policy, enabled: true }).bps).toBe(0)
  })

  it('marks the source BADGE when enabled and reports the base for delta display', () => {
    const r = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'TRUSTED', policy, enabled: true })
    expect(r.source).toBe('BADGE')
    expect(r.baseBps).toBe(500)
    expect(r.badge).toBe('TRUSTED')
  })

  it('is reversible — flipping enabled false→true→false restores base pricing', () => {
    const off1 = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'PREMIER', policy, enabled: false })
    const on = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'PREMIER', policy, enabled: true })
    const off2 = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'PREMIER', policy, enabled: false })
    expect(off1.bps).toBe(500)
    expect(on.bps).toBe(0)
    expect(off2.bps).toBe(500)
  })

  it('falls back to base for an unknown/missing badge fee (never throws)', () => {
    const r = resolveManufacturerFeeBps({
      baseProductionFeeBps: 500,
      badge: 'VERIFIED',
      policy: { feeBpsByBadge: {} as unknown as { VERIFIED: number; TRUSTED: number; PREMIER: number } },
      enabled: true,
    })
    expect(r.bps).toBe(500)
    expect(r.source).toBe('BASE')
  })
})

describe('feeBpsToPct', () => {
  it('formats whole and fractional percents', () => {
    expect(feeBpsToPct(450)).toBe('4.5%')
    expect(feeBpsToPct(250)).toBe('2.5%')
    expect(feeBpsToPct(0)).toBe('0%')
    expect(feeBpsToPct(500)).toBe('5%')
    expect(feeBpsToPct(1500)).toBe('15%')
  })
})

describe('resolveManufacturerFeeBps — promo precedence (MM-7)', () => {
  it('an active promo overrides the badge fee, even when the engine is live', () => {
    const r = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'VERIFIED', policy, enabled: true, promoFeeBps: 0 })
    expect(r.bps).toBe(0)
    expect(r.source).toBe('PROMO')
  })
  it('a promo overrides the base fee while the engine is in shadow', () => {
    const r = resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'VERIFIED', policy, enabled: false, promoFeeBps: 100 })
    expect(r.bps).toBe(100)
    expect(r.source).toBe('PROMO')
  })
  it('null promo falls through to the normal badge/base logic', () => {
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'TRUSTED', policy, enabled: true, promoFeeBps: null }).bps).toBe(250)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 500, badge: 'TRUSTED', policy, enabled: false, promoFeeBps: null }).bps).toBe(500)
  })
})

describe('addMonths / addDays / addDuration', () => {
  it('adds whole months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-04-15')
  })
  it('clamps when the target month is shorter', () => {
    // Jan 31 + 1 month → Feb 28 (2026 is not a leap year), not Mar 3.
    expect(addMonths(new Date('2026-01-31T12:00:00Z'), 1).getUTCMonth()).toBe(1) // February
  })
  it('adds whole days', () => {
    expect(addDays(new Date('2026-01-30T00:00:00Z'), 5).toISOString().slice(0, 10)).toBe('2026-02-04')
  })
  it('addDuration dispatches on unit', () => {
    expect(addDuration(new Date('2026-01-01T00:00:00Z'), 10, 'DAYS').toISOString().slice(0, 10)).toBe('2026-01-11')
    expect(addDuration(new Date('2026-01-01T00:00:00Z'), 2, 'MONTHS').toISOString().slice(0, 10)).toBe('2026-03-01')
  })
})

describe('resolveActivePromo (MM-7)', () => {
  const grace = { enabled: true, value: 3, unit: 'MONTHS' as const, feeBps: 0 }
  const now = new Date('2026-06-01T00:00:00Z')

  it('global grace applies within the window from activation', () => {
    const p = resolveActivePromo({ now, activatedAt: new Date('2026-05-01T00:00:00Z'), grace, manualGrants: [] })
    expect(p).not.toBeNull()
    expect(p!.source).toBe('GLOBAL_GRACE')
    expect(p!.feeBps).toBe(0)
  })

  it('global grace has expired once past the window', () => {
    const p = resolveActivePromo({ now, activatedAt: new Date('2026-01-01T00:00:00Z'), grace, manualGrants: [] })
    expect(p).toBeNull()
  })

  it('the toggle disables global grace entirely', () => {
    const p = resolveActivePromo({ now, activatedAt: new Date('2026-05-01T00:00:00Z'), grace: { ...grace, enabled: false }, manualGrants: [] })
    expect(p).toBeNull()
  })

  it('supports a DAYS unit window', () => {
    const activatedAt = new Date('2026-05-20T00:00:00Z')
    const g = { enabled: true, value: 30, unit: 'DAYS' as const, feeBps: 0 }
    // now = Jun 1 → 12 days in, within 30 → active.
    expect(resolveActivePromo({ now, activatedAt, grace: g, manualGrants: [] })!.source).toBe('GLOBAL_GRACE')
    // 40 days after activation → expired.
    expect(resolveActivePromo({ now: new Date('2026-06-29T00:00:00Z'), activatedAt, grace: g, manualGrants: [] })).toBeNull()
  })

  it('a manual grant wins over global grace', () => {
    const p = resolveActivePromo({
      now,
      activatedAt: new Date('2026-05-01T00:00:00Z'),
      grace,
      manualGrants: [{ feeBps: 200, startsAt: new Date('2026-05-15'), endsAt: new Date('2026-08-15'), revokedAt: null }],
    })
    expect(p!.source).toBe('MANUAL_GRANT')
    expect(p!.feeBps).toBe(200)
  })

  it('ignores revoked and out-of-window manual grants', () => {
    const p = resolveActivePromo({
      now,
      activatedAt: new Date('2020-01-01'),
      grace: { ...grace, enabled: false },
      manualGrants: [
        { feeBps: 0, startsAt: new Date('2026-05-01'), endsAt: new Date('2026-09-01'), revokedAt: new Date('2026-05-20') }, // revoked
        { feeBps: 0, startsAt: new Date('2026-07-01'), endsAt: new Date('2026-09-01'), revokedAt: null }, // future
      ],
    })
    expect(p).toBeNull()
  })

  it('among concurrent manual grants the most generous wins', () => {
    const p = resolveActivePromo({
      now,
      activatedAt: new Date('2020-01-01'),
      grace: { ...grace, enabled: false },
      manualGrants: [
        { feeBps: 300, startsAt: new Date('2026-05-01'), endsAt: new Date('2026-09-01'), revokedAt: null },
        { feeBps: 0, startsAt: new Date('2026-05-01'), endsAt: new Date('2026-07-01'), revokedAt: null },
      ],
    })
    expect(p!.feeBps).toBe(0)
  })
})
