# Slice 4 — Mode 3 Declare panel (Nutrition / Supplement Facts direct entry)

**Paste the prompt at the bottom into Claude Code. Has one Pavel decision flagged inline (tier gate).**

## Why this slice exists

Some partners arrive with a pre-tested COA. They already know the nutrition or supplement facts panel; enumerating ingredients to compute it is busywork. Mode 3 lets them declare the panel directly, render the FDA-style label live as they type, and ship without populating a slot-based recipe.

The keystone constraint: the platform must NOT present declared values as platform-attested. The FDA regulatory posture briefing (`docs/legal/FDA_REGULATORY_POSTURE.md` §5) flagged this as the highest-stakes contradiction risk — the Creator Agreement says compliance scans are "assistance only," but if the public detail page renders a declared panel without disclosure, that framing breaks. Mode 3's "Declared by manufacturer" disclosure is the contractual bridge that keeps the posture coherent.

Two days for an experienced contributor. One additive migration. New synthetic-ingredient pattern. Compliance service one-line conditional.

## Prerequisites

- **Slice 2** (`docs/builds/ingredients-mode-chooser-slice-2.md`) — Mode chooser shell with the `recipeEntryMode` column. Slice 4 enables the DECLARED_PANEL tile.
- Slices 1 and 3 are independent of Slice 4 and can ship in any order relative to it. Recommend the order 1 → 2 → 3 → 4 only because it stages risk (smallest fix first, biggest novel system last).

## Architectural pattern locked — synthetic Whole Product ingredient

The audit considered two paths for Mode 3:

**A. Synthetic "Whole Product" PARTNER_PRIVATE ingredient (CHOSEN).** Mode 3 creates one Ingredient row owned by the partner, holding the declared nutrition values in its `nutritionPer100g` JSON. That ingredient becomes the only `TemplateIngredientSlot` on the product. Compliance service: when `nutrientSource = DECLARED`, skip per-ingredient summation and pull directly from this single slot.

**B. `LABEL_DECLARED` mode flag + bypass the slot model entirely.** Compliance service branches on the flag, pulls from a new `NutritionPanelDeclaration` model. More schema, but cleaner conceptual separation.

We picked A because:
1. Big-9 allergens, BE flag, banned-list enforcement all hook off the slot's `Ingredient` row — they keep working unchanged.
2. The IngredientUsage tracking, audit log, and reapproval flow are slot-aware — they keep working unchanged.
3. The label renderer expects slots → sums → rounded panel. With one slot that pre-contains the panel, the renderer just outputs it as-is.
4. One additive enum column + one synthetic Ingredient pattern, vs. a new model + a fork in the compliance service.

Side-effect to know about: this single "Whole Product" Ingredient is real in the database and shows up in the partner's PARTNER_PRIVATE feed. Hide it from the standard IngredientPicker results (filter on a new `isDeclaredPanelSynthetic` boolean) so it doesn't pollute Mode 1 search.

## What's in scope

1. **Schema:** add `ProductTemplate.nutrientSource NutrientSource @default(COMPUTED)` with enum `NutrientSource { COMPUTED DECLARED }`. Add `Ingredient.isDeclaredPanelSynthetic Boolean @default(false)`. Both additive.
2. **Server action** `declareNutritionPanel(productTemplateId, declaration)` that:
   - Authorizes ownership
   - Tier-gates (see §Tier gate below)
   - Creates or updates the synthetic Whole Product PARTNER_PRIVATE Ingredient
   - Replaces the product's slots with a single slot pointing at the synthetic ingredient
   - Sets `nutrientSource = DECLARED` and `recipeEntryMode = DECLARED_PANEL`
   - Audit-logs the declaration
