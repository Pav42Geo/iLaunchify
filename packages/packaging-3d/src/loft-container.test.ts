import { describe, it, expect } from 'vitest'
import { buildLoftContainer, superellipsePoint } from './loft-container'

describe('superellipsePoint', () => {
  it('n=2 is a plain ellipse', () => {
    const a = 10
    const b = 6
    expect(superellipsePoint(a, b, 2, 0)).toEqual({ xMm: a, zMm: 0 })
    const p = superellipsePoint(a, b, 2, Math.PI / 2)
    expect(p.xMm).toBeCloseTo(0, 6)
    expect(p.zMm).toBeCloseTo(b, 6)
  })

  it('higher n pushes points toward the corner (squarer)', () => {
    // at 45°, a rounder shape (n=2) sits closer to origin than a squarer one (n=8)
    const round2 = superellipsePoint(10, 10, 2, Math.PI / 4)
    const square8 = superellipsePoint(10, 10, 8, Math.PI / 4)
    expect(square8.xMm).toBeGreaterThan(round2.xMm)
  })
})

describe('buildLoftContainer', () => {
  it('rejects non-positive dims', () => {
    expect(() => buildLoftContainer({ heightMm: 0, bodyWidthMm: 90, bodyDepthMm: 90 })).toThrow(/positive/)
    expect(() => buildLoftContainer({ heightMm: 260, bodyWidthMm: 0, bodyDepthMm: 90 })).toThrow(/positive/)
  })

  it('builds the Simply-Lemonade family: rounded-rect body → round neck', () => {
    // ~1.53L bottle: ~90mm square body, ~260mm tall, round neck.
    const c = buildLoftContainer({ heightMm: 260, bodyWidthMm: 90, bodyDepthMm: 90, neckDiameterMm: 34 })
    expect(c.dims).toEqual({ widthMm: 90, heightMm: 260, depthMm: 90 })
    // bottom section = full rounded-rect body (n≈4), top section = round neck (n=2)
    expect(c.sections[0]!.n).toBe(4)
    expect(c.sections[c.sections.length - 1]!.n).toBe(2)
    // neck is narrower than the body
    expect(c.sections[c.sections.length - 1]!.aMm).toBeLessThan(c.sections[0]!.aMm)
    expect(c.sections[c.sections.length - 1]!.aMm).toBe(17) // neckDiameter/2
  })

  it('every ring has the requested point count and rings match sections', () => {
    const c = buildLoftContainer({ heightMm: 200, bodyWidthMm: 80, bodyDepthMm: 50, ringPoints: 32, levels: 12 })
    expect(c.rings).toHaveLength(c.sections.length)
    expect(c.rings).toHaveLength(13) // levels + 1
    for (const ring of c.rings) expect(ring).toHaveLength(32)
  })

  it('front label band spans the flat face width (front/back label, not full wrap)', () => {
    const c = buildLoftContainer({ heightMm: 260, bodyWidthMm: 90, bodyDepthMm: 90 })
    expect(c.labelBand.frontWidthMm).toBe(90)
    expect(c.labelBand.bandHeightMm).toBeGreaterThan(0)
    expect(c.labelBand.topYMm).toBeGreaterThan(c.labelBand.bottomYMm)
  })

  it('oval body (n=2) still lofts to a round neck', () => {
    const c = buildLoftContainer({ heightMm: 200, bodyWidthMm: 70, bodyDepthMm: 45, bodySquareness: 2 })
    expect(c.sections[0]!.n).toBe(2)
    expect(c.sections[0]!.aMm).not.toBe(c.sections[0]!.bMm) // oval body (a≠b)
  })
})
