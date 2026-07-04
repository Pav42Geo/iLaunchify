import { describe, it, expect } from 'vitest'
import { buildParametricModel, decorableSurfaces } from './parametric-geometry'
import { PACKAGING_TOPOLOGIES } from './types'

describe('buildParametricModel — coverage', () => {
  it('handles every topology without throwing (given real dims)', () => {
    for (const t of PACKAGING_TOPOLOGIES) {
      const m = buildParametricModel(t, { widthMm: 60, heightMm: 120 })
      expect(m.surfaces.length).toBeGreaterThan(0)
      expect(m.dims.depthMm).toBeGreaterThan(0)
    }
  })

  it('rejects non-positive width/height', () => {
    expect(() => buildParametricModel('OTHER', { widthMm: 0, heightMm: 100 })).toThrow(/positive/)
    expect(() => buildParametricModel('OTHER', { widthMm: 50, heightMm: -1 })).toThrow(/positive/)
  })
})

describe('BOX topologies', () => {
  it('produces 6 real-size faces with correct dims', () => {
    const m = buildParametricModel('MULTI_CONTAINER_BOX', { widthMm: 100, heightMm: 200, depthMm: 40 })
    expect(m.primitive).toBe('BOX')
    expect(m.surfaces).toHaveLength(6)
    const front = m.surfaces.find((s) => s.key === 'front')!
    expect([front.widthMm, front.heightMm]).toEqual([100, 200])
    const left = m.surfaces.find((s) => s.key === 'left')!
    expect([left.widthMm, left.heightMm]).toEqual([40, 200]) // depth × height
    const top = m.surfaces.find((s) => s.key === 'top')!
    expect([top.widthMm, top.heightMm]).toEqual([100, 40]) // width × depth
  })

  it('marks the bottom non-decorable, everything else decorable', () => {
    const m = buildParametricModel('CASE', { widthMm: 100, heightMm: 100, depthMm: 100 })
    expect(m.surfaces.find((s) => s.key === 'bottom')!.decorable).toBe(false)
    expect(decorableSurfaces(m)).toHaveLength(5)
  })

  it('derives a depth when the die-line omits it', () => {
    const m = buildParametricModel('POUCH_STAND_UP', { widthMm: 150, heightMm: 220 })
    expect(m.primitive).toBe('BOX')
    expect(m.dims.depthMm).toBeCloseTo(60, 5) // 150 * 0.4
  })
})

describe('CYLINDER topologies', () => {
  it('wrap width equals the circumference and radius is half the diameter', () => {
    const m = buildParametricModel('SINGLE_CONTAINER', { widthMm: 66, heightMm: 120 })
    expect(m.primitive).toBe('CYLINDER')
    expect(m.radiusMm).toBe(33)
    const wrap = m.surfaces.find((s) => s.key === 'wrap')!
    expect(wrap.widthMm).toBeCloseTo(Math.PI * 66, 1)
    expect(wrap.heightMm).toBe(120)
    expect(wrap.decorable).toBe(true)
  })

  it('lidded topologies mark the top decorable as a LID', () => {
    const jar = buildParametricModel('CAPSULE_JAR', { widthMm: 70, heightMm: 90 })
    expect(jar.hasLid).toBe(true)
    const top = jar.surfaces.find((s) => s.key === 'top')!
    expect(top.role).toBe('LID')
    expect(top.decorable).toBe(true)
    // Non-lidded single container: top is a plain non-decorable cap.
    const can = buildParametricModel('SINGLE_CONTAINER', { widthMm: 66, heightMm: 120 })
    expect(can.surfaces.find((s) => s.key === 'top')!.decorable).toBe(false)
  })

  it('cylinder depth derives to the diameter', () => {
    const m = buildParametricModel('TUBE', { widthMm: 40, heightMm: 150 })
    expect(m.dims.depthMm).toBe(40)
  })
})

describe('PLANE topologies', () => {
  it('sachet/flat pouch/stick pack → front + back only', () => {
    for (const t of ['SACHET', 'POUCH_FLAT', 'STICK_PACK'] as const) {
      const m = buildParametricModel(t, { widthMm: 80, heightMm: 120 })
      expect(m.primitive).toBe('PLANE')
      expect(m.surfaces.map((s) => s.key)).toEqual(['front', 'back'])
      expect(decorableSurfaces(m)).toHaveLength(2)
    }
  })
})
