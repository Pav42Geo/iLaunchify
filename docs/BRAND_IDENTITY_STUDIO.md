# Brand Identity Studio — Spec

**Status:** V1 architecture locked 2026-05-24 with Pavel.
**Related:** [CREATOR_ONBOARDING.md](./CREATOR_ONBOARDING.md) (Step 4 captures Quickstart subset) · [DESIGN_STUDIO.md](./DESIGN_STUDIO.md) (consumes brand identity for template filtering + label rendering) · [MANUFACTURER_PRODUCT_BUILDER.md](./MANUFACTURER_PRODUCT_BUILDER.md) · [PLATFORM_SPEC.md](./PLATFORM_SPEC.md)

## Why a dedicated surface

Creator Onboarding Step 4 ("Brand Quickstart") captures the **minimum** brand identity to make Design Studio useful — logo, color palette, typography pair, visual style, tagline. That gets a creator producing on‑brand labels in 5–8 minutes.

But real brand identity is more than that — it's a brand book that includes logo variants, typography systems, color systems with neutrals, imagery style, voice/tone guidelines, taglines, and usage rules. Creators invest in this over weeks. **Cramming it into onboarding makes Step 4 take 30+ minutes and most creators abandon. Skipping it entirely means Design Studio works but labels look generic.**

The fix is the split:

| Surface | Purpose | When | Time investment |
|---|---|---|---|
| **Onboarding Step 4 — Brand Quickstart** | Minimum identity for Design Studio to be useful | First signin, in the 5-step stepper | 5–8 min |
| **Brand Identity Studio** (this doc) | Full brand book builder | Anytime after onboarding | Open-ended; weeks of polish |

Design Studio always reads the latest values from `Brand` + linked identity rows. A creator who just did Step 4 has minimum context. As they invest in the Studio, their labels become more on‑brand without re‑doing anything per product.

This pattern matches how Frontify / Brandfolder / Canva Brand Kits / Shopify Theme Settings work — a destination where brand identity lives and evolves.

## The Studio destination

**Route:** `/creator/brand/[brandId]/identity` — one Studio per brand. With multi‑brand support (see `CREATOR_ONBOARDING.md` §Multi‑brand support), each brand has its own Studio.

**Layout:** Persistent left sidebar with 7 tabs (Logo Suite, Typography, Color System, Imagery, Voice, Taglines, Usage Guidelines) + right‑side editor + live preview rail showing how the latest values render on a sample label.

**Top action bar:** "Brand health score" (e.g., "78% complete — 3 sections to refine") + "Preview brand book" (generates a PDF brand guidelines export) + "Export brand kit" (zip of all assets in print + web formats).

## 1. The 7 tabs

### 1.1 Logo Suite

| Variant | Purpose | Required for completion? |
|---|---|---|
| Primary logo | Main brand mark, used on labels and marketing | Yes |
| Icon‑only | Small contexts (favicons, social profile, mobile, partner card thumbnail) | No |
| Horizontal lockup | Wide constraints (email headers, web nav, label banner) | No |
| Vertical / stacked lockup | Tall constraints (label sides, sleeve sleeves) | No |
| Monogram | Stamp / seal effects, watermarks | No |
| Inverse / single-color variants | Dark backgrounds, single‑color print processes | No |
| Favicon (16×16, 32×32, 180×180 Apple touch) | Browser tab + iOS home screen | No |

Each variant: SVG (preferred) or PNG (≥ retina‑res for raster). Stored as `Asset` rows (uses the unified Asset model from FOD_ADMIN_DELTA §1.2 once V1.1 ships it; until then uses PartnerFile/AdminFile equivalent).

**Minimum spacing rule per variant:** picker that sets `minimumClearSpaceUnits` (multiple of logo height — e.g., "minimum 0.5x clear space around the logo"). Design Studio enforces this when placing the logo on a label.

### 1.2 Typography

V1 ships a **curated font library** (~20 carefully selected pairs). Creator picks. No custom upload V1 (deferred to V1.5+).

