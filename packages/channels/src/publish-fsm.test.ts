import { describe, it, expect } from 'vitest'
import {
  PUBLISH_STATES,
  PUBLISH_TRIGGERS,
  canPublishTransition,
  isAwaitingRelease,
  isLive,
  evaluatePublishRelease,
  type PublishState,
} from './publish-fsm'

describe('publish transitions', () => {
  it('exposes the 7 states and 3 triggers', () => {
    expect(PUBLISH_STATES).toHaveLength(7)
    expect(PUBLISH_TRIGGERS).toEqual(['MANUAL', 'SCHEDULED_AT', 'ON_ORDER_DELIVERED'])
  })

  it('allows the core happy path DRAFT→PUSHED→LIVE', () => {
    expect(canPublishTransition('DRAFT', 'PUSHED')).toBe(true)
    expect(canPublishTransition('PUSHED', 'LIVE')).toBe(true)
  })

  it('supports hold + schedule arming from DRAFT', () => {
    expect(canPublishTransition('DRAFT', 'HELD')).toBe(true)
    expect(canPublishTransition('DRAFT', 'SCHEDULED')).toBe(true)
    expect(canPublishTransition('HELD', 'PUSHED')).toBe(true)
    expect(canPublishTransition('SCHEDULED', 'PUSHED')).toBe(true)
  })

  it('treats unpublish (LIVE→PAUSED) and republish (PAUSED→LIVE) as first-class', () => {
    expect(canPublishTransition('LIVE', 'PAUSED')).toBe(true)
    expect(canPublishTransition('PAUSED', 'LIVE')).toBe(true)
  })

  it('rejects illegal jumps', () => {
    expect(canPublishTransition('DRAFT', 'LIVE')).toBe(false) // must PUSH first
    expect(canPublishTransition('LIVE', 'DRAFT')).toBe(false)
    expect(canPublishTransition('HELD', 'LIVE')).toBe(false)
  })

  it('every state has a transition entry (no orphans)', () => {
    for (const s of PUBLISH_STATES) {
      expect(canPublishTransition(s, s)).toBe(false) // no self-loops defined
    }
  })
})

describe('state predicates', () => {
  it('flags awaiting-release states', () => {
    expect(isAwaitingRelease('HELD')).toBe(true)
    expect(isAwaitingRelease('SCHEDULED')).toBe(true)
    expect(isAwaitingRelease('DRAFT')).toBe(false)
  })
  it('flags live', () => {
    expect(isLive('LIVE')).toBe(true)
    expect(isLive('PAUSED')).toBe(false)
  })
})

describe('evaluatePublishRelease', () => {
  const now = new Date('2026-07-03T12:00:00Z')

  it('never auto-releases MANUAL holds', () => {
    const v = evaluatePublishRelease({ state: 'HELD', trigger: 'MANUAL', now })
    expect(v.release).toBe(false)
  })

  it('releases SCHEDULED_AT once now >= publishAt', () => {
    const due = evaluatePublishRelease({ state: 'SCHEDULED', trigger: 'SCHEDULED_AT', publishAt: new Date('2026-07-03T11:00:00Z'), now })
    expect(due).toEqual({ release: true, to: 'PUSHED' })
    const notYet = evaluatePublishRelease({ state: 'SCHEDULED', trigger: 'SCHEDULED_AT', publishAt: new Date('2026-07-04T00:00:00Z'), now })
    expect(notYet.release).toBe(false)
  })

  it('SCHEDULED_AT without a time does not release', () => {
    expect(evaluatePublishRelease({ state: 'SCHEDULED', trigger: 'SCHEDULED_AT', publishAt: null, now }).release).toBe(false)
  })

  it('releases ON_ORDER_DELIVERED only when the linked order is delivered', () => {
    expect(evaluatePublishRelease({ state: 'HELD', trigger: 'ON_ORDER_DELIVERED', linkedOrderDelivered: true, now })).toEqual({ release: true, to: 'PUSHED' })
    expect(evaluatePublishRelease({ state: 'HELD', trigger: 'ON_ORDER_DELIVERED', linkedOrderDelivered: false, now }).release).toBe(false)
    expect(evaluatePublishRelease({ state: 'HELD', trigger: 'ON_ORDER_DELIVERED', now }).release).toBe(false)
  })

  it('does not release when the link is not awaiting release', () => {
    const s: PublishState = 'LIVE'
    expect(evaluatePublishRelease({ state: s, trigger: 'ON_ORDER_DELIVERED', linkedOrderDelivered: true, now }).release).toBe(false)
  })
})
