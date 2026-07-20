import { describe, it, expect } from 'vitest'
import {
  segmentPriceCents,
  selectPrintProcess,
  finishCents,
  evaluatePrintPrice,
  printCrossoverQty,
  type PriceCurveSegment,
} from './print-price'

// The prototype's two curves (print-service-builder-prototype.html Step 5):
// digital 100 @ $45.00 + $0.35/unit, max 20k; flexo 2,500 @ $3,300.00 + $0.08/unit, max 250k.
const DIGITAL: PriceCurveSegment = { printProcess: 'DIGITAL', baseQty: 100, basePriceCents: 4500, incrementQty: 1, incrementPriceCents: 35, maxQty: 20000 }
const FLEXO: PriceCurveSegment = { printProcess: 'FLEXO', baseQty: 2500, basePriceCents: 330000, incrementQty: 1, incrementPriceCents: 8, maxQty: 250000 }

describe('segmentPriceCents — piecewise-linear, feasible only', () => {
  it('digital @ 11,444 = $4,015.40', () => expect(segmentPriceCents(DIGITAL, 11444)).toBe(401540))
  it('flexo @ 11,444 = $4,015.52', () => expect(segmentPriceCents(FLEXO, 11444)).toBe(401552))
  it('below baseQty → null', () => expect(segmentPriceCents(DIGITAL, 50)).toBeNull())
  it('above maxQty → null', () => expect(segmentPriceCents(DIGITAL, 30000)).toBeNull())
  it('off the lattice → null', () => {
    const latticed: PriceCurveSegment = { printProcess: 'SCREEN', baseQty: 500, basePriceCents: 10000, incrementQty: 500, incrementPriceCents: 100, maxQty: 50000 }
    expect(segmentPriceCents(latticed, 750)).toBeNull() // (750-500) % 500 !== 0
    expect(segmentPriceCents(latticed, 1000)).toBe(10100) // on the lattice
  })
})

describe('selectPrintProcess — the crossover is EMERGENT from min(), never typed', () => {
  const curves = [DIGITAL, FLEXO]
  it('11,444 → digital still wins by $0.12', () => expect(selectPrintProcess(curves, 11444)?.segment.printProcess).toBe('DIGITAL'))
  it('11,445 → flexo takes over', () => expect(selectPrintProcess(curves, 11445)?.segment.printProcess).toBe('FLEXO'))
  it('200 → only digital is feasible', () => expect(selectPrintProcess(curves, 200)?.segment.printProcess).toBe('DIGITAL'))
  it('100,000 → only flexo (digital past its 20k ceiling)', () => expect(selectPrintProcess(curves, 100000)?.segment.printProcess).toBe('FLEXO'))
  it('50 → no feasible curve → null (route to a quote)', () => expect(selectPrintProcess(curves, 50)).toBeNull())
})

describe('printCrossoverQty — the number the builder shows, derived from the two curves', () => {
  it('digital vs flexo crosses at 11,444 (matches the trade-press break-even)', () => {
    expect(printCrossoverQty(DIGITAL, FLEXO)).toBe(11444)
  })
  it('parallel curves never cross → null', () => {
    expect(printCrossoverQty(DIGITAL, { ...DIGITAL, printProcess: 'D2', baseQty: 200 })).toBeNull()
  })
})

describe('finishCents — each pricing mode', () => {
  it('FLAT_PER_ORDER = setup only', () => expect(finishCents({ label: 'x', pricingMode: 'FLAT_PER_ORDER', basePriceCents: 5000 }, { qty: 1000 })).toBe(5000))
  it('PER_UNIT = setup + per-unit × qty', () => expect(finishCents({ label: 'x', pricingMode: 'PER_UNIT', basePriceCents: 2000, perUnitPriceCents: 10 }, { qty: 1000 })).toBe(12000))
  it('PER_COLOR = setup + per-color plates (per order)', () => expect(finishCents({ label: 'x', pricingMode: 'PER_COLOR', basePriceCents: 0, pricePerColorCents: 4000 }, { qty: 1000, colorCount: 3 })).toBe(12000))
})

describe('evaluatePrintPrice — the full quote', () => {
  it('11,444 units, no add-ons: digital, $4,015.40, not indicative, no floor', () => {
    const q = evaluatePrintPrice([DIGITAL, FLEXO], { qty: 11444 })
    expect(q?.processUsed).toBe('DIGITAL')
    expect(q?.subtotalCents).toBe(401540)
    expect(q?.lineItems).toHaveLength(1)
    expect(q?.quoteRequired).toBe(false)
    expect(q?.meetsOrderValueFloor).toBe(true)
  })
  it('adds finishes + die-cut + substrate lines onto the print line', () => {
    const q = evaluatePrintPrice([DIGITAL, FLEXO], {
      qty: 1000,
      finishes: [{ label: 'Spot UV', pricingMode: 'PER_UNIT', basePriceCents: 3000, perUnitPriceCents: 5 }],
      dieCutSurchargeCentsPerUnit: 2,
      substrateCentsPerUnit: 4,
    })
    // print: 4500 + 900×35 = 36000; finish: 3000 + 5×1000 = 8000; diecut 2×1000=2000; substrate 4×1000=4000.
    expect(q?.lineItems.map((l) => l.kind)).toEqual(['PRINT', 'FINISH', 'DIECUT', 'SUBSTRATE'])
    expect(q?.subtotalCents).toBe(36000 + 8000 + 2000 + 4000)
  })
  it('reports an order-value floor shortfall, never a silent exclusion', () => {
    const q = evaluatePrintPrice([DIGITAL, FLEXO], { qty: 200, minOrderValueCents: 500000 })
    expect(q?.meetsOrderValueFloor).toBe(false)
    expect(q?.orderValueShortfallCents).toBe(500000 - 8000) // digital @200 = $80
  })
  it('quoteRequired propagates from the winning segment', () => {
    const q = evaluatePrintPrice([{ ...DIGITAL, quoteRequired: true }], { qty: 1000 })
    expect(q?.quoteRequired).toBe(true)
  })
  it('no feasible curve → null (caller routes to RFQ)', () => {
    expect(evaluatePrintPrice([DIGITAL, FLEXO], { qty: 50 })).toBeNull()
  })
})
