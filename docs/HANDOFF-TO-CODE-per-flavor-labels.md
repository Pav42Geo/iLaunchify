# Handoff to Code — Per-flavor labels & die-lines in the Design Studio

**Owner:** Code (creator Design Studio + partner builder are both its hot-file zones).
**Why:** Today a multi-flavor variety pack where each unit is its own flavored container (a 12-pack = 3 flavors × 4 cans, each can its own label) **cannot** be designed — the Studio loads ONE product-scoped design and never iterates flavors. The aggregate single-label case (one variety *box*, multi-column Nutrition Facts) already works. This adds per-flavor-unit label design.

## 0. Diagnosis (verified)

- `Design` is product-scoped ("one Design per surface/die-cut"); `DesignVersion` has no flavor field.
- Studio loader `apps/creator/.../design/canvas/page.tsx` → `loadDesignJson(productId)` (and `saveDesignJson`) are product-only — never iterate flavors. `LabelDrawer.flavorCount` only drives the **aggregate multi-column nutrition panel** (one label), not separate designs.
- **Substrate that exists but is INERT in the Studio:** `PackagingComponent` (product-scoped) already has `flavorPresetId`, `designVersionId`, and `dielineId`. These are read ONLY in checkout (`(checkout)/.../component-actions.ts`, `cart-actions.ts`, `review-actions.ts`, `adjust-actions.ts`), never in the Studio. PackagingComponent rows are CREATED at checkout (`component-actions.ts` line ~192/388), i.e. AFTER design — so they can't be the pre-checkout design home.
- `FlavorPreset` (template-level: name, `swatchHex`, `statementOfIdentity`, `slotResolution`, `extras`) has **no die-line/surface link**.

## 1. LOCKED decisions (Pavel 2026-06-18)

- **Design UX = shared base + per-flavor overrides.** One base canvas; per flavor the accent color (`FlavorPreset.swatchHex`), flavor name (`FlavorPreset.name`/`statementOfIdentity`), and nutrition auto-bind to that flavor's recipe. The creator may tweak per-flavor. Each flavor still persists its own `DesignVersion`.
- **Authoring scope = partner pre-defines per-flavor die-line slots.** The partner declares, in the builder, that a packing type's flavors are individually labeled and which die-line/surface each flavor uses (default: the shared template die-line). The creator fills each flavor's artwork.
- Design the FLAVOR POOL, not the order-time pack picks: the creator authors per-flavor labels for the FlavorPresets the product offers; checkout pack composition then reuses them.

## 2. Schema — SUBSTRATE ALREADY LAID (commits `3574a43` + `8262205`, additive, Mac migration pending)

Cowork laid the no-regret columns + enum:
- **`enum LabelTopology { SINGLE, AGGREGATE, PER_FLAVOR }`** + **`PackingProfile.labelTopology LabelTopology @default(SINGLE)`** — the "is this individually-labeled?" marker, declared PER PACKING TYPE (the 15 types), seeded with sensible defaults (3 SINGLE, 2 AGGREGATE, 10 PER_FLAVOR — see `seed-packing-types.ts TOPOLOGY`), admin-overridable via `/admin/packing-types`. **This replaces the earlier "perFlavorLabels marker" open question.** Gate per-flavor design on `PackingProfile.labelTopology === 'PER_FLAVOR'`; keep the aggregate path for `AGGREGATE`; single label for `SINGLE`.
- **`Design.flavorPresetId String?`** (+ `@@index([productId, flavorPresetId])`) — null = the shared BASE design; a FlavorPreset id = that flavor's label. Reuses `DesignVersion` versioning. (No `@@unique` added — a product already has multiple Designs per surface; enforce one-design-per-(product,flavor,surface) in app logic.)
- **`FlavorPreset.dielineId String?`** — optional per-flavor die-line override; null = the shared template/packaging die-line (the common case: same can, different label).

