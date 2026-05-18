# Canvas Engine — Decisions

**Status:** Draft for Pavel approval. Once accepted, the V1 build plan locks against it.

**The four decisions in this doc:**
1. Which canvas library powers the design editor.
2. How the compliance overlay (FDA Nutrition Facts / Supplement Facts) integrates with the canvas.
3. How designs get exported to print-provider-ready files (PDF, CMYK, bleed, ICC profiles).
4. How and when 3D preview gets built.

These are tightly coupled — picking the canvas library affects the export pipeline affects the compliance overlay. Decided together, deliberately.

---

## Requirements (from research + product scope)

The canvas engine has to do all of this:

| Requirement | Source | Hardness |
|---|---|---|
| Place text + images on a 2D canvas with familiar editing UX (Canva-style) | Creator UX moat | Medium — solved by mature canvas libraries |
| Respect die-cut boundary (bleed, safe area, cut outline) | Print requirements | Medium — needs custom overlay |
| Render the FDA Nutrition Facts / Supplement Facts panel as a locked, non-editable region | Compliance moat | Hard — text and layout are regulated |
| Real-time compliance feedback (warnings appear as creator edits) | Compliance moat | Hard — depends on rule pack evaluation |
| Save design state to DB as serialized JSON, restore on reopen | Multi-session editing | Easy — all canvas libs support this |
| Export to print-ready PDF (vector, with bleed marks, CMYK, embedded ICC profile) | Print provider deliverable | **Very hard** — RGB→CMYK + ICC management is non-trivial |
| Support multiple die-cut shapes (rectangle, oval, round, pouch, wrap, etc.) | Multi-format products | Medium — die-cut catalog (V1 schema) |
| 3D preview of the design wrapped on a container | Creator delight | Hard — needs Three.js + 3D models |
| AI-generated content insertion (V1.5+) | Future roadmap | Medium — depends on canvas-state serialization being clean |
| Performance with 100+ design elements + high-res raster assets | Real-world labels | Medium — depends on library |

---

## Decision 1 — Canvas library: **stay on Fabric.js (v5 → v6 when stable)**

### The honest weighing

This was the closest call in the rebuild. Three serious candidates, ranked:

#### A. Fabric.js — RECOMMENDED

- **Maturity:** 12+ years, used by Creative Tim, Designs.ai, many regulated industry tools.
- **Serialization:** Built-in `canvas.toJSON()` / `canvas.loadFromJSON()` — clean for DB persistence.
- **Vector export:** Native SVG export is solid; the foundation of a print pipeline.
- **Object model:** Object-oriented (Group, Path, IText, etc.) — easy to lock individual objects (critical for the compliance panel).
- **React:** Not React-native, but well-wrapped (e.g., the FOD wrapper `FabricCanvas.tsx` at 541 lines is reasonable).
- **Performance:** Adequate for 100+ elements; slows on very heavy scenes.
- **Maintenance:** v5 stable, v6 in beta (active dev resumed). Slower pace than Konva but not abandoned.
- **FOD investment:** ~5,200 lines of Fabric-specific code in FOD, including compliance overlay and die-cut services that are platform-specific work.

#### B. Konva.js + react-konva — Considered, not chosen

