// Packing-type consolidation (docs/PACKING_TYPE_CONSOLIDATION.md) — the engine
// branches on the 6 STRUCTURAL buckets, not the 15 merchandising presets. The
// presets still drive the picker UI; this maps the chosen preset's
// `PackingProfile.structuralType` to the builder's behavior. Single source so
// recipe shape / label topology / pack-config UI can't drift apart.

/** The 6 structural buckets (mirrors the Prisma `StructuralPackType` enum). */
export type StructuralPackType =
  | 'SINGLE_UNIT'
  | 'MULTI_UNIT_SAME'
  | 'MULTI_FLAVOR_MIXED'
  | 'MULTI_FLAVOR_COMPARTMENT'
  | 'PER_FLAVOR_IN_OUTER'
  | 'CUSTOMIZABLE_PICK_N'

/** Which builder config UI + recipe/label shape a structure drives:
 *  - `single` — one recipe, one label (SINGLE_UNIT, MULTI_UNIT_SAME)
 *  - `multi`  — base + flavor presets, one AGGREGATE label (MIXED, COMPARTMENT)
 *  - `pack`   — per-flavor units in an outer, a label/die-line per flavor
 *    (PER_FLAVOR_IN_OUTER, CUSTOMIZABLE_PICK_N) */
export type PackUiKind = 'single' | 'multi' | 'pack'

export function uiKindForStructuralType(
  st: StructuralPackType | null | undefined,
): PackUiKind | null {
  switch (st) {
    case 'SINGLE_UNIT':
    case 'MULTI_UNIT_SAME':
      return 'single'
    case 'MULTI_FLAVOR_MIXED':
    case 'MULTI_FLAVOR_COMPARTMENT':
      return 'multi'
    case 'PER_FLAVOR_IN_OUTER':
    case 'CUSTOMIZABLE_PICK_N':
      return 'pack'
    default:
      return null
  }
}

/** True when a structure carries more than one flavor (base + presets). */
export function isMultiFlavorStructure(st: StructuralPackType | null | undefined): boolean {
  const k = uiKindForStructuralType(st)
  return k === 'multi' || k === 'pack'
}

/** Pack-config kind for a profile: prefer the 6-value structuralType (single
 *  source); fall back to the legacy flavorMode + packStructure derivation for
 *  any profile not yet carrying a structuralType (so un-seeded rows still work). */
const LEGACY_PACK_STRUCTS = ['OUTER_WITH_INNERS', 'INDIVIDUAL_IN_OUTER', 'CUSTOMIZABLE']

export function packUiKindForProfile(profile: {
  structuralType?: StructuralPackType | string | null
  flavorMode: 'SINGLE' | 'MULTI'
  packStructure: string
}): PackUiKind {
  const fromStructural = uiKindForStructuralType(profile.structuralType as StructuralPackType | null)
  if (fromStructural) return fromStructural
  if (profile.flavorMode === 'SINGLE') return 'single'
  return LEGACY_PACK_STRUCTS.includes(profile.packStructure) ? 'pack' : 'multi'
}
