# Handoff → Code: guided ("turnkey") mode for the product editor

**From:** Cowork · 2026-06-08
**Decision (Pavel):** the new-product flow should be a **6-step guided builder**, delivered as a **guided mode of the existing editor** (not a parallel `/build` route) — one source of truth, reusing the cards you already wired (`RecipeLabelPanel`, `FlavorPresetsPanel`, `IngredientsCard`, `VariantsCard`, `PackagingCard`, submit-readiness). This is your territory since you own/just enriched `EditorShell`.

## What Cowork already built (collision-safe, committed-ready)

- `products/new/build-actions.ts` → `createDraftShell({ name, subcategoryId })` — creates a minimal DRAFT `ProductTemplate` (no ingredients/packaging/variant yet; submit gate still applies later). Typecheck-clean.
- `products/new/page.tsx` + `products/new/BasicsStep.tsx` → **Step 0 (Basics)**: captures name + category/subcategory, calls `createDraftShell`, then `router.push('/products/${id}/edit?mode=guided')`. Shows the 6-step journey rail. Typecheck-clean.
- `BasicsStep.tsx` exports `GUIDED_BUILDER_STEPS` (the step labels) so the editor's rail can match.
- **Orphaned now → `git rm`:** `products/new/TurnkeyProductFlow.tsx` (the old thin 4-step flow, replaced by BasicsStep + guided editor).

So the entry already lands the partner in `/products/[id]/edit?mode=guided`. If guided mode isn't built yet, it just renders the normal editor (graceful — `?mode` is ignored).

## What to build: guided mode in `EditorShell`

When `searchParams.mode === 'guided'` (thread it from `edit/page.tsx` into `EditorShell`):

1. **Render one step at a time** instead of the full single-page card stack. Keep a `currentStep` state. The right rail (live FDA label / compliance / readiness) stays visible the whole time — that's the payoff of the guided flow.
2. **Top step rail** reusing the existing section-nav states (done/warn/todo), labels from `GUIDED_BUILDER_STEPS`.
3. **Prev/Next footer**; "Next" gated by the relevant existing readiness check (e.g. Recipe step needs ≥1 ingredient). Final step = **Review & submit** → reuse `submitProductForReview` + the readiness rail.
4. **Default (no `mode` param) = current single-page editor, unchanged.** No regression.

### Step → existing card mapping

| # | Step | Reuses |
|---|------|--------|
| 0 | Basics | Basics card (name/description/price + nutrient overrides / grouping panels) — already captured on entry, editable here |
| 1 | Variants & packs | `VariantsCard` |
| 2 | Recipe builder | `IngredientsCard` + `RecipeLabelPanel` (live label) + `AllergensCard` + `LabelPhrasesCard` |
| 3 | Packaging & die-lines | `PackagingCard` |
| 4 | Cost & pricing | price (Basics `priceFloorCents`) + `ProductTemplatePricingTier` UI |
| 5 | Review & submit | submit-readiness rail + `submitProductForReview` |

(Flavors/`FlavorPresetsPanel` can sit inside the Recipe step or as its own sub-section.)

### Order note
The prototype (`docs/prototypes/new-product-flow.html`) put Variants before Recipe, but **Recipe-before-Variants is more logical** since variants reference serving size that the recipe defines. Recommend: Basics → Recipe → Variants → Packaging → Pricing → Review. Pavel's call.

## Why this is clean
Everything the 6 steps need already lives in `EditorShell`'s cards (you wired the rich ones in `bcd0185` + `a42b214`). Guided mode is a *presentation layer* over them — no duplicated logic, no parallel data loaders, and the single-page editor remains for power users. The only new surface is the step shell + prev/next + the `?mode=guided` branch.
