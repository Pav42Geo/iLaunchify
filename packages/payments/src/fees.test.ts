// Unit tests for the platform application-fee math (fees.ts).
//
// This is LIVE money: the fee Stripe Connect deducts as the platform's cut on
// every order. The floor exists so micro-orders don't lose money to Stripe's
// per-transaction fee. These pin the rate, the floor, the rounding direction,
// and override behavior (OrderSettings.productionFeeBps passes a custom rateBp).

import { describe, it, expect } from 'vitest'
import {
  computeApplicationFee,
  APPLICATION_FEE_RATE_BP,
  APPLICATION_FEE_FLOOR_CENTS,
} from './fees'

describe('computeApplicationFee', () => {
  it('applies the 15% default rate above the floor', () => {
    expect(computeApplicationFee({ subtotalCents: 10_000 })).toBe(1_500) // $100 → $15
    expect(computeApplicationFee({ subtotalCents: 5_000 })).toBe(750)
  })

  it('enforces the $1 floor on micro-orders', () => {
    // 15% of $5.00 = $0.75, below the $1.00 floor → floor wins.
    expect(computeApplicationFee({ subtotalCents: 500 })).toBe(APPLICATION_FEE_FLOOR_CENTS)
    // Zero subtotal still returns the floor (never negative / never zero by default).
    expect(computeApplicationFee({ subtotalCents: 0 })).toBe(APPLICATION_FEE_FLOOR_CENTS)
  })

  it('crosses the floor boundary correctly', () => {
    // 15% == 100c exactly at subtotal 667 (100.05 → floor 100), and 668 → 100.2 → 100.
    // First subtotal whose computed fee strictly exceeds the floor:
    // floor 100 needs fee >= 101 → subtotalCents * 1500 / 10000 >= 101 → >= 674 (101.1).
    expect(computeApplicationFee({ subtotalCents: 673 })).toBe(100) // 100.95 → floor
    expect(computeApplicationFee({ subtotalCents: 674 })).toBe(101) // 101.1 → 101
  })

  it('rounds the fee DOWN (Math.floor — never over-charges)', () => {
    // 1001 * 1500 / 10000 = 150.15 → 150, not 151.
    expect(computeApplicationFee({ subtotalCents: 1_001 })).toBe(150)
    // 6_667 * 1500 / 10000 = 1000.05 → 1000.
    expect(computeApplicationFee({ subtotalCents: 6_667 })).toBe(1_000)
  })

  it('honors a custom rate (OrderSettings.productionFeeBps override)', () => {
    expect(computeApplicationFee({ subtotalCents: 10_000, rateBp: 2_000 })).toBe(2_000) // 20%
    expect(computeApplicationFee({ subtotalCents: 10_000, rateBp: 1_000 })).toBe(1_000) // 10%
    // A 0% rate still floors to the default floor.
    expect(computeApplicationFee({ subtotalCents: 10_000, rateBp: 0 })).toBe(APPLICATION_FEE_FLOOR_CENTS)
  })

  it('honors a custom floor (e.g. 0 to allow zero-fee promos)', () => {
    expect(computeApplicationFee({ subtotalCents: 500, floorCents: 0 })).toBe(75) // 15% of $5 with no floor
    expect(computeApplicationFee({ subtotalCents: 0, floorCents: 0 })).toBe(0)
  })

  it('scales linearly for large orders', () => {
    // $10,000 order → $1,500 fee at 15%.
    expect(computeApplicationFee({ subtotalCents: 1_000_000 })).toBe(150_000)
  })

  it('exposes sane defaults', () => {
    expect(APPLICATION_FEE_RATE_BP).toBe(1_500)
    expect(APPLICATION_FEE_FLOOR_CENTS).toBe(100)
  })
})
