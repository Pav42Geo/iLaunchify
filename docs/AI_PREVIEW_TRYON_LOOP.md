# AI Templator — "Try-on loop" preview UX (spec)

**Status:** Approved direction (Pavel, 2026-07-01) · **Owner:** Cowork · **Doc pair:** `AI_PACKAGING_GENERATOR.md` §8, `STUDIO_ARCHITECTURE_3D_2D.md`

## Why

Research pass (2026-07-01) across packaging design tools (Pacdora, Packlane, Packly) and
AI generators (Midjourney, Looka, Canva Magic Design):

- Packaging tools make the **3D product the hero preview** — every edit re-renders a
  rotatable model instantly; the flat die-line is the technical view. (= our locked
  3D/2D architecture: die-line is the print master, 3D is the derived experience.)
- AI tools run a **pick → refine loop**: 4-up grid, per-concept actions, "vary this one"
  to converge instead of re-rolling blind (Midjourney), and **in-context try-on** — click
  a candidate and see it applied to the real artifact immediately (Looka).

Our drawer today: flat 2-up SVG grid at 400px, 3D is opt-in per card, "Use on canvas"
**stacks** images (no swap), comparison = apply → undo. All the machinery for the better
loop already exists (`Dieline3DViewer`, CanvasTexture live 3D, truth-layer composite,
stored generation briefs). This spec arranges it.

## The three features

### F1 — Swap-in-place + concept switcher (the core)

**Behavior**
- "Use on canvas" places the concept as a **tagged** full-bleed image at the back of the
  stack (under the truth layer), replacing any previously applied AI concept — never
  stacking a second one.
- While a generation's variations exist in the drawer, an **"On canvas: Concept 2/4 ‹ ›"**
  switcher (drawer, above the results grid) cycles the applied concept in place.
  Truth layer stays on top; this is real in-context comparison.
- Applying / switching is **one undoable step** in canvas history (EditSnapshot ring
  buffer picks it up like any other mutation).
- Removing: the tagged object is selectable/deletable like any image; switcher hides
  when no tagged concept is on canvas.

**Implementation**
- Add `'ai-concept'` to `CanvasCustomType` (`packages/ui/src/canvas/objects.ts`) and pass
  it through `addImageFromUrl(canvas, src, { customType: 'ai-concept', maxFraction: 0.98 })`.
- Stamp metadata on the object (Fabric custom props, serialized into design JSON):
  `aiConcept: { generationId, variationIndex, dielineId }`.
- Apply = find existing object with `customType === 'ai-concept'` → remove → add new →
  `sendObjectToBack` → `requestRenderAll`. Helper `applyAiConcept(canvas, src, meta)` in
  `packages/ui/src/canvas/objects.ts` so drawer code stays thin.
- Recolor/apply-brand safety: add `'ai-concept'` to the skip list used by
  `packages/ui/src/color/recolor.ts` callers (it's an image; images are skipped anyway,
  but the explicit skip documents intent).
- Switcher state = the drawer's existing `variations: string[]` + a
  `appliedIndex: number | null`. Persist nothing server-side; the canvas object's
  metadata is the durable record.

**Phase 2 (needs a canvas-internals seam — Code):** hover a variation card →
*temporary* preview on canvas, restored on mouseleave, **without polluting undo
history**. Requires a `withHistorySuspended(canvas, fn)` (or equivalent) helper from the
canvas history owner. F1 ships without hover; click-to-swap is already a big win.

### F2 — 3D-first results for shaped products

**Behavior**
- When the selected die-line's `containerCategory` maps to a real shape
  (`shapeKindForCategory` — CAN, BOTTLE, BOX, POUCH…), variation results render as
  **small rotatable 3D previews by default** (current `Dieline3DViewer` + `textureSvg`),
  with the existing Flat toggle inverted (flat becomes the secondary view).
- **Aspect-aware layout:** in the 400px drawer, surfaces with aspect ratio > 1.6 or
  < 0.625 (can wraps, tall labels) render **single-column** tiles; near-square keeps 2-up.
- Live preview (pre-generation composite) follows the same rule: wide → full-width tile.

**Implementation**
- All inside `AiCreatePanel.tsx` (results column) — pure presentation. Aspect from
  `selected.surface.widthMm / heightMm`. Default `threeDIdx` behavior becomes
  "all cards 3D" via a per-card boolean map instead of the single index.
- Perf guard: max 4 concurrent `Dieline3DViewer` instances (one per card) — acceptable;
  they already render in set mode. If frame rate suffers on low-end machines, lazy-mount
  on card visibility.

### F3 — "More like this" (converge, don't re-roll)

**Behavior**
- Each variation card gets **"More like this"**: re-runs a draft cycle seeded from that
  concept's brief (descriptor + chips + palette), replacing the grid with 4 riffs on the
  chosen direction. Costs one draft cycle like any generate; meters update as usual.
- Breadcrumb line above results: "Riffing on Concept 3 · [back to first batch]" — keep
  the previous batch in memory (one level only, no tree).

**Implementation**
- The brief already rides `generateAiConcepts({ brief })` and is stored in `promptJson`
  (used by Library → Inspire). "More like this" = call `onGenerate` with the same plan +
  brief, optionally `seed` derived from the variation index once the provider honors
  seeds (stub ignores it — fine).
- No schema change. (Optional later: `AiDesignGeneration.parentId` for lineage; not V1.)

## Ownership / hot files

| File | Owner for this work |
|---|---|
| `studio/ai-create/AiCreatePanel.tsx`, `AiCreateDrawer.tsx`, `TemplateLibrary.tsx`, `actions.ts`, `loader.ts` | **Cowork** |
| `packages/ui/src/canvas/objects.ts` (add `'ai-concept'` + `applyAiConcept`) | **Cowork** (additive only) |
| `design/canvas/CanvasLayoutShell.tsx` | **Cowork** (only if a mount change proves necessary; expected: none) |
| Canvas history internals / `withHistorySuspended` seam (F1 Phase 2) | **Code** — request when Phase 2 starts |
| `Dieline3DViewer`, CanvasTexture pipeline | **Code's zone** — consumed as-is, no edits |

**Release protocol (per CLAUDE.md multi-agent rules):** Code commits/pushes any
uncommitted edits to the files in rows 1–3, confirms clean working tree for those paths,
and treats them as Cowork-owned single-writer until handed back. Cowork commits after
every change as usual.

## Phasing

- **P1** — F1 click-to-swap + switcher, F2 aspect-aware layout. No new seams.
- **P2** — F2 3D-by-default, F3 More-like-this.
- **P3** — F1 hover try-on (needs history-suspend from Code), A/B pin (pin one candidate,
  flip the other), lightbox zoom.

## Out of scope

- No consumer-facing surface (B2B only). No schema changes. No provider changes — works
  against the deterministic stub today. Coordinated-set and flavour-family modes keep
  their current preview layouts (revisit after P2).
