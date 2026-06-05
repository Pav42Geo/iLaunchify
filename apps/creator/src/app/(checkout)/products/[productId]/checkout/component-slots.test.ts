import { describe, it, expect } from 'vitest'
import { impliedComponentSlots, sealIsFdaMandatory } from './component-slots'

// Pure module (type-only @ilaunchify/db import erases) — runs without a DB.

const roles = (cat: Parameters<typeof impliedComponentSlots>[0], lt: Parameters<typeof impliedComponentSlots>[1]) =>
  impliedComponentSlots(cat, lt).map((s) => s.role)

describe('impliedComponentSlots — decision table', () => {
  it('JAR/FOOD → container + closure (no discrete seal)', () => {
    expect(roles('JAR', 'FOOD')).toEqual(['CONTAINER', 'CLOSURE'])
  })

  it('BOTTLE/FOOD → container + closure', () => {
    expect(roles('BOTTLE', 'FOOD')).toEqual(['CONTAINER', 'CLOSURE'])
  })

  it('JAR/DIETARY_SUPPLEMENT → adds a mandatory tamper-evident seal', () => {
    const slots = impliedComponentSlots('JAR', 'DIETARY_SUPPLEMENT')
    expect(slots.map((s) => s.role)).toEqual(['CONTAINER', 'CLOSURE', 'SEAL'])
    expect(slots.find((s) => s.role === 'SEAL')?.fdaMandatory).toBe(true)
  })

  it('CAN → container only (closure integral); OTC adds a seal', () => {
    expect(roles('CAN', 'FOOD')).toEqual(['CONTAINER'])
    expect(roles('CAN', 'OTC')).toEqual(['CONTAINER', 'SEAL'])
  })

  it('TUBE → container + closure', () => {
    expect(roles('TUBE', 'FOOD')).toEqual(['CONTAINER', 'CLOSURE'])
  })

  it('POUCH/SUPPLEMENT → container only (structurally sealed; no discrete seal)', () => {
    expect(roles('POUCH', 'DIETARY_SUPPLEMENT')).toEqual(['CONTAINER'])
  })

  it('STICK_PACK/OTC → container only (structurally sealed)', () => {
    expect(roles('STICK_PACK', 'OTC')).toEqual(['CONTAINER'])
  })

  it('BOX/FOOD → container only', () => {
    expect(roles('BOX', 'FOOD')).toEqual(['CONTAINER'])
  })

  it('every slot list starts with exactly one CONTAINER', () => {
    const slots = impliedComponentSlots('BOTTLE', 'DIETARY_SUPPLEMENT')
    expect(slots.filter((s) => s.role === 'CONTAINER')).toHaveLength(1)
    expect(slots[0]?.role).toBe('CONTAINER')
  })
})

describe('sealIsFdaMandatory', () => {
  it('true for supplement + OTC, false otherwise', () => {
    expect(sealIsFdaMandatory('DIETARY_SUPPLEMENT')).toBe(true)
    expect(sealIsFdaMandatory('OTC')).toBe(true)
    expect(sealIsFdaMandatory('FOOD')).toBe(false)
    expect(sealIsFdaMandatory('PET_PRODUCT')).toBe(false)
  })
})
