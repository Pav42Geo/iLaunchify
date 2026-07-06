import { describe, expect, it } from 'vitest'
import {
  MAX_REROUTES,
  resolveMaxReroutes,
  rerouteBudgetRemaining,
  canReroute,
} from './dispatch-fsm'

describe('resolveMaxReroutes — settings-driven cap', () => {
  it('uses the configured value when valid', () => {
    expect(resolveMaxReroutes(5)).toBe(5)
    expect(resolveMaxReroutes(0)).toBe(0)
  })
  it('falls back to MAX_REROUTES when unset or invalid', () => {
    expect(resolveMaxReroutes(null)).toBe(MAX_REROUTES)
    expect(resolveMaxReroutes(undefined)).toBe(MAX_REROUTES)
    expect(resolveMaxReroutes(-1)).toBe(MAX_REROUTES)
    expect(resolveMaxReroutes(Number.NaN)).toBe(MAX_REROUTES)
  })
  it('floors fractional configured values', () => {
    expect(resolveMaxReroutes(4.9)).toBe(4)
  })
})

describe('rerouteBudgetRemaining + canReroute', () => {
  it('counts down from the configured cap', () => {
    expect(rerouteBudgetRemaining(0, 3)).toBe(3)
    expect(rerouteBudgetRemaining(1, 3)).toBe(2)
    expect(rerouteBudgetRemaining(3, 3)).toBe(0)
  })
  it('never goes negative past the cap', () => {
    expect(rerouteBudgetRemaining(9, 3)).toBe(0)
  })
  it('canReroute gates on remaining budget', () => {
    expect(canReroute(2, 3)).toBe(true)
    expect(canReroute(3, 3)).toBe(false)
    expect(canReroute(4, 3)).toBe(false)
  })
  it('a zero cap forbids all reroutes', () => {
    expect(rerouteBudgetRemaining(0, 0)).toBe(0)
    expect(canReroute(0, 0)).toBe(false)
  })
  it('unset cap uses the default of 3', () => {
    expect(rerouteBudgetRemaining(0, null)).toBe(MAX_REROUTES)
    expect(canReroute(MAX_REROUTES - 1, undefined)).toBe(true)
    expect(canReroute(MAX_REROUTES, undefined)).toBe(false)
  })
})
