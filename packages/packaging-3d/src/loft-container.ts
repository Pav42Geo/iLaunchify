/**
 * @ilaunchify/packaging-3d — cross-section loft engine (G3.1e).
 *
 * The lathe (surface of revolution) only makes ROUND containers. Many real CPG
 * bottles — juice, detergent, sauce, dairy — have a NON-circular body (rounded
 * rectangle / oval) that blends up into a round neck. The reference is Pavel's
 * Simply Lemonade bottle: flat-ish label face, rounded corners, round threaded neck.
 *
 * We model these as a LOFT: a superellipse cross-section swept up the height,
 * morphing from the body shape (rounded rectangle, adjustable "squareness") through
 * a shoulder to a round neck. This is the "created realistic model" path — parametric
 * (admin sets real dims), never AI. Clean, predictable rings so a front label maps
 * to the flat face at real size.
 *
 * Pure; no three.js. Outputs ordered cross-sections + sampled rings (bottom→top);
 * the three.js layer connects consecutive rings into a lofted BufferGeometry + caps.
 */

export interface LoftSpec {
  heightMm: number
  /** full body width (the flat label-face span), mm */
  bodyWidthMm: number
  /** full body depth, mm */
  bodyDepthMm: number
  /** superellipse exponent: 2 = ellipse/round, 4 = rounded rectangle (default), higher = squarer */
  bodySquareness?: number
  /** round neck opening diameter, mm (default = 35% of body width) */
  neckDiameterMm?: number
  /** height of the shoulder blend from body → neck, mm (default 16% of height) */
  shoulderHeightMm?: number
  /** height of the straight round neck, mm (default 12% of height) */
  neckHeightMm?: number
  /** points sampled around each ring (default 48) */
  ringPoints?: number
  /** vertical subdivisions (default 24) */
  levels?: number
}

/** A cross-section: superellipse half-extents + exponent at a given height. */
export interface CrossSection {
  aMm: number
  bMm: number
  /** superellipse exponent (2 = round) */
  n: number
  yMm: number
}

export interface RingPoint {
  xMm: number
  zMm: number
}

export interface LoftContainer {
  /** ordered bottom→top cross-section parameters (levels+1 entries) */
  sections: CrossSection[]
  /** sampled rings (rings[level][point]) — connect consecutive rings to loft the body */
  rings: RingPoint[][]
  dims: { widthMm: number; heightMm: number; depthMm: number }
  /** front-face label region (front/back label, not a full wrap) */
  labelBand: { bottomYMm: number; topYMm: number; frontWidthMm: number; bandHeightMm: number }
}

const round = (n: number) => Math.round(n * 1000) / 1000
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/**
 * A point on a superellipse of half-extents (a, b) and exponent n at angle theta.
 * n = 2 → ellipse; n → ∞ → rectangle; n ≈ 4 → rounded rectangle. Pure.
 */
export function superellipsePoint(aMm: number, bMm: number, n: number, theta: number): RingPoint {
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const ex = 2 / n
  return {
    xMm: aMm * Math.sign(ct) * Math.pow(Math.abs(ct), ex),
    zMm: bMm * Math.sign(st) * Math.pow(Math.abs(st), ex),
  }
}

/**
 * Build a lofted container (rounded-rectangular/oval body → round neck). Pure +
 * deterministic. Throws on non-positive height / body width / body depth.
 */
export function buildLoftContainer(spec: LoftSpec): LoftContainer {
  const h = spec.heightMm
  const bodyW = spec.bodyWidthMm
  const bodyD = spec.bodyDepthMm
  if (!(h > 0) || !(bodyW > 0) || !(bodyD > 0)) {
    throw new Error(`buildLoftContainer: height, bodyWidth, bodyDepth must be positive (got ${h}, ${bodyW}, ${bodyD}).`)
  }
  const bodyN = spec.bodySquareness ?? 4
  const neckR = (spec.neckDiameterMm ?? bodyW * 0.35) / 2
  const shoulderH = spec.shoulderHeightMm ?? h * 0.16
  const neckH = spec.neckHeightMm ?? h * 0.12
  const bodyH = Math.max(h - shoulderH - neckH, h * 0.1)
  const ringPoints = Math.max(8, spec.ringPoints ?? 48)
  const levels = Math.max(4, spec.levels ?? 24)

  const bodyA = bodyW / 2
  const bodyB = bodyD / 2

  const crossAt = (y: number): { aMm: number; bMm: number; n: number } => {
    if (y <= bodyH) return { aMm: bodyA, bMm: bodyB, n: bodyN }
    if (y >= bodyH + shoulderH) return { aMm: neckR, bMm: neckR, n: 2 }
    const u = (y - bodyH) / shoulderH // 0..1 across the shoulder blend
    return { aMm: lerp(bodyA, neckR, u), bMm: lerp(bodyB, neckR, u), n: lerp(bodyN, 2, u) }
  }

  const sections: CrossSection[] = []
  const rings: RingPoint[][] = []
  for (let i = 0; i <= levels; i++) {
    const y = (h * i) / levels
    const c = crossAt(y)
    sections.push({ aMm: round(c.aMm), bMm: round(c.bMm), n: round(c.n), yMm: round(y) })
    const ring: RingPoint[] = []
    for (let j = 0; j < ringPoints; j++) {
      const theta = (j / ringPoints) * Math.PI * 2
      const p = superellipsePoint(c.aMm, c.bMm, c.n, theta)
      ring.push({ xMm: round(p.xMm), zMm: round(p.zMm) })
    }
    rings.push(ring)
  }

  const bottomY = h * 0.06
  const topY = bodyH * 0.9
  return {
    sections,
    rings,
    dims: { widthMm: round(bodyW), heightMm: round(h), depthMm: round(bodyD) },
    labelBand: {
      bottomYMm: round(bottomY),
      topYMm: round(topY),
      frontWidthMm: round(bodyW),
      bandHeightMm: round(topY - bottomY),
    },
  }
}
