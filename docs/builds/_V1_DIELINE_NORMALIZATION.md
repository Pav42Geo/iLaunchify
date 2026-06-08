# V1 Dieline Normalization + Prepress Export Bundle

> **STATUS: SPEC ONLY — NOTHING SHIPPED.** V1 Track C. Depends on `_V1_PACKAGING_COMPONENTS.md` + `_V1_DECORATION_METHODS.md`.

> Locked 2026-06-03 — hybrid auto-parse + partner-confirm flow. Industry terminology audited: "dieline" not "die-cut"; "substrate" not "material"; PANTONE specified with C/U/M book.

## Concept

When a partner provides a dieline (cutting/scoring/folding spec for a specific PackagingType + DecorationMethod), iLaunchify needs to:

1. Preserve the partner's exact original file (legal/operational source-of-truth for the printer)
2. Generate a normalized canvas representation so every creator's Studio experience is uniform
3. Composite the creator's artwork onto the original at export time for prepress delivery

The hybrid approach: **auto-parse the easy 80%, confirm the rest with the partner once per template, preserve both versions.**

## Schema

```prisma
model PackagingDieline {
  // RENAMED from PackagingDieCut per ilaunchify-prepress-terminology lock
  id                  String   @id @default(uuid())
  partnerServiceId    String
  packagingTypeId     String
  decorationMethod    DecorationMethod   // dieline shape varies by decoration
  
  // Files
  originalFileKey     String             // R2 — partner's exact uploaded file, IMMUTABLE
  originalFileFormat  DielineFileFormat  // AI | PDF | SVG | DXF
  normalizedSvgKey    String?            // R2 — platform-generated normalized SVG for canvas
  thumbnailKey        String?            // R2 — square preview thumbnail
  
  // Confirmed structured spec (partner fills in after upload)
  widthMm             Decimal  @db.Decimal(10, 3)
  heightMm            Decimal  @db.Decimal(10, 3)
  depthMm             Decimal? @db.Decimal(10, 3)   // for 3D structures
  bleedMm             Decimal  @db.Decimal(10, 3) @default(3.0)
  
  trimBox             Json                          // {x, y, w, h} of trim
  safeAreaBox         Json                          // {x, y, w, h} of safe area
  foldLines           Json[]                        // [{x1, y1, x2, y2, type: VALLEY|MOUNTAIN|PERFORATION}]
  surfaces            Json[]                        // multi-surface: [{name:"front", trimBox}, {name:"back", trimBox}, ...]
  
  // Color management context
  colorProfileExpected String?                      // ICC profile name expected at print
  spotColorBook        PmsBook   @default(COATED)   // C / U / M for PANTONE references
  
  // Status FSM
  status              DielineStatus
  parseAccuracyScore  Decimal?  @db.Decimal(3, 2)   // 0.00-1.00 from auto-parse
  
  uploadedAt          DateTime  @default(now())
  partnerConfirmedAt  DateTime?
  adminVerifiedAt     DateTime?
  adminVerifiedById   String?
  
  @@index([partnerServiceId, packagingTypeId, decorationMethod])
}

enum DielineFileFormat { AI PDF SVG DXF }

enum DielineStatus {
  UPLOADED              // partner uploaded, auto-parse pending
  PARSED                // auto-parse done, awaiting partner confirmation
  PARTNER_CONFIRMED     // structured spec confirmed by partner
  ADMIN_VERIFIED        // admin spot-checked sample
  ACTIVE                // available for creator selection
  ARCHIVED              // superseded by newer version
}

enum PmsBook { COATED UNCOATED MATTE NEON METALLIC PASTEL }

model SpotColor {
  // Pantone spec including book (per terminology lock)
  id                String   @id @default(uuid())
  pmsNumber         String                    // "185"
  bookVersion       PmsBook
  fullSpec          String   @unique          // "PMS 185 C" / "PMS 185 U" / etc.
  cmykApprox        Json                      // {c, m, y, k} closest CMYK for soft-proof only
  rgbApprox         String                    // hex, for on-screen rendering only
  category          SpotColorCategory @default(STANDARD)
}

enum SpotColorCategory {
  STANDARD          // regular PANTONE PLUS Solid C/U/M
  NEON
  METALLIC
  PASTEL
  WHITE_INK         // special — for printing on transparent/dark substrates
  SPOT_VARNISH      // selective varnish channel
  FOIL              // foil channel (often named per foil supplier)
}
```

