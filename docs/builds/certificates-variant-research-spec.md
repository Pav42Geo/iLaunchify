# Cert Variant Research Spec

Contractor / admin research brief for sourcing approved cert variants to populate the C7 Asset Library. Read `_certificates-master-catalog.json` first for the universe of ~85 cert types we're curating.

**Purpose:** for each cert type in our master catalog, source the official approved SVG variants from the certifying body's brand standards + capture metadata per `CertificateAssetVariant` schema. Feeds the C7 admin bulk import.

**Lift estimate:** ~15-30 minutes per cert × 85 certs = ~22-40 hours. Plan as a 1-2 week contractor task or distributed admin work.

**Deliverable:** one `cert-variants.json` file matching the schema below, plus a `variants/` folder of SVG files named by slug.

## Per-cert research checklist

For each `CertificateType` slug in `_certificates-master-catalog.json`:

### 1. Locate the brand guidelines

Most cert bodies publish a brand standards / logo usage / brand guidelines document. Typical paths:

- USDA Organic: https://www.ams.usda.gov/services/organic-certification/organic-seal
- Non-GMO Project: https://www.nongmoproject.org/contact/use-of-the-non-gmo-project-verified-mark/
- Kosher OU: https://oukosher.org/use-of-the-ou-symbol-policy/
- Fair Trade USA: https://www.fairtradecertified.org/business/the-mark
- B Corp: https://www.bcorporation.net/en-us/certification/marketing-guidance/
- USP Verified: https://www.usp.org/verification-services/quality-marks
- ECOCERT COSMOS: https://www.cosmos-standard.org/standard
- Climate Neutral: https://www.climateneutral.org/style-guide

If the cert body doesn't publish public brand standards, contact them directly (`brand@xyz.org` or `licensing@xyz.org` are common addresses).

Capture:
- `brandGuidelinesUrl` (public link if available)
- Date the guidelines were retrieved
- Any license-fee or registration prerequisites noted

### 2. Download approved variants

Most cert bodies provide a downloadable logo kit. Variants to look for:

**Visual variants:**
- Full-color (RGB / CMYK / Pantone)
- 1-color black (for B&W printing)
- 1-color reversed white (for dark backgrounds)
- Outline / line-art (for very small placements)

**Contentual variants (where applicable):**
- USDA Organic: "100% Organic" / "Organic" / "Made with Organic [ingredient]"
- Non-GMO Project: with vs without product-name slot
- Kosher: plain mark / OU-D (dairy) / OU-P (Passover) / OU-Pareve / OU-Glatt
- Fair Trade USA: "Fair Trade Certified" vs "Fair Trade Ingredients"
- USP: "Verified" mark vs "USP Verified Dietary Supplement"
- B Corp: with vs without "Certified B Corporation" descriptor

**Aspect ratios:**
- Square (most common)
- Horizontal (logo + text laid out left-to-right)
- Stacked (logo above text)
- Vertical

Save each variant as an SVG file named `{certSlug}-{variantKind}-{contentualVariant?}.svg`, e.g.:
- `usda-organic-color-100-percent.svg`
- `usda-organic-color-organic.svg`
- `usda-organic-color-made-with-organic.svg`
- `usda-organic-black-organic.svg`
- `usda-organic-reversed-white-organic.svg`
- `kosher-ou-color-default.svg`
- `kosher-ou-color-dairy.svg`
- etc.

### 3. Capture metadata per variant

For each SVG variant, record in the output JSON:

