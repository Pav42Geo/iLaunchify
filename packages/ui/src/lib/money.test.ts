// Pin-test for the canonical money formatter (M4). Locks the format + rounding so
// every call site that migrates to it renders identically.
import { describe, it, expect } from 'vitest'
import { formatCents, formatCentsOrDash } from './money'

describe('formatCents', () => {
  it('formats whole dollars with 2 decimals', () => {
    expect(formatCents(10000)).toBe('$100.00')
    expect(formatCents(500)).toBe('$5.00')
  })
  it('formats sub-dollar amounts', () => {
    expect(formatCents(12345)).toBe('$123.45')
    expect(formatCents(1)).toBe('$0.01')
    expect(formatCents(0)).toBe('$0.00')
  })
  it('groups thousands (en-US, pinned locale)', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(100000000)).toBe('$1,000,000.00')
    expect(formatCents(-123456)).toBe('$-1,234.56')
  })
})

describe('formatCentsOrDash', () => {
  it('renders null/undefined as an em-dash', () => {
    expect(formatCentsOrDash(null)).toBe('—')
    expect(formatCentsOrDash(undefined)).toBe('—')
  })
  it('formats a real amount like formatCents', () => {
    expect(formatCentsOrDash(2500)).toBe('$25.00')
  })
})
