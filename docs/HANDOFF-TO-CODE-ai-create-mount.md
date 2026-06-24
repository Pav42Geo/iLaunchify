# Handoff → Code: mount AI Create into the Studio (P2 → real wiring)

P0–P2 of the AI Packaging Generator are built (`docs/AI_PACKAGING_GENERATOR.md`).
Everything is deterministic + sandbox-verified; the only thing left for a live,
real-data P2 is the loader + the Studio-rail mount, which touch **your** hot files
(`CanvasLayoutShell.tsx`), so they're yours to land.

## What's already built (don't rebuild)
- `@ilaunchify/ai-design` — `assemblePrompt`, `requiredElements`, `evaluateCompliance`,
  `satisfiedElementsFromFrames`, `elementKindsForFrame`. Pure, golden-tested.
- `@ilaunchify/ui`: `planGeneration(input) → GenerationPlan` (the brain),
  `compositeDesignSvg`, `buildPanelMaskSvg`, `reservedZoneLabels`, `presentFrameKinds`,
  `classifyFrames`. Pure SVG, golden-tested.
- `apps/creator/src/app/(studio)/studio/ai-create/AiCreatePanel.tsx` — the UI, fully
  prop-driven, die-line-first, tier-gated. Renders live composite + compliance chip.
- `.../ai-create/page.tsx` — a **fixture demo** at `/studio/ai-create` (placeholder art).

## What you wire (real data)
1. **Loader** (server): for the product, load its die-line SET → `DielineTarget[]`
   (`{ id, label, shapeLabel, layout: FrameLayout, surface: {widthMm,heightMm} }`).
   The die-line is the INPUT (Pavel): primary + outer carton + per-flavor labels all
   become entries. `layout` = `PackagingDieline.frames`; `surface` = its mm dims.
   Resolve `domain` from `Category.labelingType`, `market` (US for now), `brandPalette`
   from the Brand Kit, `substrateLabel` from the component substrate, `tier` from the
   creator (Builder/Agency enabled; Maker shows the gated upsell; Admin in Admin Mode).
2. **Mount** `<AiCreatePanel … />` into the Studio left rail as an "AI Create" tool
   (next to Elements/Brand/Templates), or keep the standalone route — your call on the
   shell. The panel is self-contained; just pass props.
3. **Provider seam** (`onGenerate`, P3): `(plan, dielineId) => Promise<string[]>`.
   Send `plan.prompt` / `plan.negativePrompt` / `plan.maskSvg` to the image provider,
   return N variation image refs. Until then the panel shows the deterministic
   placeholder composite — fully usable for layout/compliance review.

## Notes
- New workspace package: run `pnpm install` so `@ilaunchify/ai-design` links (I added it
  to `packages/ui` + `apps/creator` deps + the tsconfig `paths`). Sandbox symlinks are
  stand-ins; pnpm recreates them.
- Compliance gate: `plan.compliance.complete` must be true before export. The panel
  already surfaces missing required elements.
- No schema yet — P2 is stateless. `AiDesignGeneration` + credits ledger land in P3.