- **Performance:** Materially faster than Fabric on heavy scenes (canvas redraw optimizations).
- **React fit:** First-class react-konva wrapper, idiomatic JSX.
- **Maintenance:** Active, modern.
- **Export:** No native SVG export; you'd render to canvas, then either rasterize (loses vector quality for print) or roll your own SVG serializer.
- **FOD compatibility:** None. Switching means rewriting ~5,200 lines.
- **Why not chosen:** The performance win is real but immaterial for label-sized designs (a label has <100 elements, not 1,000). The SVG-export gap is a serious print-pipeline problem. And the FOD investment loss is meaningful — not the 3,625-line monolith (we'd rewrite that anyway), but the 1,800+ lines of compliance/market/die-cut services built on Fabric primitives.

#### C. Polotno (commercial, built on Konva) — Considered, not chosen

- **Speed-to-market:** Ships a working design editor on day 1.
- **CMYK export:** Pro tier supports it.
- **License:** ~$249/month SDK Pro at time of writing.
- **Why not chosen:** The platform's moat requires *deep* customization of the canvas — compliance regions can't be moved, die-cut constraints, partner-specific export pipelines, locked Nutrition Facts panels, jurisdiction-aware text validation. Polotno is designed for generic design editing (Canva-clones). Building those moat features *on top of* Polotno fights the abstraction; building them *in* a raw library you control is cleaner.

#### D. Custom from scratch (SVG-based) — Considered, ruled out

Not at V1. Reinventing well-trodden ground costs months for a marginal gain.

### The decision

**Fabric.js v5 now, upgrade to v6 when stable (~3–6 months).** Two reasons:

1. **The FOD canvas investment is asymmetric.** The 3,625-line `CanvasEngine.tsx` is a monolithic mess and gets rewritten — that work would be lost either way. But the **supporting pieces** (compliance overlay, market-aware template manager, die-cut catalog service) total ~2,660 lines of moat-specific code, built on Fabric primitives. Switching libraries forces rewriting all of that to gain marginal performance and an arguably better React story. Not worth it.

2. **The hard problem isn't the canvas library — it's the print export pipeline.** Both Fabric and Konva produce browser-canvas output that's RGB. CMYK conversion happens server-side regardless of library choice. We should put engineering effort where it differentiates, not where it doesn't.

### What we explicitly do NOT do

- **Don't keep the 3,625-line `CanvasEngine.tsx`.** Rewrite as small composed components (`<Stage>`, `<DieCutFrame>`, `<ComplianceRegion>`, `<EditableLayer>`, `<Toolbar>`). The FOD file is the recipe-builder pathology applied to canvas.
- **Don't keep the v0 Fabric React wrapper as-is.** Port `FabricCanvas.tsx` to a cleaner pattern (typed event handlers, ref forwarding, no leaked Fabric internals to consumers).
- **Don't write Fabric code in app routes.** All Fabric usage lives in `packages/ui/src/canvas/` so the editor can be reused by `apps/creator` and `apps/admin` (template authoring).

---

## Decision 2 — Compliance overlay integration

The Nutrition Facts panel and Supplement Facts panel are **non-negotiable layouts** dictated by 21 CFR 101 and 21 CFR 111. The creator does not get to edit the type sizes, leading, line weights, or field order. They DO get to choose:

- Where on the canvas the panel sits (within die-cut bounds + bleed).
- Whether it's the standard format or the simplified ("Tabular," "Linear") format if allowed.
- Optional ingredient highlighting style (within rule-pack constraints).

### The pattern

**Server-rendered compliance panel as an embedded image, then promoted to vector at export time.**

```
Editor flow:
  1. Creator finalizes recipe → /v1/compliance/check (Python service) returns:
     - violations[] (block publish)
     - warnings[] (advisory)
     - renderedPanel: PNG @ 4x resolution for editor display
     - panelMetadata: { widthMm, heightMm, format: "STANDARD" | "TABULAR" | "LINEAR" }
  2. Canvas places a `ComplianceRegion` Fabric object at the chosen position.
     - The PNG is the texture.
     - The object is `selectable: false, lockMovementX: false, lockMovementY: false`
       (creator can MOVE it but not RESIZE or ROTATE).
     - Real dimensions in mm are preserved in the object's `data` field.
  3. Creator continues editing; if recipe changes, the panel re-renders.

Export flow:
  - On export, the editor sends the design JSON to the export service.
  - The export service requests a VECTOR (SVG) version of the panel from the compliance service
    (WeasyPrint can output SVG directly when given the same HTML/CSS that produces the PNG).
  - The final PDF embeds the SVG panel — full vector quality, no rasterization artifacts.
```

**Why this pattern beats the alternatives:**

- *Render the panel in Fabric directly:* requires reimplementing 21 CFR 101 typography rules in Fabric. The compliance service already owns this — we'd duplicate logic.
- *Always serve only PNG (no vector):* prints poorly at small sizes; small text becomes mushy.
- *Render panel in the editor at export time only:* the creator can't preview accurately.

### What gets ported from FOD

`frontend/src/components/design-studio/ComplianceOverlay.tsx` (716 lines) is the closest existing match. Port forward, but refactor to consume the new compliance service API (`POST /v1/compliance/check` returns the structure above instead of doing in-browser layout). Estimated effort: 2–3 days for the React side, 1 week to add the SVG-output path to the WeasyPrint compliance service.

---

## Decision 3 — Print export pipeline

This is the hardest piece of the canvas system. Print providers need:

- **PDF/X-1a or PDF/X-4** (PDF subset designed for print pre-press).
- **CMYK color space** (not RGB) with an embedded ICC profile matching the print provider's press.
- **Vector text wherever possible** (not rasterized).
- **Bleed marks + trim marks + safe-area indicators** on the final file.
- **Correct PPI** (typically 300 PPI for raster images).
- **Total ink limit** respected (typically 300% for offset, 240% for digital).

### The architecture

Server-side rendering pipeline in a new Python service (or extend `services/compliance/`):

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Export Pipeline                              │
└─────────────────────────────────────────────────────────────────────┘

Editor sends:
  - designJson (Fabric serialized state)
  - productId, brandId, dieCutTemplateId, partnerServiceId (label printing)
  - exportFormat: 'PDF_X1A' | 'PDF_X4' | 'PRINT_PROVIDER_NATIVE'

Pipeline (services/exports/):
  1. Fetch DieCutTemplate (outline SVG, bleed, safe area)
  2. Fetch PartnerService.icc_profile (CMYK profile this provider uses)
  3. Resolve designJson:
     - For each image asset: fetch from R2 at print resolution (300 PPI)
     - For ComplianceRegion: request vector SVG from compliance service
     - For text: ensure fonts are embedded (PDF requires font subsetting)
  4. Render to SVG:
     - Use Python svglib + Pillow OR a Node-side renderer (we have node-canvas + Fabric)
     - Tip: server-side Fabric works via `fabric-pure-browser` or `node-canvas`
  5. Convert SVG → PDF (CairoSVG or Inkscape headless)
  6. CMYK conversion + ICC embedding (Ghostscript with the provider's ICC profile)
  7. Add trim marks, bleed marks, color bars, registration marks (Ghostscript or pikepdf)
  8. PDF/X-1a or PDF/X-4 compliance pass (Ghostscript --PDFX option)
  9. Validate output (verifyPdfx tools — flag if non-conformant)
  10. Store final PDF in R2, return signed URL to creator + dispatch to print provider
```

### Why a separate service (not inside the compliance service)

The compliance service is read-heavy and synchronous (label panel render, rule eval). The export pipeline is write-heavy and asynchronous (a single export can take 10–30 seconds for high-res designs with CMYK conversion). Different scaling profile. Different deployment target.

**Recommendation:** `services/exports/` — Python, FastAPI, queue-backed via Redis (BullMQ-compatible or RQ). V1 implementation can live next to `services/compliance/` if we don't want a separate Fly.io app yet, but the code separation is clean from day 1.

### Tooling stack for the export pipeline

| Need | Tool | Why |
|---|---|---|
| Server-side Fabric rendering | `node-canvas` + Fabric Node bindings | Reuses our Fabric design JSON without translation |
| SVG → PDF | CairoSVG (Python) or Inkscape headless | Both well-tested; CairoSVG is easier to deploy |
| CMYK conversion + ICC embedding | Ghostscript with `-sDEVICE=pdfwrite -sColorConversionStrategy=CMYK -sOutputICCProfile=<profile>.icc` | Industry standard, free, scriptable |
| PDF/X conformance | Ghostscript `--PDFX` flag + `pikepdf` for tweaks | Standard pre-press pipeline |
| Bleed / trim marks | Ghostscript + custom overlay or `pikepdf` | Programmatic |
| PDF/X validation | `verapdf` (open-source) | Catches non-conformant output before sending to print provider |
| ICC profile management | Source from print providers during onboarding; store in R2 | Each provider has different press characteristics |

### Print-provider-specific export profiles

Each `PartnerService` of type `LABEL_PRINTING` declares (during onboarding):

```ts
// PartnerService.capabilities (Json field, validated by Zod per type)
{
  type: "LABEL_PRINTING",
  preferredFormats: ["PDF_X1A", "PDF_X4"],
  iccProfileAssetId: "asset_xyz", // CMYK ICC profile they want
  bleedMm: 3.0,
  trimMarks: true,
  registrationMarks: false,
  totalInkLimit: 300,
  supportedMaterials: ["paper", "vinyl", "polypropylene"],
  // For each die-cut they support (via PartnerServiceDieCut), they can override
  // these defaults per die-cut.
}
```

The export pipeline reads these per-order and tailors output accordingly.

### What gets ported from FOD

The FOD codebase has `frontend/src/lib/services/dieCutTemplateService.ts` (941 lines) which handles die-cut catalog and likely some bleed/safe-area logic — port forward into the new export service. The actual print pipeline doesn't exist in FOD (the codebase ends at PNG export); this is mostly new build.

### V1 vs. V1.5

**V1 must:**
- Export to PDF/X-1a with CMYK conversion using one default ICC profile (US SWOP or Coated GRACoL).
- Bleed + trim marks.
- Vector compliance panel embedding.

**V1.5+:**
- Per-partner ICC profiles (V1 ships a default; V1.5 reads `PartnerService.iccProfileAssetId`).
- Multi-provider quote-comparison export (same design, three providers' formats simultaneously).
- Spot color support (Pantone) — needed for specialty supplements packaging.
- Soft-proofing in the editor (simulate CMYK appearance in RGB-only browser).

---

## Decision 4 — 3D preview: **defer to V1.5, scaffold the path now**

### Recommendation

**Not in V1.** Build using `@react-three/fiber` + `@react-three/drei` when we get there. Library: Three.js.

### Why defer

3D preview is delight, not need. The print pipeline (Decision 3) is non-negotiable. Compliance integration (Decision 2) is non-negotiable. 3D preview is what makes the creator say "wow" — but it doesn't gate any order from shipping.

Building 3D preview well is also non-trivial:
- Need a library of 3D container models (GLB/GLTF) matching each die-cut category.
- Need clean texture mapping from the 2D design onto a curved surface.
- Need realistic lighting + materials.
- Need it to work on a mid-range laptop (creators aren't all on M3 MacBooks).

Realistic cost to ship 3D preview in V1: 4–6 weeks of dedicated work. That's a quarter of the V1 budget.

### What we do in V1

Two cheap things that preserve the path:

1. **Scaffold the 3D preview component slot in the editor UI.** A placeholder card that says "3D preview — coming soon." This stops us from designing the editor layout twice.
2. **Tag each `DieCutTemplate` with the expected 3D model class** (`bottle_round_400ml`, `tub_wide_300g`, etc.) in seed data, even though no GLB files exist yet. When V1.5 adds 3D, we already know the mapping.

### V1.5 plan

`apps/creator/components/design-studio/Preview3D.tsx`:
- `react-three-fiber` Stage with `<Environment>` for lighting
- `useGLTF` loads the model from R2 based on `dieCutTemplate.model3dKey`
- Apply the rendered design (from the export pipeline at lower resolution) as a `MeshStandardMaterial.map`
- For curved surfaces (bottle wraps): use a custom UV-mapped texture
- Orbit controls for rotation

Initial 3D model library: 6–8 hero containers (supplement bottle, beverage can, tub, pouch, sachet, dropper bottle). Models can be commissioned from a contractor for ~$200–500 each on Fiverr/Upwork, or use free assets from Sketchfab as starting points.

---

## What gets ported from FOD (canvas-specific)

| FOD file | LOC | Action | Where it lands |
|---|---|---|---|
| `components/CanvasEngine.tsx` | 3,625 | **Rewrite from scratch.** Decompose into ~15 focused components. | `packages/ui/src/canvas/` |
| `components/canvas/FabricCanvas.tsx` | 541 | Port + refactor (typed events, clean ref forwarding) | `packages/ui/src/canvas/FabricStage.tsx` |
| `components/canvas/CanvasViewport.tsx` | 111 | Port nearly as-is | `packages/ui/src/canvas/Viewport.tsx` |
| `components/canvas/useCanvasViewportApi.ts` | 46 | Port nearly as-is | `packages/ui/src/canvas/hooks/` |
| `components/canvas/CanvasUIOverlay.tsx` | 82 | Port + refactor | `packages/ui/src/canvas/Overlay.tsx` |
| `components/design-studio/ComplianceOverlay.tsx` | 716 | Port + refactor to consume new compliance API | `packages/ui/src/canvas/ComplianceRegion.tsx` |
| `components/design-studio/CanvasEditor.tsx` | 223 | Rewrite — the orchestrator | `apps/creator/.../design-studio/page.tsx` |
| `components/design-studio/MarketAwareTemplateManager.tsx` | 1,003 | Port; simplify for V1 single-market (US-only) | `packages/storefront-kit/src/templates/` |
| `components/design-studio/MarketLoader.tsx` | 508 | Simplify dramatically (V1 = 1 market) | merged into above |
| `components/design-studio/RegulatoryPalette.tsx` | 437 | Port — defines compliance-safe colors per claim type | `packages/ui/src/canvas/RegulatoryPalette.tsx` |
| `components/design-studio/TextToolbar.tsx` | 285 | Port; harden type validation | `packages/ui/src/canvas/TextToolbar.tsx` |
| `components/design-studio/shared/DesignStudioCore.tsx` | 182 | Port | `packages/ui/src/canvas/Core.tsx` |
| `components/design-studio/shared/TemplateManager.tsx` | 109 | Port | `packages/ui/src/canvas/templates/` |
| `components/design-studio/MultilingualFieldManager.tsx` | 438 | **Defer to V1.5+** (V1 = English only) | — |
| `components/design-studio/EnhancedDesignStudio.tsx` | 525 | **Discard.** "Enhanced" → it's a wrapper variant; same pathology as Recipe builder. | — |
| `components/AdminTemplateUploader.tsx` | ? | Port if admin needs to upload templates in V1 (for the design library) | `apps/admin/.../templates/` |
| `components/admin/templates/TemplateBuilder.tsx` | ? | Port — admin authors the curated library items | `apps/admin/.../templates/` |
| `lib/services/dieCutTemplateService.ts` | 941 | Port; split into client (`packages/db` queries) and server (`services/exports`) | both |
| `utils/fabricUtils.ts` | 209 | Port nearly as-is | `packages/ui/src/canvas/utils.ts` |
| `hooks/useCanvasSync.ts` | ? | Port + refactor to use TanStack Query for autosave | `packages/ui/src/canvas/hooks/` |
| `lib/TemplateManager.ts` | ? | Port | `packages/storefront-kit/` |
| `lib/design-studio/renderDesignStudioBarcodeSvg.ts` | ? | Port | `services/exports/app/barcode.py` (move to backend; barcodes aren't editable) |

**Net work breakdown:**
- Rewriting `CanvasEngine.tsx` (the 3,625-line monolith): ~3 weeks
- Porting supporting pieces with refactor: ~3 weeks
- New print export pipeline: ~3 weeks
- Build = ~9 weeks of canvas-specific work in the 12-week V1 budget. Tight, but the rest of V1 is mostly schema port + auth + standard CRUD that should be faster than this.

---

## V1 canvas scope — what ships, what doesn't

**V1 must ship:**
- 2D editor for label designs.
- 6–10 die-cut templates from V1 catalog.
- Compliance overlay (Nutrition Facts + Supplement Facts).
- Real-time compliance feedback (warnings update as creator edits).
- Save + restore design JSON.
- Image upload (creator brand assets).
- Text editing with brand fonts.
- Color palette constrained to brand palette.
- PDF export with CMYK conversion (default ICC profile).
- Bleed + trim marks.

**V1.5+:**
- 3D preview.
- AI-generated content insertion.
- Multilingual labels (V1 = English only).
- Multi-jurisdiction labels (V1 = US only).
- Spot color (Pantone) support.
- Per-print-provider ICC profiles (V1 uses one default).
- Soft-proofing in browser.
- Template marketplace (creators selling templates to creators).

**Never:**
- Free-form drawing (creators draw shapes). Wrong tool for the job — they should upload SVG/PNG assets.
- Video timeline editing on canvas. AI video gen happens elsewhere in V1.5+.

---

## Open questions

1. **Which default ICC profile for V1 CMYK conversion?** Most US digital print providers expect US SWOP V2 or GRACoL 2013. Recommendation: ship US SWOP V2 as default; let print providers override during their service onboarding. Confirm with Simona's print-provider research.

2. **Where does the export pipeline live in V1 — extend `services/compliance/` or new `services/exports/`?** Recommendation: new service, even if deployed in the same container at V1 (to share Python dependencies and Ghostscript install).

3. **Server-side Fabric rendering via `node-canvas` — Node service or Python `wand`/Pillow?** Recommendation: spin up a small Node sidecar for Fabric server-side rendering, output SVG, then pass to Python pipeline for CMYK + Ghostscript. Two-language pipeline is OK if the boundary is clean.

4. **Fabric v5 → v6 migration timing.** Fabric v6 is in beta. We start on v5 (FOD's version) for ecosystem stability; plan a v6 migration as a focused effort in V1.5 once it ships stable. Cost estimate: 1 week.

5. **Storage of design JSON — `Asset` table or new `Design` table?** Designs are mutable, versioned, owned by Brand. Recommendation: new `Design` model with `DesignVersion` (mirrors Template/TemplateVersion). Add to V1 schema port.

6. **Print provider sandbox for V1?** Recommendation: yes — let one or two real print providers test the export pipeline against their press during weeks 9–10 of the roadmap, before closed beta. Catches ICC mismatches before real orders.