**Required slots:**
- Heading font (display): e.g., "Playfair Display Bold", "Inter Black", "Recoleta", "Space Grotesk"
- Body font (text): e.g., "Inter Regular", "Source Sans Pro", "Lato"
- Optional: Accent font (e.g., "IBM Plex Mono" for technical callouts; "Caveat" for handwritten flourishes)

**Type scale (V1):** 6 sizes derived from a single base + ratio. Admin‑curated ratios: 1.125 (minor third, conservative), 1.250 (major third, balanced), 1.333 (perfect fourth, dramatic), 1.414 (augmented fourth, bold). Creator picks ratio; sizes auto‑compute.

**Letter spacing + line height defaults** per font (set by admin during curation).

**Live preview:** sample text "Verdant Wellness — Performance from real ingredients. The science of clean nutrition." renders across all three slots so creator can see how their copy reads.

### 1.3 Color System

Beyond the 3‑color palette from Step 4 — a full color system with semantic roles.

**Required roles:**

| Role | What it's for | V1 source |
|---|---|---|
| `primary` | Main brand color | From palette or custom |
| `secondary` | Supporting brand color | From palette or custom |
| `accent` | Call-to-action highlights | From palette or custom |
| `surface` | Card / panel background (off-white or very light) | Default if not customized |
| `background` | Page background | Default if not customized |
| `text-primary` | Main copy color | Defaults to dark variant of primary |
| `text-secondary` | De-emphasized copy | Lighter neutral |
| `success` | Green for positive states | Defaults from palette type |
| `warning` | Amber for caution | Defaults from palette type |
| `error` | Red for errors | Defaults from palette type |
| `border` | Hairlines, dividers | Lighter neutral |

**Curated palettes for V1** (~30 palettes, tagged by `LabelDesignTemplate.styleTags`): each palette specifies all 11 semantic roles. Creator picks; values auto‑populate. Custom palette mode lets creator override any role.

**Accessibility checker built‑in:** every text/background pair gets a WCAG contrast ratio check inline (AA = 4.5:1, AAA = 7:1). Failing pairs are flagged so creator sees "your accent color doesn't pass WCAG AA against your background — consider darkening" — Design Studio enforces hard‑fail on label rendering for primary text combos.

**HEX / RGB / HSL display + copy buttons** per color so creator's external tools (Figma, web, etc.) can match exactly.

### 1.4 Imagery Style

**Photography style** — single‑select reference categories:
- `lifestyle` — humans using the product in context
- `product` — clean product shots on solid backgrounds
- `lab` — scientific / technical contexts
- `ingredient` — close‑ups of raw inputs
- `editorial` — magazine / aspirational
- `none` — brand doesn't use photography (illustrated‑only)

**Illustration style** — single‑select:
- `line-art` — simple line illustrations
- `flat` — flat color shapes
- `hand-drawn` — sketchy / organic
- `geometric` — patterns and shapes
- `none`

**Texture / pattern library** — creator uploads background textures or pattern repeats for use on labels (kraft paper texture, fabric weave, watercolor wash). Stored as `Asset` rows with kind=`PATTERN`. Up to 10 V1.

**Hero imagery slots** — creator uploads 3–5 brand hero photos. Used as backdrop on landing pages, product detail pages, marketing exports. Validated for resolution + aspect ratios.

### 1.5 Voice & Tone

Beyond the `brandVoiceTags` multi‑select from Step 4 (visual style) — this tab covers written tone.

**Writing tone words** — multi‑select from controlled vocabulary (~16 options):
- `friendly` · `professional` · `warm` · `scientific` · `confident` · `humble` · `playful` · `serious` · `direct` · `lyrical` · `casual` · `formal` · `authoritative` · `nurturing` · `provocative` · `understated`

Max 4 tone words. These guide AI copy assistance in V1.5+ and the V2 Template Generator's per-brand styling.

