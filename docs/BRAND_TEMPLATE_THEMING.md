# Brand template theming — recolor with a palette (Phase 3)

Status: **PROPOSED** (Pavel asked to spec the recolor transform before building, 2026-06-23)
Builds on: Brand Kit V2 Slice 5 (`BrandPalette`/`BrandSwatch`) + palette generator (Phase 1/2).
Reference: BRAND_PALETTE_GENERATOR.md §11.

---

## 1. Goal

Two Agency-tier capabilities, tied together:
1. **Recolor any template/design with a palette** the creator generated or picked — one click re-themes the whole layout.
2. A **premium designer-template library** (admin-curated) that Agencies can drop in and recolor.

Reuses everything already built: the Fabric.js canvas, `BrandTemplate` (`canvasJson`), and Slice 5 palettes. Recoloring is a pure transform over the canvas JSON — no canvas-engine changes.

## 2. Data — what we transform

`BrandTemplate.canvasJson` (and a live design) is Fabric `canvas.toJSON()`:

```jsonc
{ "version": "...", "background": "#fff", "objects": [
  { "type": "rect", "fill": "#A44200", "stroke": "#000", ... },
  { "type": "i-text", "fill": "#3C1518", ... },
  { "type": "group", "objects": [ ... ] },           // recurse
  { "type": "image", "src": "data:...", "customType": "qr-code" }  // SKIP (bitmap)
] }
```

Recolor = walk `objects[]` (recursing groups), collect distinct `fill` / `stroke` colors, replace per a map. **Skip:**
- `type: "image"` (logos, photos, QR/barcode bitmaps — can't be recolored as vectors).
- Transparent / `null` fills.
- Objects tagged as **regulated label sections** (`customType` in the label-section set) — never recolor a Nutrition/Supplement/Drug Facts panel or other compliance art.

## 3. Recolor engine (`@ilaunchify/ui` — pure, tested, no deps)

```ts
// Distinct normalized hex colors used by recolorable vector objects.
collectCanvasColors(canvasJson: string): { hex: string; count: number }[]

// Replace colors per an exact old→new hex map; returns new canvasJson.
recolorCanvasJson(canvasJson: string, map: Record<string, string>): string

// Suggest a mapping from a template's colors onto a palette, ordered by
// lightness (dark template colors → dark palette swatches). Creator can override.
autoMapColors(colors: string[], palette: string[]): Record<string, string>
```

- Pure string→string; deterministic; golden-testable on fixture JSON.
- `collectCanvasColors` powers the "these colors will change" preview (with swatches + counts).
- Honest limit: find-and-replace over vector fills only. It will **not** recolor embedded raster images or intelligently rebalance contrast. Raster-heavy templates get flagged "limited recolor."

## 4. Two mapping strategies

- **Dominant-color remap (V1, universal).** Use `collectCanvasColors` → `autoMapColors` onto the chosen palette, creator overrides per color, then `recolorCanvasJson`. Works on **any** template/design — including the creator's own saved ones — with no special authoring.
- **Role-tagged premium templates (exact).** Admin authors a premium template and tags each source color with a role (`primary`/`secondary`/`accent`/`neutral`) in `BrandTemplate.colorRoles`. "Apply palette" then maps role→palette slot exactly, one click. Polished path for the Agency library.

## 5. Schema (additive)

```prisma
model BrandTemplate {
  // … existing …
  isPremium  Boolean @default(false)  // admin-curated library template
  tier       String?                  // optional min tier to use (e.g. 'agency')
  colorRoles Json?                    // { "#A44200": "primary", "#3C1518": "neutral", ... }
}
```

Premium templates are `brandId`-null OR owned by a system brand? → Decision §9. Simplest: a nullable `brandId` is migration-hostile; instead add `isGlobal Boolean` + keep `brandId` pointing at a system "iLaunchify Templates" brand, OR a separate `PremiumTemplate` model. Recommend: **reuse BrandTemplate with `isPremium` + a system brand** to avoid a new model. Finalize in §9.

## 6. UI flow

On a template card or the live design: **"Recolor with palette"** →
1. Pick a saved `BrandPalette` (or open the generator).
2. Preview: each detected color (`collectCanvasColors`) shown as a row `oldSwatch → [palette swatch dropdown]`, auto-mapped, override per row. Skipped images/regulated sections noted.
3. **Apply** → for a live design, load `recolorCanvasJson` onto the canvas (one history step, undoable). For a template, save a recolored copy.

Premium library (Agency): a browsable gallery of `isPremium` templates → "Use" loads it onto the canvas → recolor as above.

## 7. Tiering

- **Recolor with palette** + **premium template library** = **Agency** (matches the Slice-5 / generator gating stance; Builder keeps the generator + manual templates).
- Recolor is gated even on the creator's own templates? → Decision §9 (lean: recolor = Agency; everyone can still hand-edit colors).

## 8. Build phases

- **3a — recolor engine** (`@ilaunchify/ui`) + golden tests. Decision-free; build now.
- **3b — "Recolor with palette" UI** on the live design + own templates (Agency-gated), using a saved palette; load result onto canvas as one undoable step.
- **3c — premium template library**: schema (`isPremium`/`tier`/`colorRoles`), admin CRUD to curate + tag, creator browse gallery, role-exact apply.

## 9. Open decisions for Pavel

1. **Recolor gating** — Agency only (recommended), or available to all on their *own* designs with the premium *library* being the Agency perk?
2. **Premium templates storage** — reuse `BrandTemplate` + `isPremium` + a system brand (recommended, no new model), or a dedicated `PremiumTemplate` model?
3. **Apply target** — recolor the *live design* in place (undoable), save a *new* template, or both?
4. **Role tagging** — ship dominant-color remap only for V1 and add role-tagging later (recommended), or do role tags from the start for premium templates?
