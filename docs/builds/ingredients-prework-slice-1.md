# Slice 1 — Ingredients pre-work (banned-list runtime + picker empty-state)

**Paste this brief into Claude Code as a single message. Or run `/ship-admin-surface` style — just paste the prompt block at the bottom and let the session drive.**

## Why this slice exists

Pavel is about to add an AI Recipe Parser (Mode 2) and a Manual Label Entry (Mode 3) to the Partner Product Builder's IngredientsCard. Two existing bugs the audit caught will get worse the moment Mode 2 starts adding ingredient slots in bulk, so they must land first as standalone, non-net-new work.

This slice fixes both, plus surfaces recently-used ingredients from the existing `IngredientUsage` data. No schema migration. No new packages. Half a day for an experienced contributor.

The full three-mode UX plan and the audit findings are in this conversation log; the audit pointed at specific file paths + line numbers and the design landed pink-themed in a Cowork mockup. This brief is the executable pre-work.

## What's in scope

Three changes, one PR:

1. **Banned-list save-time enforcement.** Today `isIngredientBanned()` only runs inside `createPartnerPrivateIngredient`. Extend it to fire on every path that creates or replaces a slot ingredient — `addIngredientSlot`, `updateIngredientSlot` (if the baseIngredientId changes), `addReplacement`. Existing USDA/Library/Private picks currently bypass the check; this closes the gap that contradicts Creator Agreement §3.
2. **Picker empty-state staples panel.** Server route at the search action currently short-circuits when `q.length < 2` and returns nothing. Change the empty-query response to return a curated panel of recently-used + library staples so the spec'd "empty picker" UX actually renders.
3. **Recently-used recall.** Surface `IngredientUsage` rows scoped to the calling partner to power the recently-used list. Order by `lastUsedAt DESC` (or `useCount DESC` — pick one and write a comment), cap at 8 entries.

## What's NOT in scope

- No Mode 2 (AI parser). No Mode 3 (declare panel). No mode chooser. Those are separate slices.
- No new schema. No migration.
- No tier gates yet — Slice 1 is pure bugfix + UX polish.
- No changes to allergen card, BE flag UI, FlavorPreset surfacing, or `TemplateOptionalIngredient` UI.

## Required reading FIRST

Before touching code:

1. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientPicker.tsx` — the client component.
2. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` — the slot CRUD card.
3. `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — find `addIngredientSlot`, `updateIngredientSlot`, `removeIngredientSlot`, `addReplacement`. These get the new ban check.
4. `apps/partner/src/app/(dashboard)/products/[id]/edit/ingredient-actions.ts` — find `searchIngredients`, `createPartnerPrivateIngredient`, and the existing `isIngredientBanned()` helper. The helper is the source of truth for ban matching; reuse it, do not reimplement.
5. `packages/db/prisma/schema.prisma` — confirm field names: `BannedIngredient`, `Ingredient`, `IngredientUsage` (look for `userId`/`partnerServiceId`, `lastUsedAt`, `useCount`).
6. `.claude/memory/ilaunchify-ingredient-governance.md` — sliding verification model.
7. `.claude/memory/ilaunchify-ingredient-sourcing.md` — three-tier sourcing.
8. `.claude/memory/ilaunchify-leads-are-early-partners.md` — irrelevant here; skip.
9. `docs/legal/FDA_REGULATORY_POSTURE.md` §5 — the exposed surface this slice closes.

## Implementation notes

### Change 1 — banned-list save-time enforcement

**Where:** `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts`.

**What:** In `addIngredientSlot` and `addReplacement`, after authorize() and before the Prisma write, call `isIngredientBanned()` against the `Ingredient` row being added (lookup by `baseIngredientId` / `ingredientId`). In `updateIngredientSlot`, only run the check if `baseIngredientId` changed.

If the ingredient matches a banned matcher:
- Return `{ ok: false, error: <Ingredient name> is on the banned list for this product category and cannot be added. Contact admin to request an exception. }`.
- Write an `AuditLog` row with `action: 'INGREDIENT_BAN_BLOCK'`, `entityType: 'ProductTemplate'`, payload containing the ingredient id, ingredient name, banned matcher slug, and actor.
- Do NOT mutate.

Reuse the existing `isIngredientBanned()` signature — don't reimplement matching logic. If the helper currently only accepts a name string, extend it to optionally accept an `Ingredient` row (name + allergenFlags + bioengineeredStatus + sourceType) so future matchers can match on more than name. Keep backward compatibility for the existing `createPartnerPrivateIngredient` call site.

**Tests:** add a unit test (or expand the existing one) that asserts:
- adding a banned existing USDA/Library/Private ingredient via `addIngredientSlot` returns the error and writes no slot
- adding a non-banned ingredient still works
- the AuditLog row is written on a block

### Change 2 — picker empty-state staples panel

**Where:** `apps/partner/src/app/(dashboard)/products/[id]/edit/ingredient-actions.ts` (`searchIngredients` action) + `IngredientPicker.tsx`.

**What:** Remove the `q.length < 2` short-circuit. When the query is empty (or under 2 chars), return a curated panel:
- Recently used (Change 3 below) — up to 8 rows.
- Library staples — up to 12 rows from `Ingredient` where `sourceType = 'LIBRARY'` ordered by a `displayPriority` field if it exists, else by `useCount DESC`, else by `name ASC`. If no `LIBRARY` rows exist (cold seed), fall back to top USDA hits by use count.

Mark each row with its existing source pill — the client component already renders pills correctly; the action just needs to return rows of the existing shape.

The client component in `IngredientPicker.tsx` should render the empty-state results under two subheaders: "Recently used" and "Library staples". If both panels are empty, show the existing empty-state message ("Search for an ingredient by name").

### Change 3 — recently-used recall

**Where:** `apps/partner/src/app/(dashboard)/products/[id]/edit/ingredient-actions.ts`.

**What:** Add a helper `getRecentlyUsedIngredients(partnerServiceId: string, limit: number = 8)` that queries `IngredientUsage` scoped to the calling partner's PartnerService, joins `Ingredient`, orders by `lastUsedAt DESC` (write a comment that this could also be `useCount DESC` if Pavel changes his mind), returns `Ingredient[]`.

Confirm the actual scope key in the schema before writing — `IngredientUsage` may key by `userId`, `partnerServiceId`, or `partnerId`. Use whichever is there. If both `lastUsedAt` and `useCount` exist, choose `lastUsedAt DESC`.

Wire it into the empty-state response from Change 2.

## CockroachDB + RSC + Next gotchas to respect

- No `@db.Text` (memory `ilaunchify-cockroachdb-no-db-text.md`). Not relevant here — no schema work — but worth knowing.
- No function-shaped props across the RSC boundary (memory `ilaunchify-rsc-boundary-config.md`). If the empty-state panel renders new subheaders via a server-rendered configuration, import icons inside the client component, not as props.
- If you somehow do touch schema, restart `next dev` after `prisma generate` (memory `ilaunchify-dev-prisma-restart.md`).

## AuditLog discipline

Every banned-block on a slot add must write an AuditLog row. The existing `card-actions.ts` actions all use the `authorize()` + `writeAuditLog()` pattern — match it exactly.

## Reapproval-marked

Ingredients is an approval-marked card. Blocked saves do not transition state. Successful saves still transition `PUBLISHED → PENDING_EDIT_REVIEW` per the existing pattern — no change to that behavior.

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/partner typecheck
```

