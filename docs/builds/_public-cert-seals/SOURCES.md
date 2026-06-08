# Public / government certification seals — local copies

Fetched from official government sources at the user's request (the "public seals
only" path). These are GOVERNMENT-PUBLISHED marks, NOT private trademarks — but
they still carry usage rules: each may only appear on a product that is actually
certified under the corresponding program. Do not wire these into the studio as
generally-placeable artwork; they go through the same admin cert pipeline +
consent-at-claim gating as any other mark.

Official sources provide EPS (vector master) + JPG (raster). They do NOT publish
SVG or PNG. No EPS→SVG / JPG→PNG converter is installed locally (no ImageMagick /
Inkscape / Ghostscript), so SVG/PNG were not generated — install one of those and
I can convert, or convert the EPS (vector) yourself.

## USDA Organic  (slug: usda-organic)
- Source: https://www.ams.usda.gov/rules-regulations/organic/organic-seal
- Files: color + B&W EPS (vector), color JPG (raster), plus the ®-registered
  variants (suffix `-R`).
- Usage: 7 CFR 205.311. Only for products certified under the USDA National
  Organic Program. Read "Using the Organic Seal" before any use.

## EU Organic (Euroleaf)  (slug: eu-organic)
- Source: https://agriculture.ec.europa.eu/farming/organic-farming/organic-logo_en
- Files: 6 EPS variants (vector: colour / one-colour light+dark, each ± outer
  line), 7 JPG variants (raster), + the official user manual (PDF).
- Usage: mandatory on pre-packaged EU organic food meeting the rules; governed
  by the EU organic logo user manual (clear-space, min size, colours).

## NOT publicly available (gated — certification + login required)
- Canada Organic (CFIA) — distributed only via accredited certification bodies.
- USDA BioPreferred / Certified Biobased — label graphic behind eAuthentication
  login for certified companies (only the brand-guide PDF is public).

## Everything else in the platform's 89-cert catalog
Private trademarks (Non-GMO Project, NSF, Kosher OU/OK/Star-K, Halal IFANCA,
Fair Trade, Rainforest Alliance, …). Artwork must be obtained from each issuing
body under a trademark license — see each cert's issuingBodyUrl in
docs/builds/_certificates-master-catalog.json.