```json
{
  "certificateTypeSlug": "usda-organic",
  "name": "USDA Organic — 100% Organic — Full color",
  "slug": "usda-organic-color-100-percent",
  "variantKind": "COLOR",
  "contentualVariant": "100-percent-organic",
  "svgFilename": "usda-organic-color-100-percent.svg",
  "minWidthMm": 12.7,
  "maxWidthMm": null,
  "approvedColorSpec": "Pantone 348 C green / Pantone 1535 C brown / 4-color CMYK equivalents acceptable per NOP brand standards",
  "requiredCoText": "Certified Organic by [certifying agent name]",
  "clearSpaceFactor": 0.25,
  "aspectRatioLocked": true,
  "isOfficialVariant": true,
  "brandGuidelinesPage": "page 8 of USDA NOP Brand Standards document v3.2",
  "applicableProductionMethods": ["digital", "offset", "flexographic"],
  "displayOrder": 1,
  "notes": "Must be paired with certifying agent attribution. Cannot be used on products that are not certified at 100% organic content per 7 CFR §205.301(a)."
}
```

### 4. Verify license terms

For each cert body, capture:
- Is the cert mark a registered trademark? (Most are — verify USPTO TESS)
- Does the certifying body require platform-level licensing for software that renders the mark?
- Does the partner's certification implicitly license the mark for use in normal commercial labeling?
- Any geographic license restrictions?

Flag any cert where the answer to question #2 is YES — those need lawyer-led licensing conversations BEFORE going live in the iLaunchify asset library. Likely candidates: Non-GMO Project (licensing model), some kosher bodies (registration required), Fair Trade USA (per-product licensing).

### 5. Output format

Single JSON file at `docs/builds/_certificates-variants-catalog.json`:

```json
{
  "$schema": "iLaunchify Certificate Variant catalog v1",
  "version": "2026-06-01",
  "researchedBy": "[Name]",
  "variants": [
    { /* per-variant object as above */ }
  ],
  "licenseConcerns": [
    {
      "certSlug": "non-gmo-project-verified",
      "concern": "Platform license likely required for software-rendered use; needs Non-GMO Project legal contact",
      "contactSuggestion": "licensing@nongmoproject.org"
    }
  ]
}
```

Plus the `variants/` folder with all SVG files named per the slug pattern.

## Priority order

Start with the 20 highest-frequency certs (most likely to appear on first beta cohort products):

1. usda-organic (all variants — most contentually complex)
2. non-gmo-project-verified
3. cgmp-food + cgmp-supplement
4. kosher-ou (with all sub-variants)
5. vegan-action
6. gfco-gluten-free
7. fair-trade-usa
8. b-corp
9. climate-neutral
10. nsf-certified-sport
11. usp-verified
12. ecocert-cosmos-organic
13. leaping-bunny
14. ewg-verified
15. mocra-compliant
16. aafco
17. clean-label-purity
18. made-safe
19. rainforest-alliance
20. whole30-approved

These 20 cover ~80% of expected beta-cohort cert usage. After they're loaded, batch the remaining 65 over a few weeks.

## Quality bar

- SVGs must be the OFFICIAL marks from the cert body, not redrawn approximations.
- Color values must match published Pantone / CMYK / RGB specs exactly.
- Brand guidelines URLs must point to the live, current document (not cached / archived versions).
- Sub-variant flags (OU-D, 100% Organic, etc.) must be CAPTURED separately — they are not interchangeable.
- Required co-text must be transcribed verbatim from brand standards.

## What this does NOT include

- Packaging symbols (Resin Codes, How2Recycle, BPI Compostable, etc.) — separate research task, same shape.
- Labeling symbols (Refrigerate after opening, Allergen icons, Prop 65 warnings, BE disclosure mark) — separate research task.
- Mandatory regulatory text (Nutrition Facts panel template, Supplement Facts panel template) — already in the Design Studio per DS-49 Label drawer.

## Hand-off

When the catalog + variants/ folder is complete, hand to admin for:
1. Counsel review of the `licenseConcerns` section
2. Upload via the C7 bulk import path (admin pastes JSON or uploads file)
3. SVG files staged in R2 by the import action
4. QA pass on the first 10 admin-rendered variants (admin verifies they look right in the iLaunchify Design Studio canvas at min, default, and max sizes)
