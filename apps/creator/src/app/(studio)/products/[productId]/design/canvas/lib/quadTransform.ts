// Pure rect→quad projective transform (homography) expressed as a CSS
// `matrix3d(...)` string, so a flat <img> can be perspective-warped into an
// arbitrary 4-corner print area on a product photo (Mockup Slice 2). No deps;
// unit-tested. Standard "general 2D projection" homography (rect-to-quad).

export interface Pt { x: number; y: number }

/** 3×3 matrix, row-major. */
type Mat3 = [number, number, number, number, number, number, number, number, number]
type Vec3 = [number, number, number]

/** Adjugate (classical adjoint) of a 3×3 — used to invert a basis. */
function adj(m: Mat3): Mat3 {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ]
}

/** Multiply two 3×3 matrices (unrolled to satisfy noUncheckedIndexedAccess). */
function multmm(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

/** Multiply a 3×3 matrix by a column vector. */
function multmv(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

/** Map the unit basis to four points — the per-quad projective basis. */
function basisToPoints(p: readonly [Pt, Pt, Pt, Pt]): Mat3 {
  const m: Mat3 = [p[0].x, p[1].x, p[2].x, p[0].y, p[1].y, p[2].y, 1, 1, 1]
  const v = multmv(adj(m), [p[3].x, p[3].y, 1])
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]])
}

/** Homography mapping the four `from` points → the four `to` points (same order). */
export function general2DProjection(
  from: readonly [Pt, Pt, Pt, Pt],
  to: readonly [Pt, Pt, Pt, Pt],
): Mat3 {
  return multmm(basisToPoints(to), adj(basisToPoints(from)))
}

/** Apply a homography to a point (perspective divide). */
export function projectPoint(h: Mat3, p: Pt): Pt {
  const r = multmv(h, [p.x, p.y, 1])
  return { x: r[0] / r[2], y: r[1] / r[2] }
}

/**
 * CSS `matrix3d(...)` that warps the source rect (0,0)–(srcW,srcH) onto the dst
 * quad [TL, TR, BR, BL] (px, relative to the element's transform-origin `0 0`).
 * Apply to an absolutely-positioned <img> sized `srcW × srcH`.
 *
 * matrix3d is column-major 4×4; we embed the 3×3 homography leaving z untouched:
 *   col0 = [a,d,0,g]  col1 = [b,e,0,h]  col2 = [0,0,1,0]  col3 = [c,f,0,i]
 */
export function matrix3dForQuad(srcW: number, srcH: number, dst: readonly [Pt, Pt, Pt, Pt]): string {
  const from: [Pt, Pt, Pt, Pt] = [
    { x: 0, y: 0 },
    { x: srcW, y: 0 },
    { x: srcW, y: srcH },
    { x: 0, y: srcH },
  ]
  const h = general2DProjection(from, dst)
  const w = h[8] || 1 // normalize so the homogeneous scale is 1
  const cells = [
    h[0] / w, h[3] / w, 0, h[6] / w,
    h[1] / w, h[4] / w, 0, h[7] / w,
    0, 0, 1, 0,
    h[2] / w, h[5] / w, 0, h[8] / w,
  ]
  return `matrix3d(${cells.join(', ')})`
}
