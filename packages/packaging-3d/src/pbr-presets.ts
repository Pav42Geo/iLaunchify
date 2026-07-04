/**
 * @ilaunchify/packaging-3d — PBR material presets (G1.2).
 *
 * Pure, renderer-agnostic preset map keyed to a finite finish vocabulary
 * (`PbrMaterialKind`). Values are plain numbers a UI package maps 1:1 onto
 * three.js `MeshPhysicalMaterial` — this package never imports three.js.
 *
 * The finish vocabulary and its parameters follow the research (docs/
 * MOCKUP_LIBRARY_UX_RESEARCH.md §3): laminate/soft-touch = a clearcoat topcoat,
 * glass + clear/shrink film = transmission, soft-touch/velvet = sheen. Contact
 * shadows + HDRI (G1.3) do the rest of the realism lift; these presets set the
 * surface response.
 *
 * The schema's `PackagingMaterial` carries a free-form `slug`/`name` and a
 * `SubstrateCategory` enum rather than a fixed finish enum, so callers pass those
 * strings in and `resolvePbrMaterialKind()` maps them here (keyword-first, then
 * substrate category, then a safe default). Constants first — an admin-tunable
 * `MockupRenderSetting` table can override these later (plan G1.2).
 */

// ── Finish vocabulary ────────────────────────────────────────────────────────
export const PBR_MATERIAL_KINDS = [
  'MATTE_LAMINATE',
  'GLOSS_LAMINATE',
  'SOFT_TOUCH',
  'KRAFT',
  'UNCOATED_PAPER',
  'METAL',
  'GLASS',
  'SHRINK_FILM',
] as const
export type PbrMaterialKind = (typeof PBR_MATERIAL_KINDS)[number]

/**
 * Renderer-agnostic PBR parameters. Every field is present (0-defaulted) so a
 * consumer can spread them straight onto MeshPhysicalMaterial with no
 * undefined-handling. Ranges: roughness/metalness/clearcoat/transmission/sheen
 * ∈ [0,1]; ior typically ~1.0–2.0; thickness/envMapIntensity ≥ 0.
 */
export interface PbrPreset {
  kind: PbrMaterialKind
  label: string
  description: string
  roughness: number
  metalness: number
  /** second specular topcoat (KHR_materials_clearcoat) — laminate/soft-touch */
  clearcoat: number
  clearcoatRoughness: number
  /** light transmission (KHR_materials_transmission) — glass / clear film */
  transmission: number
  /** index of refraction, used with transmission */
  ior: number
  /** volume thickness for refraction (only meaningful when transmission > 0) */
  thickness: number
  /** retroreflective micro-fibre sheen (KHR_materials_sheen) — soft-touch/velvet */
  sheen: number
  sheenRoughness: number
  /** how strongly the HDRI environment reflects on this surface */
  envMapIntensity: number
  /** substrate's own colour when the artwork doesn't fully cover (e.g. kraft brown) */
  suggestedBaseColorHex?: string
}

// ── The presets (constants; admin-tunable later) ─────────────────────────────
export const PBR_PRESETS: Record<PbrMaterialKind, PbrPreset> = {
  MATTE_LAMINATE: {
    kind: 'MATTE_LAMINATE',
    label: 'Matte laminate',
    description: 'Coated matte film — low-glare topcoat, gentle sheen.',
    roughness: 0.8,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.7,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 0.6,
  },
  GLOSS_LAMINATE: {
    kind: 'GLOSS_LAMINATE',
    label: 'Gloss laminate',
    description: 'High-gloss coated film — sharp reflections, wet-look topcoat.',
    roughness: 0.15,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transmission: 0.0,
    ior: 1.5,
    thickness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 1.0,
  },
  SOFT_TOUCH: {
    kind: 'SOFT_TOUCH',
    label: 'Soft-touch',
    description: 'Velvety soft-touch laminate — diffuse, tactile, minimal glare.',
    roughness: 0.9,
    metalness: 0.0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.9,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.0,
    sheen: 0.5,
    sheenRoughness: 0.8,
    envMapIntensity: 0.4,
  },
  KRAFT: {
    kind: 'KRAFT',
    label: 'Kraft',
    description: 'Recycled brown kraft — rough, uncoated, natural fibre.',
    roughness: 0.95,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 0.3,
    suggestedBaseColorHex: '#b08d57',
  },
  UNCOATED_PAPER: {
    kind: 'UNCOATED_PAPER',
    label: 'Uncoated paper',
    description: 'Natural uncoated paper/label stock — matte, slightly toothy.',
    roughness: 0.85,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 0.35,
  },
  METAL: {
    kind: 'METAL',
    label: 'Metal / foil',
    description: 'Metallic foil or metal can/tin — reflective, conductive surface.',
    roughness: 0.25,
    metalness: 0.9,
    clearcoat: 0.2,
    clearcoatRoughness: 0.2,
    transmission: 0.0,
    ior: 1.5,
    thickness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 1.2,
  },
  GLASS: {
    kind: 'GLASS',
    label: 'Glass',
    description: 'Clear glass jar/bottle — transmissive, refractive, smooth.',
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.9,
    ior: 1.5,
    thickness: 0.5,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 1.0,
  },
  SHRINK_FILM: {
    kind: 'SHRINK_FILM',
    label: 'Shrink film',
    description: 'Glossy shrink sleeve / clear film — slight translucency, tight wrap.',
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    transmission: 0.15,
    ior: 1.45,
    thickness: 0.1,
    sheen: 0.0,
    sheenRoughness: 0.0,
    envMapIntensity: 0.9,
  },
}

