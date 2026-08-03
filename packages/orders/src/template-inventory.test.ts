// Golden checks for the manufacturer template-inventory math
// (docs/MANUFACTURER_INVENTORY_2026-07-27.md sections 3/4/4b/5).
import { describe, expect, it } from 'vitest'
import {
  BASE_FLAVOR_KEY,
  applyTemplateLedgerEntry,
  consumptionFromPack,
  consumptionFromUnits,
  isConfigOrderable,
  isTemplateSellable,
  maxOrderableQty,
  mergeNeeds,
  replayTemplateLedger,
  sellableFlavorIds,
  shouldNotifyTemplateAlert,
  templateAlertState,
  validateOrderQty,
  type FlavorStockRow,
} from './template-inventory'

const rows = (...r: Array<[string, number] | [string, number, boolean]>): FlavorStockRow[] =>
  r.map(([flavorPresetId, quantityAvailable, tracked]) => ({
    flavorPresetId,
    quantityAvailable,
    tracked: tracked ?? true,
  }))

describe('ledger invariants', () => {
  it('restock adds, consumed subtracts with negative delta', () => {
    const up = applyTemplateLedgerEntry(0, 'RESTOCK', 100)
    expect(up).toEqual({ ok: true, nextAvailable: 100, delta: 100 })
    const down = applyTemplateLedgerEntry(100, 'ORDER_CONSUMED', 40)
    expect(down).toEqual({ ok: true, nextAvailable: 60, delta: -40 })
  })

  it('OVERSELL IMPOSSIBLE: consuming past available is rejected, never clamped', () => {
    const r = applyTemplateLedgerEntry(300, 'ORDER_CONSUMED', 500)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('300 available, 500 requested')
  })

  it('reversal restores, adjustment is signed and floored at zero', () => {
    expect(applyTemplateLedgerEntry(10, 'ORDER_REVERSED', 5)).toEqual({ ok: true, nextAvailable: 15, delta: 5 })
    expect(applyTemplateLedgerEntry(10, 'ADJUSTMENT', -4)).toEqual({ ok: true, nextAvailable: 6, delta: -4 })
    expect(applyTemplateLedgerEntry(10, 'ADJUSTMENT', -11).ok).toBe(false)
  })

  it('rejects zero, negative (non-adjustment) and fractional quantities', () => {
    expect(applyTemplateLedgerEntry(10, 'RESTOCK', 0).ok).toBe(false)
    expect(applyTemplateLedgerEntry(10, 'ORDER_CONSUMED', -5).ok).toBe(false)
    expect(applyTemplateLedgerEntry(10, 'RESTOCK', 1.5).ok).toBe(false)
  })

  it('replay derives final state and reports the violating entry', () => {
    const { available, violations } = replayTemplateLedger([
      { kind: 'RESTOCK', quantity: 50 },
      { kind: 'ORDER_CONSUMED', quantity: 20 },
      { kind: 'ORDER_CONSUMED', quantity: 40 }, // violates: only 30 left
      { kind: 'ORDER_REVERSED', quantity: 5 },
      { kind: 'ADJUSTMENT', quantity: -5 },
    ])
    expect(available).toBe(30)
    expect(violations).toEqual([{ index: 2, reason: expect.stringContaining('30 available') }])
  })
})

describe('per-flavor consumption (the ONE split)', () => {
  it('pack order = merged slots x packCount', () => {
    expect(
      consumptionFromPack(
        [
          { flavorPresetId: 'choc', units: 6 },
          { flavorPresetId: 'van', units: 4 },
          { flavorPresetId: 'choc', units: 2 }, // duplicate slot merges
        ],
        10,
      ),
    ).toEqual([
      { flavorPresetId: 'choc', units: 80 },
      { flavorPresetId: 'van', units: 40 },
    ])
  })

  it('simple order maps to the base sentinel; zero/empty drop out', () => {
    expect(consumptionFromUnits(500)).toEqual([{ flavorPresetId: BASE_FLAVOR_KEY, units: 500 }])
    expect(consumptionFromUnits(0)).toEqual([])
    expect(consumptionFromPack([{ flavorPresetId: 'choc', units: 5 }], 0)).toEqual([])
    expect(mergeNeeds([{ flavorPresetId: 'x', units: 0 }])).toEqual([])
  })
})

