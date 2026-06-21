import { describe, it, expect } from 'vitest'
import {
  canTransitionTicket,
  assertTicketTransition,
  TicketTransitionError,
  eventKindForTransition,
  isTerminalStatus,
  effectiveSlaWindow,
  isResponseSlaBreached,
  resolveResponseMinutes,
  SLA_DEFAULTS,
} from './ticket-fsm'

describe('ticket FSM transitions', () => {
  it('allows the canonical forward path', () => {
    expect(canTransitionTicket('NEW', 'TRIAGED')).toBe(true)
    expect(canTransitionTicket('TRIAGED', 'IN_PROGRESS')).toBe(true)
    expect(canTransitionTicket('IN_PROGRESS', 'WAITING_ON_REQUESTER')).toBe(true)
    expect(canTransitionTicket('WAITING_ON_REQUESTER', 'RESOLVED')).toBe(true)
    expect(canTransitionTicket('RESOLVED', 'CLOSED')).toBe(true)
  })

  it('allows reopen edges into IN_PROGRESS', () => {
    expect(canTransitionTicket('RESOLVED', 'IN_PROGRESS')).toBe(true)
    expect(canTransitionTicket('CLOSED', 'IN_PROGRESS')).toBe(true)
  })

  it('rejects self-transitions', () => {
    expect(canTransitionTicket('NEW', 'NEW')).toBe(false)
    expect(canTransitionTicket('CLOSED', 'CLOSED')).toBe(false)
  })

  it('rejects illegal jumps', () => {
    expect(canTransitionTicket('NEW', 'RESOLVED')).toBe(false)
    expect(canTransitionTicket('NEW', 'WAITING_ON_REQUESTER')).toBe(false)
    expect(canTransitionTicket('CLOSED', 'RESOLVED')).toBe(false)
    expect(canTransitionTicket('WAITING_ON_REQUESTER', 'NEW')).toBe(false)
  })

  it('assert throws on illegal, is silent on legal', () => {
    expect(() => assertTicketTransition('NEW', 'TRIAGED')).not.toThrow()
    expect(() => assertTicketTransition('NEW', 'RESOLVED')).toThrow(TicketTransitionError)
  })

  it('labels event kinds meaningfully', () => {
    expect(eventKindForTransition('IN_PROGRESS', 'RESOLVED')).toBe('RESOLVED')
    expect(eventKindForTransition('CLOSED', 'IN_PROGRESS')).toBe('REOPENED')
    expect(eventKindForTransition('RESOLVED', 'IN_PROGRESS')).toBe('REOPENED')
    expect(eventKindForTransition('NEW', 'TRIAGED')).toBe('STATUS_CHANGED')
  })

  it('CLOSED is the only terminal status', () => {
    expect(isTerminalStatus('CLOSED')).toBe(true)
    expect(isTerminalStatus('RESOLVED')).toBe(false)
  })
})

describe('SLA windows', () => {
  it('uses priority defaults when no override', () => {
    expect(effectiveSlaWindow('URGENT')).toEqual(SLA_DEFAULTS.URGENT)
    expect(effectiveSlaWindow('LOW')).toEqual({ responseMinutes: 1440, resolveMinutes: 7200 })
  })

  it('applies category overrides per-leg', () => {
    const w = effectiveSlaWindow('MEDIUM', { slaResponseMinutes: 30, slaResolveMinutes: null })
    expect(w.responseMinutes).toBe(30) // overridden
    expect(w.resolveMinutes).toBe(SLA_DEFAULTS.MEDIUM.resolveMinutes) // fell back
  })

  it('breaches when response window elapses on an open, un-responded ticket', () => {
    const createdAt = new Date('2026-06-20T00:00:00Z')
    const now = new Date('2026-06-20T02:00:00Z') // 2h later
    expect(
      isResponseSlaBreached({
        status: 'NEW',
        priority: 'URGENT', // 1h response window
        createdAt,
        firstResponseAt: null,
        now,
      }),
    ).toBe(true)
  })

  it('does not breach once first response is recorded', () => {
    const createdAt = new Date('2026-06-20T00:00:00Z')
    const now = new Date('2026-06-20T05:00:00Z')
    expect(
      isResponseSlaBreached({
        status: 'IN_PROGRESS',
        priority: 'URGENT',
        createdAt,
        firstResponseAt: new Date('2026-06-20T00:30:00Z'),
        now,
      }),
    ).toBe(false)
  })

  it('resolveResponseMinutes follows ticket → category → priority precedence', () => {
    expect(resolveResponseMinutes('HIGH', 30, 90)).toBe(30) // ticket override wins
    expect(resolveResponseMinutes('HIGH', null, 90)).toBe(90) // category override
    expect(resolveResponseMinutes('HIGH', null, null)).toBe(SLA_DEFAULTS.HIGH.responseMinutes)
    expect(resolveResponseMinutes('URGENT', undefined, undefined)).toBe(60)
  })

  it('does not breach a closed ticket', () => {
    const createdAt = new Date('2026-06-20T00:00:00Z')
    const now = new Date('2026-06-25T00:00:00Z')
    expect(
      isResponseSlaBreached({
        status: 'CLOSED',
        priority: 'URGENT',
        createdAt,
        firstResponseAt: null,
        now,
      }),
    ).toBe(false)
  })
})
