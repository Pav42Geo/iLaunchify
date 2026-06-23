# Brand Palette Generator — design spec

Status: **PROPOSED** (Pavel asked to spec before building, 2026-06-23)
Builds on: Brand Kit V2 Slice 5 (color V2 — `BrandPalette` / `BrandSwatch`, shipped
commit `060bd46`). Reference: Coolors.co generator.

---

## 1. Goal

Let creators **generate** their own brand palettes (2–6 colors) instead of only
hand-entering hex values — Coolors-style: pick a base, choose a harmony method,
roll, lock the colors they like, re-roll the rest, then save it as a brand palette.
Different harmony methods are a subscription upgrade lever.

## 2. Key principle — additive, no schema change

The generator is **pure UI + a pure math module** on top of the existing Slice 5
model. A generated palette is just a `BrandPalette` with `BrandSwatch` rows. Nothing
new in the database. CMYK is auto-computed and stored in the existing `cmykC/M/Y/K`
columns; color names go in the existing `name` column. Gradients reuse the existing
`gradient` JSON.

No licensed IP ships: harmonies are math, CMYK is a public formula, color names come
from an open-licensed dataset, and Pantone stays a manual reference code (unchanged).

---

## 3. Color engine (`@ilaunchify/ui` — pure, unit-tested, zero deps)

A new pure module `packages/ui/src/color/` — no React, no Fabric, fully testable.

```ts
// conversions (all pure)
hexToRgb(hex): {r,g,b}
rgbToHex({r,g,b}): hex
rgbToHsl / hslToRgb
rgbToCmyk({r,g,b}): {c,m,y,k}        // naive formula — REFERENCE only (see §7)
relativeLuminance / contrastRatio    // for the optional a11y check

// harmony generation
type HarmonyMethod =
  | 'AUTO' | 'MONOCHROMATIC' | 'ANALOGOUS' | 'COMPLEMENTARY'
  | 'SPLIT_COMPLEMENTARY' | 'TRIADIC' | 'TETRADIC' | 'SQUARE'

generatePalette(opts: {
  method: HarmonyMethod
  count: number            // 2–6
  base?: string            // optional seed hex; else random
  locked?: (string|null)[] // per-slot lock; null = regenerate this slot
  seed?: number            // deterministic for tests
}): string[]               // array of hex, length = count

// naming (Phase 2)
nearestColorName(hex): string   // min ΔE (Lab) over the bundled name list
```

**Harmony math (hue offsets in HSL, then spread lightness/saturation across `count`):**

| Method | Hue offsets from base | Notes |
|---|---|---|
| Monochromatic | 0 | vary lightness/saturation only |
| Analogous | −30, 0, +30 (… ±60) | adjacent hues |
| Complementary | 0, 180 | opposite |
| Split-complementary | 0, 150, 210 | |
| Triadic | 0, 120, 240 | |
| Tetradic | 0, 90, 180, 270 (rectangle 0,60,180,240) | |
| Square | 0, 90, 180, 270 | |
| Auto | weighted random hue/sat/light | the free default |

For `count` ≠ the method's natural size, interpolate extra slots by stepping
lightness within the nearest hue. Lock-aware: locked slots are kept verbatim;
only `null` slots regenerate.

**Tests:** golden tests per method (fixed `seed` + `base` → expected hex array),
plus invariants (length === count, all valid hex, locked slots preserved).

---

## 4. Tier gating (recommended)

Gate the *methods*, not the feature — Auto stays free so it's discoverable.
Reuses the existing `advancedBrandFeatures(tier)` / Builder+ gate.

| Capability | Maker | Builder | Agency |
|---|---|---|---|
| Auto / random generate + Save as palette | ✓ | ✓ | ✓ |
| Manual hex entry (existing) | ✓ | ✓ | ✓ |
| 7 harmony methods (Mono…Square) | — | ✓ | ✓ |
| Lock-and-regenerate | — | ✓ | ✓ |
| Auto color names | — | ✓ | ✓ |
| Auto CMYK on generated swatches | ✓ | ✓ | ✓ |
| Gradient swatches in palettes | — | — | ✓ |
| Extract palette from logo/image | — | — | ✓ |
| Palette count cap | 3 | 12 | unlimited |

Locked methods render with a "PRO" badge + upgrade nudge (mirrors Coolors). The
**server action enforces** the gate (never trust the client) — `generatePalette`
with a gated method by a Maker → rejected.

> Alternative Pavel floated: all methods free for everyone (drop the PRO gating on
> methods, keep gradients/extract gated to Agency). Cleaner/generous; loses one
> upgrade lever. Open decision — see §10.

---

## 5. Color names

The "~ Rich Mahogany" labels need a dataset. Recommendation:
- **meodai/color-names** (~30k names, MIT) — or a curated ~1–2k subset to keep the
  client bundle small. Nearest name by ΔE in Lab space.
