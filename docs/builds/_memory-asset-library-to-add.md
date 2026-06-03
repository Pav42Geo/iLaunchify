# Memory file to add — Pavel, drop into `.claude/memory/`

Cowork can't write into `.claude/memory/` (protected path). Copy block below into:

`.claude/memory/ilaunchify-asset-library-pattern.md`

Plus the index entries at the bottom.

---

## File — `.claude/memory/ilaunchify-asset-library-pattern.md`

```markdown
---
name: ilaunchify-asset-library-pattern
description: "Asset Library scope: certs + packaging symbols + labeling symbols under unified schema family. Admin-curated approved variants per asset (color/B&W/contentual sub-variants). Filtered drawer in Design Studio (partner availability + product category + market + substrate axes). Canvas object rules (aspect lock + color lock + size enforcement + clear-space + required co-text auto-pair). NEVER auto-stamp; per-cert consent via C6."
metadata:
  type: project
---

The platform's approach to managing certification badges, packaging symbols, and labeling symbols. Locked 2026-06-01 after the conversation about size rules, multi-placement, variant management, and filtered drawer.

## Scope — three asset families under unified pattern

- **Certificate badges** — USDA Organic, Non-GMO, Kosher, Vegan, Fair Trade, etc.
- **Packaging symbols** — Resin Recycling Codes 1-7, Green Dot, How2Recycle, BPI Compostable, FSC, recycling triangle, etc.
- **Labeling symbols** — "Refrigerate after opening", country-of-origin marks, allergen icons, Prop 65 warnings, BE disclosure mark, "Distributed by" attribution, etc.

All three use the same admin curation pattern + same creator picker pattern + same canvas enforcement rules. Don't fragment them.

## Schema family

- `CertificateAssetVariant` (per `CertificateType`) — color/B&W/outline + contentual sub-variants like OU-D, 100% Organic
- `PackagingSymbol` + `PackagingSymbolVariant` — with `applicableSubstrates` (PET/glass/aluminum/paper) + `applicableMaterials` (bottle/pouch/folding-carton) + `applicableMarkets` + `requiredWhen` / `recommendedWhen` rules
- `LabelingSymbol` + `LabelingSymbolVariant` — same shape

Each variant carries:
- SVG file (R2)
- Raster preview (PNG thumbnail)
- `minWidthMm` + `maxWidthMm` per cert body brand standards
- `approvedColorSpec` (Pantone / CMYK / RGB)
- `requiredCoText` (e.g., USDA Organic requires "Certified by [agent]")
- `clearSpaceFactor` (e.g., 0.25 = 25% of width clear on all sides)
- `aspectRatioLocked` (always true for cert marks)
- `brandGuidelinesUrl`

## Filtered drawer in Design Studio (the load-bearing UX)

Context-aware filtering across 4 axes — drawer ONLY shows assets where ALL apply:

1. **Partner availability** — only certs the partner has VERIFIED `PartnerCertificateInstance` for
2. **Product category fit** — `CertificateType.applicableCategorySlugs` matches product subcategory
3. **labelingType fit** — matches FOOD / SUPPLEMENT / COSMETIC / etc.
4. **Market fit** — `applicableMarketSlugs` includes one of the product's `BrandTargetMarket` rows
5. **Packaging substrate fit** — for symbols only — `PackagingSymbol.applicableSubstrates` matches selected packaging substrate

Empty state gets meaningful messaging — not "no items" but "No certificates apply to this product / packaging combination. Your partner doesn't hold certs valid for [category]. They can request to add new cert types in their Partner dashboard."

## Compliance scanner extensions

- Flag missing REQUIRED symbols (e.g., plastic bottle in CA missing Resin Code per SB 343)
- Flag missing required attributions (e.g., "Distributed by" per 21 C.F.R. §101.5)
- Flag asset placed outside primary display panel when PDP-required
- Flag off-size assets (below min or above max per variant)
- Flag aspect-ratio violations (shouldn't happen with canvas lock)
- Flag missing required co-text (e.g., USDA Organic without "Certified by [agent]")

Existing infrastructure (`scanLabelCompliance`, `autoDetectLabelSections`) extends naturally.

## Canvas object rules (Design Studio enforcement)

Per asset object on the canvas:

- **Aspect ratio LOCKED** at drop time. Cannot be stretched / squished.
- **Color modification LOCKED.** Variant choice (Color / B&W / Outline) is the only re-color path. No custom color picker.
- **Size enforced** — refuse resize below `minWidthMm` or above `maxWidthMm`.
- **Clear space enforced** — refuse placement of other objects within `clearSpaceFactor × width` zone around the asset.
- **Required co-text auto-paired** — text object linked to badge; cannot orphan; must move together; must meet font-size minimums.
- **Required content vs PDP zone** — if asset has `requiredOnPDP: true`, compliance scan flags placement outside PDP.

## Consent-at-Claim — non-negotiable

Per memory `ilaunchify-cert-liability-pattern`: NEVER auto-stamp. Every cert badge added to a label requires per-cert affirmative consent via the consent modal. The asset library makes badges AVAILABLE; the consent flow gates each USE.

## Multi-placement

Real packaging often carries the same cert on multiple panels (front for marketing, back for formal attribution block). The consent modal fires ONCE per cert type added to the design, regardless of how many times it's placed on the canvas. Compliance scanner can flag "missing instance in primary display zone" if creator placed it only in secondary panels.

## Variant research

A one-time task per cert type — admin or contractor sources approved SVG variants from each cert body's brand standards document, records metadata per the schema above. See `docs/builds/certificates-variant-research-spec.md`. Decoupled from build sequence — can run in parallel with C7/C8.

## Trademark + license-fee posture

See `docs/legal/LEGAL_AUTHORITIES.md` §13. Default posture is Option B (platform hosts library; partners use under their existing cert-body license). Some certs (notably Non-GMO Project) may require Option C (platform-level license negotiation) or fall back to Option A (partner uploads their own artwork). Counsel confirms per cert before going live.

## See also

- `docs/builds/_certificates-roadmap.md` — full slice plan
- `docs/builds/certificates-c7-asset-library.md` — admin curation slice (when written)
- `docs/builds/certificates-c8-design-studio-asset-rules.md` — design studio enforcement slice (when written)
- `docs/builds/certificates-variant-research-spec.md` — contractor research brief
- `docs/legal/LEGAL_AUTHORITIES.md` §13 — trademark + license-fee considerations
- [[ilaunchify-cert-liability-pattern]] — consent-at-claim + no auto-stamp rule
- [[ilaunchify-certificates-declare-only]] — cert module scope lock
```

---

## Append to `.claude/memory/MEMORY.md` (Project context section)

Add this line near the bottom of `## Project context`:

```
- [Asset library pattern — certs + packaging + labeling symbols](ilaunchify-asset-library-pattern.md) — Admin-curated approved SVG variants per asset (color/B&W/contentual sub-variants). Filtered Design Studio drawer (partner availability + product category + market + substrate). Canvas object rules (aspect lock + color lock + size enforcement + clear-space + required co-text). NEVER auto-stamp.
```

---

## Append to `.claude/memory/INDEX.md` under `### Phases`

```
- `ilaunchify-asset-library-pattern.md` — Asset library scope + filtered drawer + canvas enforcement rules
```
