/**
 * @ilaunchify/packaging-3d — lathe container engine (G3.1b).
 *
 * The reliable path for LABEL die-lines (docs/CONTAINER_3D_FROM_IMAGE_RESEARCH.md):
 * most CPG containers (can / bottle / jar / tub / tube) are rotationally symmetric,
 * so we model them as a surface of revolution — a real-mm PROFILE curve revolved
 * around the Y axis. That gives EXACT real dimensions, watertight topology, and a
 * clean predictable UV grid, so a wrap label maps at true 1 mm = 1 mm.
 *
 * `buildLatheContainer(spec)` returns the profile (bottom→top, real mm) the three.js
 * layer feeds to `THREE.LatheGeometry`, plus the label band and `labelWrapTarget`
 * (the exact die-line size — circumference × band height — that fits the body).
 * Scale is spec-driven (manufacturer's real dims), never image-derived.
 *
 * Pure; no three.js. The container is SEPARATE from the label die-line (a label
 * die-line shapes the printed region, the container is its own object).
 */

export const CONTAINER_ARCHETYPES = ['CAN', 'BOTTLE', 'JAR', 'TUB', 'TUBE'] as const
export type ContainerArchetype = (typeof CONTAINER_ARCHETYPES)[number]

export interface ContainerSpec {
  archetype: ContainerArchetype
  /** total height, mm */
  heightMm: number
  /** main body diameter, mm (the label-band diameter) */
  bodyDiameterMm: number
  /** top opening diameter, mm — bottle/tube neck / jar+tub lip (defaults per archetype) */
  neckDiameterMm?: number
  /** height of the shoulder taper from body to neck, mm (defaults per archetype) */
  shoulderHeightMm?: number
  /** height of the straight neck section, mm (defaults per archetype) */
  neckHeightMm?: number
}

/** One point on the revolve profile: radius at a given height (both mm). */
export interface ProfilePoint {
  rMm: number
  yMm: number
}

export interface LabelBand {
  bottomYMm: number
  topYMm: number
  /** body radius the label wraps at, mm */
  radiusMm: number
  /** full wrap circumference at that radius, mm (2πr) */
  circumferenceMm: number
  /** vertical extent of the band, mm */
  bandHeightMm: number
}

export interface LatheContainer {
  archetype: ContainerArchetype
  /** bottom→top outline, real mm — revolve around Y in three.js LatheGeometry */
  profile: ProfilePoint[]
  /** bounding box (width = depth = max diameter), mm */
  dims: { widthMm: number; heightMm: number; depthMm: number }
  labelBand: LabelBand
}

const round = (n: number) => Math.round(n * 100) / 100
const TWO_PI = Math.PI * 2

/**
 * Build the revolve profile + label band for a container. Pure + deterministic.
 * Throws on non-positive height/body diameter (real dims are required).
 */
export function buildLatheContainer(spec: ContainerSpec): LatheContainer {
  const h = spec.heightMm
  const bodyR = spec.bodyDiameterMm / 2
  if (!(h > 0) || !(bodyR > 0)) {
    throw new Error(`buildLatheContainer: height and bodyDiameter must be positive (got h=${h}, d=${spec.bodyDiameterMm}).`)
  }
  const neckR = (spec.neckDiameterMm ?? defaultNeckDiameter(spec.archetype, spec.bodyDiameterMm)) / 2
  const shoulderH = spec.shoulderHeightMm ?? defaultShoulderHeight(spec.archetype, h)
  const neckH = spec.neckHeightMm ?? defaultNeckHeight(spec.archetype, h)

  const { profile, band } = profileFor(spec.archetype, { h, bodyR, neckR, shoulderH, neckH })

  const maxR = profile.reduce((m, p) => Math.max(m, p.rMm), 0)
  const radiusMm = round(band.radiusMm)
  return {
    archetype: spec.archetype,
    profile: profile.map((p) => ({ rMm: round(p.rMm), yMm: round(p.yMm) })),
    dims: { widthMm: round(maxR * 2), heightMm: round(h), depthMm: round(maxR * 2) },
    labelBand: {
      bottomYMm: round(band.bottomYMm),
      topYMm: round(band.topYMm),
      radiusMm,
      circumferenceMm: round(TWO_PI * radiusMm),
      bandHeightMm: round(band.topYMm - band.bottomYMm),
    },
  }
}