**Brand keywords** — free‑text, ~3–7 short phrases that describe the brand essence ("clean nutrition," "evidence-based wellness," "performance for everyday"). Used as prompts for AI image gen + copy in V2+.

**Persona description** — paragraph (optional, ~150 words) describing the brand's audience and voice. Used as system prompt context for AI assists. Examples:
> "Verdant Wellness speaks to women 28–45 who care about functional ingredients but don't want sterile science branding. Our voice is warm and informed, never preachy. We assume curiosity and reward it with depth."

### 1.6 Taglines & Copy

**Primary tagline** — single line under the logo. "Performance from real ingredients."

**Secondary taglines / hero copy patterns** — array of approved short copy lines used across product pages, label backs, marketing. Examples:
- "Functional nutrition. Honest formulation."
- "Designed for the everyday athlete."

**Brand keywords pool** — words/phrases the brand uses (mirrors Voice tab brand keywords for cross‑surface reuse).

**Banned words / phrases** — array of words the brand will never use ("artisanal," "synergy," "leverage"). Design Studio flags these in any label copy creator writes; AI copy assists avoid them.

**Standard product description structure** (optional V1.5+) — template for how product descriptions are organized on this brand's product detail pages.

### 1.7 Usage Guidelines

This tab is mostly **generated** from the values above, with optional creator override.

**Logo spacing rules** (auto‑generated from minimumClearSpaceUnits) with visual examples.

**Color usage rules** — when to use primary vs accent vs background. Auto‑generated from semantic roles, editable.

**Typography hierarchy guide** — heading sizes vs body, when to use accent font. Auto from type scale, editable.

**Do / don't visual examples** — admin provides 4–6 generic do/don't templates that get filled with the brand's actual logo + colors. Examples: "Don't place logo on busy photo backgrounds without the inverse variant." "Don't combine more than 2 fonts." "Do maintain minimum spacing around logo." "Don't stretch or distort logo proportions."

**Accessibility notes** — automated WCAG check summary across all text/background pairs.

**Export brand book** — single button that renders all 7 tabs into a PDF brand guidelines doc. The creator can hand this to a contractor / agency / freelancer who's working on their brand outside the platform.

## 2. Schema additions