## Auto-parse heuristics

Step 2 of the hybrid flow. Run on upload. Extract what we can from the file's metadata, layer names, and colors.

**Layer name matches (case-insensitive substring):**
- `die`, `cut`, `cutter`, `dieline` → trim/die layer
- `bleed` → bleed layer
- `safe`, `safety`, `live` → safe area layer
- `crease`, `fold`, `score` → fold lines
- `perf`, `perforation` → perforation lines

**Color heuristics (when layer names absent):**
- Cyan 100% C100 M0 Y0 K0 → die/trim line
- Magenta 100% M100 → crease/fold (industry convention)
- Yellow 100% → perforation
- Dashed gray/black at low weight → bleed indicator
- Dashed green at low weight → safe area

**PDF metadata extraction:**
- `TrimBox` → trim dimensions
- `BleedBox` → bleed dimensions
- `MediaBox` → overall page

**Output:** populate the structured spec fields tentatively with `parseAccuracyScore` 0-1. Flag confidence per field for partner review.

**Implementation:** `pdf-parse` + `svgo` for SVG normalization + a custom AI parser fallback (in V1.5 — manual confirmation suffices for V1).

## Partner confirm flow

After auto-parse, partner sees a side-by-side view:

- Left: their original file (rendered as PDF/SVG preview)
- Right: structured spec form pre-filled from auto-parse
- Each field has an auto-parsed value + confidence indicator + editable input
- Multi-surface mode lets partner name and bound each printable surface

Partner reviews, corrects what's wrong, confirms. Status flips to `PARTNER_CONFIRMED`. Audit logged.

## Normalized SVG generation

Run on `PARTNER_CONFIRMED`. Platform generates a clean SVG using only the structured spec fields:

- White background
- Trim line as solid Cyan stroke (1pt)
- Bleed line as dashed gray stroke
- Safe area as dashed green stroke
- Fold lines as solid Magenta stroke (valley) or solid red (mountain)
- Perforation as dashed yellow

Saved to `normalizedSvgKey`. Studio uses this for the `DielineFrame` overlay; underlying canvas serializes against the structured spec coordinates.

## Admin verification (sampling, not gating)

Admin gets a "Die-line Curator" mode in the Studio: open the partner's `PackagingDieline`, view original + normalized side-by-side with measurement overlay, tweak fields, save with `ADMIN_VERIFIED` stamp.

Admin verification is **sampling-based** — not every dieline reviewed. Algorithm prioritizes:
- New partners' first 3 dielines
- Dielines with `parseAccuracyScore < 0.7`
- Random 10% sample of rest
- Any dieline flagged by a creator's pre-flight ack

Verified dielines get a "VERIFIED" badge in marketplace + partner UI; non-verified are still ACTIVE but flagged for internal review.

## Export bundle — the prepress deliverable

When a creator's order goes to production, the partner receives a bundle matching their `PartnerPrintOutputSpec`. Bundle contents per component:

**1. Master artwork PDF** (one per surface for multi-surface dielines)
- Format: per `preferredFileFormat` (`PDF_X1A` | `PDF_X4`)
- Color space + ICC profile per `colorSpace` + `iccProfile`
- Vector elements as vectors; raster at `minDpi` minimum at final size
- Bleed per `bleedMm`
- Fonts per `fontPolicy` (EMBED | OUTLINE_TO_PATHS | EITHER)
- Spot color channels properly named with C/U/M designation, sourced from `SpotColor.fullSpec`
- TAC verified under `tacLimitPct`
- No registration marks (partner imposes)

**2. Original dieline file** (per `dielineDeliveryFormat`)
- SEPARATE_FILE: untouched original from R2
- LAYERED_IN_PDF: dieline embedded as non-printing layer in master PDF
- BOTH: both options

**3. Spec sheet PDF** (auto-generated)
- Job ID + creator + brand info
- Decoration method
- Substrate (PackagingType.substrateType)
- Color profile name + ICC profile attached
- TAC limit
- Spot colors with C/U/M and special process notes (white ink areas, foil zones)
- Special finishes per AccentDecoration (spot UV areas, emboss zones)
- Quantity + lead time + ship date
- Delivery address(es)
- Free-text from `PartnerPrintOutputSpec.exportInstructions`

