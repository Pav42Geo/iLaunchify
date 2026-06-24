# Die-line Management — session handoff (2026-06-23)

Built the admin **Die-line Management** program end-to-end per `DIELINE_MANAGEMENT_UX.md`.
All commits below are on the working branch; `pnpm typecheck` is clean across
db / ui / storage / admin / partner / creator, and the pure-engine golden suites
(dielineSvg, dielineParse, frames) pass.

## What shipped (commits, newest first)

- `e63952c` P2b — Product readiness `/dielines/readiness` (the "set view")
- `59b0d80` Conversion Verifier **ghost-diff** (detected lines over the original)
- `0fd62d5` P3b — propagate frames to the shape cluster
- `9f051f7` Substrate / material swatches (kraft, board, coated, corrugated, film, foil)
- `0d27f9c` Pacdora-style preview dock → fullscreen 2D⇄3D modal (3D = mount slot)
- `1ff8c62` Detection report (confidence + coverage) in the Verifier
- `85fa990` P4 auto-parse engine — SVG recognizer + "Detect from original"
- `479860b` P3a — By-shape lens + auto-cluster + batch-map
- `f1de796` Conversion Verifier (overlay + measurement audit + review gate)
- `c651d55` Frame content fidelity (pinned phrases/symbols render on canvas)
- `56cc3ec` "Design in Studio" from a mapped die-line
- `f277662` P2a — canonical shape mapping (PackagingDieline → DieCutTemplate)
- `5084447` P1 — Die-line Operations workspace
- earlier this session: admin Die-line Curator (Spec ⇄ Frames), promote
  DielineFrameEditor to `@ilaunchify/ui`, `/template-author` → `/studio?adminMode=1`,
  seed dev admin = SUPER_ADMIN, sidebar "Die-lines" → `/dielines`.

## Mac steps

- **P2a schema (canonicalShapeId / matchConfidence / clusterKey + mappedDielines)**
  — already pushed by you (`pnpm db:push && pnpm db:generate`). Done.
- Everything after P2a is **no-schema**. Just **restart the dev servers** (admin
  3003, creator 3000) to pick up the new components/routes.

## Smoke test (admin, localhost:3003)

1. `/dielines` — Operations workspace: KPI strip (click-to-filter), Inbox /
   By shape / By packaging / By partner lenses, search. "Product readiness →" in hero.
2. A row → **Curate** opens `/dielines/[id]`:
   - **Canonical shape** picker (suggested match) + **Design in Studio** when mapped.
   - **Detect from original** (SVG originals) → spec pre-fills + Detection report.
   - **Overlay** → Normalized ⇄ **Ghost-diff**; **Material** swatches; **3D ⤢** → fullscreen dock.
   - Measurement audit + review checkbox gates **Save normalized & verify**.
   - **Frames** mode: place frames (pinned text renders) → **Propagate to cluster**.
3. `By shape` lens → an unmapped cluster → **Map N** (batch-map).
4. `/dielines/readiness` — products with their component die-line set + ready signal.

## Dependency-gated follow-ups (need one install / integration each)

- **3D fold viewer** → `pnpm add three @types/three --filter @ilaunchify/ui`, then
  build `Dieline3DViewer` into the dock's 3D slot (mesh + substrate base colour +
  Open⇄Close fold slider doubling as a parse-correctness check). Highest-impact.
- **PDF / AI auto-parse** → `pdf-parse` as a background job (SVG parsing is live).
- **AI Template Generator** (DESIGN_TEMPLATE_LIBRARY §9a) → image-gen integration.

## Notes / debts

- Frame content fidelity renders in the **shared DielineFrameEditor** (partner
  studio + admin Curator). Rendering pinned content in the creator **Fabric**
  Studio + a real PackagingSymbol picker are tracked follow-ups (§11a).
- PDF/AI originals show "auto-parse supports SVG for now" — by design.
- Curator productId placeholder + `template-author-actions.ts` filename retained
  (internal, functional) from the `/studio` rename.
