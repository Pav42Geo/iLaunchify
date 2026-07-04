/**
 * @ilaunchify/packaging-3d — parametric geometry engine (G3.1).
 *
 * The core of "die-line → 3D mockup": given a package's topology + REAL dimensions
 * (from the die-line, in millimetres), produce a renderer-agnostic `ParametricModel`
 * — the primitive family, resolved real-mm bounds, and the set of real-size decorable
 * SURFACES (each a panel the creator's die-line/design maps onto). The three.js layer
 * (Packaging3DView / Dieline3DViewer) consumes this to build actual geometry; this
 * module stays three.js-free and fully unit-testable.
 *
 * Dimensions come from the die-line — never invented. Depth is derived only when the
 * die-line doesn't supply it, using conservative per-family ratios.
 */

import type { PackagingTopology, Dimensions, BoxFace } from './types'

export type GeometryPrimitive = 'BOX' | 'CYLINDER' | 'PLANE'

export type SurfaceRole = 'PANEL' | 'WRAP' | 'CAP' | 'LID'

export interface ParametricSurface {
  /** unique slug within the model ('front', 'wrap', 'lid'…) */
  key: string
  label: string
  role: SurfaceRole
  /** box-face binding (only for BOX primitives) */
  face?: BoxFace
  /** real-world size of THIS surface in mm (what the die-line placeholder must be) */
  widthMm: number
  heightMm: number
  /** does a creator die-line/design go here? (caps/bottoms usually don't) */
  decorable: boolean
}

export interface ParametricModel {
  topology: PackagingTopology
  primitive: GeometryPrimitive
  /** fully-resolved bounds in mm (depth derived if the die-line omitted it) */
  dims: Required<Dimensions>
  hasLid: boolean
  /** cylinder radius in mm (widthMm treated as the diameter); undefined for box/plane */
  radiusMm?: number
  surfaces: ParametricSurface[]
}

const CYLINDER_TOPOLOGIES: PackagingTopology[] = ['SINGLE_CONTAINER', 'CAPSULE_JAR', 'TUBE']
const PLANE_TOPOLOGIES: PackagingTopology[] = ['SACHET', 'POUCH_FLAT', 'STICK_PACK']
const LID_TOPOLOGIES: PackagingTopology[] = ['CAPSULE_JAR', 'TUBE']

function primitiveFor(topology: PackagingTopology): GeometryPrimitive {
  if (CYLINDER_TOPOLOGIES.includes(topology)) return 'CYLINDER'
  if (PLANE_TOPOLOGIES.includes(topology)) return 'PLANE'
  return 'BOX' // MULTI_CONTAINER_BOX, CASE, POUCH_STAND_UP, OTHER
}

/** Derive a plausible depth (mm) when the die-line didn't supply one. */
function resolveDepthMm(topology: PackagingTopology, w: number, h: number): number {
  const minWH = Math.min(w, h)
  switch (topology) {
    case 'SINGLE_CONTAINER':
    case 'CAPSULE_JAR':
    case 'TUBE':
      return w // cylinder — depth = diameter
    case 'STICK_PACK':
    case 'SACHET':
      return minWH * 0.15
    case 'POUCH_FLAT':
      return minWH * 0.12
    case 'POUCH_STAND_UP':
      return w * 0.4 // gusset
    default:
      return minWH * 0.6
  }
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Build the parametric model for a topology + real dimensions. Pure + deterministic.
 * Throws on non-positive width/height (a die-line must have real trim size).
 */
export function buildParametricModel(topology: PackagingTopology, dims: Dimensions): ParametricModel {
  const w = dims.widthMm
  const h = dims.heightMm
  if (!(w > 0) || !(h > 0)) {
    throw new Error(`buildParametricModel: width and height must be positive (got ${w}×${h}).`)
  }
  const d = round(dims.depthMm && dims.depthMm > 0 ? dims.depthMm : resolveDepthMm(topology, w, h))
  const primitive = primitiveFor(topology)
  const hasLid = LID_TOPOLOGIES.includes(topology)
  const resolved: Required<Dimensions> = { widthMm: round(w), heightMm: round(h), depthMm: d }

  if (primitive === 'CYLINDER') {
    const radiusMm = round(w / 2)
    const circumferenceMm = round(Math.PI * w)
    const surfaces: ParametricSurface[] = [
      { key: 'wrap', label: 'Wrap / body label', role: 'WRAP', widthMm: circumferenceMm, heightMm: round(h), decorable: true },
      { key: 'top', label: hasLid ? 'Lid' : 'Top', role: hasLid ? 'LID' : 'CAP', widthMm: round(w), heightMm: round(w), decorable: hasLid },
      { key: 'bottom', label: 'Bottom', role: 'CAP', widthMm: round(w), heightMm: round(w), decorable: false },
    ]
    return { topology, primitive, dims: resolved, hasLid, radiusMm, surfaces }
  }

  if (primitive === 'PLANE') {
    // Flexible flat pack — front + back panels only (the two decorable faces).
    const surfaces: ParametricSurface[] = [
      { key: 'front', label: 'Front', role: 'PANEL', face: 'front', widthMm: round(w), heightMm: round(h), decorable: true },
      { key: 'back', label: 'Back', role: 'PANEL', face: 'back', widthMm: round(w), heightMm: round(h), decorable: true },
    ]
    return { topology, primitive, dims: resolved, hasLid, surfaces }
  }

  // BOX — six faces at real size. Front/back = w×h, left/right = d×h, top/bottom = w×d.
  const surfaces: ParametricSurface[] = [
    { key: 'front', label: 'Front', role: 'PANEL', face: 'front', widthMm: round(w), heightMm: round(h), decorable: true },
    { key: 'back', label: 'Back', role: 'PANEL', face: 'back', widthMm: round(w), heightMm: round(h), decorable: true },
    { key: 'left', label: 'Left side', role: 'PANEL', face: 'left', widthMm: d, heightMm: round(h), decorable: true },
    { key: 'right', label: 'Right side', role: 'PANEL', face: 'right', widthMm: d, heightMm: round(h), decorable: true },
    { key: 'top', label: 'Top', role: 'PANEL', face: 'top', widthMm: round(w), heightMm: d, decorable: true },
    { key: 'bottom', label: 'Bottom', role: 'PANEL', face: 'bottom', widthMm: round(w), heightMm: d, decorable: false },
  ]
  return { topology, primitive, dims: resolved, hasLid, surfaces }
}

/** The decorable surfaces only (where a die-line/design goes). */
export function decorableSurfaces(model: ParametricModel): ParametricSurface[] {
  return model.surfaces.filter((s) => s.decorable)
}
