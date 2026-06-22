# Handoff → Code: de-dup the two die-line studios

**Why this is a handoff, not a direct edit.** `PackagingStudioStep.tsx` is a hot
file (1817 lines, 8 commits in the last few days, all yours). Per the two-agent
rule I don't edit your hot files in place. The cold half is already done; this
doc is the single-writer plan for the hot half.

## Context — two studios, one editor

| Entry point | File | Edits | Status |
|---|---|---|---|
| Standalone studio (`/dielines/[id]`, packaging library) | `apps/partner/src/app/(studio)/dielines/[dielineId]/DielineStudioShell.tsx` (576 ln) | a `PackagingDieline` row via `saveDielineFrames` / `saveDielineGeometry` / `confirmDieline` | **cold** |
| Inline Step 4 of the product builder | `apps/partner/src/app/(dashboard)/products/new/PackagingStudioStep.tsx` (1817 ln) | a `PackagingSystem.customDielineLayout` (autosave) + library/upload/mockups/3D/co-review | **hot (yours)** |

Both reuse the `@ilaunchify/ui` frame *model* already (`DEFAULT_FRAME_LAYOUT`,
`FRAME_SCOPE`, `validateFrameLayout`, `Frame`/`FrameKind`/`FrameScope`/`NormBox`).
The duplication is the *presentation + chrome*.

## Done already (committed, safe)

New shared module — single source of truth for the presentation constants that
were **byte-identical** in both files:

`apps/partner/src/app/(dashboard)/packaging/dielines/frame-presentation.ts`
exports `SCOPE_COLOR`, `KIND_LABEL`, `PALETTE`.

`DielineStudioShell` now imports them; its local copies are deleted. Partner app
typechecks clean.

## Step 1 — trivial, do this first (≈5 min)

In `PackagingStudioStep.tsx` delete the local `SCOPE_COLOR` (≈L125–131),
`KIND_LABEL` (≈L133–150), and `PALETTE` (≈L152–158) and import them instead:

```ts
import { SCOPE_COLOR, KIND_LABEL, PALETTE } from '../../(dashboard)/packaging/dielines/frame-presentation'
// (from products/new/, the relative path to packaging/dielines/ — verify depth)
```

Everything else in the file is unchanged. `pnpm --filter @ilaunchify/partner type-check`.
That removes the last byte-for-byte duplication between the two studios.

## Step 2 — bigger win, optional: extract `<DielineFrameEditor>`

The genuinely duplicated UI is the editor surface both shells wrap:

- left **tool rail** (Die-line · Surfaces · Guides · Frames · Layers)
- **Frames drawer** (add-from-`PALETTE`, per-frame scope chip + `KIND_LABEL`)
- **Layers drawer**
- **canvas**: uploaded/blank backdrop + draggable `NormBox` frames coloured by
  `SCOPE_COLOR[FRAME_SCOPE[kind]]`, select/drag/resize/delete
- bottom **zoom toolbar** (zoom in/out/fit)
- **preflight** list from `validateFrameLayout(layout, { safeArea })`

Propose a presentational component (no data fetching, fully controlled):

```ts
// apps/partner/src/app/(dashboard)/packaging/dielines/DielineFrameEditor.tsx  ('use client')
export interface DielineFrameEditorProps {
  layout: FrameLayout
  onLayoutChange: (next: FrameLayout) => void   // caller debounces + persists
  backdropUrl: string | null                    // uploaded die-line image, or null = blank board
  issues: LayoutIssue[]                          // caller computes via validateFrameLayout
  safeAreaPct?: number
  readOnly?: boolean
  // optional chrome slots so each shell keeps its own surrounding UI:
  headerSlot?: React.ReactNode                   // confirm button / submit / save indicator
  footerNote?: React.ReactNode
}
```

Each shell keeps what's *unique* and delegates the editor:

- **DielineStudioShell**: owns the confirm flow → passes `onLayoutChange` =
  debounced `saveDielineFrames`, geometry → `saveDielineGeometry`, `headerSlot` =
  the "Confirm die-line" button (`confirmDieline`).
- **PackagingStudioStep**: owns library tabs / upload modal / mockups / 3D / the
  co-review submit → passes `onLayoutChange` = its `customDielineLayout` autosave,
  `backdropUrl` = first uploaded die-line, `headerSlot` = its Saved indicator.

Net: ~300–400 lines of canvas/drawer/rail logic collapse to one component; the
two shells shrink to data-wiring + their unique surrounding chrome. Build the
component, point `DielineStudioShell` at it first (it's cold — I can do that half
on request), then swap `PackagingStudioStep`'s inline editor for it in the same
pass so nothing renders twice.

## Guardrails

- Keep the `@ilaunchify/ui` frame model as the only model source; the new
  component is presentation-only.
- Don't change persistence shapes (`FrameLayout` / `DielineGeometry` /
  `customDielineLayout`) — this is a pure UI de-dup.
- Additive only; no schema, no behavior change. Verify with a side-by-side of
  both studios after the swap (drag, add-from-palette, zoom, preflight, confirm).
