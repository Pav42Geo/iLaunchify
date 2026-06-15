import { describe, it, expect } from 'vitest'
import { isOrderStale } from './auto-cancel'

describe('isOrderStale', () => {
  const now = new Date('2026-06-14T12:00:00Z')

  it('is stale once the unpaid age reaches the window exactly', () => {
    const created = new Date('2026-06-11T12:00:00Z') // exactly 72h earlier
    expect(isOrderStale(created, now, 72)).toBe(true)
  })

  it('is stale when older than the window', () => {
    const created = new Date('2026-06-10T12:00:00Z') // 96h earlier
    expect(isOrderStale(created, now, 72)).toBe(true)
  })

  it('is NOT stale when younger than the window', () => {
    const created = new Date('2026-06-13T12:00:00Z') // 24h earlier
    expect(isOrderStale(created, now, 72)).toBe(false)
  })

  it('respects a tightened window', () => {
    const created = new Date('2026-06-14T06:00:00Z') // 6h earlier
    expect(isOrderStale(created, now, 4)).toBe(true)
    expect(isOrderStale(created, now, 8)).toBe(false)
  })

  it('treats a freshly created order as not stale', () => {
    expect(isOrderStale(now, now, 72)).toBe(false)
  })
})
