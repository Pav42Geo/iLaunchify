# Per-flavor label safety — Cowork ⇄ Code build split

**Date:** 2026-07-04. Companion to `docs/PER_FLAVOR_LABEL_SAFETY_UX.md`. Purpose: let **Cowork**
and **Code** build the Bind/Signal/Verify safety work **in parallel without clobbering each other**.
The rule that makes this safe: **single writer per file** + **new self-contained files for Cowork**,
so the only shared edit surface is a handful of mount points in `CanvasLayoutShell.tsx`, which
**Code owns**.

## Ownership split (do not edit the other agent's files)

### Cowork owns — NEW self-contained files (presentational + pure, zero canvas internals)
- `canvas/lib/flavorMismatch.ts` (+ `.test.ts`) — ✅ built. `detectFlavorMismatch(active, texts, pool)`.
- `canvas/lib/flavorCompleteness.ts` (+ `.test.ts`) — pure submit-gate engine (below). *Cowork to build.*
- `canvas/drawers/FlavorSwitcher.tsx` — presentational pills (swatch + name + active), "Editing: X".
  Props only; no data fetching. *Cowork to build.*
- `canvas/drawers/FlavorLabelSections.tsx` — the Label & Compliance per-flavor list (row per flavor
  with completeness ✓/✗ + the aggregate row), `PER_FLAVOR` only. *Cowork to build.*
- `canvas/drawers/FlavorMismatchNotice.tsx` — renders `detectFlavorMismatch` warnings inline. *Cowork.*
- `canvas/lib/flavorAccent.ts` — pure helper: `swatchHex → { borderColor, ring }` chrome-tint style.
  *Cowork.*

### Code owns — the hot files (canvas plumbing + mounting Cowork's parts)
- `canvas/CanvasLayoutShell.tsx` — **the only shared file.** Code does ALL edits here:
  mounts `<FlavorSwitcher/>`, applies the flavor accent around the stage, renders
  `<FlavorLabelSections/>` inside the Label & Compliance tool, renders `<FlavorMismatchNotice/>`,
  calls `detectFlavorMismatch` in the compliance scan, and gates submit with `flavorCompleteness`.
- `canvas/page.tsx` + `canvas/actions.ts` — per-flavor loader/save (`Design.flavorPresetId`), the
  core plumbing from `HANDOFF-TO-CODE-per-flavor-labels.md` §4.
- `canvas/flavorBind.ts` — **Code's** (already exists). The "locked flavor tokens" (Bind) is deep
  Fabric work — Code's zone.
- `(checkout)/.../component-actions.ts` — map each flavor's `DesignVersion` onto its component.

## The seam (the contract between us)

Cowork exports **stable prop/param interfaces**; Code imports and mounts. Proposed signatures:

```ts
// FlavorSwitcher.tsx
export function FlavorSwitcher(props: {
  flavors: { id: string; name: string; swatchHex: string | null }[]
  activeId: string | null            // null = shared base
  onSelect: (id: string | null) => void
  includeBase?: boolean              // show a "Base (all)" pill
}): JSX.Element

// flavorCompleteness.ts  (pure — Cowork builds + tests)
export function checkFlavorCompleteness(input: {
  flavors: { id: string; name: string }[]
  savedFlavorIds: string[]           // flavors that have a saved Design
  needsAggregate: boolean
  aggregateSaved: boolean
}): { complete: boolean; missingFlavors: string[]; missingAggregate: boolean }

// flavorAccent.ts
export function flavorAccentStyle(swatchHex: string | null): React.CSSProperties
```

`detectFlavorMismatch` is already exported from `canvas/lib/flavorMismatch.ts`.

## Rules (from CLAUDE.md multi-agent section)

1. **Single writer per file.** Cowork never edits `CanvasLayoutShell.tsx` / `page.tsx` / `actions.ts`
   / `flavorBind.ts` for this workstream; Code never edits Cowork's `flavor*.ts` / `Flavor*.tsx`.
2. **Commit immediately** after each change; push promptly. Never leave edits uncommitted while the
   other agent is active.
3. **Mount edits are Code's.** When a Cowork component is ready, Code adds the import + mount in one
   small commit. Cowork announces "ready to mount: <Component> with <props>"; Code wires it.
4. If a shared-file edit is ever unavoidable from Cowork, **announce + hand off single-writer** (owner
   commits first, clean tree, then the other proceeds).

## Suggested order

1. Cowork: `flavorCompleteness.ts` (+test) and `FlavorSwitcher.tsx` — ready to mount.
2. Code: per-flavor loader/save plumbing (`page.tsx`/`actions.ts`) — independent of Cowork's files.
3. Code: mount `FlavorSwitcher` + apply `flavorAccentStyle` (Signal).
4. Cowork: `FlavorLabelSections.tsx` + `FlavorMismatchNotice.tsx`.
5. Code: mount those in Label & Compliance; call `detectFlavorMismatch` in the scan; gate submit with
   `checkFlavorCompleteness`; make the multipack viewer the required `PER_FLAVOR` pre-submit review.
6. Code: locked flavor tokens (Bind).