**4. Composite proof PDF** (watermarked)
- Creator's artwork composited on dieline
- "FOR QC REFERENCE — NOT FOR PRESS" watermark
- Pre-flight report inline (acked warnings listed)

**5. Manifest JSON**
- All file paths + MD5 + sizes
- Dispatch ID linkage
- Ack records (compliance ack, pre-flight ack, partner pre-production QC sign-off)

**Filename convention:**

```
[orderId]_[creatorSlug]_[productSlug]_[componentRole]_[surfaceId]_[decorationMethod]_v[versionNumber].pdf
```

Example: `IL-2026-00451_pavelco_energy-drink_primary_front_directprint_v3.pdf`

## Pre-flight checks (partner-spec-driven)

Per memory `ilaunchify-partner-spec-source-of-truth` — checks read from `PartnerPrintOutputSpec`, not hardcoded.

**Per component, per surface:**
- ✗ Bleed extension verified (artwork extends past trim to bleed line) — ERROR
- ✗ DPI ≥ `minDpi` for all raster elements at final size — ERROR
- ✗ Color space matches `colorSpace` (warn if mixed) — ERROR or WARNING per partner
- ✗ Fonts handled per `fontPolicy` — ERROR
- ✗ Spot colors in `spotColorLibrary` book with correct C/U/M for substrate — ERROR
- ⚠ Trim integrity (no critical elements crossing trim line outside safe area) — WARNING
- ⚠ Safe area respected (text and key graphics within safe zone) — WARNING
- ⚠ TAC under `tacLimitPct` — WARNING (errors at 110% of limit)
- ⚠ White ink / varnish / foil channels named per `specialChannelNaming` convention — WARNING

Errors block export. Warnings require ack (existing DS-69 pattern). Warning text references the partner spec field that triggered it, so creator understands WHY ("Greenfield Bottling requires PDF/X-1a; your artwork uses live transparency").

## Partner Print Output Spec — extended schema

```prisma
model PartnerPrintOutputSpec {
  id                          String   @id @default(uuid())
  partnerServiceId            String   @unique
  
  // Output format
  preferredFileFormat         FileFormat
  
  // Color management
  colorSpace                  ColorSpace
  iccProfile                  String?            // "FOGRA39", "GRACoL2013_CRPC6"
  tacLimitPct                 Int       @default(300)
  
  // Spot colors
  spotColorsAccepted          Boolean   @default(true)
  spotColorLibrary            PmsBook   @default(COATED)
  specialChannelNaming        Json                // {white: "White", varnish: "Spot UV", foil: "Foil"}
  
  // Resolution + dimensions
  minDpi                      Int       @default(300)
  bleedMm                     Decimal   @db.Decimal(5, 2) @default(3.0)
  
  // Fonts
  fontPolicy                  FontPolicy
  
  // Dieline delivery
  dielineDeliveryFormat       DielineDelivery   @default(SEPARATE_FILE)
  dielineLayerName            String?            // "Dieline" or "Cutter" per partner convention
  
  // Substrate context
  defaultSubstrateType        SubstrateType?
  
  // Manifest
  manifestFormat              ManifestFormat   @default(JSON_STANDARD)
  
  // Free-text override
  exportInstructions          String?
  
  updatedAt                   DateTime  @updatedAt
}

enum FileFormat       { PDF_X1A PDF_X4 TIFF EPS_AI }
enum ColorSpace       { CMYK RGB CMYK_OGV GRAYSCALE }
enum FontPolicy       { EMBED OUTLINE_TO_PATHS EITHER }
enum DielineDelivery  { SEPARATE_FILE LAYERED_IN_PDF BOTH }
enum SubstrateType    { COATED_PAPER UNCOATED_PAPER COATED_BOARD UNCOATED_BOARD FILM_PP FILM_PET FILM_BOPP METAL_ALUMINUM GLASS PLASTIC_HDPE PLASTIC_PET TEXTILE TRANSPARENT_FILM }
enum ManifestFormat   { JSON_STANDARD CUSTOM_XML NONE }
```

## Tasks for Claude Code