- Bundle as a static JSON in `@ilaunchify/ui`; name lookup is client-side, no API.
- **Phase 2** — ship the generator first without names; add naming as a fast follow.

CMYK and color names are the only "extra" data; both are open/computed. **Pantone
stays manual reference-code only** (no change — licensed library never ships).

---

## 6. UX flow

A **"Generate"** button in the existing Palettes section (both the dashboard
`/brands/[id]/assets` and the in-Studio Brand → Edit kit tab — they share the same
component). Opens a generator panel:

1. A row of `count` color columns (default 5), each showing hex + name + a **lock**
   toggle (lock = keep on re-roll).
2. **Method** picker (tier-gated, PRO badges on locked methods) + **count** stepper (2–6).
3. **Generate** button (and spacebar) → rolls unlocked slots via the engine.
4. Optional: per-column quick-edit (HSL nudge) + a small contrast/readability hint.
5. **"Save as palette"** → names the palette, writes a `BrandPalette` + `BrandSwatch`
   rows (hex + auto CMYK + auto name). It then appears in the normal palette list and
   its solids fold into the Studio pickers (existing Slice 5 behavior).

No live full-screen takeover like Coolors; an inline panel/modal scoped to the kit.

## 7. CMYK honesty

Auto CMYK uses the naive `k = 1−max(r,g,b); c=(1−r−k)/(1−k)…` formula — **a screen-RGB
reference, not a color-managed/ICC print value**. Label it "CMYK (reference)" in the
UI; the printer's RIP + the chosen substrate are authoritative. Same honesty stance
as Pantone-as-reference. (Matches the locked "operational trust > false precision"
philosophy.)

## 8. Persistence mapping

| Generated | → | Stored |
|---|---|---|
| hex | → | `BrandSwatch.hex`, `kind='SOLID'` |
| auto CMYK | → | `BrandSwatch.cmykC/M/Y/K` |
| nearest name | → | `BrandSwatch.name` |
| palette name + order | → | `BrandPalette.name` + `sortIndex` |

New server action `generateAndSaveBrandPalette(brandId, {method,count,colors,name})`
— owner-guarded, tier-gated, reuses `createBrandPalette` + `addBrandSwatch`. The
engine can also run purely client-side for the live "roll" preview; only **Save**
hits the server.

---

## 9. Build phases

- **Phase 1** — color engine (`packages/ui/src/color/`) + golden tests; generator
  panel in Palettes section; `generateAndSaveBrandPalette` action (tier-gated, owner-
  guarded); auto CMYK; **bundled color-name dataset + `nearestColorName`** (names in V1).
  Auto = free; the 7 harmony methods gated to Builder+.
- **Phase 2 (Agency) — extract palette from an image.** Quantize an uploaded image
  (k-means / median-cut over decoded pixels) to N dominant colors. **"Use my logo"** is
  a first-class shortcut that drops near-white/transparent background pixels. Source =
  an image (logo or photo), NOT the finished canvas design (that would be circular).
- **Phase 3 (Agency) — template theming** (see §11): premium designer templates +
  recolor any template/design with a generated/picked palette.

## 10. Decisions (locked 2026-06-23)

1. **Method gating — gate the 7 harmony methods to Builder+.** ✓ Auto stays free.
2. **Color names — bundle the dataset in Phase 1** (ship with names). ✓
3. **Palette count caps — 3 / 12 / ∞** (Maker / Builder / Agency). ✓ Confirmed.
4. **Extract source — an image (logo or uploaded photo), not the design.** ✓ Logo is a
   first-class "use my logo" shortcut.

## 11. Agency: premium templates + palette theming

Make design templates a real Agency upgrade: a **premium designer-template library**
(admin-curated) plus the ability to **recolor any template (or the current design) with
a palette** the creator generated or picked. Reuses the existing Fabric.js canvas JSON,
`BrandTemplate`, and Slice 5 palettes — recoloring is a pure transform over the canvas
objects (swap `fill` / `stroke`).

**Two mapping strategies (ship both):**

- **Dominant-color remap (V1, universal).** Detect a template's distinct fill/stroke
  colors, auto-map them to the palette by role/lightness order (creator can override per
  color), then replace across all objects. Works on **any** template — including
  user-saved ones — with no special authoring.
- **Role-tagged premium templates (exact).** When admin authors a premium template, tag
  each color slot (`primary` / `secondary` / `accent` / `neutral`). "Apply palette" is
  then one-click and exact. This is the polished path for the Agency-only library.

**Tiering:** premium template library + palette recolor = **Agency**. (Builder keeps the
generator + manual templates; Maker keeps Auto + manual hex.) Schema impact is small and
additive — likely a `BrandTemplate.tier`/`isPremium` flag + an optional `colorRoles` JSON
on premium templates for role tagging. Spec separately before building (Phase 3).

**Honest note:** color remap is a deterministic find-and-replace over vector fills; it
won't intelligently re-balance contrast or recolor embedded raster images. Good for
vector/label art (our case); flag raster-heavy templates as "limited recolor."
