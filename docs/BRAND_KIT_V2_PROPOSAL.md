# Brand Kit V2 — proposal (Pavel 2026-06-22)

Builds on BRAND_KIT_PROPOSAL.md + memory `ilaunchify-brand-kit-decisions` and the
scope correction `ilaunchify-brand-assets-not-design-system` (brand kit = the
asset library that feeds the Fabric.js packaging canvas, not a web design system).

This proposal answers Pavel's questions: full font list, custom font upload,
brand assets surfacing in every rail section + addable from there, Canva-style
text-style roles, Pantone / palettes / gradients, and per-tier "give them more".

---

## 1. What the Brand Kit is today (recall)

The kit IS the `Brand` model. The canvas consumes four things via
`buildBrandCanvasAssets` (apps/creator/src/lib/brand-canvas-assets.ts):

| Asset | Schema today | Surfaced in Studio today |
|---|---|---|
| Colors | `colorPrimary/Secondary/Accent` + `brandSwatches[]` (~5 cap) | BackgroundDrawer pins swatches; color pickers |
| Fonts | `brandFontIds[]` (1–3 **TypographyFont** ids) | Text drawer font list (pinned) |
| Logos | `logoAssetId` / `logoIconAssetId` / `logoHorizontalAssetId` (3 variants) | ImagesDrawer "My Brand" section |
| Tagline / about | `tagline`, `aboutText` | Phrases/Text |

Edited in-Studio via BrandDrawer (Apply / Edit) → BrandKitCompactEditor
(LogosCompact / ColorsCompact with "+" picker / FontsCompact / TaglineCompact) +
Build-from-website. No schema change needed to *use* the kit; it's mostly UX +
two new models below.

---

## 2. Gaps vs Canva's Brand Hub

| Canva Brand Hub | iLaunchify today | Gap |
|---|---|---|
| Multiple named **color palettes** | one flat triad + swatches | ✗ multi-palette |
| **Gradients** as brand colors | solid hex only | ✗ |
| Pantone / spot-color refs | none | ✗ (print-relevant) |
| **Brand fonts** (full library) | small DB seed, not the 113 catalog | ✗ list mismatch |
| **Custom font upload** | none (schema half-ready) | ✗ |
| **Text styles** (Heading/Subheading/Body…) | flat `brandFontIds[]` | ✗ roles |
| Brand **logos** | 3 variants | ~ (ok for V1) |
| Brand **photos / images** library | logos only | ✗ |
| Brand **graphics / icons** | Iconify only, not brand-saved | ✗ |
| Brand voice | intentionally OUT (locked) | — keep out |
| Brand templates | shipped (`BrandTemplate`) | ✓ |

The big themes: (A) **fonts** (full list + custom upload + text-style roles),
(B) a **generalized brand asset library** so Graphics/Background/Images all carry
brand items and can add to the kit, (C) **richer color** (palettes / gradients /
Pantone). Each maps to a Pavel question below.

---

## 2b. Beyond Canva — CPG-specific elements worth adding (Claude's suggestions)

We're not a generic design tool; we put product *on a shelf*. The highest-value
additions are the ones that auto-fill regulated, repeated, print-critical fields so
a creator sets them once per brand and never re-types them per product.

**Governance line (Pavel 2026-06-22):** anything tied to *earned eligibility,
compliance, or the physical package* is **product/package-owned, NOT a brand
self-service choice.** A creator must never attach a certification they didn't earn,
a claim that wasn't compliance-vetted for that product, or a package-mark that
doesn't apply to the chosen packaging. These are **excluded** from the brand kit and
stay where they belong:
- **Certification seals** → come with the PRODUCT (earned PartnerCertificate →
  admin-verified → surfaced on that product). Never creator-self-added to a brand.
- **Approved claims / phrase library** → product/recipe-specific and compliance-
  gated; lives on the product (PhrasesDrawer / ClaimSuggestions / compliance engine).
- **Recycling / usage / package iconography** → determined by the chosen PACKAGE
  (packaging type drives the required marks), not a creator pick.

What *is* legitimately brand-level (kept):

1. **Responsible-party / legal block (highest value).** Business legal name +
   address + the "Distributed by / Manufactured for / Manufactured by" line +
   customer-care contact. Required on essentially every food/supplement/cosmetic
   label — auto-fills the label's responsible-party line for every product in the
   brand. Pairs with `operatingRegion` we already store. Pure time + compliance win.
2. **Print color values, not just screen.** Store **CMYK** (and the §5 Pantone ref)
   alongside each `hex`. RGB-on-screen ≠ what prints; CPG creators and our print
   partners care about CMYK/spot. Cheap to add to `BrandSwatch`.
3. **Inverse / mono logo variant.** We dropped INVERSE in V1, but packaging prints
   on dark *and* light substrates — a one-color/knockout logo is genuinely needed.
   Add it back as a `BrandAsset(kind=LOGO)` variant (not a 4th confusing column).
