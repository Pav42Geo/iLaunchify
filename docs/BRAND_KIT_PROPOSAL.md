# Brand Kit for Creators — Canva study + iLaunchify proposal

> **DECIDED (Pavel 2026-06-22):** (1) colors/fonts caps **equal across tiers** — gate
> ONLY kit count + template count; (2) Brand Templates per kit locked at
> **3 / 15 / Unlimited** (Maker / Builder / Agency); (3) Brand Voice stays **OUT**;
> (4) dedicated **`BrandTemplate`** model (not EditSnapshot). Brand-kit count stays
> the already-locked **1 / 3 / Unlimited**.

Status: PROPOSAL for Pavel (2026-06-22). Adapts Canva's Brand Kit to iLaunchify's
**locked** brand scope. Respects: `ilaunchify-brand-assets-not-design-system`
(brand = logos + colors + fonts that feed the Fabric.js packaging canvas; voice /
personas / WCAG / type-scales are OUT of scope) and `PLATFORM_SPEC.md §Tier 1`
(brand-profile counts already locked at 1 / 3 / Unlimited).

---

## 1. What Canva's Brand Kit actually is (studied)

Canva's Brand Kit is a per-brand container surfaced inside the editor so a designer
can apply their brand while designing. It holds:

- **Logos** (logo + variations)
- **Colors** (hex/CMYK, grouped primary/secondary)
- **Fonts** (heading/subheading/body/quote/caption; primary/secondary; can upload)
- **Brand Voice** (tone/personality)
- **Photos, Graphics, Icons** (uploaded asset libraries + custom categories)
- **Brand Templates** (pre-designed, locked-brand starting layouts for common content)
- **Brand Kit Builder** (auto-extract logos/colors/fonts from a URL or PDF)

**Per-plan limits (Canva, 2026):** Free **1** Brand Kit (and only **3 colors**) →
Pro **5** → Teams **100** → Enterprise **1,000**. (Sources at end.)

Canva's model is multi-brand, editor-embedded, and tiered by count — which is
exactly the shape we want. We adopt the structure and **drop the parts that don't
fit packaging** (Brand Voice, web-style assets), per our locked scope.

## 2. The iLaunchify adaptation (what a "Brand Kit" is for us)

Good news: the `Brand` model already IS this, correctly scoped. A creator's Brand
Kit = one `Brand` row holding:

| Canva element | iLaunchify Brand Kit | Status |
|---|---|---|
| Logos | `logoAssetId` / `logoIconAssetId` / `logoHorizontalAssetId` (3 variants) | **built** (`/brands/[id]/assets` LogosSection) |
| Colors | `colorPrimary/Secondary/Accent` + `brandSwatches[]` | **built** (ColorsSection) |
| Fonts | `brandFontIds[]` → `TypographyFont` | **built** (FontsSection) |
| Tagline / about | `tagline`, `aboutText`, `positioning` | **built** (TaglineSection) |
| Brand Voice | — | **OUT of scope** (locked) — flag below |
| Photos/Graphics/Icons | brand asset library (uploaded `Asset`s) | partial — V1.5 "Brand assets" tab |
| **Brand Templates** | saved packaging/label designs reusable as starting points | **NEW — this proposal** |
| Brand Kit Builder | auto-extract from creator's site/IG | **V1.5** (Builder+ tier) |

**What's genuinely new here (2 things):**
1. **Surface the Brand Kit *inside the Design Studio*** (a left-rail "Brand" tool) so
   creators apply logos/colors/fonts onto the packaging canvas in one click — today
   the data exists but there's no dedicated Brand rail in the Studio.
2. **Brand Templates** — let a creator save a finished label/packaging design as a
   reusable, brand-locked starting point, and start a new product from it.

**Scope flag (your call):** Canva includes **Brand Voice**. We locked it OUT
(2026-05-25) because iLaunchify brand identity feeds a *packaging canvas*, not
marketing copy. I recommend keeping it out for V1. If you want a light "tagline +
key claims" text block reused on labels, that's already covered by `tagline` /
`aboutText` — no need to import Canva's voice module.

## 3. Where it lives (two surfaces)

### A. Design Studio — new left-rail "Brand" tool (the headline ask)
The Studio left rail today has 11 tools (Product, Label, Text, Images, Graphics,
Clipart, Background, Pattern, QR, Barcode, Layers). **Add a "Brand" tool** (brand
badge icon) near the top. Its drawer:

