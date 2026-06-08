# Handoff → Code: migrate the uncommitted product-schema additions + remove stray `20260605062339_`

**From:** Cowork session · 2026-06-07
**Why:** The shared dev DB and the regenerated Prisma client are out of sync. Code's `prisma-migrator` subagent regenerated the client off the working-tree `schema.prisma` (which contains Cowork's uncommitted schema additions), so the client now `SELECT`s columns that aren't in the DB → **P2022 on every `ProductTemplate` query**. These additions are Cowork's; this note hands the migration to Code as requested.

## What needs to land in the DB

All of the following are **already present in `schema.prisma`** (do NOT re-edit the schema — the client was regenerated off exactly these). They are all additive / nullable / defaulted, CockroachDB-safe (no `@db.Text`):

- **`ProductTemplate`**: `labelingTypeLocked Boolean @default(true)`, `statementOfIdentity String?`, `familyCode String?`, plus `@@index([familyCode])`
- **`ProductTemplateVariant`**: `sku String?`, `gtin String? @unique`, `gtinSource GtinSource @default(USER_PROVIDED)`, plus `@@unique([productTemplateId, sku])`
- **`FlavorPreset`**: `statementOfIdentity String?`

`GtinSource` enum and the `FlavorPreset` table already exist in the DB (FlavorPreset from `20260525041217_…`), so the real diff is just the columns/constraints above.

Rationale for placement is locked in memory (`ilaunchify-soi-sku-label-lock`): SoI is per-recipe (FlavorPreset + ProductTemplate default), SKU/GTIN are per sellable config (variant), `labelingTypeLocked` is category-derived.

## Blocker to clear first: stray migration `20260605062339_`

`migrate dev` fails with **P3006** on `20260605062339_`: it `ALTER TYPE "MandatoryPhraseCategory"` at timestamp 06:23, **before** `20260605120000_mandatory_phrases` creates that enum at 12:00 → shadow replay errors `type "MandatoryPhraseCategory" does not exist`.

Facts:
- It is **unapplied** (confirmed by Code) and **staged but uncommitted** (`git status` shows `A  …/20260605062339_/migration.sql`).
- Its contents are **100% duplicated** by the correctly-ordered, applied `20260605130000_phrase_requirement` (same `PhraseRequirement` enum, same 3 `MandatoryPhraseCategory` values, same `MandatoryPhrase.requirement` column).
- Cowork's `mv` kept getting reverted because the file is staged in the index — only a `git rm` makes the removal stick.

## Steps

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify

# 1. Remove the stray (unapplied → no drift). The applied 20260605130000_ already covers it.
git rm -f "packages/db/prisma/migrations/20260605062339_/migration.sql"
rm -rf "packages/db/prisma/migrations/20260605062339_" "packages/db/prisma/.migration-trash"

# 2. Create + apply the migration (shadow replay is clean once 062339 is gone).
cd packages/db
pnpm exec dotenv -e ../../.env.local -- prisma migrate dev --name variant_skus_and_statement_of_identity