// ── Accessors ────────────────────────────────────────────────────────────────
export function isPbrMaterialKind(v: unknown): v is PbrMaterialKind {
  return typeof v === 'string' && (PBR_MATERIAL_KINDS as readonly string[]).includes(v)
}

/** The preset for a kind. Total over the union — never undefined. */
export function getPbrPreset(kind: PbrMaterialKind): PbrPreset {
  return PBR_PRESETS[kind]
}

// ── Substrate → finish resolution (keyword-first, then category, then default) ─
export type SubstrateCategory =
  | 'PAPER_COATED'
  | 'PAPER_UNCOATED'
  | 'KRAFT_RECYCLED'
  | 'FILM_BOPP'
  | 'FILM_CLEAR'
  | 'FILM_METALLIC'
  | 'SPECIALTY'

const CATEGORY_TO_KIND: Record<SubstrateCategory, PbrMaterialKind> = {
  PAPER_COATED: 'GLOSS_LAMINATE', // coated → glossy unless slug says matte/soft-touch
  PAPER_UNCOATED: 'UNCOATED_PAPER',
  KRAFT_RECYCLED: 'KRAFT',
  FILM_BOPP: 'GLOSS_LAMINATE',
  FILM_CLEAR: 'SHRINK_FILM',
  FILM_METALLIC: 'METAL',
  SPECIALTY: 'SOFT_TOUCH',
}

// Ordered so the most specific finish wins (soft-touch before matte before gloss).
const KEYWORD_RULES: ReadonlyArray<readonly [readonly string[], PbrMaterialKind]> = [
  [['soft-touch', 'soft touch', 'softtouch', 'velvet', 'suede'], 'SOFT_TOUCH'],
  [['kraft'], 'KRAFT'],
  [['glass'], 'GLASS'],
  [['shrink', 'sleeve'], 'SHRINK_FILM'],
  [['metal', 'metallic', 'foil', 'aluminum', 'aluminium', 'tin', 'chrome'], 'METAL'],
  [['matte', 'matt', 'silk'], 'MATTE_LAMINATE'],
  [['gloss', 'glossy'], 'GLOSS_LAMINATE'],
  [['uncoated', 'natural', 'recycled'], 'UNCOATED_PAPER'],
]

export interface MaterialFinishInput {
  slug?: string | null
  name?: string | null
  substrateCategory?: string | null
}

/**
 * Map a DB `PackagingMaterial` (or any finish-ish descriptor) to a `PbrMaterialKind`.
 * Priority: explicit finish keywords in slug/name → SubstrateCategory → UNCOATED_PAPER.
 * Pure + deterministic; case/whitespace-insensitive.
 */
export function resolvePbrMaterialKind(input: MaterialFinishInput): PbrMaterialKind {
  const hay = `${input.slug ?? ''} ${input.name ?? ''}`.toLowerCase()
  for (const [keywords, kind] of KEYWORD_RULES) {
    if (keywords.some((k) => hay.includes(k))) return kind
  }
  const cat = input.substrateCategory?.trim().toUpperCase()
  if (cat && cat in CATEGORY_TO_KIND) return CATEGORY_TO_KIND[cat as SubstrateCategory]
  return 'UNCOATED_PAPER'
}

/** Convenience: resolve a descriptor straight to its preset. */
export function resolvePbrPreset(input: MaterialFinishInput): PbrPreset {
  return getPbrPreset(resolvePbrMaterialKind(input))
}
