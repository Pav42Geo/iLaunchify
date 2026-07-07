import { describe, expect, it } from 'vitest'
import {
  canTransitionAppeal,
  assertAppealTransition,
  isOpenAppeal,
  outcomeChangesAggregate,
  standingFrozen,
  appealDeadlines,
  appealSlaState,
  DEFAULT_APPEAL_SLA,
} from './rating-appeal'

describe('rating appeal FSM', () => {
  it('allows submit → review/outcomes, forbids resurrecting a resolved appeal', () => {
    expect(canTransitionAppeal('SUBMITTED', 'UNDER_REVIEW')).toBe(true)
    expect(canTransitionAppeal('SUBMITTED', 'EXCLUDED')).toBe(true)
    expect(canTransitionAppeal('UNDER_REVIEW', 'UPHELD')).toBe(true)
    expect(canTransitionAppeal('UPHELD', 'UNDER_REVIEW')).toBe(false)
    expect(canTransitionAppeal('EXCLUDED', 'UPHELD')).toBe(false)
    expect(() => assertAppealTransition('WITHDRAWN', 'UNDER_REVIEW')).toThrow(/Invalid appeal transition/)
  })

  it('open vs aggregate-changing classification', () => {
    expect(isOpenAppeal('SUBMITTED')).toBe(true)
    expect(isOpenAppeal('UNDER_REVIEW')).toBe(true)
    expect(isOpenAppeal('UPHELD')).toBe(false)
    expect(outcomeChangesAggregate('EXCLUDED')).toBe(true)
    expect(outcomeChangesAggregate('REATTRIBUTED')).toBe(true)
    expect(outcomeChangesAggregate('UPHELD')).toBe(false)
  })
})

describe('standing freeze', () => {
  it('freezes while any appeal is open, releases once all resolved', () => {
    expect(standingFrozen([{ status: 'UPHELD' }, { status: 'SUBMITTED' }])).toBe(true)
    expect(standingFrozen([{ status: 'UPHELD' }, { status: 'EXCLUDED' }])).toBe(false)
    expect(standingFrozen([])).toBe(false)
  })
})

describe('appeal SLA', () => {
  const created = new Date('2026-07-01T00:00:00Z')
  const at = (d: number) => new Date(created.getTime() + d * 86_400_000)

  it('deadlines follow the policy', () => {
    const { ackBy, resolveBy } = appealDeadlines(created, DEFAULT_APPEAL_SLA)
    expect(ackBy).toEqual(at(2))
    expect(resolveBy).toEqual(at(7))
  })

  it('escalates ack then resolve; resolved appeals are on-time', () => {
    expect(appealSlaState(at(1), created, null, 'SUBMITTED')).toBe('ON_TIME')
    expect(appealSlaState(at(3), created, null, 'SUBMITTED')).toBe('ACK_OVERDUE')
    expect(appealSlaState(at(3), created, at(1), 'UNDER_REVIEW')).toBe('ON_TIME') // acked in time
    expect(appealSlaState(at(8), created, at(1), 'UNDER_REVIEW')).toBe('RESOLVE_OVERDUE')
    expect(appealSlaState(at(99), created, null, 'UPHELD')).toBe('ON_TIME') // resolved
  })
})