3. **Switch-confirmation:** when a partner switches FROM Mode 1 (with existing slots) TO Mode 3, show a confirmation modal explaining that existing slots will be replaced. No silent data loss.
4. **Compliance service patch:** in `packages/compliance` (or wherever the per-ingredient summation lives), branch on `ProductTemplate.nutrientSource`. When `DECLARED`, return the synthetic ingredient's `nutritionPer100g` directly. Skip summation, skip rounding logic that assumes weighted averages (the partner did that math; we don't re-do it).
5. **Label renderer:** in `NutritionFactsRenderer` (and `SupplementFactsRenderer` if it exists), append "Declared by manufacturer" caption when `nutrientSource = DECLARED`. Caption styles match FDA label footer style — small, italic, gray.
6. **Public detail page disclosure:** wherever the panel surfaces on `apps/marketing` product detail, add the disclosure banner above or adjacent to the panel: "Nutrition facts entered by the manufacturer. iLaunchify did not compute these values."
7. **Mode 3 UI:** the AiParserPanel-style left-column panel mounted by IngredientsCard when `chooserMode === 'DECLARED_PANEL'`. Two sub-tabs (Nutrition Facts vs Supplement Facts) auto-selected based on product category. Form fields per nutrient with units + DV%. Free-text ingredient statement. Allergen "Contains:" multi-select (auto-suggests against Big-9, partner can add). Net quantity field. Live label preview on the right.
8. **Mode chooser update:** remove the `disabled` + `Coming next` badge from the DECLARED_PANEL tile when partner's tier supports it.

## What's NOT in scope

- No backfill — existing products keep `nutrientSource = COMPUTED` (the enum default). Migration writes no data.
- No retroactive disclosure on COMPUTED panels — they remain platform-derived.
- No Supplement Facts schema work if it doesn't already exist; if `SupplementFactsRenderer` is missing, scope down to Nutrition Facts only and add a `[VERIFY]` note for the Supplement Facts follow-up.
- No COA upload flow — partners declare values from their own testing. Uploading the COA itself is a V1.1 trust-signal feature (forward-pointer).
- No verification of declared values — the partner attests to them per Creator Agreement §3. Admin can review during the standard product approval flow.

## Tier gate — Pavel must confirm

**Recommended default: Builder+ gate, matching Mode 2 AI parser.** Rationale: both modes save partner time, both are differentiated tier value, both should drive Maker → Builder conversion.

**Alternative under consideration: free on all tiers.** Rationale: Mode 3 is for partners with COAs, which are sometimes Maker-tier reality (small-batch, hand-tested). Gating it could frustrate the exact persona who needs it most.

**This brief implements Builder+ as the default.** Pavel: confirm or override before the Mode 3 slice author ships. If you want it free for everyone, edit the seed lines below to all `true`.

## Required reading FIRST

1. `docs/builds/ai-recipe-parser-economics.md` — reference for the tier-gate pattern.
2. `docs/legal/FDA_REGULATORY_POSTURE.md` §5 — the contractual basis for the disclosure.
3. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` + `ModeChooser.tsx` (from Slice 2).
4. `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — `addIngredientSlot` / `removeIngredientSlot` for the slot-replacement step.
5. `apps/partner/src/app/(dashboard)/products/[id]/edit/ingredient-actions.ts` — `createPartnerPrivateIngredient` for the synthetic Ingredient creation pattern.
6. `packages/compliance/src/...` — find the per-ingredient summation entrypoint that needs the `nutrientSource` branch. Likely `computeNutritionPanel(productTemplateId)` or similar. Confirm path before editing.
7. `packages/ui/src/components/NutritionFactsRenderer.tsx` (or wherever it lives) — for the "Declared by manufacturer" caption.
8. `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` — the public detail page where the disclosure renders.
9. `.claude/memory/ilaunchify-recipe-builder-modes.md` — the locked Mode 3 schema decisions.
10. `.claude/memory/ilaunchify-cockroachdb-no-db-text.md` + `ilaunchify-migrate-dev-hangs-use-deploy.md`.

## Implementation notes

### Schema

```prisma
enum NutrientSource {
  COMPUTED
  DECLARED
}

model ProductTemplate {
  // ... existing
  nutrientSource NutrientSource @default(COMPUTED)
}

model Ingredient {
  // ... existing
  isDeclaredPanelSynthetic Boolean @default(false)
}
```

