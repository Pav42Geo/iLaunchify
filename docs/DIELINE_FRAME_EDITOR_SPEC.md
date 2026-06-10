# Die-line frame editor — build spec

Status: drafted 2026-06-10 (Pavel discussion). Closes builder placeholder **#36**.

The last builder placeholder. A partner **uploads** a die-line file and **confirms /
adjusts structured boxes on top of it** (no freehand drawing). The result — die
geometry + a layer of **mandatory-element frames** — is saved on the existing
`PackagingDieline` model and consumed downstream by the creator Design Studio as
**soft, movable guides**, with a **hard pre-submit compliance gate** that blocks
production if a mandatory element is missing/hidden/out-of-bounds.

No new app, no partner login into the creator Studio (separate auth + tenant
boundary). We reuse the **canvas engine** (`@ilaunchify/ui`: `Stage`,
`DieCutFrame`, `DieCutLegend`, `dielineSvgFromSpec`) in two modes — partner
"frame authoring" and creator "artwork design".

---

## 1. Locked decisions (from discussion)

1. **Upload-and-confirm only** — partner uploads PDF/AI; confirms boxes on top. No freehand die drawing in V1.
2. **Soft guides downstream** — in the Studio the creator can move the frames and toggle objects while editing.
3. **Hard gate at submit** — soft while designing, but a mandatory element that is missing, hidden, or outside the safe area **blocks** going to production (not a dismissible warning). Override policy is a counsel call, deferred.
4. **Recipe-derived elements stay platform-generated** — Nutrition Facts, ingredient list, "Contains:" allergen line are always platform structured objects (they go stale on recipe change). Imported designer art is a background layer behind them. (Full `IMPORTED_HYBRID` / `IMPORTED_FLAT` label-source modes = Phase D, forward note.)

---

## 2. Data model

### 2.1 Additive `frames` JSON on `PackagingDieline`

One additive, nullable column — no migration risk. Frames are normalized to the
**surface trim box** (0..1) so they're resolution-independent and reused verbatim
by both canvases.

```prisma
model PackagingDieline {
  // ...existing fields (trimBox, safeAreaBox, foldLines, surfaces, partnerFileId,
  // originalFileFormat, status, adminVerifiedAt, normalizedSvgKey, ...)
  frames            Json?     // FrameLayout — mandatory-element zones (see below)
  framesUpdatedAt   DateTime?
}
```

```ts
// PackagingDieline.frames
interface FrameLayout {
  version: 1
  frames: Frame[]
}
interface Frame {
  id: string                       // stable id (cuid)
  element: MandatoryElement
  surfaceId?: string               // PackagingDieline.surfaces[].name; default = primary display panel
  box: NormBox                     // normalized to the surface trim box
  rotationDeg?: number
  required: boolean                // drives the submit gate
  source: 'PLATFORM' | 'PARTNER'   // platform-seeded default vs partner-moved
  notes?: string
}
type MandatoryElement =
  | 'STATEMENT_OF_IDENTITY'
  | 'NUTRITION_FACTS'              // recipe-derived
  | 'INGREDIENTS'                  // recipe-derived
  | 'ALLERGENS'                    // recipe-derived
  | 'NET_QUANTITY'
  | 'MANUFACTURER'
  | 'CERTIFICATIONS'               // conditional (present only if product carries certs)
  | 'BARCODE'                      // conditional (present only when GTIN/SKU барcode mode set)
interface NormBox { x: number; y: number; w: number; h: number } // each 0..1
```

`recipeDerived = NUTRITION_FACTS | INGREDIENTS | ALLERGENS` — these are the
auto-validated, platform-owned objects.

### 2.2 How a product resolves its die-line

No new linkage. A product's chosen packaging carries it:
`ProductTemplatePackaging → PartnerPackagingOffering.dielineId → PackagingDieline`.
Per-product surface swaps already exist on `ProductTemplatePackaging.surfaceOverrides`.
The Studio resolves: product → selected offering → `dielineId` → `frames` +
`trimBox`/`safeAreaBox`/`surfaces`.

### 2.3 Forward note (Phase D) — label-source mode

Additive `labelSource` enum on the product/variant: `STUDIO_BUILT` |
`IMPORTED_HYBRID` | `IMPORTED_FLAT`. Drives whether the gate is fully automated
(hybrid: auto-check the platform Facts/allergen objects) or routes to human
compliance review (flat). Out of scope for A–C; the gate below assumes
`STUDIO_BUILT` + hybrid.

---

## 3. Phase A — Partner upload + confirm route

**Home:** the partner **Packaging** area, NOT per-product — a die-line is
`partnerService + packagingType + decorationMethod` scoped and reused across
products. Surface as `/(dashboard)/packaging/dielines/[dielineId]` (manage), with
a "+ New die-line" entry from the packaging offerings flow. The product builder's
Packaging step just **selects** an existing confirmed die-line (already wired via
`PackagingPicker`); it does not re-author frames.

