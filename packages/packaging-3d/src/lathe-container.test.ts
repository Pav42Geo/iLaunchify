import { describe, it, expect } from 'vitest'
import { buildLatheContainer, labelWrapTarget, CONTAINER_ARCHETYPES } from './lathe-container'

describe('buildLatheContainer — coverage', () => {
  it('builds every archetype with a valid bottom→top profile', () => {
    for (const archetype of CONTAINER_ARCHETYPES) {
      const c = buildLatheContainer({ archetype, heightMm: 150, bodyDiameterMm: 66 })
      expect(c.profile.length).toBeGreaterThanOrEqual(4)
      expect(c.profile[0]).toEqual({ rMm: 0, yMm: 0 }) // starts at bottom center
      expect(c.profile[c.profile.length - 1]!.rMm).toBe(0) // ends at top center (closed)
      // y is non-decreasing (a valid revolve outline)
      for (let i = 1; i < c.profile.length; i++) {
        expect(c.profile[i]!.yMm).toBeGreaterThanOrEqual(c.profile[i - 1]!.yMm)
      }
      expect(c.dims.heightMm).toBe(150)
    }
  })

  it('rejects non-positive height / body diameter', () => {
    expect(() => buildLatheContainer({ archetype: 'CAN', heightMm: 0, bodyDiameterMm: 66 })).toThrow(/positive/)
    expect(() => buildLatheContainer({ archetype: 'CAN', heightMm: 150, bodyDiameterMm: -1 })).toThrow(/positive/)
  })
})

describe('real dimensions + label band', () => {
  it('a can body radius = bodyDiameter/2 and wrap = circumference × band height', () => {
    const can = buildLatheContainer({ archetype: 'CAN', heightMm: 122, bodyDiameterMm: 66 })
    expect(can.labelBand.radiusMm).toBe(33)
    expect(can.labelBand.circumferenceMm).toBeCloseTo(Math.PI * 66, 1)
    const wrap = labelWrapTarget(can.labelBand)
    expect(wrap.widthMm).toBe(can.labelBand.circumferenceMm)
    expect(wrap.heightMm).toBeCloseTo(122 * 0.92 - 122 * 0.05, 1)
    // bounding box is diameter × diameter × height
    expect(can.dims.widthMm).toBe(66)
    expect(can.dims.depthMm).toBe(66)
  })

  it('a bottle neck is narrower than its body', () => {
    const b = buildLatheContainer({ archetype: 'BOTTLE', heightMm: 200, bodyDiameterMm: 70 })
    const bodyMax = Math.max(...b.profile.map((p) => p.rMm))
    const neckPoint = b.profile[b.profile.length - 2]! // point just below top-center
    expect(neckPoint.rMm).toBeLessThan(bodyMax)
    expect(b.labelBand.radiusMm).toBe(35) // wraps on the body
  })

  it('label wrap is exact 1mm=1mm: width = 2πr', () => {
    const jar = buildLatheContainer({ archetype: 'JAR', heightMm: 80, bodyDiameterMm: 90 })
    expect(labelWrapTarget(jar.labelBand).widthMm).toBeCloseTo(2 * Math.PI * jar.labelBand.radiusMm, 2)
  })

  it('respects explicit neck/shoulder overrides', () => {
    const custom = buildLatheContainer({ archetype: 'BOTTLE', heightMm: 200, bodyDiameterMm: 70, neckDiameterMm: 20, shoulderHeightMm: 40, neckHeightMm: 30 })
    // neck radius 10 shows up in the profile
    expect(custom.profile.some((p) => p.rMm === 10)).toBe(true)
  })
})