Migration name: `add_nutrient_source_and_declared_synthetic_2026_06_01`.

If `migrate dev` hangs, hand-author SQL per memory `ilaunchify-migrate-dev-hangs-use-deploy.md`:

```sql
CREATE TYPE "NutrientSource" AS ENUM ('COMPUTED', 'DECLARED');
ALTER TABLE "ProductTemplate" ADD COLUMN "nutrientSource" "NutrientSource" NOT NULL DEFAULT 'COMPUTED';
ALTER TABLE "Ingredient" ADD COLUMN "isDeclaredPanelSynthetic" BOOLEAN NOT NULL DEFAULT false;
```

### Server action

`apps/partner/src/app/(dashboard)/products/[id]/edit/declared-panel-actions.ts`:

```ts
'use server'

import { authorize } from './_authorize'
import { hasFeature } from '@ilaunchify/auth/tiers'
import { writeAuditLog } from '@ilaunchify/audit'
import { prisma } from '@ilaunchify/db'

interface DeclareInput {
  // The panel: nutrient values + units + DV%
  nutritionPer100g: Record<string, number>  // serving, calories, fat, sodium, carb, sugar, addedSugar, fiber, protein, etc.
  servingSize: string  // free-text per FDA format, e.g. "1 can (355 mL)"
  servingsPerContainer: number
  ingredientStatement: string  // free-text, FDA-format
  allergens: string[]  // Big-9 + custom
  netQuantity: string  // FDA-format, e.g. "12 fl oz (355 mL)"
  labelType: 'NUTRITION_FACTS' | 'SUPPLEMENT_FACTS'
}

export async function declareNutritionPanel(productTemplateId: string, input: DeclareInput) {
  const { user, product, partnerService } = await authorize(productTemplateId)
  const creatorTier = user.creator?.subscriptionTier ?? 'maker'

  if (!hasFeature(creatorTier, 'declare-nutrition-panel')) {
    return { ok: false as const, error: 'upgrade-required' }
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Upsert the synthetic Whole Product Ingredient owned by this partner
    const synthetic = await tx.ingredient.upsert({
      where: {
        // unique key: partnerServiceId + isDeclaredPanelSynthetic + productTemplateId
        // OR a deterministic id pattern. Pick whichever fits the existing schema.
        // Recommended: name format "__declared_panel__<productTemplateId>"
        name_partnerServiceId: {
          name: `__declared_panel__${productTemplateId}`,
          partnerServiceId: partnerService.id,
        },
      },
      create: {
        name: `__declared_panel__${productTemplateId}`,
        internalName: `Declared panel for ${product.name}`,
        labelDeclarationName: 'Whole product (declared)',
        sourceType: 'PARTNER_PRIVATE',
        partnerServiceId: partnerService.id,
        isDeclaredPanelSynthetic: true,
        nutritionPer100g: input.nutritionPer100g,
        allergenFlags: input.allergens,
        // density: not relevant for declared mode
        // bioengineeredStatus: default; partner attests on the panel form if needed
      },
      update: {
        nutritionPer100g: input.nutritionPer100g,
        allergenFlags: input.allergens,
      },
    })

    // 2. Replace all existing slots with a single slot pointing at the synthetic
    await tx.templateIngredientSlot.deleteMany({ where: { productTemplateId } })
    await tx.templateIngredientReplacement.deleteMany({
      where: { slot: { productTemplateId } },
    })
    await tx.templateIngredientSlot.create({
      data: {
        productTemplateId,
        baseIngredientId: synthetic.id,
        weightG: 100,  // 100g basis matches nutritionPer100g convention
        allowReplacement: false,
        displayOrder: 0,
        label: 'Declared panel (whole product)',
      },
    })

    // 3. Update the product
    await tx.productTemplate.update({
      where: { id: productTemplateId },
      data: {
        nutrientSource: 'DECLARED',
        recipeEntryMode: 'DECLARED_PANEL',
        servingSize: input.servingSize,
        servingsPerContainer: input.servingsPerContainer,
        ingredientStatement: input.ingredientStatement,
        netQuantity: input.netQuantity,
        // labelType: store on ProductTemplate or derive from category — confirm field
      },
    })

    // 4. If status was PUBLISHED, transition to PENDING_EDIT_REVIEW (this is a brand-affecting change)
    if (product.status === 'PUBLISHED') {
      await tx.productTemplate.update({
        where: { id: productTemplateId },
        data: { status: 'PENDING_EDIT_REVIEW' },
      })
    }

    // 5. Audit
    await writeAuditLog({
      actorUserId: user.id,
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'DECLARE_NUTRITION_PANEL',
      payload: {
        labelType: input.labelType,
        nutrientCount: Object.keys(input.nutritionPer100g).length,
        allergenCount: input.allergens.length,
      },
    }, tx)

    return { ok: true as const, syntheticIngredientId: synthetic.id }
  })
}
```