**Upload → confirm flow:**

1. **Upload** the die-line file → store via `@ilaunchify/storage` (R2) → create a
   `PartnerFile` (add `PartnerFileKind.DIELINE`) → set
   `PackagingDieline.partnerFileId` + `originalFileFormat` (`PDF` | `AI`) + status
   `UPLOADED`.
2. **Backdrop render** on the shared `Stage` canvas:
   - `PDF` → render page 1 to a raster via **pdf.js** (`pdfjs-dist`), shown as a
     locked background image.
   - `AI` → treat as PDF-compatible; if pdf.js can't open it, fall back to a
     "preview unavailable — align boxes to dimensions" mode using `widthMm/heightMm`.
   - (Full vector normalization → `normalizedSvgKey` / `parseAccuracyScore` is a
     later admin-assisted pass; not V1.)
3. **Confirm boxes** by dragging/resizing typed rectangles over the backdrop:
   `trimBox`, `safeAreaBox`, `foldLines[]`, `surfaces[]` → persist to the existing
   `PackagingDieline` fields. Reuse `DieCutFrame` for the box chrome.
4. **Place frames** — a palette of mandatory elements (seeded from a sensible
   default layout); partner drags each into position per surface → write
   `frames` (`source:'PARTNER'` once moved). Recipe-derived + SoI + net qty +
   manufacturer default `required:true`; certs/barcode `required` only when the
   product carries them (resolved downstream).
5. **Confirm** → status `PARTNER_CONFIRMED`. Admin verify (existing lifecycle) →
   `ADMIN_VERIFIED` → `ACTIVE` (selectable in offerings).

**Server actions** (`packaging/dielines/actions.ts`, partner-owned, audited):
`createDielineUpload`, `saveDielineGeometry` (boxes), `saveDielineFrames`,
`confirmDieline`. All gate on partnerService ownership; every mutation writes an
`AuditLog` row; autosave like the rest of the builder.

---

## 4. Phase B — Studio guide-loading

On Studio open, resolve the product's die-line (§2.2) and:

1. Render `trimBox` / `safeAreaBox` / `foldLines` as non-interactive **guide
   overlays** (reuse `clearSpace.ts` conventions).
2. Render each `frame` as a **soft, movable guide** (creator can drag/resize).
3. Pre-render the **platform mandatory objects** into their frames as typed,
   role-tagged Studio objects (reuse `useCanvasRoles.ts` + `NutritionFactsToolbar`):
   Nutrition Facts (from `@ilaunchify/nutrition`), ingredient list, "Contains:"
   line, SoI, net quantity, manufacturer block. These are **toggleable** while
   editing.
4. Imported designer artwork (Phase D hybrid) sits as a **background layer**
   behind the frames; recipe-derived objects always stay platform-owned on top.

No frame is hard-locked — per decision #2.

---

## 5. Phase C — Submit / compliance gate

> **Engine built (2026-06-10):** `checkFrameCompliance(layout, placed, ctx)` in
> `@ilaunchify/ui` (`canvas/frame-compliance`) — pure, DB-free, node-verified
> across present/missing/out-of-bounds/stale. Returns a `ComplianceReport`
> (`status` + per-frame `checks` with `MISSING | OUT_OF_BOUNDS | STALE`). It runs
> identically in the creator `CompliancePanel` and in the server submit check.
> Remaining: collect `placed` (role + visibility + normalized bounds + recipeHash)
> from the canvas and wire the report into the gate UI + server submit.

Extend the existing **`CompliancePanel` + "ready to submit" checker**. At
submit/preflight, for the resolved die-line:

For every `frame` where `required === true` (after resolving conditional
certs/barcode against the product):

- **Present & visible** — a corresponding Studio object exists and is not hidden/deleted. ❌ if missing.
- **In bounds** — the object's bounds sit inside the surface `safeAreaBox`. ❌ if it bleeds outside.
- **Recipe-fresh** (recipe-derived only) — the object matches the current recipe
  snapshot (compare engine output / a `recipeHash`); a stale Facts/allergen object
  must be refreshed. ❌ if stale.

Result: **block submit** when any check fails, listing each failure with a jump-to
action. Per decision #3 these are hard blocks, not dismissible. (A counsel-approved
override path can be added later behind a flag.)

**Staleness trigger:** when the recipe changes after a design exists, mark the
recipe-derived objects stale so the gate forces a refresh before re-submit
(mirrors the partner approval-map re-review pattern).

---

## 6. Reuse map (don't rebuild)

- **Canvas engine** — `@ilaunchify/ui`: `Stage`, `DieCutFrame`, `DieCutLegend`, `dielineSvgFromSpec`.
- **Storage** — `@ilaunchify/storage` (`uploadFile`, `getSignedReadUrl`, key helpers) + `PartnerFile`.
- **Studio infra** — `clearSpace.ts`, `useCanvasRoles.ts`, `NutritionFactsToolbar`, `CompliancePanel`, the ready-to-submit checker.
- **Label math** — `@ilaunchify/nutrition` (`calculateLabel` → `toPanelData` → `NutritionFactsRenderer`).
- **Packaging linkage** — `PackagingDieline`, `PartnerPackagingOffering.dielineId`, `ProductTemplatePackaging.surfaceOverrides`, the builder `PackagingPicker`.

