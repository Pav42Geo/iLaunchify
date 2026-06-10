// =============================================================================
// Packaging composition — shared types for the 3D Packaging Studio + the
// surface → component → die-line resolution. docs/PACKAGING_COMPOSITION_MODEL.md.
// =============================================================================
//
// Pure, DB-free. `PackagingType.defaultSurfaces` is stored as SurfaceDescriptor[]
// (a Json-shape upgrade — no column change). The 3D scene loads each component's
// type model; clicking a surface resolves its `role` to the matching
// PackagingComponent → that component's die-line.

export type Model3DSource = 'PACDORA_IMPORT' | 'UPLOAD' | 'PARAMETRIC'

/** A decorable region on a packaging type's 3D model — the click target. */
export interface SurfaceDescriptor {
  /** Stable surface id: "wrap" | "front" | "lid_top" | "face_1"… */
  key: string
  label: string
  /** ComponentRole this surface decorates (CONTAINER / CLOSURE / CARTON / SEAL / …). */
  role: string
  /** UV region on the model for click-to-select, normalized 0..1. */
  uvRegion?: { x: number; y: number; w: number; h: number }
  defaultBleedMm?: number
}

/** How a parent component arranges its children in the 3D scene. */
export interface ChildLayout {
  kind: 'grid' | 'stack' | 'explicit'
  rows?: number
  cols?: number
  /** explicit per-child positions (mm), if kind === 'explicit'. */
  positions?: Array<{ x: number; y: number; z: number }>
}

/**
 * Resolve a clicked surface to the matching component (by role). Components are
 * the product's PackagingComponent rows; pass the minimal {role} shape.
 */
export function resolveSurfaceComponent<T extends { role: string }>(
  surface: SurfaceDescriptor,
  components: T[],
): T | null {
  return components.find((c) => c.role === surface.role) ?? null
}