| # | Slice | Lift |
|---|---|---|
| C9.a | Schema rename — PackagingDieCut → PackagingDieline (entity + all FK references) | ~½ day |
| C9.b | Schema add — DielineStatus FSM + PmsBook + SpotColor + SpotColorCategory + structured spec fields | ~½ day |
| C9.c | Schema add — PartnerPrintOutputSpec full model | ~¼ day |
| C9.d | Partner upload flow — file → R2, auto-parse trigger (background job), confidence scores | ~1 day |
| C9.e | Partner confirm UI — side-by-side preview + structured spec form | ~1.5 days |
| C9.f | Normalized SVG generator — from confirmed spec → cleansed SVG saved to R2 | ~½ day |
| C9.g | Admin "Dieline Curator" mode in Studio — open in admin role, side-by-side measurement view, save ADMIN_VERIFIED | ~1.5 days |
| C9.h | Sampling algorithm + admin verification queue prioritization | ~½ day |
| C9.i | Spot color picker in Studio with C/U/M selector + substrate-aware default | ~½ day |
| C9.j | Pre-flight check engine — partner-spec-driven checks per component | ~1 day |
| C9.k | Export bundle generator — master PDF + dieline file + spec sheet + composite proof + manifest JSON | ~1.5 days |
| C9.l | Partner `/partner/print-spec` editor — CRUD for PartnerPrintOutputSpec | ~½ day |
| C9.m | Rename DieCutFrame → DielineFrame in packages/ui + update all imports + UI strings | ~½ day |

Total: **~9-10 days** focused. Most complex piece: C9.k export bundle generation (PDF/X conformance + spot channel preservation).

## Paste-ready Claude Code prompt — C9.a (rename)

```
Ship Slice C9.a — rename PackagingDieCut → PackagingDieline per
ilaunchify-prepress-terminology memory lock. Brief at
docs/builds/_V1_DIELINE_NORMALIZATION.md.

This is a pure rename pass:
1. packages/db/prisma/schema.prisma — model PackagingDieCut → PackagingDieline,
   field dieCutId → dielineId, status enum DieCutStatus → DielineStatus
2. All FK references across schema (PartnerPackagingOffering.dieCutId → dielineId,
   PackagingComponent.dieCutId → dielineId, etc.)
3. All TypeScript imports + usage across apps/* and packages/*
4. UI strings — "die-cut" / "Die-Cut" → "dieline" / "Dieline" — partner editor,
   admin pages, creator Product Builder
5. packages/ui DieCutFrame component → DielineFrame, update all imports

Use prisma migrate dev (or hand-author SQL + migrate deploy).

Verify: pnpm typecheck && pnpm lint (workspace-wide).
Grep verify: grep -ri "die-cut\|dieCut\|DieCut" apps/ packages/ should
return zero hits (or only in legacy migration files for FK constraints).

Then /ship "C9.a dieline rename — PackagingDieline, DielineStatus,
DielineFrame, UI strings updated per prepress terminology lock".
```

## Prepress glossary appendix

Use these terms in code, schema, UI, and partner-facing copy. Full list in memory `ilaunchify-prepress-terminology.md`. Highlights:

- **Dieline** (not die-cut)
- **Trim line** / **bleed line** / **safe area**
- **Score line** + **crease** + **mountain/valley fold**
- **Substrate** (not material) + **stock** + **GSM** / **caliper**
- **Process colors** (CMYK) vs **spot color** (PANTONE)
- **PMS C / U / M** — always specify book
- **TAC / TIC** — total ink coverage limit
- **ICC profile** — color management (Fogra39, GRACoL, USWebCoatedSWOP)
- **PDF/X-1a** (conservative) vs **PDF/X-4** (modern with transparency)
- **Outline / convert to paths** — fonts to vectors
- **Soft proof** vs **hard proof**
- **Spot UV / spot varnish** — selective glossy coating
- **Foil stamp** — metallic application
- **Knockout / overprint / trapping** — color interactions

## See also

- Memory: `ilaunchify-prepress-terminology.md` — naming lock
- Memory: `ilaunchify-partner-spec-source-of-truth.md` — partner-spec-driven exports
- `_V1_PACKAGING_COMPONENTS.md` — PackagingComponent that owns the dieline reference
- `_V1_DECORATION_METHODS.md` — dieline shape varies per decoration
- `docs/PACKAGING_LIBRARY_ARCHITECTURE.md` — existing PackagingType library
- F1 phase (#426-428) — existing FinishType for accent decorations
