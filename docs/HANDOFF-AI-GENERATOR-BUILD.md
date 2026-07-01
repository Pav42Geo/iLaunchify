# Handoff — AI Packaging Generator build (Mac steps)

The real build of the AI Packaging Generator has started. Spec = `AI_PACKAGING_GENERATOR.md`.
Everything below is committed + typechecks in the sandbox; these are the steps to run on
the Mac so it links + migrates.

## 1. Install the new workspace packages
Two new pure packages were added and are now depended on by `@ilaunchify/ui`, the creator
app, and the admin app:
- `@ilaunchify/ai-design` — prompt / mandatory-elements / domain presets / compliance /
  flavor-series engines.
- `@ilaunchify/imagegen` — provider seam + metering + output-policy engines.

```
pnpm install
```
(Adds them to the workspace + links; sandbox uses temporary symlinks that pnpm recreates.)

## 2. Push the additive schema
All additive (no drops). Models added across the build:
- `AiDesignGeneration` (+ `AiGenScope`, `AiGenStatus` enums) — a generation run + admin
  save-as-template classification (`savedTemplateId` / `packagingCategoryId` /
  `dieCutTemplateId`).
- `AiGenerationUsage`, `AiGenerationCredit`, `GenerationStorageUsage` — metering ledgers.
- `AiOutputPreset` — admin-authored output presets.
- `AiGeneratorSettings` — the admin-config singleton (JSON overrides).

```
pnpm db:push
pnpm db:generate
rm -rf apps/*/.next
# restart next dev
```

After `db:generate`, the cast-guarded db helpers (`getAiGeneratorSettings`,
`listAiOutputPresets`, etc.) start reading real rows instead of returning defaults.

## 3. What's live after this
- **Admin → AI Generator** (`/ai-generator`, catalog:write): Providers readiness, Tier
  limits, Per-domain vocab, Output caps, Output presets CRUD, Gates. Edits persist to
  `AiGeneratorSettings` / `AiOutputPreset`.
- **Creator `/studio/ai-create`** now runs on the REAL loader when given `?productId=…`:
  `loadAiCreateProps(productId, userId)` (`apps/creator/src/app/(studio)/studio/ai-create/loader.ts`)
  resolves the product's actual die-line SET (frames + mm dims via `productTemplatePackaging`
  → `packagingTypeId` → `packagingDieline`), Brand Kit palette (brand colors + swatches),
  regulatory domain (`labelingType`, SUPPLEMENT category override), creator tier, remaining
  draft credits (tier cap − `AiGenerationUsage` this period), and the admin-tuned per-domain
  chip vocab (`resolveDomainOptions`). No `productId` → fixture demo fallback (placeholder art).
  Cast-guarded, so it returns usable props even pre-`db:push`.

## 3b. Multi-die-line + flavour modes (live in the panel)
`AiCreatePanel` now has three scopes, driven by props (no new deps):
- **One die-line** — original single-surface flow.
- **Coordinate set** (shows when >1 die-line) — `planGenerationSet`: one shared brief +
  seed across every die-line, per-surface preview cards, **package-level** compliance
  (a required mark only needs to appear on one surface). Jar front + circular top label,
  box + outer carton, any multi-die-line pack.
- **Flavour family** (shows when the optional `flavors` prop has >1 entry) —
  `planFlavorSeries`: generate ONE master, then N flavours **derive** from it (recolour
  the `FLAVOR_ACCENT` role + swap the flavour element), so the brand look is identical and
  only the accent differs. Shows the locked master, the derived-flavour strip (accent
  swatch + element cue), held-constant invariants, and any rejected specs.

The fixture demo exercises all three, and the **real loader now populates `flavors`**:
`loadAiCreateProps` reads the product's ACTIVE `FlavorPreset` rows and maps each accent from
`swatchHex`, falling back to the brand palette, then a default ramp — no migration needed.
Flavour-family mode appears automatically for any product with ≥2 flavours.

## 4. Still to build (next slices)
- Mount `AiCreatePanel` into the **Studio → Templates** tab, passing `?productId` of the
  open product. (Studio shell is Code's hot file — coordinate; the loader + route are ready
  to consume.) Wire two callbacks so generated concepts leave the panel:
  - `onEditInStudio({ svg, dielineId, label })` — load the concept onto the Fabric canvas.
    In admin (template-author) mode, saving then reuses the existing
    `saveStudioLibraryTemplate` flow (system-templates brand + category/die-line metadata) —
    the AI panel does NOT need its own save-as-template path.
  - `onExport({ svg, dielineId, label })` — hand off to the existing label export.
  Until wired, both buttons are hidden (no dead controls).
- P3: fal + Recraft adapters implementing `ImageGenProvider`; `AiDesignGeneration` FSM
  wired to debit usage via the metering engine. **Needs `FAL_KEY` + `RECRAFT_API_KEY`.**
- Coordinated-set + flavor-series UI; template management (product-aware matching +
  per-creator compliance re-validation).

## 5. Still gated on Pavel
- Final **price points + allotments** (seed values in `DEFAULT_TIER_LIMITS` /
  `DEFAULT_OUTPUT_POLICIES`).
- The **fal + Recraft API keys** (P3 unlock).
