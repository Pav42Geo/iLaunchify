# Packing-type consolidation — 15 presets → 6 structures

**Decision (Pavel 2026-06-18):** the 15 `PackingType` / `PackingProfile` rows are over-modeled for the engine — most are the same physical structure with a different marketing name. Keep them as friendly **merchandising presets** for the partner picker, but make the engine branch on **6 structural types**. Done WITHOUT a destructive migration (the 15-value enum is wired into the builder + `ProductTemplateVariant.packingType`, both Code's hot-file zones).

## The 6 structures (`enum StructuralPackType`)

| Structure | Physical reality | Label (`labelTopology`) | Die-line |
|---|---|---|---|
| `SINGLE_UNIT` | 1 flavor, 1 container | SINGLE | one |
| `MULTI_UNIT_SAME` | 1 flavor, N identical units | SINGLE | one |
| `MULTI_FLAVOR_MIXED` | many flavors loose in one pack | AGGREGATE | one |
| `MULTI_FLAVOR_COMPARTMENT` | many flavors in divided sections | AGGREGATE | one (sectioned) |
| `PER_FLAVOR_IN_OUTER` | N flavored units boxed together | PER_FLAVOR | per flavor |
| `CUSTOMIZABLE_PICK_N` | buyer/creator picks the mix | PER_FLAVOR | per flavor |

## 15 → 6 mapping (seeded in `seed-packing-types.ts`)

| Preset (PackingType) | structuralType | merchandisingTag |
|---|---|---|
| single-flavor-single-pack | SINGLE_UNIT | — |
| single-flavor-multipack | MULTI_UNIT_SAME | — |
| value-bulk-single | MULTI_UNIT_SAME | bulk |
| multi-flavor-mixed | MULTI_FLAVOR_MIXED | — |
| multi-flavor-compartment | MULTI_FLAVOR_COMPARTMENT | — |
| multi-flavor-individual-in-outer | PER_FLAVOR_IN_OUTER | — |
| sampler-mini | PER_FLAVOR_IN_OUTER | sampler |
| subscription-rotating | PER_FLAVOR_IN_OUTER | subscription |
| gift-premium | PER_FLAVOR_IN_OUTER | gift |
| value-bulk-variety | PER_FLAVOR_IN_OUTER | bulk |
| seasonal-limited | PER_FLAVOR_IN_OUTER | seasonal |
| pairing-functional | PER_FLAVOR_IN_OUTER | pairing |
| retail-counter-display | PER_FLAVOR_IN_OUTER | retail |
| refill-eco | PER_FLAVOR_IN_OUTER | refill |
| customizable-pick-n | CUSTOMIZABLE_PICK_N | — |

9 of 15 collapse to `PER_FLAVOR_IN_OUTER`; 2 to `MULTI_UNIT_SAME`. The difference between the collapsed ones is purely merchandising / size / the `isSubscription` flag — none of which forks recipe/label/die-line logic.

## Substrate LAID (Cowork, additive — commits `23f55ab` schema + the seed commit)

- `enum StructuralPackType` (6).
- `PackingProfile.structuralType StructuralPackType?` + `PackingProfile.merchandisingTag String?` (nullable, seeded for all 15).
- `labelTopology` already aligns (SINGLE/AGGREGATE/PER_FLAVOR per structure).
- The 15 rows are untouched as presets → no breakage. Pavel can thin the partner picker anytime via `PackingProfile.isActive` (no schema change).

## Cutover — HANDOFF TO CODE (builder + variant are its hot zones)

1. **Engine/builder reads `structuralType`, not the 15-value `group`/`packingType` enum.** Wherever logic branches on `PackingType` (recipe shape, flavorMode gating, label columns, die-line/pack structure, the builder's "Choose product type" gate), switch to the 6-value `PackingProfile.structuralType`. The 15 presets still drive the *picker UI*; the engine maps the chosen preset → `structuralType`.
2. **`ProductTemplateVariant.packingType`** (the parallel 15-value enum on the variant): either (a) add `ProductTemplateVariant.structuralType` and migrate reads, or (b) resolve structuralType from the template's `PackingProfile`. Prefer (b) — single source.
3. **Partner picker:** group/curate the presets (or show fewer) — `isActive` already supports hiding presets without code.
4. **labelTopology** (already laid) and `structuralType` stay consistent — the per-flavor-labels feature (`docs/HANDOFF-TO-CODE-per-flavor-labels.md`) gates on `labelTopology === 'PER_FLAVOR'`, which equals `structuralType ∈ {PER_FLAVOR_IN_OUTER, CUSTOMIZABLE_PICK_N}`.

Don't delete the 15-value `PackingType` enum until the variant + builder reads are migrated — keep it as the preset key.