```prisma
// =============================================================================
// BRAND — augmented for full identity
// =============================================================================

model Brand {
  // ... existing fields (id, name, creatorUserId, operatingRegionId, etc.) ...

  // From Step 4 Quickstart (V1):
  brandStylePresetId    String?              // FK; null if built from scratch
  logoPrimaryAssetId    String?              // FK to Asset
  colorPaletteId        String?              // FK to ColorPalette (curated)
  customColors          Json?                // populated if no palette picked; { primary, secondary, accent }
  typographyPairId      String?              // FK to TypographyPair (curated)
  brandVoiceTags        String[]             // multi-select max 2 from styleTags vocab
  tagline               String?
  directionNotes        String?

  // From Brand Identity Studio (V1+):
  logoIconAssetId       String?              // FK to Asset
  logoHorizontalAssetId String?
  logoVerticalAssetId   String?
  logoMonogramAssetId   String?
  logoInverseAssetId    String?
  faviconAssetId        String?
  logoMinClearSpaceUnits Float @default(0.5)

  typographyAccentId    String?              // FK to TypographyFont (curated, single)
  typeScaleRatio        Float  @default(1.250)

  colorSystem           Json?                // 11 semantic roles { primary, secondary, accent, surface, background, textPrimary, ...}
  customPaletteOverride Boolean @default(false)

  photographyStyle      PhotographyStyle?
  illustrationStyle     IllustrationStyle?
  patternAssetIds       String[]             // Asset rows, kind=PATTERN
  heroImageAssetIds     String[]             // Asset rows, kind=HERO_PHOTO

  writingToneWords      String[]             // multi-select max 4
  brandKeywords         String[]             // free-text ~3-7 short phrases
  personaDescription    String?              // ~150 word paragraph

  secondaryTaglines     String[]
  bannedWords           String[]

  brandHealthScore      Int @default(0)      // computed: % of Studio fields completed
  brandBookExportedAt   DateTime?            // last time PDF brand book was generated

  // ... existing relations + new relations to BrandStylePreset, ColorPalette,
  //     TypographyPair, TypographyFont, Asset ...
}

enum PhotographyStyle { LIFESTYLE PRODUCT LAB INGREDIENT EDITORIAL NONE }
enum IllustrationStyle { LINE_ART FLAT HAND_DRAWN GEOMETRIC NONE }

// =============================================================================
// CURATED LIBRARIES — admin maintains
// =============================================================================

model BrandStylePreset {
  id                    String   @id @default(cuid())
  slug                  String   @unique
  name                  String                                    // "Modern Minimalist Wellness"
  description           String
  styleTags             String[]                                  // matches LabelDesignTemplate styleTags vocab
  recommendedColorPaletteId  String?
  recommendedTypographyPairId String?
  sampleLabelAssetId    String?                                   // preview image for picker
  sampleTagline         String?
  status                PresetStatus
  createdAt             DateTime @default(now())
  brandsUsing           Brand[]
}

enum PresetStatus { DRAFT ACTIVE DEPRECATED }

model ColorPalette {
  id                  String   @id @default(cuid())
  slug                String   @unique
  name                String                       // "Sage Serenity"
  description         String?
  styleTags           String[]                     // tags it's appropriate for
  colorSystem         Json                          // all 11 semantic roles
  contrastReport      Json                          // pre-computed WCAG ratios for each pair
  isCurated           Boolean @default(true)        // admin-curated vs user-custom
  status              PresetStatus
  brandsUsing         Brand[]
}

model TypographyPair {
  id                  String   @id @default(cuid())
  slug                String   @unique
  name                String                       // "Playfair + Source Sans"
  description         String?
  styleTags           String[]
  headingFontId       String                       // FK to TypographyFont
  bodyFontId          String                       // FK to TypographyFont
  recommendedRatio    Float @default(1.250)
  status              PresetStatus
  brandsUsing         Brand[]
}

model TypographyFont {
  id                  String   @id @default(cuid())
  family              String                       // "Inter", "Playfair Display"
  weight              String                       // "Regular", "Bold", "Black"
  style               String                       // "Normal", "Italic"
  source              FontSource                   // GOOGLE_FONTS | ADOBE | PRIVATE_LICENSED
  webfontUrl          String?                      // for browser rendering
  printFileAssetId    String?                      // OTF/TTF for label PDF rendering
  unicodeRanges       String[]                     // subset support
  licenseTerms        String                       // brief license summary for creator
  status              PresetStatus
}

enum FontSource { GOOGLE_FONTS ADOBE PRIVATE_LICENSED }
```

## 3. Brand Style Presets — V1 launch catalog

Admin curates ~12–15 presets at V1 launch, each combining color + typography + visual style + tagline pattern. Creator picks one in Onboarding Step 4 → 70% of brand identity auto‑populates.

**Launch catalog (proposed):**

