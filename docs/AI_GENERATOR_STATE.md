# AI Packaging Generator — state of the build (2026-07-01)

Quick-reference for the next session: what's **built + verified**, what's **gated**, and where
each piece lives. Full spec: `AI_PACKAGING_GENERATOR.md`. Mac steps: `HANDOFF-AI-GENERATOR-BUILD.md`.

## Thesis (unchanged)

Two-layer, **die-line-first** generation. AI paints only the CREATIVE layer into an EXISTING
die-line (or die-line SET); the TRUTH layer (Facts panels, ingredients, allergens, barcode, FDA
marks) is rendered deterministically as vector and never AI-drawn. Domain shapes the creative,
never compliance.

## Built + verified (green)

All packages typecheck; all golden suites pass (`ai-design`, `imagegen`, `ui/template-match`).

### Pure engines — `packages/ai-design`
- `prompt.ts` — `assemblePrompt` (positive + truth-suppressing negative; domain tone).
- `mandatory.ts` — required-element packs + `evaluateCompliance` / `evaluateCompliancePackage`
  (package-level UNION for multi-surface sets).
- `domainPreset.ts` — per-domain styles/colors/elements/tone/substrate + `resolveDomainOptions`.
- `flavorSeries.ts` — `planFlavorSeries`: one master → N flavour derivatives (recolor
  `FLAVOR_ACCENT` + element swap; deterministic `master:flavorId` seeds).

### Orchestration + composite — `packages/ui/src/canvas`
- `aiPlan.ts` — `planGeneration` (single die-line) + `planGenerationSet` (coordinated set,
  shared seed, package compliance).
- `aiComposite.ts` — mask + reserved-zone + placeholder composite.
- `Dieline3DViewer.tsx`, `dielinePdf.ts` — 3D fold viewer + PDF/AI die-line parse.

### Metering + providers — `packages/imagegen`
- `metering.ts` — tier limits, megapixels, draft/finalize quotes, budget checks, storage est.
- `output.ts` — `resolveOutputPolicy` + `clampOutput` + `OutputPreset`.
- `provider.ts` — `ImageGenProvider` seam + `providerStatus(env)`.
- `adapters/` — `stub` (deterministic, keyless), `fal` (FLUX raster + ControlNet-on-mask +
  upscale, REST), `recraft` (vector type, REST).
- `resolve.ts` — `resolveImageGenProvider(env)` composes fal + Recraft, stub fallback per
  capability; reports `fullyReal` + `backing`.
- `orchestrator.ts` — `runDraftGeneration` / `runFinalizeGeneration`: budget-checked, never
  call a provider over budget, return a `debit` the caller persists (package stays DB-free).

### Template scoping — `packages/ui/src/lib/template-match.ts`
- `matchTemplatesToProduct` — die-line-scoped matching (EXACT `packagingTypeId` or
  SHAPE_FAMILY = container + aspect bucket), grouped by style.
- `deriveTemplateTargeting` — one shared derivation for every save path (prefers real
  `ContainerCategory`, falls back to the die-cut map; aspect from dims).
- `DIE_CUT_CATEGORY_TO_CONTAINER` — full 35-value die-cut taxonomy → container.

### Data + admin
- Schema (additive, **needs `db:push` on Mac**): `AiDesignGeneration`, `AiGenerationUsage`,
  `AiGenerationCredit`, `GenerationStorageUsage`, `AiOutputPreset`, `AiGeneratorSettings`;
  enums `AiGenScope`/`AiGenStatus`; `DieCutCategory` expanded 6→35.
- `packages/db/src/ai-generator-settings.ts` — cast-guarded settings singleton + presets CRUD.
- Style taxonomy — `TemplateStyle` (26–30 per domain × 4 facets), seeded
  (`seed-template-styles.ts`). Admin authors via `saveStudioLibraryTemplate`.
- **Admin → AI Generator** (`/ai-generator`) — providers, tier limits, per-domain vocab,
  output caps, output presets CRUD, gates.
- **Admin → Developer** (`/developer`) — fal.ai + Recraft rows (env status + rotation), added
  2026-07-01.

### Creator surface
- `AiCreatePanel` — three scopes: One die-line / Coordinate set (>1 die-line) / Flavour family
  (>1 flavour). Tier-gated (Builder/Agency/admin; Maker → premium templates). Compliance chip,
  brand palette, per-domain chip vocab, `onEditInStudio`/`onExport` result seam.
- `loader.ts` — `loadAiCreateProps(productId, userId)`: real die-line SET + Brand Kit palette +
  domain/market + tier + credits + flavours (from `FlavorPreset.swatchHex`).
- `actions.ts` — `generateAiConcepts` (draft) + `finalizeAiConcept`: FSM
  (RUNNING→READY|FAILED), debits usage + storage, audits, cast-guarded. Runs on the stub today;
  swaps to fal/Recraft on keys with no code change.
- Route `/studio/ai-create` — real loader when `?productId`, fixture demo otherwise.

## Gated / remaining

1. **API keys** — set `FAL_KEY` + `RECRAFT_API_KEY` in the host env (surfaced at
   `/developer`). Until then the stub serves; everything else already runs.
2. **Mac apply** — `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next` to make the
   additive schema (AI models + expanded `DieCutCategory`) real.
3. **Panel wiring** — pass `generateAiConcepts` into `AiCreatePanel` as an RSC server-action
   prop and call it from `generate()` (draft px ≈ 1 MP at the die-line aspect). Snippet in
   `HANDOFF-AI-GENERATOR-BUILD.md`. Pairs with the Studio → Templates mount (**Code's hot
   file** — coordinate).
4. **R2 persistence** — upload variation images and store `variationKeys` (currently returned
   inline).
5. **Pavel decisions** — final tier price points + allotments (seeds in `DEFAULT_TIER_LIMITS` /
   `DEFAULT_OUTPUT_POLICIES`).

## First moves next session
- If keys are in: do #2 (Mac apply), then #3 (panel wiring) with Code, and generation is live
  end-to-end on real models.
- If not: everything is demoable on the stub at `/studio/ai-create` right now.