4. **Barcode / GS1 identity.** The brand's GS1 company prefix (or managed-UPC
   choice) tied to the kit so GTIN/SKU generation is consistent across products.
   Hooks the existing GTIN model (`ilaunchify-gtin-model`) to the brand.
5. **On-pack contact + QR set.** Website, customer-care, social handles (we already
   store `socialAccounts`), and a default QR destination — pinned for the QR/Barcode
   drawers so on-pack links are one tap and consistent.

Recommended first-class adds: **#1 (legal block)** and **#2 (CMYK)** — small,
regulated, reused on every single product, and uniquely *ours*. #3 is a quick win on
the §4 BrandAsset model; #4–#5 are fast-follows.

---

## 3. Fonts

### 3a. Show the whole list (the "couple suggestions" bug)
Root cause: two unconnected font systems.
- Studio Text tool → `FONT_CATALOG` (113 entries, `packages/ui/src/fonts/catalog.ts`).
- Brand Kit picker → `prisma.typographyFont` `status=ACTIVE` (small seed); `brandFontIds`
  store TypographyFont ids.

**Fix: make `FONT_CATALOG` the single source of truth.** The brand-kit font picker
(FontsCompact) draws from the same 113-font catalog the canvas uses, and a brand
font is stored by its **catalog key (family)** so it applies through the identical
text-tool path. `TypographyFont` stays only for (i) print-file (OTF/TTF) resolution
at PDF render and (ii) custom uploads (3b). Net: the kit shows every font the Studio
has, and "apply brand font" is guaranteed to match a real text-tool font.

### 3b. Custom font upload — yes, recommend it (gated)
The schema half-anticipates this: `TypographyFont.source` enum + `printFileAssetId`.
Add:
- `FontSource.CUSTOM_UPLOAD`; `TypographyFont.ownerBrandId` (nullable → private to a
  brand when set, global when null).
- Upload flow: creator uploads WOFF2 (web preview) **and** the OTF/TTF (print file,
  required for production PDF) → Asset rows → a private `TypographyFont` →
  appended to `brandFontIds`. Shows in the Studio Text list for that brand only.
- **License attestation** checkbox ("I have the right to use & embed this font for
  print") — store the attestation + timestamp (consistent with the
  `labels-are-regulated` / operational-trust posture).
- **Tier-gate** custom upload to Builder + Agency (see §6).

### 3c. Canva-style text styles (be more advanced)
Replace the flat `brandFontIds[]` *concept* (keep the column for back-compat) with a
`BrandTextStyle` model — named roles, each a full style, not just a family:

```
model BrandTextStyle {
  id            String  @id @default(cuid())
  brandId       String
  role          BrandTextRole   // TITLE | HEADING | SUBHEADING | BODY | CAPTION | ACCENT
  fontKey       String          // FONT_CATALOG family or custom TypographyFont id
  weight        String          // 'Bold' etc
  sizePt        Float?          // optional default size hint for the canvas
  letterSpacing Float?          // tracking
  textCase      TextCase?       // NONE | UPPER | LOWER | TITLE
  colorRef      String?         // 'primary'|'accent'|hex — binds to the palette
  order         Int      @default(0)
}
```
Applying a text style sets family+weight+size+tracking+case+color in one tap — more
advanced than Canva (we also bind color to the palette, so re-coloring the brand
re-flows the type). Number of roles is tier-gated (§6).

---

## 4. Generalized brand asset library (Graphics / Background / Images)

Today only logos are "brand assets". Pavel wants brand items to appear in **every**
relevant rail section and to be **addable from those sections**. Introduce one model:

```
model BrandAsset {
  id        String  @id @default(cuid())
  brandId   String
  kind      BrandAssetKind  // LOGO | GRAPHIC | PHOTO | PATTERN | BACKGROUND | ICON
  assetId   String          // → Asset (R2)
  label     String?
  order     Int     @default(0)
  createdAt DateTime @default(now())
}
```
Keep the 3 logo columns for back-compat (migrate them into `BrandAsset(kind=LOGO)`
lazily). `buildBrandCanvasAssets` returns assets grouped by kind.

### Two-way wiring (the "best solution")
**Pinned in, addable out** — one reciprocal pattern across drawers:
- **Read:** each drawer renders a "My Brand" section at the top showing
  `BrandAsset` of its kind — ImagesDrawer→PHOTO+LOGO, GraphicsDrawer→GRAPHIC+ICON,
  BackgroundDrawer→BACKGROUND+PATTERN(+swatches, already there), Text→text styles.
- **Write:** every asset card in every drawer gets a small **pin / "＋ Brand Kit"**
  affordance. Clicking it calls one shared server action
  `addBrandAsset({ brandId, assetId, kind })` (kind inferred from the drawer) →
  the item now appears in that drawer's My-Brand section *and* in the BrandDrawer kit
  editor. Uploaded canvas images get the same pin. This is the single mechanism that
  satisfies "appear dynamically" + "add from the section" without per-drawer bespoke
  logic.

