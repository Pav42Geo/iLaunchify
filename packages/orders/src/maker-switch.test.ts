import { describe, it, expect } from 'vitest'
import { evaluateMakerSwitch, type MakerSwitchFacts } from './maker-switch'

const NOW = new Date('2026-07-10T12:00:00Z')

function facts(over: Partial<MakerSwitchFacts> = {}): MakerSwitchFacts {
  return {
    roomStatus: 'ACTIVE',
    roomCreatedAt: new Date('2026-07-01T00:00:00Z'),
    ndaSignedAt: null,
    milestoneStatuses: ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
    milestoneTermsStatuses: ['UNSET', 'UNSET', 'UNSET', 'UNSET'],
    recipeStatus: 'IN_REVIEW',
    hasAnySubmission: false,
    priorRooms: 0,
    ...over,
  }
}

const base = { policy: 'UNTIL_FUNDED', graceDays: 14, maxSwitches: 1 }

describe('evaluateMakerSwitch — universal guards', () => {
  it('refuses when the room is not ACTIVE', () => {
    expect(evaluateMakerSwitch(base, facts({ roomStatus: 'CLOSED_WON' }), NOW).allowed).toBe(false)
  })

  it('DISABLED refuses everything', () => {
    expect(evaluateMakerSwitch({ ...base, policy: 'DISABLED' }, facts(), NOW).allowed).toBe(false)
  })

  it('money backstop closes EVERY policy once any milestone leaves PENDING', () => {
    for (const policy of ['UNTIL_FUNDED', 'UNTIL_RECIPE_APPROVED', 'WITHIN_GRACE_DAYS', 'UNTIL_NDA_SIGNED']) {
      const v = evaluateMakerSwitch(
        { ...base, policy },
        facts({ milestoneStatuses: ['FUNDED_ESCROW', 'PENDING'] }),
        NOW,
      )
      expect(v.allowed).toBe(false)
      expect(v.reason).toMatch(/funded/i)
    }
  })

  it('enforces the per-brief switch cap (0 = unlimited)', () => {
    expect(evaluateMakerSwitch(base, facts({ priorRooms: 1 }), NOW).allowed).toBe(false)
    expect(evaluateMakerSwitch({ ...base, maxSwitches: 0 }, facts({ priorRooms: 5 }), NOW).allowed).toBe(true)
  })
})

describe('evaluateMakerSwitch — policy ladder', () => {
  it('UNTIL_FUNDED allows while everything is unfunded', () => {
    expect(evaluateMakerSwitch(base, facts({ recipeStatus: 'APPROVED', hasAnySubmission: true }), NOW).allowed).toBe(true)
  })

  it('WITHIN_GRACE_DAYS allows inside the window, refuses after', () => {
    const p = { ...base, policy: 'WITHIN_GRACE_DAYS' }
    expect(evaluateMakerSwitch(p, facts(), NOW).allowed).toBe(true) // 9 days old, 14-day window
    expect(
      evaluateMakerSwitch({ ...p, graceDays: 7 }, facts(), NOW).allowed, // 9 days old, 7-day window
    ).toBe(false)
    // graceDays 0 = no time limit under this policy
    expect(evaluateMakerSwitch({ ...p, graceDays: 0 }, facts(), NOW).allowed).toBe(true)
  })

  it('UNTIL_NDA_SIGNED closes at signature', () => {
    const p = { ...base, policy: 'UNTIL_NDA_SIGNED' }
    expect(evaluateMakerSwitch(p, facts(), NOW).allowed).toBe(true)
    expect(evaluateMakerSwitch(p, facts({ ndaSignedAt: new Date() }), NOW).allowed).toBe(false)
  })

  it('UNTIL_FIRST_SUBMISSION closes once the maker submits anything', () => {
    const p = { ...base, policy: 'UNTIL_FIRST_SUBMISSION' }
    expect(evaluateMakerSwitch(p, facts(), NOW).allowed).toBe(true)
    expect(evaluateMakerSwitch(p, facts({ hasAnySubmission: true }), NOW).allowed).toBe(false)
  })

  it('UNTIL_TERMS_AGREED closes once any milestone terms are AGREED', () => {
    const p = { ...base, policy: 'UNTIL_TERMS_AGREED' }
    expect(evaluateMakerSwitch(p, facts({ milestoneTermsStatuses: ['PROPOSED', 'UNSET'] }), NOW).allowed).toBe(true)
    expect(evaluateMakerSwitch(p, facts({ milestoneTermsStatuses: ['AGREED', 'UNSET'] }), NOW).allowed).toBe(false)
  })

  it('UNTIL_RECIPE_APPROVED closes at approval or lock, ignores earlier statuses', () => {
    const p = { ...base, policy: 'UNTIL_RECIPE_APPROVED' }
    expect(evaluateMakerSwitch(p, facts({ recipeStatus: 'CHANGES_REQUESTED' }), NOW).allowed).toBe(true)
    expect(evaluateMakerSwitch(p, facts({ recipeStatus: null }), NOW).allowed).toBe(true)
    expect(evaluateMakerSwitch(p, facts({ recipeStatus: 'APPROVED' }), NOW).allowed).toBe(false)
    expect(evaluateMakerSwitch(p, facts({ recipeStatus: 'LOCKED' }), NOW).allowed).toBe(false)
  })
})