If you wrote a test:

```bash
pnpm --filter @ilaunchify/partner test
```

Smoke-test the flow manually:
1. Open a DRAFT product in `apps/partner` editor
2. Open the Ingredients card; verify recently-used + staples render before typing
3. Try to add a banned ingredient via the picker — confirm the error toast + no slot write
4. Verify `/admin/audit` shows an `INGREDIENT_BAN_BLOCK` row
5. Add a non-banned ingredient — confirm it works
6. Add a replacement to an existing slot of a banned ingredient — confirm the same block applies

## Commit

```
/ship "Slice 1 ingredients pre-work — banned-list save-time enforcement + picker empty-state staples + recently-used"
```

If `/ship` runs `pnpm typecheck` and it fails, fix and re-run before committing. If you touch the schema by accident, also reminder Pavel to `pnpm --filter @ilaunchify/db prisma generate` + restart `next dev`.

## Decision locked elsewhere — for the next slice author

**AI Recipe Parser (Mode 2) is gated to Builder+ tier.** Captured in `.claude/memory/ilaunchify-recipe-builder-modes.md` for the future Slice 3 brief. Mode 1 (Search & build) is free on every tier. Mode 3 (Declare panel) — tier gate TBD; lean Builder+ for parity but Pavel hasn't locked it.

When you write the Mode 2 brief, gate via:

```ts
import { hasFeature } from '@ilaunchify/auth/tiers'
if (!hasFeature(creatorTier, 'ai-recipe-parser')) return { ok: false, error: 'upgrade-required' }
```

Add `'ai-recipe-parser'` to the `PlanFeature` rows seeded in `packages/plans` (Builder and Agency = true; Maker = false) as part of the Mode 2 slice, not this one.

## Paste-ready prompt for Claude Code

```
Ship Slice 1 of the Partner Ingredients pre-work — three changes in one PR:

1. Banned-list save-time enforcement on addIngredientSlot + updateIngredientSlot
   (when baseIngredientId changes) + addReplacement in
   apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts. Reuse the
   existing isIngredientBanned() helper from ingredient-actions.ts. Extend it if
   needed to accept an Ingredient row (not just a name string). On block: return
   {ok: false, error}, write an AuditLog row with action 'INGREDIENT_BAN_BLOCK',
   do not mutate.

2. Picker empty-state staples panel. Remove the q.length < 2 short-circuit in
   searchIngredients in ingredient-actions.ts. When query is empty, return
   recently used (up to 8) + library staples (up to 12) for the
   IngredientPicker.tsx empty state. Client renders under two subheaders.

3. Recently-used recall. Add getRecentlyUsedIngredients(partnerServiceId, limit=8)
   that queries IngredientUsage scoped to the calling partner, joins Ingredient,
   orders by lastUsedAt DESC, returns Ingredient[]. Wire into empty-state.

Read docs/builds/ingredients-prework-slice-1.md for the full brief, plus
apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx +
IngredientPicker.tsx + card-actions.ts + ingredient-actions.ts before touching
code. No schema migration. No new packages. Approval-marked card behavior
unchanged.

Verify: pnpm --filter @ilaunchify/partner typecheck.

Then /ship "Slice 1 ingredients pre-work — banned-list save-time enforcement +
picker empty-state staples + recently-used".
```