# 3. Refresh the client + clear the 3-layer stale-client cache.
cd ../.. && pnpm db:generate && rm -rf apps/*/.next
```

If `migrate dev` still balks for any reason, `prisma db push` applies the same additive diff without touching migration history (fallback only — prefer the migration file).

## After the schema lands

- **Reseed the wiped catalog** (Code's approved surgical reseed): `seedCatalog` + `seedStarterTemplates` restore `ProductTemplate` / `Product` / `ProductTemplateVariant` / `TemplateIngredientSlot` / `Recipe` / `PackagingComponent`.
- **Commit as one unit:** `schema.prisma` + the new migration dir + the `20260605062339_` deletion. Committing the deletion is what permanently stops it resurrecting and fixes `migrate dev` for the whole team.
- **Leave** `20260607000000_academy_models` (Academy — additive, already applied).

## Unrelated cleanup also waiting on a `git rm` (new-product consolidation, low priority)

Cowork collapsed `/products/new` to a single turnkey flow. These are now orphaned/redirect-stubbed and safe to delete whenever:

```bash
git rm "apps/partner/src/app/(dashboard)/products/new/NewProductStepper.tsx" \
       "apps/partner/src/app/(dashboard)/products/new/TemplatePicker.tsx"
git rm -r "apps/partner/src/app/(dashboard)/products/new/blank" \
          "apps/partner/src/app/(dashboard)/products/new/clone" \
          "apps/partner/src/app/(dashboard)/products/new/starter"
```

(The two external "Clone for a line extension" links — partner `products/[id]/preview/page.tsx` + `ProductRowActions.tsx` — were already repointed to `/products/new`, so nothing 404s.)

---

# Phase 2 (after the schema lands): wire the live engine label

The accurate FDA label engine (`@ilaunchify/nutrition`) + two presentational panels are built and typecheck-clean. They just need data plumbed in.

## 2a. One-time: `pnpm install`

`@ilaunchify/nutrition` is now a partner dep (added to `apps/partner/package.json`, root `tsconfig.json` paths, and `apps/partner/next.config.js` transpilePackages). Run `pnpm install` to create the workspace symlinks (partner→nutrition, and nutrition→`@ilaunchify/types`). Until then, tsc reports `Cannot find module '@ilaunchify/nutrition'` / `@ilaunchify/types` — pure install artifacts, code is correct.

## 2b. Loader — pass nutrient data into the slots (the missing link)

`apps/partner/.../products/[id]/edit/page.tsx` currently selects only `name/weightG/allergens` for slots — which is why the old label was structural-only. Extend the `ingredientSlots` select (and replacements + optional ingredients) to include the ingredient's nutrient panel + density:

```ts
baseIngredient: { select: { id: true, name: true, source: true, allergenFlags: true,
  nutritionPer100g: true, densityGPerML: true } }   // <-- add the last two
```

Then map to `RecipeLabelPanel`'s `LabelIngredient[]` (exported from `RecipeLabelPanel.tsx`):
- base slots → `{ id, name, weightG: Number(weightG), per100g: baseIngredient.nutritionPer100g as Record<string,number>, densityGPerMl: baseIngredient.densityGPerML, category: 'base' }`
- replacements → same shape, `category: 'base'`, `parentId: <slot/base id>`, `selected: <isActiveSwap>`
- optionals → `category: 'optional'`, `selected: <ticked>`

Variants → `LabelVariant[]`: `{ id, label: \`${containerFormat}${flavor ? ' · '+flavor : ''}\`, servingsPerContainer, servingSizeG: Number(servingSizeG), servingSizeDesc }`.

## 2c. EditorShell — swap the structural preview for the real one

In the right rail, replace the structural `<LabelPreview …>` with:

```tsx
<RecipeLabelPanel
  labelingType={labelingType}
  ingredients={labelIngredients}        // mapped in 2b
  variants={labelVariants}              // mapped in 2b
  priceFloorCents={template.priceFloorCents}
/>
```

Optionally mount `<NutritionBreakdownPanel ingredients={labelIngredients} variants={labelVariants} />` as a "Nutrition Breakdown" card/tab (the unrounded QA view + %DV-from-exact + per-100g + batch totals).

Both panels are pure (props→render), mood-board styled, and already handle the Public-vs-Preview split (public = base only; preview = base + active swaps + ticked optionals) per the locked rule.

## 2d. Optional VariantsCard enhancement (don't duplicate — it already persists serving geometry)

`VariantsCard` already persists `servingsPerContainer` / `servingSizeG` / `servingSizeDesc` / `containerSizeG` via `updateVariant`. The ReciPal "by serving size vs by package size" toggle + `i` info-icon help text + "makes about N packages" readout should be added **inside** `VariantsCard` (by-package mode derives `servingSizeG = packageSizeG / servingsPerContainer` before commit), not as a separate card. Moisture-loss is a preview-only control (lives on `RecipeLabelPanel`); persist it only if you add a column/`packingConfig` key.
