import { describe, it, expect } from 'vitest'
import { resolveCreatorIntake, maxPriority } from './intake-policy'
import { SUPPORT_SETTINGS_DEFAULTS } from '@ilaunchify/db'

const S = SUPPORT_SETTINGS_DEFAULTS

describe('maxPriority', () => {
  it('returns the stronger priority', () => {
    expect(maxPriority('LOW', 'HIGH')).toBe('HIGH')
    expect(maxPriority('URGENT', 'HIGH')).toBe('URGENT')
    expect(maxPriority('MEDIUM', 'MEDIUM')).toBe('MEDIUM')
  })
})

describe('resolveCreatorIntake (defaults)', () => {
  it('agency floors priority to HIGH + 4h SLA', () => {
    const r = resolveCreatorIntake({ tier: 'AGENCY', categoryPriority: 'LOW', settings: S })
    expect(r.priority).toBe('HIGH')
    expect(r.slaResponseMinutes).toBe(240)
  })

  it('never LOWERS an already-urgent category priority', () => {
    const r = resolveCreatorIntake({ tier: 'AGENCY', categoryPriority: 'URGENT', settings: S })
    expect(r.priority).toBe('URGENT') // floor is HIGH, category already higher
  })

  it('maker keeps LOW floor + 48h SLA', () => {
    const r = resolveCreatorIntake({ tier: 'MAKER', categoryPriority: 'LOW', settings: S })
    expect(r.priority).toBe('LOW')
    expect(r.slaResponseMinutes).toBe(2880)
  })

  it('builder floors to MEDIUM + 24h SLA', () => {
    const r = resolveCreatorIntake({ tier: 'BUILDER', categoryPriority: 'LOW', settings: S })
    expect(r.priority).toBe('MEDIUM')
    expect(r.slaResponseMinutes).toBe(1440)
  })
})

describe('resolveCreatorIntake (switches off)', () => {
  it('priorityFloorEnabled=false → keeps category priority', () => {
    const r = resolveCreatorIntake({
      tier: 'AGENCY',
      categoryPriority: 'LOW',
      settings: { ...S, priorityFloorEnabled: false },
    })
    expect(r.priority).toBe('LOW')
  })

  it('slaTargetsEnabled=false → null SLA (read-time default)', () => {
    const r = resolveCreatorIntake({
      tier: 'AGENCY',
      categoryPriority: 'LOW',
      settings: { ...S, slaTargetsEnabled: false },
    })
    expect(r.slaResponseMinutes).toBeNull()
  })
})
