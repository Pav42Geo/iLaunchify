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

1. **Shared presentation constants** — `frame-presentation.ts` (`SCOPE_COLOR`,
   `KIND_LABEL`, `PALETTE`); were byte-identical in both files.

2. **Shared `<DielineFrameEditor>` is BUILT** —
   `apps/partner/src/app/(dashboard)/packaging/dielines/DielineFrameEditor.tsx`.
   It contains the whole editor (tool rail · Die-line/Surfaces/Guides/Frames/Layers
   drawers · canvas with draggable frames + guides · zoom toolbar · debounced
   autosave · live preflight) and all the canvas/drawer/small sub-components.
   `DielineStudioShell` was rewritten to render it (576 → ~140 lines) — proof the
   API works against a real consumer. Partner app typechecks clean.

   Its props:
   ```ts
   interface DielineFrameEditorProps {
     initialLayout: FrameLayout; initialTrim: NormBox; initialSafe: NormBox
     backdrop: { fileUrl: string | null; isPdf: boolean }
     meta?: { format?; widthMm?; heightMm?; bleedMm? }
     onPersist: (geom: { layout; trim; safe }) => Promise<{ ok: boolean; error?: string }>  // editor debounces ~700ms, then calls this
     topBarLeft?: React.ReactNode
     topBarRight?: (ctx: { issues: LayoutIssue[]; saveStatus }) => React.ReactNode
   }
   ```
   The editor owns tool/selection/zoom/drag + the autosave timer + `issues`
   (it computes `validateFrameLayout` internally and hands it to `topBarRight`).

## Step 1 — trivial, do this first (≈5 min)

In `PackagingStudioStep.tsx` delete the local `SCOPE_COLOR` (≈L125–131),
`KIND_LABEL` (≈L133–150), and `PALETTE` (≈L152–158) and import them instead:

```ts
import { SCOPE_COLOR, KIND_LABEL, PALETTE } from '../../(dashboard)/packaging/dielines/frame-presentation'
// (from products/new/, the relative path to packaging/dielines/ — verify depth)
```

Everything else in the file is unchanged. `pnpm --filter @ilaunchify/partner type-check`.
That removes the last byte-for-byte duplication between the two studios.

## Step 2 — YOUR remaining work: swap `PackagingStudioStep` onto `<DielineFrameEditor>`

The component exists and is proven (DielineStudioShell uses it). Now retire the
inline editor in `PackagingStudioStep` and render the shared one instead:

1. Delete the inline rail/drawers/canvas/zoom/drag/autosave block in
   `PackagingStudioStep.tsx` (the part that mirrors what's now in
   `DielineFrameEditor.tsx`) — keep your unique surrounding chrome (library tabs,
   upload modal, mockups, 3D toggle, History/Undo/Redo, co-review submit).
2. Render `<DielineFrameEditor .../>` in the canvas slot, wiring:
   - `initialLayout/initialTrim/initialSafe` from the loaded `PackagingSystem`
     (`customDielineLayout` for the type-less custom case, or the resolved
     die-line's frames otherwise).
   - `backdrop` = `{ fileUrl: firstUploadedDielineUrl, isPdf }`.
   - `onPersist` = your existing `customDielineLayout` / `saveDielineFrames`
     autosave (return `{ ok, error }`).
   - `topBarRight` = your existing Saved indicator / preflight / submit cluster
     (it receives `{ issues, saveStatus }`).
3. Keep the constants import from `frame-presentation` (Step 1) — the editor
   already uses it, so once you delegate you can drop your local copies entirely.

This collapses the duplicated ~430 lines in your file to a single
`<DielineFrameEditor>` render. Because it's your hot file, you're the single
writer for this swap — I've left it to you rather than risk clobbering your
in-flight work.

## Guardrails

- Keep the `@ilaunchify/ui` frame model as the only model source; the new
  component is presentation-only.
- Don't change persistence shapes (`FrameLayout` / `DielineGeometry` /
  `customDielineLayout`) — this is a pure UI de-dup.
- Additive only; no schema, no behavior change. Verify with a side-by-side of
  both studios after the swap (drag, add-from-palette, zoom, preflight, confirm).
