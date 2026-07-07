// MM-5 fee-resolution tests. The badge sets the platform production-fee cut, but
// ONLY when the engine is enabled — the whole point of shadow mode is that
// pricing does not move until Pavel flips the switch.

import { describe, it, expect } from 'vitest'
import { resolveManufacturerFeeBps, feeBpsToPct } from './merit-fee'

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
