# Handoff → Code: Die-line Phase B (creator Studio wiring)

**Owner:** Code (single-writer of the creator Design Studio, `apps/creator/src/app/(studio)/products/[productId]/design/canvas/*` — ~1,800-line hot surface).
**Why this handoff:** all the engines are built, verified, and importable. Phase B is pure *wiring* inside the creator Studio, which Cowork won't touch to avoid clobbering your in-flight work.

Spec context: `docs/DIELINE_FRAME_EDITOR_SPEC.md` (§4 guide-loading, §5 submit gate, §12b overlays). The partner Studio that *produces* the frames already ships (`apps/partner/.../(studio)/dielines/[dielineId]`).

---

## What's already built (import, don't rebuild)

All from `@ilaunchify/ui` (pure, DB-free, node-verified):

```ts
import {
  // model
  type FrameLayout, type Frame, type FrameKind, type FrameScope, type NormBox,
  FRAME_SCOPE, DEFAULT_FRAME_LAYOUT, MANDATORY_KINDS,
  // resolution
  resolveLayout, requiredFrames, frameApplies, type FrameContext, type ResolvedFrame,
  resolveMaterialMarks, type MaterialSymbol, MATERIAL_FRAME_FAMILIES,
  // template preflight (partner side; reuse if useful)
  validateFrameLayout, type LayoutIssue,
  // submit gate
  checkFrameCompliance, type PlacedObject, type ComplianceContext,
  type ComplianceReport, type FrameCheck, PRIMARY_SURFACE, stableHash,
} from '@ilaunchify/ui'
```

From `@ilaunchify/nutrition`: `recipeFingerprint(ingredients)` → stable string; hash it with `stableHash(...)` for the recipe-fresh check.

`PackagingDieline.frames` (new `Json` column, `FrameLayout` shape) + `framesUpdatedAt` are in the schema. The product resolves its die-line via `ProductTemplatePackaging → PartnerPackagingOffering.dielineId → PackagingDieline`.

---

## Step 1 — Server loader (new file, NOT in the canvas hot dir)

Suggested: `apps/creator/src/app/(studio)/products/[productId]/design/canvas/dieline-frames-data.ts` (or `apps/creator/src/lib/dieline-frames.ts`). Resolve, for the open product:

1. **Die-line + frames** — product → its selected packaging offering → `dielineId` → `PackagingDieline { frames, trimBox, safeAreaBox, surfaces, status }`. If none `ACTIVE`/`PARTNER_CONFIRMED`, return `{ dieline: null }` (Studio renders without guides — don't hard-fail).
2. **FrameContext** — build:
   - `materialSlug` / `substrateSlug` — from the product's chosen substrate (configurator `ProductOptionValue` with `key=SUBSTRATE`, or the offering's material). Null is fine.
   - `marketCode` — `'US'` (V1).
   - `hasCerts` — `ProductCertificate` count > 0 for the product/template.
   - `hasBarcode` — `product.barcodeMode !== 'NONE'` or `gtin` present.
3. **Material symbols** — `prisma.packagingSymbol.findMany({ where: { status: 'ACTIVE' }, select: { id, slug, name, family, applicableSubstrates, applicableMaterials, applicableMarkets, requirement, variants: {...svg/png + size rules} } })` → pass as `MaterialSymbol[]`.
4. **recipeHash** — `stableHash(recipeFingerprint(baseRecipeRows))` from the template ingredient slots (same row build as the configurator's `configure-data.ts`). Stamp it on every recipe-derived object you place.
5. **safeAreaBySurface** — `{ [PRIMARY_SURFACE]: <safeAreaBox as NormBox> }` (extend per-surface when multi-surface lands).

Return: `{ dieline, layout: FrameLayout, ctx: FrameContext, materialSymbols, recipeHash, safeAreaBySurface }`.

---

## Step 2 — Render guides (canvas)

`const resolved = resolveLayout(layout, ctx)` → render each `ResolvedFrame.frame.box` (normalized to the surface trim box) as a **soft, movable** guide overlay (reuse `DieCutFrame` / your `clearSpace` conventions). Color by `FRAME_SCOPE[kind]` (Recipe/Material/Product/Identity/Creative). Conditional frames already filtered out by `resolveLayout` (e.g. barcode only when `hasBarcode`).

Per decision (Pavel): guides are **movable and toggleable** while editing — do not hard-lock.

---

## Step 3 — Pre-render platform objects into frames

For each resolved frame, drop the platform-owned object into its box as a typed, role-tagged Studio object (reuse `useCanvasRoles` + `NutritionFactsToolbar`):

- `NUTRITION_FACTS` → engine panel (`calculateLabel → toPanelData → NutritionFactsRenderer`), **stamp `recipeHash`**.
- `INGREDIENTS` / `ALLERGENS` → engine-derived text, **stamp `recipeHash`**.
- `STATEMENT_OF_IDENTITY` / `NET_QUANTITY` / `MANUFACTURER` → product/identity text.
- `MATERIAL` frames (`RECYCLING_MARK` etc.) → `resolveMaterialMarks(materialSymbols, MATERIAL_FRAME_FAMILIES[kind] ?? [], ctx)` → render the chosen `PackagingSymbolVariant` svg/png (respect its `minWidthMm`/`clearSpaceFactor`).
- `CERTIFICATIONS` → existing cert-badge flow (`useCertBadgeSizeRules`).
- `PHRASES` / `LABELING_SYMBOL` → phrase engine + `LabelingSymbol`.

The designer artwork (`IMPORTED_HYBRID`, Phase D) sits as a background layer behind these; recipe-derived objects always stay platform-owned.

---

## Step 4 — Collect placed objects → `PlacedObject[]`

Adapter over your canvas objects (you own the Fabric object model):

```ts
function toPlacedObjects(canvasObjects): PlacedObject[] {
  return canvasObjects
    .filter(hasFrameRole)
    .map(o => ({
      kind: roleToFrameKind(o),          // from useCanvasRoles
      visible: o.visible !== false,
      box: normalizedBounds(o),          // 0..1 of the surface trim box
      surfaceId: o.surfaceId,            // or omit → PRIMARY_SURFACE
      recipeHash: o.recipeHash ?? null,  // stamped in Step 3
    }))
}
```

---

## Step 5 — Submit gate in `CompliancePanel`

```ts
const report = checkFrameCompliance(layout, toPlacedObjects(objects), {
  ...ctx, currentRecipeHash: recipeHash, safeAreaBySurface,
})
```

Render `report.checks` in the panel (each has `MISSING | OUT_OF_BOUNDS | STALE` issues with messages). **Block submit when `report.status === 'fail'`** (hard gate per Pavel — soft while editing, hard at submit). Wire the same check into the server submit action so it can't be bypassed client-side.

**Staleness:** when the recipe changes after a design exists, the stamped `recipeHash` no longer matches `currentRecipeHash` → the gate returns `STALE` for that object → creator must refresh it (re-drop the engine object). Mirrors the partner approval-map re-review pattern.

---

## Acceptance

- A product whose die-line is missing a required object → submit blocked, `CompliancePanel` lists exactly which.
- Moving a required object outside the safe area → `OUT_OF_BOUNDS`, blocked.
- Editing the recipe after placing the Facts panel → `STALE`, blocked until refreshed.
- Glass vs plastic of the same die-line → the `RECYCLING_MARK` frame renders the correct material symbol (driven by `ctx.materialSlug`), no die-line change.
- Guides are movable + toggleable while editing; nothing is hard-locked.

Engines are unit/node-verified; this is wiring + the canvas adapter only. Ping for any shape questions on the resolution helpers.