/**
 * The exact die-line target size for a full body-wrap label: circumference × band
 * height. Author the wrap die-line at this size and it maps 1 mm = 1 mm on the body
 * (front/back labels use a fraction of the circumference).
 */
export function labelWrapTarget(band: LabelBand): { widthMm: number; heightMm: number } {
  return { widthMm: band.circumferenceMm, heightMm: band.bandHeightMm }
}

// ── Per-archetype defaults + profiles ────────────────────────────────────────

function defaultNeckDiameter(a: ContainerArchetype, bodyDia: number): number {
  switch (a) {
    case 'BOTTLE':
      return bodyDia * 0.35
    case 'TUBE':
      return bodyDia * 0.28
    case 'JAR':
      return bodyDia * 0.85
    case 'TUB':
      return bodyDia * 1.02 // slight outward lip
    case 'CAN':
      return bodyDia * 0.9
  }
}

function defaultShoulderHeight(a: ContainerArchetype, h: number): number {
  switch (a) {
    case 'BOTTLE':
      return h * 0.16
    case 'TUBE':
      return h * 0.22
    case 'JAR':
      return h * 0.08
    case 'TUB':
      return h * 0.04
    case 'CAN':
      return h * 0.03
  }
}

function defaultNeckHeight(a: ContainerArchetype, h: number): number {
  switch (a) {
    case 'BOTTLE':
      return h * 0.14
    case 'TUBE':
      return h * 0.06
    case 'JAR':
      return h * 0.06
    case 'TUB':
      return h * 0.03
    case 'CAN':
      return h * 0.02
  }
}

interface ProfileInput {
  h: number
  bodyR: number
  neckR: number
  shoulderH: number
  neckH: number
}

function profileFor(a: ContainerArchetype, p: ProfileInput): { profile: ProfilePoint[]; band: { bottomYMm: number; topYMm: number; radiusMm: number } } {
  const { h, bodyR, neckR, shoulderH, neckH } = p

  if (a === 'CAN') {
    // Straight cylinder with slightly domed rims.
    const profile: ProfilePoint[] = [
      { rMm: 0, yMm: 0 },
      { rMm: bodyR, yMm: 0 },
      { rMm: bodyR, yMm: h },
      { rMm: neckR, yMm: h },
      { rMm: 0, yMm: h },
    ]
    return { profile, band: { bottomYMm: h * 0.05, topYMm: h * 0.92, radiusMm: bodyR } }
  }

  // Bottle / Tube share body → shoulder → neck (tube neck is smaller + shorter).
  if (a === 'BOTTLE' || a === 'TUBE') {
    const bodyH = h - shoulderH - neckH
    const profile: ProfilePoint[] = [
      { rMm: 0, yMm: 0 },
      { rMm: bodyR, yMm: 0 },
      { rMm: bodyR, yMm: bodyH },
      { rMm: neckR, yMm: bodyH + shoulderH },
      { rMm: neckR, yMm: h },
      { rMm: 0, yMm: h },
    ]
    return { profile, band: { bottomYMm: h * 0.06, topYMm: bodyH * 0.96, radiusMm: bodyR } }
  }

  if (a === 'JAR') {
    // Wide, short; small lip at the top.
    const bodyH = h - shoulderH - neckH
    const profile: ProfilePoint[] = [
      { rMm: 0, yMm: 0 },
      { rMm: bodyR, yMm: 0 },
      { rMm: bodyR, yMm: bodyH },
      { rMm: neckR, yMm: bodyH + shoulderH },
      { rMm: neckR, yMm: h },
      { rMm: 0, yMm: h },
    ]
    return { profile, band: { bottomYMm: h * 0.08, topYMm: bodyH * 0.95, radiusMm: bodyR } }
  }

  // TUB — wide, gentle outward taper toward the lip.
  const baseR = bodyR * 0.94
  const profile: ProfilePoint[] = [
    { rMm: 0, yMm: 0 },
    { rMm: baseR, yMm: 0 },
    { rMm: bodyR, yMm: h - neckH },
    { rMm: neckR, yMm: h },
    { rMm: 0, yMm: h },
  ]
  return { profile, band: { bottomYMm: h * 0.1, topYMm: (h - neckH) * 0.92, radiusMm: (baseR + bodyR) / 2 } }
}