describe('section 4b quantity ceiling', () => {
  const stock = rows(['choc', 300], ['van', 1000])

  it('the scarcest flavor binds: 300 choc / 5 per pack = 60 packs', () => {
    const perPack = [
      { flavorPresetId: 'choc', units: 5 },
      { flavorPresetId: 'van', units: 5 },
    ]
    expect(maxOrderableQty(stock, perPack)).toBe(60)
  })

  it('creator cannot order more than available (300 left, 500 requested)', () => {
    const perUnit = [{ flavorPresetId: 'choc', units: 1 }]
    const v = validateOrderQty(stock, perUnit, 500)
    expect(v).toEqual({ ok: false, maxOrderable: 300, reason: 'Only 300 available.' })
    expect(validateOrderQty(stock, perUnit, 300)).toEqual({ ok: true })
  })

  it('untracked flavors never bind; fully untracked = Infinity', () => {
    const mixed = rows(['choc', 300], ['van', 0, false])
    expect(
      maxOrderableQty(mixed, [
        { flavorPresetId: 'choc', units: 5 },
        { flavorPresetId: 'van', units: 5 },
        { flavorPresetId: 'straw', units: 5 }, // no row at all = untracked
      ]),
    ).toBe(60)
    expect(maxOrderableQty([], [{ flavorPresetId: 'choc', units: 5 }])).toBe(Number.POSITIVE_INFINITY)
    expect(validateOrderQty([], [{ flavorPresetId: 'choc', units: 1 }], 1_000_000)).toEqual({ ok: true })
  })

  it('exhausted flavor = ceiling 0; junk quantities rejected', () => {
    expect(maxOrderableQty(rows(['choc', 0]), [{ flavorPresetId: 'choc', units: 1 }])).toBe(0)
    expect(validateOrderQty(stock, [{ flavorPresetId: 'choc', units: 1 }], 0).ok).toBe(false)
    expect(validateOrderQty(stock, [{ flavorPresetId: 'choc', units: 1 }], 2.5).ok).toBe(false)
  })

  it('MOQ edge: 400 left with MOQ 5000 is UNORDERABLE despite stock > 0', () => {
    const s = rows(['choc', 400])
    const perUnit = [{ flavorPresetId: 'choc', units: 1 }]
    expect(isConfigOrderable(s, perUnit, 5000)).toBe(false)
    expect(isConfigOrderable(s, perUnit, 400)).toBe(true)
    expect(isConfigOrderable(s, perUnit, null)).toBe(true)
  })
})

describe('alert state machine', () => {
  it('bands: stockout at 0, low at/below threshold, healthy above; null threshold has no LOW', () => {
    expect(templateAlertState(0, 100)).toBe('STOCKOUT')
    expect(templateAlertState(100, 100)).toBe('LOW')
    expect(templateAlertState(101, 100)).toBe('HEALTHY')
    expect(templateAlertState(1, null)).toBe('HEALTHY')
  })

  it('notifies on escalation and single recovery, never lateral/downgrade-to-LOW', () => {
    expect(shouldNotifyTemplateAlert('HEALTHY', 'LOW')).toBe(true)
    expect(shouldNotifyTemplateAlert('LOW', 'STOCKOUT')).toBe(true)
    expect(shouldNotifyTemplateAlert('STOCKOUT', 'HEALTHY')).toBe(true)
    expect(shouldNotifyTemplateAlert('STOCKOUT', 'LOW')).toBe(false)
    expect(shouldNotifyTemplateAlert('LOW', 'LOW')).toBe(false)
  })
})

describe('template sellability (inventorySoldOut orderability test)', () => {
  it('untracked template is always sellable', () => {
    expect(isTemplateSellable({ activeFlavorIds: ['a', 'b'], rows: [] })).toBe(true)
    expect(isTemplateSellable({ activeFlavorIds: ['a'], rows: rows(['a', 0, false]) })).toBe(true)
  })

  it('sellable flavors respect per-flavor minimum viable order (MOQ share)', () => {
    const input = {
      activeFlavorIds: ['a', 'b'],
      rows: rows(['a', 400], ['b', 50]),
      minOrderUnitsByFlavor: new Map([
        ['a', 500], // 400 < 500: not sellable despite stock
        ['b', 50],
      ]),
    }
    expect(sellableFlavorIds(input)).toEqual(['b'])
  })

  it('minFlavorsPerPack floor: variety pack dies when in-stock flavors drop below it', () => {
    const base = { activeFlavorIds: ['a', 'b', 'c'], minFlavorsPerPack: 2 }
    expect(isTemplateSellable({ ...base, rows: rows(['a', 10], ['b', 10], ['c', 0]) })).toBe(true)
    expect(isTemplateSellable({ ...base, rows: rows(['a', 10], ['b', 0], ['c', 0]) })).toBe(false)
    // single-flavor template: plain exhaustion
    expect(isTemplateSellable({ activeFlavorIds: [BASE_FLAVOR_KEY], rows: rows([BASE_FLAVOR_KEY, 0]) })).toBe(false)
  })
})
