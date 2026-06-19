# Version history & autosave — both editor surfaces

**Decision (Pavel 2026-06-19):** kill the "Save draft" button. Both editors autosave
continuously; the chrome shows a passive **"Saved · 2 min ago"** indicator + a
**Version history** drawer (last 10 + pinned milestones). Applies to the partner
product-builder draft AND the creator Design Studio canvas.

## Autosave ≠ version history

Two mechanisms, deliberately separate:

- **Autosave** overwrites ONE live record (no new rows). Powers the "Saved" label.
  - Creator canvas: `saveDesignJson` upserts the WORKING `DesignVersion` row (debounced 1.5s + on blur/unload).
  - Partner builder: each step card autosaves its own slice through the existing `build-actions` writers.
- **Version history** is a throttled, restorable set of snapshots in `EditSnapshot`. Never one row per autosave — that's the storage trap.

## Retention policy (shipped)

Ring buffer + pinned milestones, pruned on write (`packages/db/src/snapshots-engine.ts`):

- Keep the **last 10 non-pinned (AUTO)** snapshots per entity.
- **Pin** MILESTONE + MANUAL forever (export, step-advance, submit, named saves, "Before restore").
- **Coalesce** AUTO snapshots saved <2 min apart (update the latest row instead of inserting).
- Prune on every write — self-limiting, no cleanup cron.

### Storage math
- Builder draft snapshot (`InitialDraft` JSON): ~10–50 KB, ~10 KB gzipped → 10 snaps ≈ 150 KB/product. Negligible.
- Design canvas snapshot (Fabric JSON): the only real risk IF images are embedded. **Rule: snapshots store image REFERENCES (R2 asset keys / urls), never data-URLs.** Then a snapshot ≈ the working-row size.

## Cadence (shipped)
- Working autosave: as before (continuous).
- AUTO snapshot: throttled to once / 2 min after a successful save (coalesce backstops it server-side).
- MILESTONE snapshot: creator = on export; builder = on each forward step.

## Schema (additive — `EditSnapshot`, commit b88e5c0)
Polymorphic by `(entityType SnapshotEntity, entityId)` — one model/engine/UI for both surfaces. `kind` AUTO|MILESTONE|MANUAL, `pinned`, `snapshot Json`, `label?`, `createdById?`, `createdAt`. No FK (history side-table; ownership enforced in the per-app actions; orphans on hard-delete are harmless + TTL-prunable).

## What shipped vs follow-up

| Surface | Indicator (no Save draft) | Snapshot record + list | Restore |
|---|---|---|---|
| Creator Design Studio | ✅ `SavedIndicator` | ✅ `snapshotDesign`/`listDesignSnapshots` | ✅ `restoreDesignSnapshot` → working row → `loadFromJSON` |
| Partner builder | ✅ `SavedIndicator` | ✅ `snapshotDraft`/`listDraftSnapshots` (serializes via `loadDraft`) | ⏳ read-only drawer (`allowRestore=false`) |

### Builder restore — follow-up (Code owns build-actions)
Re-applying an `InitialDraft` spans ~10 child tables (recipe slots, axes, flavors, pricing tiers, production, packing, fees, approval rules, option rules, sample options). Do NOT hand-roll a raw multi-table rewrite — **compose the existing tested per-collection writers** (`updateBasics`, `saveRecipeSlots`, `saveOptionAxes`, `savePricingTiers`, `saveProduction`, `savePacking`, `saveFees`, `saveSampleOptions`, `saveFlavors`, `saveChangeApprovalRules`, `saveOptionRules`, `setIntendedAgeGroup`, `setMarketplaceAttributes`) inside one transaction, snapshot-before-restore (already supported), then reload the builder at `?draft=<id>`. Flip `allowRestore={true}` in `GuidedBuilder`'s `VersionHistoryDrawer`.

## Shared building blocks
- `@ilaunchify/db`: `createSnapshot` / `listSnapshots` / `getSnapshotJson` + the pure engine (`snapshotsToPrune`, `coalesceTarget`) with a node test (`snapshots-engine.test.mjs`, run with `node --experimental-strip-types`).
- `@ilaunchify/ui`: `<SavedIndicator>` (icon+tooltip cluster: saved · prev · next · history) + `<VersionHistoryDrawer>` (`allowRestore`, `footnote`) + `relativeTime`.

## Design Studio top bar + visual history (a4940fd)
- `EditSnapshot.thumbnail String?` — small PNG (`snapshotCanvasAsPng` ×0.25) captured from the LIVE canvas at snapshot time (images already loaded → reliable). Stored as a data URL; ~10 KB × ≤10 ≈ negligible. Builder/old rows = null.
- `SavedIndicator` = icon + native tooltip ("Saved 2 min ago"), no inline text; optional prev/next-version + history icons. Moved to the LEFT of the top bar (logo · 3-line menu · indicator cluster); brand + product name hidden.
- `VersionHistoryPanel` (creator `canvas/`) docks under the header on the right like `CompliancePanel` — thumbnail per version + a larger selected preview + Restore. **Prev/next step the SELECTED version only; Restore is the only thing that mutates the canvas** (browsing is non-destructive, sidesteps autosave-clobber). Partner builder keeps the simpler shared `VersionHistoryDrawer` (no canvas thumbnails).
- Follow-up: history is scoped to the BASE design (`flavorPresetId: null`); per-flavor design history is a later add (Code's per-flavor model is live).

## Mac steps
`prisma db push` (EditSnapshot is additive) → `pnpm db:generate` → `rm -rf apps/*/.next` → restart. Then smoke-test: design-canvas History drawer + restore; builder History drawer (read-only).

## Collision note (2026-06-19)
The creator canvas (`canvas/actions.ts`, `CanvasLayoutShell.tsx`, `page.tsx`, `useAutoSave.ts`) is Code's ACTIVE per-flavor-labels zone. The creator version-history feature is committed (4f105d1); a later 2-line `ownedDesign` scope tweak (`flavorPresetId: null`, to target the base design) is left UNCOMMITTED in Code's working tree and will ride with Code's commit. If lost on a Code reset, re-apply it (it just scopes history to the base/shared design).