**Confirm before editing:**
- The exact unique-constraint shape for upserting the synthetic ingredient (the `name_partnerServiceId` composite key may not exist; consider using `productTemplateId` as the natural key via a custom relation, or just `findFirst → create or update` pattern).
- That `ProductTemplate` has `servingSize`, `servingsPerContainer`, `ingredientStatement`, and `netQuantity` columns. If not, add them in the same migration (additive).

### Compliance service patch

In `packages/compliance` (find the right entry point — likely `computeNutritionPanel` or `generateLabel`):

```ts
if (productTemplate.nutrientSource === 'DECLARED') {
  // Skip per-ingredient summation. The single slot's ingredient holds the declared panel.
  const slot = productTemplate.ingredientSlots[0]
  if (!slot || !slot.baseIngredient.isDeclaredPanelSynthetic) {
    throw new Error('DECLARED nutrientSource but no synthetic slot — data inconsistency')
  }
  return {
    nutritionPer100g: slot.baseIngredient.nutritionPer100g,
    declaredByManufacturer: true,  // signal to renderer
    source: 'DECLARED',
  }
}
// existing COMPUTED path unchanged
```

### Label renderer

In `NutritionFactsRenderer.tsx`:

```tsx
{panel.declaredByManufacturer && (
  <p className="text-[8px] italic text-gray-500 mt-1">
    Declared by manufacturer
  </p>
)}
```

Same in `SupplementFactsRenderer` if it exists.

### Public detail page disclosure

In `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` (and wherever the panel renders):

```tsx
{product.nutrientSource === 'DECLARED' && (
  <div className="text-xs text-ink-600 bg-cream-50 border border-cream-200 rounded-md p-3 mt-2">
    <strong>Nutrition facts entered by the manufacturer.</strong> iLaunchify did
    not compute these values from individual ingredients. The manufacturer
    attests to their accuracy.
  </div>
)}
```

### Mode 3 client UI

Add `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/DeclaredPanelPanel.tsx`:

Two-column layout per the Cowork mockup:

- **Left column (form):**
  - Label type sub-tabs: Nutrition Facts / Supplement Facts (auto-selected from product category labelingType, partner can override)
  - Serving size field (free-text, FDA format)
  - Servings per container (number)
  - Per-nutrient grid: Calories, Total Fat, Sat Fat, Trans Fat, Cholesterol, Sodium, Total Carb, Fiber, Total Sugars, Added Sugars, Protein, Vitamin D, Calcium, Iron, Potassium (Nutrition Facts) OR the Supplement Facts equivalent
  - Each row: value field + unit (locked per nutrient: g, mg, mcg) + auto-computed DV% (or partner-overridable)
  - Ingredient statement: large textarea (FDA format guidance helper below)
  - Allergens "Contains:" multi-select with Big-9 chips + free-text add
  - Net quantity (FDA format, with validate helper from `formatNetQuantity`)
  - Top: prominent pink-tinted disclosure banner — "Entered by partner — not computed by iLaunchify. Will show as 'Declared by manufacturer' on the public detail page."

