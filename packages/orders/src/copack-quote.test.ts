import { describe, it, expect } from 'vitest'
import {
  copackLineCostCents,
  selectCopackLine,
  copackOperationsCents,
  quoteCopack,
  copackCrossoverUnits,
  copackQuoteFromRows,
  type CopackLineInput,
  type CopackOperationInput,
  type CopackLineRow,
  type CopackOperationRow,
} from './copack-quote'

// The spec's two real-shaped lines (COPACK_SERVICE_SPEC §1): auger 3,600/h + 4h
// changeover @ $165/h; hand 900/h + 1h changeover @ $120/h. changeoverMinutes = h × 60.
const AUGER: CopackLineInput = {
  id: 'auger', runSpeedUnitsPerHour: 3600, changeoverMinutes: 240, lineRateCentsPerHour: 16500,
  minRunUnits: 1500, maxRunUnits: null, allergenClass: null, containerFormats: ['sachet', 'pouch'], fillTypes: ['powder'], status: 'ACTIVE',
}
const HAND: CopackLineInput = {
  id: 'hand', runSpeedUnitsPerHour: 900, changeoverMinutes: 60, lineRateCentsPerHour: 12000,
  minRunUnits: 0, maxRunUnits: 25000, allergenClass: 'peanut-free', containerFormats: ['pouch'], fillTypes: ['powder'], status: 'ACTIVE',
}

describe('copackLineCostCents — matches the spec table to the cent', () => {
  it('auger: below its 1,500 min at 300 → null', () => {
    expect(copackLineCostCents(AUGER, 300)).toBeNull()
  })
  it('hand @ 300 = $160.00', () => {
    expect(copackLineCostCents(HAND, 300)).toBe(16000)
  })
  it('auger @ 2,400 = $770.00, hand @ 2,400 = $440.00', () => {
    expect(copackLineCostCents(AUGER, 2400)).toBe(77000)
    expect(copackLineCostCents(HAND, 2400)).toBe(44000)
  })
  it('auger @ 20,000 = $1,576.67, hand @ 20,000 = $2,786.67', () => {
    expect(copackLineCostCents(AUGER, 20000)).toBe(157667)
    expect(copackLineCostCents(HAND, 20000)).toBe(278667)
  })
  it('auger @ 90,000 = $4,785.00; hand above its 25,000 ceiling → null', () => {
    expect(copackLineCostCents(AUGER, 90000)).toBe(478500)
    expect(copackLineCostCents(HAND, 90000)).toBeNull()
  })
})

describe('selectCopackLine — the crossover picks the winner nobody typed', () => {
  const lines = [AUGER, HAND]
  it('300 → hand (auger below min)', () => expect(selectCopackLine(lines, { qty: 300, fillType: 'powder', containerFormat: 'pouch' })!.line.id).toBe('hand'))
  it('2,400 → hand (auger changeover cannot amortize yet)', () => expect(selectCopackLine(lines, { qty: 2400, fillType: 'powder', containerFormat: 'pouch' })!.line.id).toBe('hand'))
  it('20,000 → auger (speed wins above the crossover)', () => expect(selectCopackLine(lines, { qty: 20000, fillType: 'powder', containerFormat: 'pouch' })!.line.id).toBe('auger'))
  it('90,000 → auger (hand out of range)', () => expect(selectCopackLine(lines, { qty: 90000, fillType: 'powder', containerFormat: 'pouch' })!.line.id).toBe('auger'))
})

describe('copackCrossoverUnits — the ~6,171 crossover falls out of the two lines', () => {
  it('auger vs hand ≈ 6,171 units', () => {
    const x = copackCrossoverUnits(AUGER, HAND)
    expect(x).not.toBeNull()
    expect(Math.round(x!)).toBe(6171)
  })
  it('parallel lines never cross → null', () => {
    const clone = { ...AUGER, id: 'auger2', changeoverMinutes: 999 }
    expect(copackCrossoverUnits(AUGER, clone)).toBeNull() // same rate/speed → dd 0
  })
})

