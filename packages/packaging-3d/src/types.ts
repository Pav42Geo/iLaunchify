/**
 * @ilaunchify/packaging-3d — shared type vocabulary (G1.1).
 *
 * This package is PURE and Prisma-free by design (DI'd like `packages/shipping`).
 * The schema enums it mirrors (StructuralPackType, PackagingTopology) are
 * re-declared here as string-literal unions so no Prisma client is imported at
 * runtime — callers pass the enum's string value across the boundary. The
 * `as const` tuples double as the single source for iteration + validation.
 *
 * Spec: docs/PACKAGING_3D_GENERATOR_PLAN.md · substrate: docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md
 */

// ── Structural pack types (6 locked structures) ──────────────────────────────
// Mirrors prisma enum StructuralPackType (packages/db/prisma/schema.prisma).
export const STRUCTURAL_PACK_TYPES = [
  'SINGLE_UNIT',
  'MULTI_UNIT_SAME',
  'MULTI_FLAVOR_MIXED',
  'MULTI_FLAVOR_COMPARTMENT',
  'PER_FLAVOR_IN_OUTER',
  'CUSTOMIZABLE_PICK_N',
] as const
export type StructuralPackType = (typeof STRUCTURAL_PACK_TYPES)[number]

// ── Packaging topology (10 form factors) ─────────────────────────────────────
// Mirrors prisma enum PackagingTopology. Drives which parametric generator
// (G3) or fold-from-net path (G4) a PackagingType resolves to.
export const PACKAGING_TOPOLOGIES = [
  'SINGLE_CONTAINER',
  'MULTI_CONTAINER_BOX',
  'STICK_PACK',
  'SACHET',
  'CASE',
  'CAPSULE_JAR',
  'POUCH_STAND_UP',
  'POUCH_FLAT',
  'TUBE',
  'OTHER',
] as const
export type PackagingTopology = (typeof PACKAGING_TOPOLOGIES)[number]

// ── Geometry source (plan §3 — three sources, one package) ───────────────────
// A. PARAMETRIC   — real dims from die-line/PackagingType → generated geometry
// B. FOLD_FROM_NET — normalizedSvg cut/crease → FOLD → folded mesh (G4)
// C. GLTF         — admin-curated / AI-drafted, admin-verified (locked §0.4)
export const GEOMETRY_SOURCES = ['PARAMETRIC', 'FOLD_FROM_NET', 'GLTF'] as const
export type GeometrySource = (typeof GEOMETRY_SOURCES)[number]

// ── Real-world dimensions (from the die-line — never invented) ───────────────
export interface Dimensions {
  /** trim width in millimetres */
  widthMm: number
  /** trim height in millimetres */
  heightMm: number
  /** depth / thickness in millimetres (undefined for flat labels) */
  depthMm?: number
}

// ── Type guards (pure, cheap — usable at the trust boundary) ──────────────────
export function isStructuralPackType(v: unknown): v is StructuralPackType {
  return typeof v === 'string' && (STRUCTURAL_PACK_TYPES as readonly string[]).includes(v)
}

export function isPackagingTopology(v: unknown): v is PackagingTopology {
  return typeof v === 'string' && (PACKAGING_TOPOLOGIES as readonly string[]).includes(v)
}

export function isGeometrySource(v: unknown): v is GeometrySource {
  return typeof v === 'string' && (GEOMETRY_SOURCES as readonly string[]).includes(v)
}