- **Right column (live label preview):**
  - Live `NutritionFactsRenderer` rendering the form values as the partner types
  - "Declared by manufacturer" caption already showing
  - Updates on every form blur

- **Footer:** Cancel + black-pill "Save declared panel" button
  - On save: if existing slots exist, show confirmation modal: "This will replace your X existing ingredient slots with a single declared panel. You can switch back to Search & build mode later, but you'll need to re-enter your ingredients."

### Switch-confirmation modal

When partner clicks DECLARED_PANEL tile while existing slots exist:

```
Switch to Declared panel?
You currently have X ingredient slots. Switching will replace them with a single declared panel based on your typed values.

You can switch back later, but your existing ingredients won't be restored automatically.

[Cancel]  [Switch and continue]
```

### Hide synthetic ingredients from picker results

In `searchIngredients` (`ingredient-actions.ts`), add to the WHERE clause:

```ts
where: {
  // ... existing filters
  isDeclaredPanelSynthetic: false,  // never surface declared-panel synthetics in normal search
}
```

### PlanFeature seed update

`packages/plans/src/seed.ts`:

```ts
{ tier: 'maker',   key: 'declare-nutrition-panel', value: 'false', kind: 'boolean' },
{ tier: 'builder', key: 'declare-nutrition-panel', value: 'true',  kind: 'boolean' },
{ tier: 'agency',  key: 'declare-nutrition-panel', value: 'true',  kind: 'boolean' },
```

(Pavel: confirm Builder+ gate, or flip all three to `true` if you want it free.)

### Mode chooser update

Same pattern as Slice 3 for the DECLARED_PANEL tile:

```tsx
<ModeTile mode="DECLARED_PANEL" icon={FileText} title="Declare the panel" sub="..." when="Pre-tested COA"
  disabled={!declarePanelAvailable}
  badge={declarePanelAvailable ? undefined : 'Upgrade to Builder'}
  onClick={declarePanelAvailable ? () => handleModeSelect('DECLARED_PANEL') : openUpgrade}
/>
```

### AuditLog action types

Extend `packages/audit/src/types.ts`:

```ts
'DECLARE_NUTRITION_PANEL',
```

## Reapproval-marked

Mode 3 declaration is highly approval-relevant — it's the entire customer-facing nutrition panel. The action above transitions `PUBLISHED → PENDING_EDIT_REVIEW` on save. Same as the existing per-slot pattern.

## RSC boundary

`DeclaredPanelPanel` is a client component. Icons + label-renderer imports stay inside it. Per-nutrient field config can be a constant array at module scope; passing it through as a prop is fine because it's serializable (no function refs).

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/db prisma generate
pnpm --filter @ilaunchify/db prisma db seed
pnpm --filter @ilaunchify/partner typecheck
pnpm --filter @ilaunchify/marketing typecheck
pnpm --filter @ilaunchify/ui typecheck
```

Manual smoke test:
1. Log in as a Builder partner. Create a DRAFT product.
2. Open IngredientsCard. Click "Declare the panel" tile.
3. Fill the form: serving size, calories 120, sodium 25mg, carb 32g, sugar 30g, protein 0g, ingredient statement "Carbonated water, mango puree, ...", allergens "Sesame", net qty "12 fl oz (355 mL)".
4. Confirm the live label renders as you type with "Declared by manufacturer" caption.
5. Save. Confirm the synthetic ingredient appears in the partner's private feed but is hidden from picker search.
6. Confirm `ProductTemplate.nutrientSource = 'DECLARED'` and `recipeEntryMode = 'DECLARED_PANEL'`.
7. Open the public marketplace detail page for that product. Confirm the disclosure banner appears above the panel.
8. Switch back to Mode 1 (Search & build). Confirm warning modal. Cancel — stay in Mode 3. Then re-confirm — slot deleted, mode flipped.
9. Log in as Maker. Confirm tile shows "Upgrade to Builder" badge linking to /settings/plan (if Builder+ gate confirmed).

## Commit

```
/ship "Slice 4 Mode 3 Declare panel — nutrientSource enum + synthetic Whole Product ingredient + public disclosure + Declared by manufacturer caption"
```

After commit, Pavel housekeeping:

```
Pavel:
  pnpm --filter @ilaunchify/db prisma generate
  pnpm --filter @ilaunchify/db prisma db seed
  restart next dev