Code still owns the app wiring (loaders/UI/checkout) below; the schema is staged so you don't start with a migration. The "shared base + override" deltas are mostly AUTO (name/color/nutrition derive from `FlavorPreset` + the per-flavor recipe) — the per-flavor `DesignVersion.designJson` = base JSON with the flavor name/color tokens swapped + the flavor's nutrition panel bound; explicit manual per-flavor tweaks just live in that flavor's `DesignVersion.designJson`.

## 3. Partner builder change

In the flavor/packs step (where FlavorPresets are authored): when the packing type is "individually-labeled flavors", expose a per-flavor row to (optionally) pick a die-line; default to the shared template die-line. Persist `FlavorPreset.dielineId` (+ the `perFlavorLabels` marker if added). Mirror the existing autosave + audit pattern (`build-actions.ts`).

## 4. Creator Studio change

- **Loader** (`design/canvas/page.tsx`): resolve the product's enabled FlavorPresets (via its ProductTemplate). If `perFlavorLabels` (or derived), pass `flavors: {flavorPresetId, name, swatchHex}[]` + the active flavor into the shell. Resolve the per-flavor die-line (FlavorPreset.dielineId ?? shared) for guides.
- **loadDesignJson/saveDesignJson** (`actions.ts`): add an optional `flavorPresetId` param; load/save the Design row for `(productId, flavorPresetId)`. Null = base.
- **Flavor switcher UI** (`CanvasLayoutShell` / a new toolbar control): tabs/dropdown of the flavors; switching loads that flavor's canvas (base JSON + that flavor's name/color/nutrition applied). Title reflects the active flavor ("Designing — Berry").
- **Shared base flow:** editing the base (no flavor selected) updates all flavors' shared elements; per-flavor edits stay on that flavor's DesignVersion. Simplest V1: "Apply base to all flavors" action that clones the base JSON into each flavor's DesignVersion, then per-flavor tweaks layer on top. Keep the existing single-design path untouched when `perFlavorLabels` is false.
- **Nutrition:** reuse the per-flavor recipe → panel path already proven in `getVarietyPreviewColumns` (creator labels) so each flavor's panel is real, not sample data.

## 5. Checkout wiring (close the loop)

At checkout, when per-flavor `PackagingComponent` rows are created (`component-actions.ts`), set each component's `designVersionId` to the matching flavor's latest `DesignVersion` (resolve via `Design.flavorPresetId`). The order then carries the right per-flavor artwork into production/manifest (per-flavor manifest splits already exist).

## 6. Compliance / die-line guides

Each flavor's canvas loads its resolved die-line's `trimBox`/`safeAreaBox`/`frames` as guides (Phase B die-line work). `checkFrameCompliance` runs per flavor at submit. The aggregate-panel path (single variety box) is unchanged and remains valid for that packaging shape.

## 7. Acceptance

- Partner marks a packing type's flavors as individually labeled, assigns (or defaults) a die-line per flavor.
- Creator opens the Studio for a per-flavor product → a flavor switcher; each flavor shows the base art + its own name/color/real nutrition; per-flavor edits persist independently.
- Single-package (aggregate) products are unaffected — still one multi-column label.
- Checkout copies each flavor's DesignVersion onto its PackagingComponent; manifest shows per-flavor artwork.
- Typecheck `apps/creator` + `apps/partner` + `packages/db` clean.

## 8. Files

- `packages/db/prisma/schema.prisma` — `FlavorPreset.dielineId`, `Design.flavorPresetId` (+ marker), additive.
- `apps/partner/.../products/new/*` — per-flavor die-line slot in the flavor/packs step + `build-actions`.
- `apps/creator/.../design/canvas/page.tsx`, `actions.ts` (loadDesignJson/saveDesignJson), `CanvasLayoutShell.tsx`, a flavor-switcher control, `LabelDrawer.tsx` (keep aggregate path; add per-flavor path).
- `apps/creator/.../(checkout)/.../component-actions.ts` — set `PackagingComponent.designVersionId` per flavor.

No marketing/admin change. The aggregate variety-box label (multi-column) stays as-is; this is the orthogonal "each flavored unit its own label" path.
