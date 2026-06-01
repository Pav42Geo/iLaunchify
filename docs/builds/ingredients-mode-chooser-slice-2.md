# Slice 2 — Mode chooser shell on IngredientsCard

**Paste the prompt at the bottom into Claude Code. Or read the full brief if you want context.**

## Why this slice exists

Slice 1 closed the runtime bugs that would have bitten us at scale. Slice 2 adds the UI shell that turns the Ingredients card from a single-flow editor into a three-mode entry surface. Mode 1 (Search & build) keeps working as the default behavior; Modes 2 (AI parser) and 3 (Declare panel) ship as disabled tiles with "Coming next" badges. Slices 3 and 4 light them up.

The mockup in Cowork conversation showed the shape: a 3-tile chooser at the top of the card when the recipe is empty, collapsing to a small "Built with: X · Switch mode" pill once any slot exists. Persisting which entry method the partner picked on `ProductTemplate.recipeEntryMode` for analytics.

Half-day for an experienced contributor. One additive migration. No new packages.

## Prerequisites

Slice 1 (`docs/builds/ingredients-prework-slice-1.md`) must land first. Mode 2 in particular will spray slot writes on the commit step, and Slice 1's banned-list save-time enforcement on `addIngredientSlot` is what keeps that safe.

Slice 2 itself can ship even if Slice 1 hasn't landed, but please order them correctly to keep the mental model clean.

## What's in scope

1. **Schema:** add `ProductTemplate.recipeEntryMode RecipeEntryMode? @default(null)` and a new enum `RecipeEntryMode { SEARCH_BUILD AI_PARSER DECLARED_PANEL }`. Nullable because legacy templates won't have a recorded primary method.
2. **UI — empty state:** when `productTemplate.ingredientSlots.length === 0` (or has only one auto-seeded placeholder), the IngredientsCard renders the 3-tile chooser above the existing "Add ingredient" UI.
3. **UI — populated state:** once any slot exists, the chooser collapses to a small pill displaying the primary entry method ("Built with: Search & build · Switch mode"). Clicking "Switch mode" re-opens the chooser.
4. **Persistence:** on the first user-driven slot add via Mode 1 (the existing flow), stamp `recipeEntryMode = SEARCH_BUILD` if currently null. Same pattern applies once Slices 3 and 4 wire up — `addIngredientSlot` callers from Mode 2 will set `AI_PARSER`, Mode 3 will set `DECLARED_PANEL`.
5. **Disabled-mode UX:** the Parse with AI and Declare panel tiles render with a small "Coming next" badge and are unclickable in Slice 2. Don't open a modal; don't navigate; just have a `disabled` state with a tooltip explaining "Available in next release."

## What's NOT in scope