```

## Paste-ready prompt for Claude Code

```
Ship Slice 4 — Mode 3 Declare panel for the Partner IngredientsCard. Brief:
docs/builds/ingredients-declared-panel-slice-4.md. Pattern locked: synthetic
Whole Product PARTNER_PRIVATE ingredient + ProductTemplate.nutrientSource
enum. Keeps Big-9 / BE / banned-list flows working unchanged.

Pieces:

1. Schema migration: add ProductTemplate.nutrientSource (enum
   COMPUTED|DECLARED, default COMPUTED) + Ingredient.isDeclaredPanelSynthetic
   (boolean, default false). Confirm ProductTemplate has servingSize,
   servingsPerContainer, ingredientStatement, netQuantity columns — add in
   same migration if missing. Additive only.

2. declareNutritionPanel server action in
   apps/partner/.../declared-panel-actions.ts: tier-gate via
   hasFeature('declare-nutrition-panel'), upsert synthetic ingredient,
   replace all existing slots with the one synthetic slot, set
   nutrientSource=DECLARED + recipeEntryMode=DECLARED_PANEL, transition
   PUBLISHED → PENDING_EDIT_REVIEW, audit-log DECLARE_NUTRITION_PANEL.

3. Compliance service patch in packages/compliance: branch on
   nutrientSource. When DECLARED, return synthetic ingredient's
   nutritionPer100g directly, skip summation, set declaredByManufacturer
   flag on the result.

4. NutritionFactsRenderer (+ SupplementFactsRenderer if exists) in
   packages/ui: append italic "Declared by manufacturer" caption when
   declaredByManufacturer flag is true.

5. Public detail page in apps/marketing/.../marketplace/[...]/page.tsx: pink-
   tinted disclosure banner above the panel when nutrientSource = DECLARED.

6. DeclaredPanelPanel client component in apps/partner/.../cards/
   DeclaredPanelPanel.tsx: two-column form (nutrient grid + ingredient
   statement + allergens + net qty) on left, live label preview on right.
   Disclosure banner at top. Save triggers slot-replacement confirmation
   modal if existing slots exist.

7. searchIngredients: filter out isDeclaredPanelSynthetic=true ingredients
   from picker results so they don't pollute Mode 1.

8. PlanFeature seed: declare-nutrition-panel = false / true / true per
   maker/builder/agency (Builder+ default — Pavel-confirmed in brief, or
   flip all to true if free for all).

9. ModeChooser update: remove disabled + Coming-next from DECLARED_PANEL
   tile when tier supports. Maker sees "Upgrade to Builder" badge.

10. Audit: add DECLARE_NUTRITION_PANEL to AUDIT_ACTIONS in
    packages/audit/src/types.ts.

NOT in scope: no backfill, no retroactive disclosure on COMPUTED panels, no
COA upload (V1.1), no verification workflow (admin reviews during normal
product approval).

Reapproval-marked: save transitions PUBLISHED → PENDING_EDIT_REVIEW.

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm --filter
@ilaunchify/db prisma db seed && pnpm --filter @ilaunchify/partner typecheck
&& pnpm --filter @ilaunchify/marketing typecheck && pnpm --filter
@ilaunchify/ui typecheck.

Then /ship "Slice 4 Mode 3 Declare panel — nutrientSource enum + synthetic
Whole Product ingredient + public disclosure + Declared by manufacturer
caption".

After commit, remind Pavel: prisma generate + seed + restart next dev.
```
