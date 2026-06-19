import { describe, it, expect } from 'vitest'
import { general2DProjection, projectPoint, matrix3dForQuad, type Pt } from './quadTransform'

const RECT = (w: number, h: number): [Pt, Pt, Pt, Pt] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]

function near(a: number, b: number, eps = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThan(eps)
}

describe('quadTransform', () => {
  it('identity quad → identity transform (corners map to themselves)', () => {
    const rect = RECT(200, 100)
    const h = general2DProjection(rect, rect)
    for (const c of rect) {
      const p = projectPoint(h, c)
      near(p.x, c.x)
      near(p.y, c.y)
    }
    // Interior point is preserved too.
    const mid = projectPoint(h, { x: 100, y: 50 })
    near(mid.x, 100)
    near(mid.y, 50)
  })

  it('known quad → each source corner lands on the matching dst corner', () => {
    const src = RECT(100, 100)
    // A trapezoid: top edge inset (perspective look).
    const dst: [Pt, Pt, Pt, Pt] = [
      { x: 20, y: 0 }, // TL
      { x: 80, y: 0 }, // TR
      { x: 100, y: 100 }, // BR
      { x: 0, y: 100 }, // BL
    ]
    const h = general2DProjection(src, dst)
    const corners = projectAll(h, src)
    for (let i = 0; i < 4; i++) {
      near(corners[i]!.x, dst[i]!.x, 1e-4)
      near(corners[i]!.y, dst[i]!.y, 1e-4)
    }
  })

  it('non-affine quad warps the center off the rect center (true perspective)', () => {
    const src = RECT(100, 100)
    const dst: [Pt, Pt, Pt, Pt] = [
      { x: 10, y: 10 },
      { x: 90, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 80 },
    ]
    const h = general2DProjection(src, dst)
    const mid = projectPoint(h, { x: 50, y: 50 })
    // Perspective: the projected center is NOT the average of the dst corners.
    const avgX = (10 + 90 + 100 + 0) / 4
    expect(Math.abs(mid.x - avgX)).toBeGreaterThan(0.001)
  })

  it('matrix3dForQuad emits a 16-cell matrix3d string', () => {
    const css = matrix3dForQuad(120, 60, RECT(120, 60))
    expect(css.startsWith('matrix3d(')).toBe(true)
    const cells = css.slice('matrix3d('.length, -1).split(',')
    expect(cells).toHaveLength(16)
    expect(cells.every((c) => Number.isFinite(Number(c)))).toBe(true)
  })
})

function projectAll(h: ReturnType<typeof general2DProjection>, pts: [Pt, Pt, Pt, Pt]): Pt[] {
  return pts.map((p) => projectPoint(h, p))
}
