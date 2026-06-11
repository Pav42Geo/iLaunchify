# Handoff to Code — finish the Recipe Builder (Step 3 of the turnkey product flow)

Owner: **Code** (single-writer — this is a Code hot file; Cowork won't touch it to
avoid collisions). File:
`apps/partner/src/app/(dashboard)/products/new/RecipeBuilderStep.tsx` (~555 lines).

Read first: `docs/MANUFACTURER_PRODUCT_BUILDER.md` (canonical builder spec, esp.
§4a ingredient sourcing), `docs/HANDOFF-TO-CODE-guided-builder.md`, and the memory
notes `ilaunchify-nutrition-engine`, `ilaunchify-configurator-constraints-spec`,
`ilaunchify-new-product-turnkey-flow`.

## What's already built (don't rebuild)

- **Recipe Ingredients table** (base): qty / unit / waste % / grams / total + delete,
  editable, debounced-persisted via `saveRecipeSlots(draftId, slots)` from `./build-actions`.
- **Optional Ingredients** table (separate section).
- **Real `IngredientPicker`** wired (`../[id]/edit/cards/IngredientPicker`, USDA /
  curated library / partner-private) via `handlePick` → adds rows with inline `per100g`.
- **ReciPal Packaging & Serving** card with `pack` / `adv` subtabs: By-package vs
  By-serving modes, package size, servings per package, moisture/cook-loss, with
  info-icon tooltips. (Partial — see gaps.)
- **Cost Summary** card (total ingredient cost · suggested retail/serving · per-serving;
  demo 4× markup) — needs the full breakdown (see gaps).
- **Live Nutrition Facts** right rail via the `@ilaunchify/nutrition` engine
  (`calculateLabel` + Public/Preview), with inline flavor editing.

## Gaps to finish (maps to the open tasks)

**Task #33 — replaceables + duplicate-warning + real 7-tab nav.**
- The 7 tabs (`🍽 BUILD RECIPE · ≣ INGREDIENTS · ⛨ ALLERGENS · $ COST · 🏷 LABEL ·
  🏷 MY RECIPES · ▦ RECIPE TEMPLATES`) are **decorative** — `i === 0 ? 'on'`, no
  switching, only BUILD RECIPE renders. Make them real tabs with panels.
- **Replaceables**: a base ingredient the Creator may swap (a "swap modal" + activate)
  — this binds to the option-axis SWAP overlay (`OptionAxesCard` / `recipeOverlay`,
  see `docs/HANDOFF-TO-CODE-option-overlay-binding.md`). Not built.
- **Duplicate-ingredient warning popup** on add (same baseIngredientId already in the
  recipe) — not built.

**Task #28 — tab panel content.** Ingredients (read-model of slots), **Allergens**
(reuse the existing `AllergensCard` — currently rendered as a sibling in
`GuidedBuilder`, fold it into the tab), Label, **Nutrition Breakdown** (per-nutrient
contribution table from the engine), Flavors (the FlavorPreset list).

**Task #34 — full Packaging/Serving + Cost breakdown.** The pack/adv subtabs +
info-icons exist; complete the **Advanced** tab (density overrides, rounding rules per
21 CFR) and replace the 3-tile Cost Summary with the **full breakdown**: per-ingredient
cost lines → ingredient subtotal → fees (reuse the `FeesCard` data) → margin → suggested
retail. Wire the real markup, not the demo `* 4`.

**Task #32 — already mostly done** (picker + persistence). Remaining: confirm the
flavor-mode path (base recipe + per-`FlavorPreset` overlay) persists correctly for
MULTI products, and drop any remaining demo-seed rows (`// Swaps to the live
IngredientPicker … when wired` seed).

## Wiring / contracts (already in place)

- Persist: `saveRecipeSlots(draftId, slots)` (`./build-actions`). Load-back:
  `initialRows` prop (from `loadDraft().recipeSlots`).
- Nutrition: `@ilaunchify/nutrition` `calculateLabel` / `toPanelData` →
  `NutritionFactsRenderer`. Ingredient nutrient lookup: `getIngredientNutrition`.
- Styling: the local `.rb` CSS scope at the bottom of the file (mood-board; no green
  on this surface).
- Allergens already exist as `AllergensCard` (`./AllergensCard`) — reuse, don't rebuild.

## Constraints

- **Single-writer**: Code owns this file. Commit early; Cowork won't edit it.
- Keep typecheck clean: `cd apps/partner && pnpm exec tsc --noEmit -p tsconfig.json`.
- Cast-guarded Prisma access stays until migrations are regenerated on the Mac.

## Acceptance

All 7 tabs switch and render real content; replaceable-swap modal + duplicate warning
work; Advanced packaging + full cost breakdown wired to real numbers; recipe + flavor
overlays persist and reload; live Facts label recomputes; partner app typechecks clean.