| Slug | Name | Style tags | Recommended palette | Recommended type | Sample tagline |
|---|---|---|---|---|---|
| `modern-minimalist-wellness` | Modern Minimalist Wellness | minimalist + wellness | Sage Serenity | Inter Pair | "Functional. Calm. Real." |
| `bold-scientific-performance` | Bold Scientific Performance | bold + scientific | Lab Navy | Space Grotesk + IBM Plex Mono | "Performance, measured." |
| `playful-artisanal-snack` | Playful Artisanal Snack | playful + organic | Warm Earth | Caveat + Inter | "Snacks worth talking about." |
| `luxury-heritage` | Luxury Heritage | luxury + vintage | Forest Gold | Playfair Display + Source Sans | "Crafted since day one." |
| `clinical-evidence` | Clinical Evidence | clinical + scientific | Pristine Clinical | Source Sans + IBM Plex Mono | "Researched. Recommended." |
| `athletic-performance` | Athletic Performance | athletic + bold | Electric Energy | Recoleta + Inter | "Train. Fuel. Repeat." |
| `wellness-modern` | Modern Wellness | wellness + minimalist | Soft Beige Trio | Inter + Lato | "Wellness, simplified." |
| `organic-handmade` | Organic Handmade | organic + vintage | Kraft Natural | Caveat + Source Sans | "Made by hand, for hand." |
| `luxury-modern` | Luxury Modern | luxury + minimalist | Black & Gold | Playfair Display + Inter | "Quality without compromise." |
| `bold-playful` | Bold & Playful | bold + playful | Sunset Pop | Recoleta + Inter | "Bring on the day." |
| `scientific-modern` | Scientific Modern | scientific + minimalist | Lab White | Inter + IBM Plex Mono | "Backed by data." |
| `vintage-artisanal` | Vintage Artisanal | vintage + organic | Heritage Cream | Playfair + Source Sans | "An old recipe, refreshed." |

Each preset stores `recommendedColorPaletteId`, `recommendedTypographyPairId`, `styleTags`, and a `sampleLabelAssetId` (preview thumbnail showing what a sample product label looks like rendered with this preset). Picker UI shows the thumbnail grid in onboarding Step 4 + Studio "Apply preset" action.

**After picking a preset:** Brand gets fully populated, but creator can override any individual field in the Studio. Preset is just a starting point.

## 4. How Design Studio consumes Brand Identity

The reason this depth matters: every field above drives a specific Design Studio behavior, not just visual reference.

| Brand field | Design Studio behavior |
|---|---|
| `brandVoiceTags[]` | Auto‑filters LabelDesignTemplate gallery by `styleTags` overlap |
| `logoPrimaryAssetId` + variants | Auto‑inserted in label's brand zone; variant chosen by available space |
| `colorPaletteId` / `colorSystem` | Pre‑fills label color picks; enforces brand colors as defaults; WCAG flag on contrast fails |
| `typographyPairId` + `typeScaleRatio` | Pre‑fills label typography; type scale provides headline/body sizes |
| `tagline` | Pre‑fills the "Brand tagline" zone on label fronts |
| `bannedWords` | Lints any label copy creator writes; AI copy assists avoid these |
| `personaDescription` + `brandKeywords` | V2+ AI Template Generator prompt context for per‑brand styled generation |
| `patternAssetIds` | Available as background fills in label background zones |
| `logoMinClearSpaceUnits` | Enforced as minimum padding around logo in label layout engine |

So a creator who's invested in their Brand Identity Studio gets Design Studio that increasingly feels like "their tool" rather than a generic template editor. Per‑product label design becomes 10× faster because most decisions are already made at the brand level.

## 5. Brand health score

A computed percentage shown at the top of every Studio tab and on the brand switcher. Drives creator behavior toward completing their identity.

