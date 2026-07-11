import { describe, it, expect } from 'vitest'
import { checkRoomLabelReadiness, type RoomLabelLike } from './room-compliance'

function label(over: Partial<RoomLabelLike> = {}): RoomLabelLike {
  return {
    domain: 'FOOD',
    coverage: { resolved: 4, total: 4, unresolvedNames: [] },
    serving: { sizeG: 355, perContainer: 1, netQuantity: { kind: 'liquid', milliliters: 355 } },
    panel: { format: 'STANDARD' },
    statement: 'Water, Sugar.',
    containsLine: 'milk',
    containsIncomplete: false,
    inciText: null,
    petOrder: null,
    otherIngredients: null,
    petGa: null,
    drugFacts: null,
    ...over,
  }
}

describe('checkRoomLabelReadiness — food/beverage', () => {
  it('complete food label is READY', () => {
    const r = checkRoomLabelReadiness(label())
    expect(r.outcome).toBe('READY')
    expect(r.items).toHaveLength(0)
  })

  it('unresolved ingredients warn; pending Contains BLOCKS (FALCPA safety gate)', () => {
    const r = checkRoomLabelReadiness(
      label({
        coverage: { resolved: 2, total: 4, unresolvedNames: ['a', 'b'] },
        containsLine: null,
        containsIncomplete: true,
      }),
    )
    expect(r.outcome).toBe('NOT_READY')
    expect(r.items.find((i) => i.id === 'coverage')?.severity).toBe('WARNING')
    expect(r.items.find((i) => i.id === 'falcpa')?.severity).toBe('BLOCKING')
  })

  it('missing panel / statement / net quantity all block', () => {
    const r = checkRoomLabelReadiness(
      label({ panel: null, statement: null, serving: { sizeG: null, perContainer: null, netQuantity: null } }),
    )
    const ids = r.items.filter((i) => i.severity === 'BLOCKING').map((i) => i.id)
    expect(ids).toContain('panel')
    expect(ids).toContain('statement')
    expect(ids).toContain('netqty')
  })
})

describe('checkRoomLabelReadiness — other domains', () => {
  it('supplement without structured formulation blocks; missing net qty only warns', () => {
    const r = checkRoomLabelReadiness(
      label({
        domain: 'SUPPLEMENT',
        panel: null,
        statement: null,
        containsIncomplete: false,
        serving: { sizeG: null, perContainer: null, netQuantity: null },
      }),
    )
    expect(r.outcome).toBe('NOT_READY')
    expect(r.items.find((i) => i.id === 'panel')?.severity).toBe('BLOCKING')
    expect(r.items.find((i) => i.id === 'netqty')?.severity).toBe('WARNING')
  })

  it('cosmetic requires INCI', () => {
    const r = checkRoomLabelReadiness(label({ domain: 'COSMETIC', inciText: null, panel: null, statement: null }))
    expect(r.items.find((i) => i.id === 'inci')?.severity).toBe('BLOCKING')
  })

  it('pet requires GA rows; adequacy + feeding are warnings', () => {
    const missing = checkRoomLabelReadiness(
      label({ domain: 'PET', petOrder: ['Chicken'], petGa: null, panel: null, statement: null }),
    )
    expect(missing.items.find((i) => i.id === 'ga')?.severity).toBe('BLOCKING')

    const partial = checkRoomLabelReadiness(
      label({
        domain: 'PET',
        petOrder: ['Chicken'],
        petGa: { rows: [{ label: 'Crude Protein (min)', value: '26%' }], adequacyStatement: null, feedingDirections: null },
        panel: null,
        statement: null,
      }),
    )
    expect(partial.outcome).toBe('READY_WITH_WARNINGS')
    expect(partial.items.map((i) => i.id).sort()).toEqual(['adequacy', 'feeding'])
  })

  it('OTC: no drug facts blocks; empty directions block; thin sections warn', () => {
    const none = checkRoomLabelReadiness(label({ domain: 'OTC', drugFacts: null, panel: null, statement: null }))
    expect(none.items.find((i) => i.id === 'drugfacts')?.severity).toBe('BLOCKING')

    const thin = checkRoomLabelReadiness(
      label({
        domain: 'OTC',
        panel: null,
        statement: null,
        drugFacts: {
          activeIngredients: [{ name: 'Acetaminophen 500 mg', purpose: 'Pain reliever' }],
          uses: [],
          warnings: [],
          directions: '',
          inactiveIngredients: '',
        },
      }),
    )
    expect(thin.outcome).toBe('NOT_READY')
    expect(thin.items.find((i) => i.id === 'directions')?.severity).toBe('BLOCKING')
    expect(thin.items.filter((i) => i.severity === 'WARNING').map((i) => i.id).sort()).toEqual([
      'inactive',
      'uses',
      'warnings',
    ])
  })
})
