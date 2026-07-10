import { describe, it, expect } from 'vitest'
import {
  BRIEF_ALLOWED_TRANSITIONS,
  INTEREST_ALLOWED_TRANSITIONS,
  assertBriefTransition,
  assertInterestTransition,
  isBriefTransitionAllowed,
  isInterestTransitionAllowed,
} from './brief-fsm'

describe('brief-fsm — ProductBrief lifecycle (spec §5)', () => {
  it('happy path: DRAFT → POSTED → INTEREST_OPEN → SHORTLISTING → MATCHED → IN_ROOM → IN_PRODUCTION → COMPLETED', () => {
    const path = [
      'DRAFT',
      'POSTED',
      'INTEREST_OPEN',
      'SHORTLISTING',
      'MATCHED',
      'IN_ROOM',
      'IN_PRODUCTION',
      'COMPLETED',
    ] as const
    for (let i = 0; i < path.length - 1; i++) {
      expect(isBriefTransitionAllowed(path[i]!, path[i + 1]!)).toBe(true)
    }
  })

  it('can cancel from every non-terminal state', () => {
    for (const from of [
      'DRAFT',
      'POSTED',
      'INTEREST_OPEN',
      'SHORTLISTING',
      'MATCHED',
      'IN_ROOM',
      'IN_PRODUCTION',
    ] as const) {
      expect(isBriefTransitionAllowed(from, 'CANCELLED')).toBe(true)
    }
  })

  it('expiry only applies while waiting on the pool (POSTED / INTEREST_OPEN / SHORTLISTING)', () => {
    expect(isBriefTransitionAllowed('POSTED', 'EXPIRED')).toBe(true)
    expect(isBriefTransitionAllowed('INTEREST_OPEN', 'EXPIRED')).toBe(true)
    expect(isBriefTransitionAllowed('SHORTLISTING', 'EXPIRED')).toBe(true)
    expect(isBriefTransitionAllowed('MATCHED', 'EXPIRED')).toBe(false)
    expect(isBriefTransitionAllowed('IN_ROOM', 'EXPIRED')).toBe(false)
  })

  it('D-CC3 reversal edges exist structurally (MATCHED/IN_ROOM → SHORTLISTING) — call site must gate', () => {
    expect(isBriefTransitionAllowed('MATCHED', 'SHORTLISTING')).toBe(true)
    expect(isBriefTransitionAllowed('IN_ROOM', 'SHORTLISTING')).toBe(true)
  })

  it('terminal states are dead ends', () => {
    for (const t of ['COMPLETED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(BRIEF_ALLOWED_TRANSITIONS[t]).toEqual([])
    }
  })

  it('rejects illegal jumps + assert throws; same-state is idempotent', () => {
    expect(isBriefTransitionAllowed('DRAFT', 'IN_ROOM')).toBe(false)
    expect(isBriefTransitionAllowed('CANCELLED', 'POSTED')).toBe(false)
    expect(() => assertBriefTransition('DRAFT', 'POSTED')).not.toThrow()
    expect(() => assertBriefTransition('DRAFT', 'DRAFT')).not.toThrow()
    expect(() => assertBriefTransition('DRAFT', 'COMPLETED')).toThrow(
      /Invalid ProductBrief transition/,
    )
  })
})

describe('brief-fsm — BriefInterest lifecycle', () => {
  it('maker raises a hand, gets starred, gets selected', () => {
    expect(isInterestTransitionAllowed('SUBMITTED', 'SHORTLISTED')).toBe(true)
    expect(isInterestTransitionAllowed('SHORTLISTED', 'SELECTED')).toBe(true)
  })

  it('select without starring first is legal (prototype: "Select & start" on any card)', () => {
    expect(isInterestTransitionAllowed('SUBMITTED', 'SELECTED')).toBe(true)
  })

  it('un-star returns SHORTLISTED → SUBMITTED', () => {
    expect(isInterestTransitionAllowed('SHORTLISTED', 'SUBMITTED')).toBe(true)
  })

  it('losing makers are passed; maker can withdraw until selected-terminal', () => {
    expect(isInterestTransitionAllowed('SUBMITTED', 'PASSED')).toBe(true)
    expect(isInterestTransitionAllowed('SHORTLISTED', 'PASSED')).toBe(true)
    expect(isInterestTransitionAllowed('SUBMITTED', 'WITHDRAWN')).toBe(true)
    expect(isInterestTransitionAllowed('SELECTED', 'WITHDRAWN')).toBe(true)
  })

  it('D-CC3 switch-maker edges exist structurally — call site must gate', () => {
    expect(isInterestTransitionAllowed('SELECTED', 'PASSED')).toBe(true)
    expect(isInterestTransitionAllowed('PASSED', 'SHORTLISTED')).toBe(true)
  })

  it('WITHDRAWN is terminal; assert throws on illegal jumps', () => {
    expect(INTEREST_ALLOWED_TRANSITIONS.WITHDRAWN).toEqual([])
    expect(() => assertInterestTransition('WITHDRAWN', 'SUBMITTED')).toThrow(
      /Invalid BriefInterest transition/,
    )
    expect(() => assertInterestTransition('SUBMITTED', 'SUBMITTED')).not.toThrow()
  })
})
