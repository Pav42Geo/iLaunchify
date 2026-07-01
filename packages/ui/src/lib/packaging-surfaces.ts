// =============================================================================
// Packaging surfaces (ADMIN_PACKAGING_STUDIO.md — P0).
//
// A packaging model (PackagingType) has decorable SURFACES — clickable regions on
// the 3D model (a lid on top, a wrap on a jar, a full panel, a bottle wrap + cap).
// Each surface carries a clickable "hotspot" (a named glTF mesh, a UV rect for a
// decal, or a 3D anchor for a marker) and a binding to the die-line(s) it opens.
//
// Stored JSON-first on PackagingType.defaultSurfaces (no migration). This module is
// the single typed shape + resolver used by the admin studio (authoring), the
// creator canvas (click-through), and the partner Add-Product step (consumption).
// PURE — no three.js, no DOM, no DB. Backward-compatible with the legacy
// [{ name, defaultBleedMm }] shape.
// =============================================================================

export type SurfaceRole = 'CONTAINER' | 'CLOSURE' | 'WRAP' | 'PANEL' | 'OTHER'
/** Marketing intent of the surface (already used by the 3D spike). */
export type SurfacePurpose = 'pdp' | 'info' | 'other'

/** How the clickable region is located on the 3D model. Any one may be present. */
export interface SurfaceHotspot {
  /** Named mesh in the imported glTF/GLB (parametric or well-prepared models). */
  meshName?: string
  /** UV rectangle (0..1) for a decal-projected region — works on any model. */
  uvRect?: { x: number; y: number; w: number; h: number }
  /** 3D anchor point for a CSS2DRenderer marker (fallback / label position). */
  anchor?: { x: number; y: number; z: number }
}

export interface PackagingSurface {
  /** Stable key (slug). Unique within a model. */
  key: string
  label: string
  role: SurfaceRole
  surfacePurpose: SurfacePurpose
  /** body | lid | panel-N … (free-form, matches the 3D controller's `part`). */
  part?: string
  decorable: boolean
  defaultBleedMm: number
  /** Where the clickable border sits on the 3D model. */
  hotspot?: SurfaceHotspot
  /** Die-line(s) this surface opens in the 2D canvas (PackagingDieline ids). */
  dielineIds: string[]
  sortOrder: number
}

// ---- parsing helpers ----

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'surface'
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
const ROLES: SurfaceRole[] = ['CONTAINER', 'CLOSURE', 'WRAP', 'PANEL', 'OTHER']
const PURPOSES: SurfacePurpose[] = ['pdp', 'info', 'other']

function parseHotspot(v: unknown): SurfaceHotspot | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const out: SurfaceHotspot = {}
  if (typeof o.meshName === 'string') out.meshName = o.meshName
  if (o.uvRect && typeof o.uvRect === 'object') {
    const r = o.uvRect as Record<string, unknown>
    out.uvRect = { x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, 1), h: num(r.h, 1) }
  }
  if (o.anchor && typeof o.anchor === 'object') {
    const a = o.anchor as Record<string, unknown>
    out.anchor = { x: num(a.x, 0), y: num(a.y, 0), z: num(a.z, 0) }
  }
  return out.meshName || out.uvRect || out.anchor ? out : undefined
}

/**
 * Normalize the stored `defaultSurfaces` JSON into typed surfaces. Accepts both the
 * enriched shape and the legacy `[{ name, defaultBleedMm }]` shape. Never throws;
 * returns [] for junk. Keys are de-duplicated; sortOrder is stable (input order).
 */
export function resolvePackagingSurfaces(raw: unknown): PackagingSurface[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PackagingSurface[] = []
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return
    const o = item as Record<string, unknown>
    const label = str(o.label) || str(o.name) || `Surface ${i + 1}`
    let key = str(o.key) || slug(label)
    while (seen.has(key)) key = `${key}-${i}`
    seen.add(key)
    const role = ROLES.includes(o.role as SurfaceRole) ? (o.role as SurfaceRole) : 'CONTAINER'
    const purpose = PURPOSES.includes((o.surfacePurpose ?? o.surfaceRole) as SurfacePurpose)
      ? ((o.surfacePurpose ?? o.surfaceRole) as SurfacePurpose)
      : 'other'
    out.push({
      key,
      label,
      role,
      surfacePurpose: purpose,
      part: typeof o.part === 'string' ? o.part : undefined,
      decorable: typeof o.decorable === 'boolean' ? o.decorable : true,
      defaultBleedMm: num(o.defaultBleedMm, 3),
      hotspot: parseHotspot(o.hotspot),
      dielineIds: strArr(o.dielineIds),
      sortOrder: num(o.sortOrder, i),
    })
  })
  return out.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Serialize back to the JSON stored on PackagingType.defaultSurfaces. */
export function serializePackagingSurfaces(surfaces: PackagingSurface[]): unknown[] {
  return surfaces.map((s, i) => ({
    key: s.key,
    label: s.label,
    role: s.role,
    surfacePurpose: s.surfacePurpose,
    ...(s.part ? { part: s.part } : {}),
    decorable: s.decorable,
    defaultBleedMm: s.defaultBleedMm,
    ...(s.hotspot ? { hotspot: s.hotspot } : {}),
    dielineIds: s.dielineIds,
    sortOrder: s.sortOrder ?? i,
  }))
}

/** The decorable surfaces (the ones a partner/creator can design into). */
export function decorableSurfaces(surfaces: PackagingSurface[]): PackagingSurface[] {
  return surfaces.filter((s) => s.decorable)
}

/** The surface a die-line is bound to, if any. */
export function surfaceForDieline(surfaces: PackagingSurface[], dielineId: string): PackagingSurface | null {
  return surfaces.find((s) => s.dielineIds.includes(dielineId)) ?? null
}

/** Surfaces that don't yet have a die-line bound — the admin's "to-bind" list. */
export function unboundSurfaces(surfaces: PackagingSurface[]): PackagingSurface[] {
  return surfaces.filter((s) => s.decorable && s.dielineIds.length === 0)
}