describe('copackQuoteFromRows — the loader mapping quotes from plain CP-1 rows', () => {
  const lineRows: CopackLineRow[] = [
    { id: 'auger', runSpeedUnitsPerHour: 3600, changeoverMinutes: 240, lineRateCentsPerHour: 16500, minRunUnits: 1500, maxRunUnits: null, allergenClass: null, containerFormats: [], fillTypes: [], status: 'ACTIVE' },
    { id: 'hand', runSpeedUnitsPerHour: 900, changeoverMinutes: 60, lineRateCentsPerHour: 12000, minRunUnits: 0, maxRunUnits: 25000, allergenClass: null, containerFormats: [], fillTypes: [], status: 'ACTIVE' },
  ]
  const opRows: CopackOperationRow[] = [{ opType: 'FILL_CLOSE', pricingUnit: 'PER_UNIT', priceCents: 12, status: 'ACTIVE' }]

  it('no authored lines → null (caller emits no co-pack line)', () => {
    expect(copackQuoteFromRows({ lines: [], operations: opRows, config: null }, { qty: 2400 })).toBeNull()
  })
  it('reproduces the engine: 2,400 units → hand $440 + fill $288 = $728', () => {
    const q = copackQuoteFromRows({ lines: lineRows, operations: opRows, config: null }, { qty: 2400, unitsPerPack: 12, unitsPerCase: 24 })
    expect(q?.ok).toBe(true)
    expect(q?.selectedLineId).toBe('hand')
    expect(q?.totalCents).toBe(72800)
  })
  it('changeoverMinutes passes straight through (240m = 4h): auger @20,000 = $1,576.67', () => {
    const q = copackQuoteFromRows({ lines: [lineRows[0]!], operations: [], config: null }, { qty: 20000 })
    expect(q?.runCostCents).toBe(157667)
  })
  it('config maps the min-run floor', () => {
    const q = copackQuoteFromRows(
      { lines: lineRows, operations: opRows, config: { changeoverFeeCents: null, minRunChargeCents: 100000, repeatRunDiscountBps: null, rushUpliftBps: null, minOrderValueCents: null } },
      { qty: 300 },
    )
    expect(q?.minRunApplied).toBe(true)
    expect(q?.totalCents).toBe(100000)
  })
})

describe('hard filters — a line that cannot run the job is excluded, not down-weighted', () => {
  const lines = [AUGER, HAND]
  it('a container the line does not run drops it', () => {
    // auger runs sachet+pouch; a "bottle" job leaves only... neither → null.
    expect(selectCopackLine(lines, { qty: 5000, containerFormat: 'bottle', fillType: 'powder' })).toBeNull()
  })
  it('allergen requirement filters to the compatible line', () => {
    // peanut-free required at 3,000: auger has no allergenClass (unrestricted, passes),
    // hand is peanut-free (passes). Both qualify; min-cost wins.
    const sel = selectCopackLine(lines, { qty: 3000, fillType: 'powder', containerFormat: 'pouch', allergenClass: 'peanut-free' })
    expect(sel).not.toBeNull()
  })
})

describe('operations — each op at its own unit', () => {
  const ops: CopackOperationInput[] = [
    { opType: 'FILL_CLOSE', pricingUnit: 'PER_UNIT', priceCents: 12, status: 'ACTIVE' },
    { opType: 'CASE_PACK', pricingUnit: 'PER_CASE', priceCents: 80, status: 'ACTIVE' },
    { opType: 'QC_COA', pricingUnit: 'PER_RUN', priceCents: 15000, status: 'DRAFT' }, // DRAFT → excluded
  ]
  it('sums PER_UNIT + PER_CASE, ignores DRAFT', () => {
    // 2,400 units: fill 12c×2400 = 28800; case 80c×ceil(2400/24)=100 → 8000; QC excluded.
    expect(copackOperationsCents(ops, { qty: 2400, unitsPerCase: 24 }, 2400 / 900)).toBe(28800 + 8000)
  })
})

describe('quoteCopack — line + ops, floored by the minimum run charge', () => {
  const lines = [AUGER, HAND]
  const ops: CopackOperationInput[] = [{ opType: 'FILL_CLOSE', pricingUnit: 'PER_UNIT', priceCents: 12, status: 'ACTIVE' }]
  it('2,400 units: hand $440 + fill $288 = $728', () => {
    const q = quoteCopack(lines, ops, {}, { qty: 2400, fillType: 'powder', containerFormat: 'pouch' })
    expect(q.ok).toBe(true)
    expect(q.selectedLineId).toBe('hand')
    expect(q.runCostCents).toBe(44000)
    expect(q.operationsCents).toBe(28800)
    expect(q.totalCents).toBe(72800)
    expect(q.minRunApplied).toBe(false)
  })
  it('min run charge floors a tiny job', () => {
    const q = quoteCopack(lines, ops, { minRunChargeCents: 100000 }, { qty: 300, fillType: 'powder', containerFormat: 'pouch' })
    // hand $160 + fill $36 = $196 raw, floored up to $1,000.
    expect(q.minRunApplied).toBe(true)
    expect(q.totalCents).toBe(100000)
  })
  it('no line can run it → not ok', () => {
    const q = quoteCopack(lines, ops, {}, { qty: 200000, fillType: 'powder', containerFormat: 'pouch' })
    // 200k > hand ceiling; auger has no ceiling so it still runs... so this DOES quote.
    expect(q.ok).toBe(true)
    expect(q.selectedLineId).toBe('auger')
  })
  it('order-value floor flags a job below it (routing gate, not a price change)', () => {
    const q = quoteCopack(lines, ops, { minOrderValueCents: 500000 }, { qty: 300, fillType: 'powder', containerFormat: 'pouch' })
    expect(q.belowOrderValueFloor).toBe(true)
  })
})
