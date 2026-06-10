import { describe, it, expect } from 'vitest'
import { composeQuote, type QuoteInput } from './quote'

const base: QuoteInput = {
  quantity: 5000,
  baseTierUnitCostCents: 200,
  variantMoqMin: 1000,
  orderIncrement: null,
  firstRun: true,
  leadTimeFirstRunDays: 45,
  leadTimeRepeatDays: 21,
  selected: [],
  fees: [],
  excludeViolation: null,
}

describe('composeQuote (§9)', () => {
  it('composes the base SKU', () => {
    const r = composeQuote(base)
    expect(r.unitCostCents).toBe(200)
    expect(r.leadTimeDays).toBe(45) // first run
    expect(r.moq).toBe(1000)
    expect(r.subtotalCents).toBe(200 * 5000)
    expect(r.valid).toBe(true)
  })

  it('stacks value deltas + fees and flags below-MOQ', () => {
    const r = composeQuote({
      ...base,
      quantity: 5000,
      selected: [{ unitCostDeltaCents: 50, leadTimeDeltaDays: 7, moqOverride: 8000, priceDeltaCents: 25 }],
      fees: [
        { label: 'QA', basis: 'PER_SKU_ONE_TIME', amountCents: 50000, waivedAboveQty: 12500 },
        { label: 'ship', basis: 'PER_UNIT', amountCents: 5, waivedAboveQty: null },
      ],
    })
    expect(r.unitCostCents).toBe(250)
    expect(r.leadTimeDays).toBe(52)
    expect(r.moq).toBe(8000)
    expect(r.oneTimeFeesCents).toBe(50000)
    expect(r.perUnitFeesCents).toBe(25000)
    expect(r.subtotalCents).toBe(250 * 5000 + 50000 + 25000)
    expect(r.valid).toBe(false) // 5000 < 8000
    expect(r.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['below-moq', 'surcharge', 'lead', 'moq-raise']),
    )
  })

  it('waives one-time fee at/above the threshold', () => {
    const r = composeQuote({
      ...base,
      quantity: 15000,
      selected: [{ unitCostDeltaCents: 0, leadTimeDeltaDays: 0, moqOverride: 8000, priceDeltaCents: 0 }],
      fees: [{ label: 'QA', basis: 'PER_SKU_ONE_TIME', amountCents: 50000, waivedAboveQty: 12500 }],
    })
    expect(r.oneTimeFeesCents).toBe(0)
    expect(r.valid).toBe(true)
  })

  it('blocks on order increment violation', () => {
    const r = composeQuote({ ...base, quantity: 1100, orderIncrement: 250 })
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.kind === 'increment')).toBe(true)
  })

  it('blocks on EXCLUDE rule violation', () => {
    const r = composeQuote({
      ...base,
      excludeViolation: { whenLabel: 'Stevia', targetLabel: 'Cork stopper' },
    })
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.kind === 'incompatible')).toBe(true)
  })
})