- **Active brand switcher** (creators are multi-brand) — pick which kit is active.
- **Logos** — thumbnails; click/drag onto the canvas (drops into the Images "My
  Brand" group, which the canvas already supports via `BrandCanvasAssets`).
- **Colors** — the brand swatches; click to apply to the selected object's fill /
  text color. Pinned to the top of every color picker too.
- **Fonts** — brand fonts; click to apply to selected text. Pinned in the Text
  drawer font list.
- **Brand Templates** — saved layouts for this brand; "Start from template".
- **Apply brand** (one-click) — recolor + font-swap the whole current design to the
  active kit. The "make it on-brand instantly" moment Canva is loved for.
- Footer link: **Edit brand kit →** (jumps to the profile editor).

### B. Creator profile — Brand Kit hub (`/brands`)
`/brands` already lists brands and `/brands/[id]/assets` already edits Logos/Colors/
Fonts/Tagline. Reframe `/brands` as the **Brand Kit hub**: kit cards (logo + swatch
row + font preview), a tier-gated **"New brand kit"** button, and per kit a new
**Templates** tab beside the existing asset sections.

## 4. Tier limits (the part you asked me to pin down)

Two of these are already locked; the rest are my proposal and need your yes.

| Element | Maker (free) | Builder | Agency | Source |
|---|---|---|---|---|
| **Brand Kits** (= brand profiles) | **1** | **3** | **Unlimited** | **LOCKED** (PLATFORM_SPEC §Tier 1) |
| **Brand Templates** per kit | **3** | **15** | **Unlimited** | **NEW — needs your lock** |
| Brand colors per kit | 3 | 6 | 10 | proposal (Canva Free = 3) |
| Brand fonts per kit | 2 | 3 | 5 | proposal |
| Logo variants per kit | 3 | 3 | 3 | already (primary/icon/horizontal) |
| Brand Kit Builder (auto-extract) | — | ✓ | ✓ | proposal · V1.5 |
| Apply-brand one-click in Studio | ✓ | ✓ | ✓ | all tiers (it's the hook) |

Rationale: our **1 / 3 / Unlimited** kit ladder mirrors Canva's 1 → 5 → 100 shape
but tuned for creators (a creator runs a few brands; an agency runs many). The
**Brand Templates** ladder (3 / 15 / Unlimited) is the new monetization lever you
flagged — generous enough to be useful on Maker, clearly more valuable on paid
tiers. The colors/fonts caps echo Canva's "Free = 3 colors" gating.

These map onto the existing `normalizeTier()` / plan system; enforcement is a small
`brandLimits(tier)` helper checked in the "New brand kit" and "Save as template"
actions (no per-tier limit code exists yet — this adds the first one).

## 5. Schema delta (additive, CockroachDB-safe)

The Brand Kit itself = the existing `Brand` model (no change). Net-new for templates:

```
model BrandTemplate {
  id             String   @id @default(uuid())
  brandId        String
  name           String
  thumbnailUrl   String?          // preview (reuse EditSnapshot thumbnail capture)
  canvasJson     String           // Fabric.js layout JSON (bare String — no @db.Text)
  packagingTypeId String?         // which container this layout targets (optional)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  brand          Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  @@index([brandId])
}
```

`Brand` gets `brandTemplates BrandTemplate[]`. We could instead reuse `EditSnapshot`
(pinned milestones) — but a template is a *reusable starting point*, not version
history, so a dedicated model keeps the semantics clean. Colors/fonts caps need no
schema (they're array-length checks).

## 6. Build sequence (once you approve)

1. **Studio "Brand" rail tool** + drawer (logos/colors/fonts apply) — reads existing
   `Brand`; highest-value, no schema. The thing you actually asked for.
2. **`brandLimits(tier)` helper** + enforce the locked 1/3/Unlimited kit cap on "New
   brand kit" (first per-tier limit in the codebase).
3. **Brand Kit hub** polish on `/brands` (kit cards + tier-gated create + upgrade nudge).
4. **Brand Templates** — `BrandTemplate` model + "Save as template" in Studio + a
   Templates tab + the tier count gate.
5. **Apply-brand one-click** (recolor/font-swap the active design).
6. V1.5: Brand Kit Builder (auto-extract), Brand assets library tab.

---

## Decisions I need from you

1. **Brand Templates per-tier counts** — lock 3 / 15 / Unlimited, or different?
2. **Colors/fonts caps** — adopt 3·6·10 / 2·3·5, or keep all tiers equal and only
   gate kit count + templates?
3. **Brand Voice** — keep OUT (my recommendation), or you want a light claims/tagline
   reuse block beyond what `tagline`/`aboutText` already give?
4. **Templates model** — dedicated `BrandTemplate` (recommended) vs. reuse pinned
   `EditSnapshot`?

A clickable prototype of both surfaces follows in chat.

## Sources (Canva, verify periodically)
- Canva Brand Kit overview — https://www.canva.com/pro/brand-kit/
- Set up Brand Kits (Help) — https://www.canva.com/help/brand-kit/
- Brand Kit Builder (auto-extract) — https://www.canva.com/help/brand-kit-builder/
- Per-plan Brand Kit limits (1/5/100/1000) — https://www.canva.com/help/brand-kit/