Components (weighted):
- Logo Suite — 20% (primary required + 2+ variants for full score)
- Typography — 15% (pair picked + accent + type scale ratio set)
- Color System — 20% (all 11 semantic roles populated; WCAG passes)
- Imagery — 15% (photography + illustration style + 3+ hero images)
- Voice & Tone — 10% (2+ tone words + 3+ keywords + persona description)
- Taglines & Copy — 10% (primary tagline + 2+ secondary)
- Usage Guidelines — 10% (logo spacing set + do/don't reviewed)

Score below 40% = "Brand Quickstart" badge (creator just did Step 4).
40–70% = "Refining" badge.
70–90% = "Polished" badge.
90%+ = "Brand Book Ready" badge — unlocks "Export brand book" PDF action.

Not gating — purely motivational. Even a 30% brand can ship products through Design Studio.

## 6. Multi-brand: Studio is per-brand

Each Brand row has its own Brand Identity Studio at `/creator/brand/[brandId]/identity`. Switching brands in the dashboard switches the entire identity context — including which Studio you're editing. No cross-brand sharing of identity assets by default (a creator with Verdant Wellness and Aurora Snacks has totally separate brand identities).

**Future V1.5+ feature:** "Clone identity from another brand" action lets a creator who wants to spin up a sub-brand or sister brand start from an existing brand's identity rather than from scratch or from a generic preset. Useful for creators building a brand family.

## 7. Roadmap

### V1
- Brand model fields: all Step 4 Quickstart + minimum Studio fields (logo primary, color palette / custom colors, typography pair, voice tags, tagline)
- Curated libraries: ~12 BrandStylePresets + ~30 ColorPalettes + ~20 TypographyPairs + ~60 TypographyFonts (all Google Fonts to start)
- Studio destination at `/creator/brand/[brandId]/identity` with all 7 tabs functional
- WCAG accessibility checker in Color System tab
- Brand health score
- Design Studio integration (filtering + asset pre-fill)

### V1.1
- Custom font upload (.woff2) — partner/creator can bring brand fonts not in the curated library
- Logo variant generator — AI generates icon-only / monogram / inverse variants from the primary logo via background-removal + color-isolation pipeline
- Pattern texture generator — AI generates brand-styled pattern repeats from brand voice + colors
- "Clone identity from another brand" for multi-brand creators

### V1.5
- Export brand book PDF (admin renders a templated brand guidelines doc populated with creator's values)
- Brand asset CDN distribution — assets uploaded once, served from edge for product detail pages + marketing
- Banned-word linter in Design Studio label copy + product description fields
- AI copy assists using personaDescription + brandKeywords as system prompt

### V2
- AI Template Agent per-brand styled generation — Template Generator (DESIGN_STUDIO.md §V2) takes the full brand kit and produces labels pre-styled for that brand. Creator's Design Studio gallery shows custom-to-them templates alongside curated.
- Brand consistency scorer — when creator's label diverges from brand standards (wrong colors, off-brand fonts), Design Studio surfaces a "Off-brand?" suggestion with one-click fix

### V3
- Multi-brand portfolio analytics — agency-style creators with 3+ brands get a portfolio overview dashboard
- Brand evolution timeline — version history of brand identity changes with date stamps and rationale
- Brand collaboration — invite a freelance designer / agency partner to edit the brand identity with audit trail

## 8. Open items

1. **Custom font upload V1.5 timing** — is .woff2 only enough, or do we need .otf + .ttf for label PDF rendering? **Default: .woff2 for web + .otf for print PDF; V1.5 ships both.**
2. **Typography curated library size** — start with ~20 pairs or ~50? **Default: ~20 at launch; expand based on creator picks.**
3. **Color palette curated library size** — start with ~30 palettes or ~50? **Default: ~30, weighted toward common brand archetypes.**
4. **Brand book PDF template** — single template or 3 (minimal / standard / extensive)? **Default: single template V1.5; offer variants V2.**
5. **Asset CDN strategy** — Cloudflare R2 + CDN for everyone, or premium tier feature? **Default: free for everyone V1.5; usage-billed if a brand exceeds GB.**

## 9. Changelog

- **2026-05-24** Spec written. Addresses Pavel's concern that Step 4 of Creator Onboarding (logo + 2-3 colors + 8-voice picker + notes) was undersized for real brand identity work. Splits into Quickstart (5–8 min in onboarding, captures minimum for Design Studio) vs full Brand Identity Studio (open-ended destination, 7 tabs, curated libraries of palettes/typography/presets, WCAG accessibility checker, brand health score, multi-brand-per-creator support via per-brand Studio routes). Brand Style Presets concept added — admin-curated complete starter kits (~12 at V1 launch) creator picks to auto-fill 70% of fields. Visual style multi-select max 2 replaces single-select to honor that real brands are blends (minimalist+scientific, wellness+luxury). Typography curated library V1 (no custom upload); custom font upload V1.5+. Direct integration with Design Studio template filtering via shared styleTags vocab + asset pre-fill on label rendering.