## 7. Phasing — status 2026-06-10

- **A — Partner upload + confirm** ✅ **shipped** — schema `frames` + `PartnerFileKind.DIELINE`, actions, the **partner Die-line Studio** (chrome + canvas + drawers + autosave + preflight-gated Confirm), admin review surface.
- **B — Studio guide-loading** 🟡 **engines + data ready; in-canvas render = Code** — `resolveLayout`/`resolveMaterialMarks` + `frameKindFromCanvasRole` + the `dieline-frames` loader are built; rendering guides + pre-rendering platform objects inside the live creator canvas is Code's single-writer work (handoff: `docs/HANDOFF-TO-CODE-dieline-phase-b.md`).
- **C — Submit gate** ✅ **gate shipped (presence)** — `checkFrameCompliance` engine + a server-side gate running off the **saved design** (`apps/creator/src/lib/dieline-compliance.ts`) + a read-only surface (`/products/[id]/label-check`). Presence-checking now; safe-area + recipe-freshness activate once Code stamps objects/bounds in B.
- **D — label-source modes** 🟡 **schema substrate landed** — `LabelSource` enum + `Design.labelSource` added (`STUDIO_BUILT`/`IMPORTED_HYBRID`/`IMPORTED_FLAT`). IMPORTED human-review routing + admin die-line normalization (`normalizedSvgKey`, `parseAccuracyScore`) remain forward.

## 7b. Partner Design Studio shell (Pavel 2026-06-10)

The partner die-line editor is a **Studio**, styled to match the creator Design
Studio chrome — same regions, partner-only tools. **Parallel shell, not a fork**:
the creator `CanvasLayoutShell` is ~1,800 lines tightly coupled to creator data
(and is Code's active surface), so the partner Studio is its own shell in the
partner app that *reuses the shared canvas primitives* (`@ilaunchify/ui`: `Stage`,
`DieCutFrame`, `DieCutLegend`, `dielineSvgFromSpec`, the new `frames` core) and
mirrors the layout — it does not import the creator shell.

**Mirror these 5 regions (from the creator shell):**

1. **Top bar (~73px)** — iLaunchify mark · **Saved** status · undo/redo · **Confirm die-line** (replaces the creator's COMPLIANCE/MOCKUP) · **Exit** (back to Packaging).
2. **Left tool rail (80px)** — partner-only icons (see keep/drop below).
3. **Slide-out drawer (400px)** — opens per selected tool.
4. **Center canvas** — Fabric stage with the uploaded die-line as backdrop + box/frame overlays.
5. **Bottom floating toolbar** — zoom / fit / pan (no rotate-object needed).

**Tool rail — keep only what the partner needs:**

| Creator tool | Partner Studio |
|---|---|
| Product (die-cut guides) | ✅ **Die-line** — upload/replace file, dimensions, bleed |
| — | ✅ **Surfaces** — define panels (front/back/neck) |
| — | ✅ **Guides** — trim / safe-area / fold boxes |
| Label | ✅ **Frames** — place mandatory + material/cert/phrase/barcode slots (the `frames` core) |
| Layers | ✅ **Layers** |
| Text, Images, Graphics, Clipart, Background, Pattern, QR Code, Barcode | ❌ creator artwork tools — dropped |

So the partner rail is **Die-line · Surfaces · Guides · Frames · Layers** — the
structural authoring set. The creative/artwork drawers are creator-only.

**Frames drawer** uses the scoped-slot model: a palette of frame kinds grouped by
scope (Recipe / Material / Product / Identity), each draggable onto a surface,
with an `appliesTo` editor (materials/markets/requires-certs) for conditional
slots. `DEFAULT_FRAME_LAYOUT` seeds a sensible starting arrangement.

**Build order:** shell + rail + top bar + canvas mount (backdrop) → Die-line/
Surfaces/Guides drawers (box editing) → Frames drawer (palette + appliesTo) →
Confirm + status. Reuses the partner upload/confirm actions from §3.

## 8. Open questions / forward markers

1. **PDF/AI fidelity** — pdf.js covers PDF + most PDF-compatible AI; native AI is best-effort backdrop only in V1. Acceptable?
2. **Default frame layout** — seed a per-`packagingType` default frame template so partners start from a sensible arrangement rather than a blank palette? (Cheap, big UX win.)
3. **Admin die-line verify UI** — the lifecycle has `ADMIN_VERIFIED`; do we build a thin admin review surface in this pass or defer to Phase D?
4. **`recipeHash`** — add a small hash/snapshot on the design or label object to make the recipe-fresh check cheap, vs. recomputing the engine at submit.
