// Pin-tests for the manufacturer merit-fee withhold (FEE_MODEL_RECONCILIATION_SPEC).
// Pure — no prisma. Locks the shadow-safe behavior (0 until the engine is enabled)
// and the 4.5/2.5/0 badge numbers, so wiring the withhold into shipDispatch is
// provably a no-op until MeritPolicy.enabled flips on.
import { describe, it, expect } from 'vitest'
import { meritWithholdCents } from './manufacturer-merit-fee'
import { resolveManufacturerFeeBps } from './merit-fee'

describe('meritWithholdCents — payout withhold math', () => {
  it('withholds nothing at 0 bps (engine off / Premier)', () => {
    expect(meritWithholdCents(10_000, 0)).toBe(0)
  })
  it('withholds the badge rate: 4.5% / 2.5%', () => {
    expect(meritWithholdCents(10_000, 450)).toBe(450)
    expect(meritWithholdCents(10_000, 250)).toBe(250)
  })
  it('rounds and clamps to the leg cost (payout never negative)', () => {
    expect(meritWithholdCents(333, 450)).toBe(15) // 14.985 → 15
    expect(meritWithholdCents(100, 20_000)).toBe(100) // absurd bps clamps to cost
  })
  it('guards bad input', () => {
    expect(meritWithholdCents(0, 450)).toBe(0)
    expect(meritWithholdCents(-5, 450)).toBe(0)
    expect(meritWithholdCents(10_000, -1)).toBe(0)
  })
})

describe('merit is standalone at base=0 — SHADOW-SAFE', () => {
  const policy = { feeBpsByBadge: { VERIFIED: 450, TRUSTED: 250, PREMIER: 0 } }
  it('returns 0 while the engine is disabled, regardless of badge', () => {
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'VERIFIED', policy, enabled: false }).bps).toBe(0)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'TRUSTED', policy, enabled: false }).bps).toBe(0)
  })
  it('returns the badge bps once enabled', () => {
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'VERIFIED', policy, enabled: true }).bps).toBe(450)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'TRUSTED', policy, enabled: true }).bps).toBe(250)
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'PREMIER', policy, enabled: true }).bps).toBe(0)
  })
  it('an active promo wins outright', () => {
    expect(resolveManufacturerFeeBps({ baseProductionFeeBps: 0, badge: 'VERIFIED', policy, enabled: true, promoFeeBps: 0 }).bps).toBe(0)
  })
})