- No AI parser logic. No paste textarea. No file upload. No Anthropic SDK. (That's Slice 3.)
- No declared-panel UI. No nutrientSource schema. (That's Slice 4.)
- No tier gating (the disabled tiles don't need to check tier yet — they're disabled for everyone).
- No `recipeEntryMode` history tracking — we record the primary method, not every switch. If Pavel wants a mode-change audit trail later, it's an additive AuditLog action.
- No changes to AllergensCard, BasicsCard, or any sibling.

## Required reading FIRST

1. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` — the card being modified.
2. `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — `addIngredientSlot` is where the `recipeEntryMode = SEARCH_BUILD` stamp goes when null.
3. `packages/db/prisma/schema.prisma` — find `ProductTemplate` model, look for similar additive enum patterns (`status`, `labelingType` etc.).
4. `docs/builds/ai-recipe-parser-economics.md` — context only; don't implement gates yet.
5. `.claude/memory/ilaunchify-recipe-builder-modes.md` — the 3-mode design lock.
6. `.claude/memory/ilaunchify-cockroachdb-no-db-text.md` — schema gotcha.
7. `.claude/memory/ilaunchify-migrate-dev-hangs-use-deploy.md` — migration gotcha.
8. `.claude/memory/ilaunchify-dev-prisma-restart.md` — post-migration gotcha.

## Implementation notes

### Schema migration

Add to `packages/db/prisma/schema.prisma`:

```prisma
enum RecipeEntryMode {
  SEARCH_BUILD
  AI_PARSER
  DECLARED_PANEL
}

model ProductTemplate {
  // ... existing fields
  recipeEntryMode RecipeEntryMode?
}
```

Generate the migration:

```bash
pnpm --filter @ilaunchify/db prisma migrate dev --name add_recipe_entry_mode_2026_06_01
```

If `migrate dev` hangs (memory note `ilaunchify-migrate-dev-hangs-use-deploy.md`), hand-author the SQL:

```sql
CREATE TYPE "RecipeEntryMode" AS ENUM ('SEARCH_BUILD', 'AI_PARSER', 'DECLARED_PANEL');
ALTER TABLE "ProductTemplate" ADD COLUMN "recipeEntryMode" "RecipeEntryMode";
```

Then `pnpm --filter @ilaunchify/db prisma migrate deploy` + `prisma generate` + restart `next dev`.

### Mode chooser component

Add `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/ModeChooser.tsx`:

```tsx
'use client'

import { Search, Sparkles, FileText } from 'lucide-react'
// (RSC boundary note: icons stay inside this client component — don't accept icon as prop)

type Mode = 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL'

interface ModeChooserProps {
  currentMode: Mode | null
  collapsed: boolean
  onSelect: (mode: Mode) => void
  onExpand: () => void
}

export function ModeChooser({ currentMode, collapsed, onSelect, onExpand }: ModeChooserProps) {
  if (collapsed) {
    return (
      <div className="...">
        Built with: <strong>{MODE_LABELS[currentMode ?? 'SEARCH_BUILD']}</strong>
        <button onClick={onExpand}>Switch mode</button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <ModeTile mode="SEARCH_BUILD" icon={Search} title="Search & build" sub="Pick from USDA, library, or your private feed. Add slots one at a time." when="Most common" active={currentMode === 'SEARCH_BUILD'} disabled={false} onClick={() => onSelect('SEARCH_BUILD')} />
      <ModeTile mode="AI_PARSER" icon={Sparkles} title="Parse with AI" sub="Paste a recipe or drop a label. We match each line and you confirm." when="Fastest from spec sheet" badge="Coming next" disabled />
      <ModeTile mode="DECLARED_PANEL" icon={FileText} title="Declare the panel" sub="Type the Nutrition or Supplement Facts directly. Bypass per-ingredient computation." when="Pre-tested COA" badge="Coming next" disabled />
    </div>
  )
}
```

Style match: cream `#F3EFE8` tile background neutral, active state uses `#FFF8FA` with `1.5px solid #FF2E63` border per the locked design system. Disabled tiles get reduced opacity + a small badge in the top-right reading "Coming next". See the Cowork mockup screenshot if you have it; otherwise match the existing chip / pill aesthetics in the partner app.

### Card integration

In `IngredientsCard.tsx`:

```tsx
const isEmpty = productTemplate.ingredientSlots.length === 0
const [chooserExpanded, setChooserExpanded] = useState(isEmpty)

return (
  <Card>
    <CardHeader ... />
    <CardBody>
      <ModeChooser
        currentMode={productTemplate.recipeEntryMode}
        collapsed={!chooserExpanded && !isEmpty}
        onSelect={handleModeSelect}
        onExpand={() => setChooserExpanded(true)}
      />
      {/* existing add-slot UI + slot rows */}
    </CardBody>
  </Card>
)
```

`handleModeSelect` for Slice 2:
- `SEARCH_BUILD` — collapse chooser, scroll to add-slot UI, optimistically stamp `recipeEntryMode` via server action `setRecipeEntryMode(productTemplateId, 'SEARCH_BUILD')` if currently null
- `AI_PARSER` and `DECLARED_PANEL` — no-op (tiles are disabled)

### Server action

Add to `card-actions.ts`:

```ts
export async function setRecipeEntryMode(
  productTemplateId: string,
  mode: 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL'
) {
  'use server'
  const { user, product } = await authorize(productTemplateId)
  if (product.recipeEntryMode !== null) {
    return { ok: true, mode: product.recipeEntryMode } // no overwrite
  }
  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { recipeEntryMode: mode },
  })
  await writeAuditLog({
    actorUserId: user.id,
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'RECIPE_ENTRY_MODE_SET',
    payload: { mode },
  })
  return { ok: true, mode }
}
```

Important: never overwrite an existing `recipeEntryMode`. The first method that adds a slot owns the record. Switching modes later doesn't update it (the partner can still parse with AI mid-recipe, but the "primary method" stays whatever they started with).

### Also stamp on first slot add

In the existing `addIngredientSlot`, after authorize() and before the slot create:

```ts
if (product.recipeEntryMode === null) {
  await prisma.productTemplate.update({
    where: { id: productTemplateId },
    data: { recipeEntryMode: 'SEARCH_BUILD' },
  })
}
```

Belt-and-suspenders against the chooser onSelect race.

### MODE_LABELS map

In the component file:

```ts
const MODE_LABELS: Record<Mode, string> = {
  SEARCH_BUILD: 'Search & build',
  AI_PARSER: 'Parse with AI',
  DECLARED_PANEL: 'Declared panel',
}
```

## RSC boundary

`ModeChooser` is a client component. Icons imported inside it (memory `ilaunchify-rsc-boundary-config.md`). Server passes only serializable props.

## AuditLog discipline

One new action: `RECIPE_ENTRY_MODE_SET`. Write it once per template when the mode is first set. Don't write on subsequent no-op calls.

## Reapproval-marked

`recipeEntryMode` is analytics-only metadata, not user-facing brand-relevant content. Changing it does NOT trigger a `PUBLISHED → PENDING_EDIT_REVIEW` transition. Existing card behavior preserved.

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/db prisma generate
pnpm --filter @ilaunchify/partner typecheck
```

Manual smoke test:
1. Create a fresh DRAFT product. Open the editor.
2. Confirm the 3-tile chooser renders at the top of IngredientsCard.
3. Click "Search & build" — chooser collapses to the pill; scrolls to add-slot UI.
4. Add an ingredient. Confirm `recipeEntryMode = SEARCH_BUILD` on the row in Prisma Studio.
5. Click "Switch mode" pill — chooser re-expands.
6. Click "Parse with AI" — confirm it's disabled, no action.
7. Refresh — confirm pill state persists.
8. Open a previously-saved product with existing slots — confirm chooser starts collapsed.

## Commit

```
/ship "Slice 2 ingredients mode chooser — 3-tile chooser + recipeEntryMode + Mode 1 default wired"
```

After commit, remind Pavel:

```
Pavel: post-migration housekeeping:
  pnpm --filter @ilaunchify/db prisma generate
  restart next dev
```

## Paste-ready prompt for Claude Code

```
Ship Slice 2 — Mode chooser shell on the Partner IngredientsCard. Brief:
docs/builds/ingredients-mode-chooser-slice-2.md.

Three pieces in one PR:

1. Schema migration: add ProductTemplate.recipeEntryMode (nullable) + new enum
   RecipeEntryMode { SEARCH_BUILD AI_PARSER DECLARED_PANEL }. Additive only.
   If `prisma migrate dev` hangs locally, hand-author SQL (CREATE TYPE +
   ALTER TABLE) and use `prisma migrate deploy`. After migrate, prisma generate
   and restart next dev.

2. ModeChooser client component at
   apps/partner/src/app/(dashboard)/products/[id]/edit/cards/ModeChooser.tsx —
   3-tile chooser when recipe empty, small pill ("Built with: X · Switch mode")
   when populated. AI_PARSER and DECLARED_PANEL tiles render disabled with
   "Coming next" badges. Icons imported inside the client component (RSC
   boundary rule).

3. Persistence: new server action setRecipeEntryMode(productTemplateId, mode)
   that stamps recipeEntryMode if currently null (never overwrites). Also
   stamp SEARCH_BUILD inside the existing addIngredientSlot when null
   (belt-and-suspenders). Each first-set writes a RECIPE_ENTRY_MODE_SET
   AuditLog entry.

NOT in scope: no AI parser logic, no declared-panel UI, no tier gates, no
nutrientSource schema, no AllergensCard changes.

Reapproval-marked: mode set does NOT transition PUBLISHED →
PENDING_EDIT_REVIEW. Analytics-only metadata.

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm --filter
@ilaunchify/partner typecheck.

Then /ship "Slice 2 ingredients mode chooser — 3-tile chooser +
recipeEntryMode + Mode 1 default wired".
```
