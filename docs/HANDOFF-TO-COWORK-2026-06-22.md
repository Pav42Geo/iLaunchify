# Handoff to Cowork — Code's 2026-06-22 session

Code → Cowork. Everything below is committed + pushed on `main` (tree clean). Two
threads landed: the **Studio Brand rail** (Cowork's spec) and **per-flavor real
nutrition 2b**. Both have dormant pieces waiting on a Mac `db push`.

## 1. Studio Brand rail + Save as template — SHIPPED (`315cf53`)

Implements `docs/HANDOFF-TO-CODE-studio-brand-rail.md` in full (rail tool, drawer,
Save-as-template). Workspace typecheck 21/21; live DOM smoke-test passed (rail order
`Product · Label · Brand · …`, drawer sections render, switcher loads the kit, ☰ has
"Save as template", no console errors).

Files: `apps/creator/.../canvas/drawers/BrandDrawer.tsx`, `.../canvas/brand-actions.ts`,
`apps/creator/src/lib/brand-canvas-assets.ts` (shared builder, also now used by the
canvas loader), `CanvasLayoutShell.tsx` + `StudioHeaderMenu.tsx` wiring,
`packages/db/src/brand-templates.ts` (+`getBrandTemplateCanvasJson`), `packages/audit`
(`BRAND_TEMPLATE_CREATED`).

**ACTIVATION (you):** `pnpm --filter @ilaunchify/db push` to create the `BrandTemplate`
table. Until then the cast-guarded helpers return empty/null, so the drawer's Templates
list stays empty and Save-as-template returns "not available yet." Everything else
(switcher, logos, colors, fonts) works against existing brand data now.

**Open follow-ups (none blocking):**
- Saved templates aren't tagged with `packagingTypeId` (shell doesn't carry it handily) —
  left null. Easy to add if you want templates filtered by packaging type.
- Thumbnail is stored as the snapshot **data-URL** directly (renders fine in `<img>`).
  Fine for V1; move to R2 upload if size becomes an issue.
- "Apply brand" one-click recolor/font-swap of the whole design was a handoff
  nice-to-have — **deferred**, not built.

## 2. Per-flavor real nutrition 2b — SHIPPED (`90fc495`→`ff63f76`)

The Studio nutrition panels now render REAL recipe data instead of `SAMPLE_*`:
- FOOD single per-flavor + variety aggregate (multi-column), supplement (Supplement
  Facts), pet (AAFCO). Auto-binds the panel to the active flavor on load.
- Architecture + the seed-data caveat are in memory `perflavor-nutrition-2b.md`.

**Out of scope (genuinely no path):** cosmetic = INCI ingredient text (a label section,
not a facts panel); OTC Drug Facts has no `computeProductLabel` engine path.

**Seed-data note:** the demo recipes' ingredients have empty `nutritionPer100g`, so real
values compute to **0** (correct, just zero). If you want non-zero demo panels, seed
`nutritionPer100g` on a few ingredients.

## 3. Earlier-session item still dormant — needs a push

Phase 4 per-flavor checkout wrote `OrderItemFlavor.designVersionId` (snapshots the
flavor's design at order time). It's guarded but **needs `pnpm --filter @ilaunchify/db
push`** to add the column before it's live.

Two tracked chips (your zone for the second):
- `task_e03c40b2` — preserve `FlavorPreset.dielineId` across `saveFlavors`.
- `task_3f0533dc` — surface `OrderItemFlavor.designVersionId` in the production manifest
  (`packages/orders` — Cowork zone).

## Dev environment
- Creator dev server is **running on :3000** (detached, fresh `.next` cache). Other apps
  up on 3002/3003/3010. Stop with `pkill -f "next dev"`.
- Heads-up: wiping `.next` forces a full warm-up recompile; a request landing mid-HMR can
  flash a transient canvas 404 (`notFound()` from the product loader). Hard reload (⌘⇧R)
  clears it — not data loss, not a code bug. The `Critical dependency` warnings on
  `blankSpec.ts`/`exportPdf.ts` are pre-existing webpack noise.

## Suggested first moves
1. `pnpm --filter @ilaunchify/db push` (activates BrandTemplate + OrderItemFlavor.designVersionId).
2. Post-push: seed a color/font/logo on Demo Brand, then Studio → Brand → Save as template
   → confirm it lands in the drawer grid + loads back.
