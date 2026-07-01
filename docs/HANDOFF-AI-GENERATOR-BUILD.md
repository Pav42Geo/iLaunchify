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
- P3 provider layer — **BUILT** in `@ilaunchify/imagegen` (golden-tested, keyless-safe):
  - `createStubProvider()` — deterministic, no network; the pipeline always runs.
  - `createFalProvider()` — FLUX.1 raster + upscale over fal's REST (`Authorization: Key`);
    ControlNet model path used when a keep-clear mask is present.
  - `createRecraftProvider()` — vector type via `api.recraft.ai` (`style: vector_illustration`).
  - `resolveImageGenProvider(env)` — composes fal (raster/upscale) + Recraft (vector),
    falling back to the stub per-capability; reports `fullyReal` + `backing`.
  - `runDraftGeneration()` / `runFinalizeGeneration()` — budget-checked orchestrators that
    debit the metering ledgers (draft cycle; finalize MP + stored bytes) and NEVER call a
    provider over budget. Return a `debit` the server action persists (package stays DB-free).
  The `AiDesignGeneration` FSM server action is **BUILT** —
  `apps/creator/src/app/(studio)/studio/ai-create/actions.ts`:
  - `generateAiConcepts(input)` — draft cycle: tier-gated, budget-checked, creates an
    `AiDesignGeneration` row (RUNNING→READY|FAILED), debits `AiGenerationUsage.draftCyclesUsed`,
    writes an `AI_DESIGN_GENERATED` audit row, returns concept SVG/URLs. Runs against the
    stub today; swaps to fal/Recraft automatically when keys are present.
  - `finalizeAiConcept(input)` — upscales the chosen concept, debits `finalizeMpUsed` +
    `GenerationStorageUsage.kilobytesUsed`, audits `AI_DESIGN_FINALIZED`.
  All writes cast-guarded (compile/degrade before `db:push`). Added `AiDesignGeneration`
  to `AUDIT_ENTITY_TYPES`.

  Remaining to go fully live:
  1. **Keys** — `FAL_KEY` + `RECRAFT_API_KEY` in the Integrations registry (env). Until then
     the stub serves; the action + metering already work.
  2. **Panel wiring** (with the Studio-tab mount, Code's shell) — pass the server action to
     `AiCreatePanel` as an RSC server-action prop and call it from `generate()`. Draft px
     ≈ 1 MP preserving the die-line aspect; prompt/negative/mask come from the plan:
     ```ts
     const refs = await generateAiConcepts({
       prompt: plan.prompt, negativePrompt: plan.negativePrompt, mask: plan.maskSvg,
       widthPx, heightPx, dielineId, productTemplateId, brandId,
       brandPalette, domain, market, complianceJson: plan.compliance, seed,
     })
     // refs.ok ? refs.images : []
     ```
  3. **R2 persistence** of `variationKeys` (currently images return inline; storage upload
     is the one leaf left).
- Coordinated-set + flavor-series UI; template management (product-aware matching +
  per-creator compliance re-validation).

## 5. Still gated on Pavel
- Final **price points + allotments** (seed values in `DEFAULT_TIER_LIMITS` /
  `DEFAULT_OUTPUT_POLICIES`).
- The **fal + Recraft API keys** (P3 unlock).
