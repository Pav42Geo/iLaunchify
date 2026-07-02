# Design Reshape — carry one design idea across die-line shapes (spec)

**Status:** Approved direction (Pavel, 2026-07-01) · **Owner:** Cowork (pipeline + UX), Code (provider/imagegen legs) · **Doc pair:** `AI_PREVIEW_TRYON_LOOP.md`, `DESIGN_TEMPLATE_LIBRARY.md` §8, `AI_PACKAGING_GENERATOR.md`

## Problem

A creator generates/authors a design they love on die-line A (e.g. a 4×12in can wrap)
and wants **that same design idea** on die-line B with a completely different shape
(e.g. a mailer box or tall pouch) — same brand line, recomposed for the new geometry.
Today the template matcher **hard-blocks** cross-shape use (shape-family gate). This
spec replaces the block with a **"Reshape for this die-line"** action.

## Core principle — a decision ladder, not one AI algorithm

Research (Canva Magic Switch, Adobe Firefly Generative Expand / Generative Match,
IP-Adapter, seam-carving literature): the industry splits retargeting into
(a) structured element re-layout — constraint-based, no AI — and (b) artwork
retargeting — outpainting or reference-conditioned regeneration. Seam carving is
rejected: it distorts motifs and type.

Our structural advantage: a Studio design is not a flat image. It is a layered Fabric
scene with **role-tagged objects** (`brand-logo`, `text`, `barcode`, `ai-concept`
background, regulated panels), the target die-line carries a typed `FrameLayout`
(LOGO / STATEMENT_OF_IDENTITY / IMAGERY / NUTRITION_FACTS…), every AI generation stores
its **brief + palette + seed context** (`promptJson`), and the truth layer is
**regenerated deterministically per product — never reshaped**. So AI is confined to
the one layer where geometry genuinely changes composition: the background art.

## The three rungs

**R1 — Element re-anchoring (deterministic, free).**
Map role-tagged canvas objects to the target `FrameLayout` by frame kind (logo → LOGO
frame, SoI text → STATEMENT_OF_IDENTITY, barcode → BARCODE…). Untagged decorative
objects re-place proportionally in normalized coordinates. Type rescales by the
min-dimension ratio, clamped to the type scale. Fonts + palette stay byte-identical.
No-frame targets fall back to full-proportional placement.

**R2 — Background-art crop (deterministic, free).**
For mild geometry change: focal-point-aware cover-crop of the `ai-concept` layer
(center-weighted V1; saliency later). Original pixels, new framing.

**R3 — Background-art AI retargeting (spends a draft cycle).**
Two routes by severity:
- **R3a Outpaint** — extend the art into the new aspect via image+mask (provider
  generative-expand). Original pixels untouched → strongest brand fidelity.
- **R3b Reference-conditioned regeneration** — re-run the stored brief through
  `planGeneration` on the TARGET die-line, passing the original art as the style
  reference image (the `GenerateContext.brandRefUrl` conditioning seam already exists —
  IP-Adapter / Firefly-Match class behaviour at the provider). Same palette, same
  style/element chips, seed reused. "Same idea, recomposed."

## Severity routing rules

Inputs: source vs target `aspectBucket` (ordered scale: WRAP → PANEL_WIDE →
PANEL_SQUARE → PANEL_TALL → LONG_STRIP, `aspectBucketFor` thresholds 2.5/1.3/0.8/0.3)
and `shapeKindForCategory` (BOX / CYLINDER / FLAT). Let `Δbucket` = distance on the
ordered scale.

| Severity | Condition | Route |
|---|---|---|
| **S0 — same family** | same bucket AND same shape kind | Direct apply (today's matcher path; no reshape) |
| **S1 — mild** | Δbucket = 1, shape kind same or FLAT↔CYLINDER | R1 + R2 (crop) |
| **S2 — strong** | Δbucket ≥ 2, target NOT multi-panel BOX | R1 + R3a (outpaint) |
| **S3 — radical** | target is multi-panel BOX (per-face frames), OR source art has no stored brief AND Δbucket ≥ 2, OR outpaint area > ~60% of output | R1 + R3b (reference-conditioned regen) |

Notes:
- FLAT↔CYLINDER at equal bucket is pure unrolling — geometry is the same rectangle;
  only the 3D preview differs. Never spend AI on it.
- S2/S3 produce **4 candidates** that land directly in the try-on loop (hover, ‹ ›
  switcher, A/B pin, lightbox) — reshape reuses the whole review UX as-is.
- The severity classifier is a pure function (`classifyReshape(source, target)`) in
  `packages/ui/src/lib/template-match.ts` — golden-tested, additive.

## Compliance & truth layer

- Reshaped output re-runs `evaluateCompliance` against the TARGET layout; the export
  gate (`compliance.complete`) applies unchanged.
- Truth-layer artifacts (Facts panels, barcodes, mandatory phrases) are NEVER image-
  reshaped — they regenerate from product data on the target (existing behaviour).

## Provenance & metering

- Lineage: `AiDesignGeneration.parentId` (nullable, additive — prisma-migrator) +
  `promptJson.reshape = { sourceGenerationId, method: 'CROP'|'OUTPAINT'|'REF_REGEN',
  sourceBucket, targetBucket }`. P1 stores it in promptJson only (no schema change);
  the column lands with P2.
- Metering: S1 free; S2/S3 = 1 draft cycle (same `generateAiConcepts` path, same
  meters). Admin unmetered as today. Every reshape writes an AuditLog row.

## Surfaces

- **Library tab (drawer)** — cross-shape items show "Reshape for this die-line"
  instead of being hidden/blocked; badge shows the routed method ("crop" / "AI").
- **Templates drawer** — same action on shape-mismatched templates.
- **Full-page generator** — "Reshape from…" picker seeded by a library item.

## Phases

- **P1 (buildable now, no provider keys):** `classifyReshape` + S1 crop + R1
  re-anchoring + the Library/Templates "Reshape" action + try-on-loop handoff +
  promptJson provenance. S2/S3 routes show "AI reshape arrives with the image
  provider" and fall back to offering S1 crop. **SHIPPED 2026-07-01** — classifier +
  `reshapeCropSvg` (golden-tested), `reanchorCanvasJson` + `inferCanvasExtent`
  (golden-tested; wired into every Templates-drawer load, fixing raw cross-size
  distortion), Library-tab Reshape action with S0 direct-use unlock. Still open in
  P1 scope: surfacing NON-matching templates in the Templates drawer (loader
  returns matches only today) and frame-aware re-anchor plumbing (`dielineFrames`
  → TemplatesDrawer; engine already supports frames).
- **P2 (provider keys live):** R3a outpaint + R3b reference regen through
  `resolveImageGenProvider` (fal/Recraft take image+mask and style reference);
  `parentId` column; severity thresholds tuned on real art.
- **P3:** per-face BOX targeting (reuse the glTF surface→face binding work), batch
  reshape (one design → the product's whole die-line SET → coordinated-set preview),
  saliency-based focal crop, reshape-quality scoring.

## Ownership

Cowork: `studio/ai-create/*`, drawer, `template-match.ts` (additive), classifier +
crop. Code: provider legs in `packages/imagegen` (image+mask / style-ref calls) and
the per-face 3D binding (P3) — request via handoff when P2 starts.

## Out of scope

Seam carving / liquid rescale (distorts motifs + type). Reshaping regulated artifacts.
Any consumer-facing surface. Automatic reshape without creator review — every reshape
goes through the try-on loop before commit.
