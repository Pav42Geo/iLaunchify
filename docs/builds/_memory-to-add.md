# Memory files to add — Pavel, drop these into `.claude/memory/`

Cowork can't write into `.claude/memory/` in the current session (protected path). Please copy the content below into the respective files. The MEMORY.md / INDEX.md entries are at the bottom.

---

## File 1 — `.claude/memory/ilaunchify-recipe-builder-modes.md`

```markdown
---
name: ilaunchify-recipe-builder-modes
description: "Partner Product Builder Ingredients card has 3 recipe-entry modes — Search & build (free on every tier), AI Recipe Parser (Builder+ only), Declare the panel (tier TBD). Schema decisions locked for Mode 3."
metadata:
  type: project
---

The Partner Product Builder's Ingredients card (`apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx`) supports three recipe-entry modes. Audit + design landed 2026-06-01.

## Mode 1 — Search & build (free, all tiers)

The current shipped flow. Search USDA + Library + Partner-private via `IngredientPicker.tsx`, add per slot with grams + lock toggle + replacements list. Continues as the default and the fallback for the other modes.

## Mode 2 — AI Recipe Parser (Builder+ only)

**Tier gate: locked to Builder + Agency.** Maker does not get this feature. Implementation:

```ts
import { hasFeature } from '@ilaunchify/auth/tiers'
if (!hasFeature(creatorTier, 'ai-recipe-parser')) {
  return { ok: false, error: 'upgrade-required' }
}
```

Add `'ai-recipe-parser'` to the `PlanFeature` rows seeded in `packages/plans` when shipping the Mode 2 slice — Builder + Agency = true, Maker = false.

V1 ships paste-text only (Claude Haiku via Anthropic SDK — not yet wired in the monorepo; first use). V1.1 ships PDF/PNG upload via R2 + Tesseract.js OCR feeding the same LLM flow. V1.2 ships photo capture. The mode chooser shows the file-upload and camera as disabled with "v1.1" / "v1.2" badges in V1.

No `ParsedRecipeDraft` model — staging is client-side only. The "Review extracted" step calls `addIngredientSlot` once per accepted line on the partner's "Add N to recipe" commit. Matches the existing per-slot autosave shape.

Banned-list save-time enforcement (Slice 1 pre-work) must land before this mode ships — Mode 2 will spray slot writes in bulk and bypass any ban check that isn't on the slot-create path.

## Mode 3 — Declare the panel (tier TBD)

For partners with a pre-tested COA. Partner types the Nutrition or Supplement Facts directly; FDA-style live label renders as fields fill. **Why:** Pavel locked this as a needed shape because some partners have already-tested formulations and shouldn't have to enumerate ingredients to publish the panel.

**Schema implementation** (locked):
- Add `ProductTemplate.nutrientSource` enum: `COMPUTED | DECLARED` (default `COMPUTED`).
- When mode 3 saves, write a synthetic `PARTNER_PRIVATE` "Whole product" Ingredient holding the declared values, set `nutrientSource = DECLARED`.
- Compliance service: when `nutrientSource = DECLARED`, skip per-ingredient summation, pull values from the synthetic ingredient.

**Public surface:**
- Product detail page renders an "Entered by partner — not computed by iLaunchify" disclosure wherever the panel surfaces.
- Label render adds a "Declared by manufacturer" caption.
- Required by `docs/legal/FDA_REGULATORY_POSTURE.md` — the "compliance scan is assistance only" contractual stance breaks if the platform presents declared panels as platform-attested.

Tier gate: not locked. Lean Builder+ for parity with Mode 2, but Pavel hasn't decided. Brief the Mode 3 slice with that as the recommended default; surface for confirmation.

## Pre-work that must land before any of the new modes (Slice 1)

See `docs/builds/ingredients-prework-slice-1.md`.

1. **Banned-list save-time enforcement** on `addIngredientSlot` + `updateIngredientSlot` + `addReplacement` — closes the contradiction with Creator Agreement §3.
2. **Picker empty-state staples panel** — server route currently short-circuits at `q.length < 2`; fix to return recently-used + library staples.
3. **Recently-used recall** — surface `IngredientUsage` data scoped to calling partner.

All three are bugfix / polish, no schema, no tier gates. Must land before Mode 2.

## Mode chooser UX

A 3-tile chooser at the top of the Ingredients card when the recipe is empty. Once any slot exists, collapses to a small pill showing the primary entry method ("Built with: Parse with AI · Switch mode"). Persist the primary method on `ProductTemplate.recipeEntryMode` for analytics. Modes are NOT mutually exclusive within a single recipe — a partner can start in AI mode, accept 8 lines, then add two more in Search & build mode.

## Why this matters

The legacy FOD `EnhancedRecipeBuilder.tsx` was 7,812 lines, single-component, USDA-only, with a buried text-paste AI feature at lines 3521–3620. Pavel and I re-scoped it in `docs/MANUFACTURER_PRODUCT_BUILDER.md` to slot-based + live preview + small cards. The three-mode chooser is the next layer on top — it surfaces the existing flow as one of three intentional entry points instead of the only one, and unlocks both the "I have a recipe document" and "I have a tested COA" workflows the legacy builder couldn't serve.

See also: [[ilaunchify-ingredient-sourcing]], [[ilaunchify-ingredient-governance]].
```

---

## File 2 — append one line to `.claude/memory/MEMORY.md` (Project context section)

Add this line near the bottom of `## Project context`, after the existing taxonomy / niche memories:

```
- [Recipe Builder 3-mode plan](ilaunchify-recipe-builder-modes.md) — Partner IngredientsCard: Mode 1 Search & build (free), Mode 2 AI Recipe Parser (Builder+ gated), Mode 3 Declare panel (tier TBD). Slice 1 pre-work is banned-list + picker empty-state + recently-used.
```

---

## File 3 — append one line to `.claude/memory/INDEX.md` under `### Phases`

```
- `ilaunchify-recipe-builder-modes.md` — 3-mode Ingredients card; AI parser gated to Builder+
```