---

## 5. Color: palettes, gradients, Pantone

Promote color from 3 columns to a small structured set (keep columns for back-compat):

```
model BrandPalette { id  brandId  name  order }          // multiple named palettes
model BrandSwatch  {
  id  paletteId  order
  kind        SwatchKind   // SOLID | GRADIENT
  hex         String?      // SOLID
  gradient    Json?        // GRADIENT: { type:'linear'|'radial', angle, stops:[{hex,pos}] }
  pantoneRef  String?      // e.g. 'PANTONE 186 C' — reference code only (see note)
  role        String?      // 'primary'|'secondary'|'accent'|null
}
```
- **Multiple palettes:** creators keep e.g. "Core", "Holiday", "Limited drop".
- **Gradients:** Fabric.js supports linear/radial fills, so a gradient swatch drops
  straight onto text/shape fills. Add a gradient editor to the "+" popover (stops +
  angle) alongside the existing solid picker.
- **Pick from curated palettes / extract from image:** seed a small set of admin-
  curated palettes; "Extract from logo/image" pulls dominant colors (we already do a
  version of this in the Build-from-website extractor — reuse it).
- **Pantone — important nuance:** the Pantone color *libraries* are licensed IP
  (Pantone Connect is a paid product); we should **not** ship the actual Pantone
  swatch books. What we *can* do cheaply and legally: store a free-text **Pantone
  reference code** per swatch (creator types/sources it) that travels on the print
  manifest to the partner for spot-color matching. That delivers 90% of the value
  (print accuracy) with zero licensing exposure. A licensed Pantone picker is a
  V2+/Agency consideration with a real cost line.

---

## 6. Subscription gating — "give them more"

Tension to flag: memory `ilaunchify-brand-kit-decisions` locked "gate ONLY kit
count + template count; colors/fonts EQUAL across tiers." Pavel now wants premium
depth. **Recommended reconciliation:** keep a *usable* kit equal for everyone (so no
one is blocked from basic branding), and gate **advanced** capabilities — the new
power features are legitimate upsells, not nickel-and-diming basic counts.

| Capability | Maker | Builder | Agency |
|---|---|---|---|
| Brand kits | 1 | 3 | ∞ (already locked) |
| Brand templates / kit | 3 | 15 | ∞ (already locked) |
| Full 113 font catalog | ✓ | ✓ | ✓ (basic — keep equal) |
| Solid colors / swatches | ✓ | ✓ | ✓ (basic — keep equal) |
| Logos (3 variants) | ✓ | ✓ | ✓ |
| **Custom font upload** | — | ✓ | ✓ |
| **Text-style roles** | Body+Heading (2) | +Sub/Title (4) | all 6 + custom |
| **Multiple palettes** | 1 | 3 | ∞ |
| **Gradients** | — | ✓ | ✓ |
| **Brand asset library** (graphics/photos/patterns) | small cap | larger | ∞ |
| **Pantone reference codes** | — | ✓ | ✓ |

Add an `advancedBrandFeatures(tier)` helper alongside `brandLimits(tier)` in
`@ilaunchify/auth`. This needs a Pavel sign-off since it revises the earlier "equal"
lock (basic stays equal; advanced is gated).

---

## 7. Phased build plan (collision-aware — Studio canvas is Code's hot zone)

- **Slice 1 — Fonts unify (highest ROI, low risk).** Point the brand-kit font
  picker at `FONT_CATALOG` (113). Searchable list in FontsCompact. No schema.
- **Slice 2 — Custom font upload.** `FontSource.CUSTOM_UPLOAD` + `ownerBrandId` +
  upload flow (web + print file) + license attestation. Builder/Agency gate.
- **Slice 3 — `BrandAsset` model + reciprocal pin/add-from-section** across
  Images/Graphics/Background drawers (the §4 mechanism). Coordinate with Code on the
  drawer files (hot zone) — spec or commit-immediately.
- **Slice 4 — `BrandTextStyle` roles** + apply-style in the Text tool.
- **Slice 5 — Color V2:** `BrandPalette`/`BrandSwatch`, gradient editor, extract-
  from-image, Pantone reference field on swatches + print-manifest passthrough.
- **Slice 6 — `advancedBrandFeatures(tier)` gating + upgrade nudges.**

All schema additions are additive (new models + nullable columns; existing columns
kept for back-compat), so each slice is one `db push` on the Mac.

---

## 8. Open decisions for Pavel
1. Approve revising the "colors/fonts equal across tiers" lock → **basic equal,
   advanced gated** (§6). Or keep everything equal and only upsell kit/template count?
2. Pantone: ship **reference codes only** (recommended, zero licensing) vs pursue a
   licensed Pantone picker later (cost)?
3. Custom font upload tier floor: Builder (recommended) or Agency-only?
4. Build order: start with Slice 1 (fonts unify) now?
