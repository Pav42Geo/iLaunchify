# Marketplace Audit — 2026-06-01

**Scope:** the public marketing-app marketplace surfaces (`apps/marketing/src/app/marketplace`, `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]`, `apps/marketing/src/app/launch/[niche]`) against the locked `MANUFACTURER_PRODUCT_BUILDER.md`, `MARKETPLACE_DESIGN.md`, and Pavel's 2026-06-01 product-plan additions (labelingType, ProductTemplatePricingTier, Niche taxonomy, PackagingSystem.coPackerServiceId).
**Method:** read-only. No code changed.
**Author:** audit pass — paired with the in-flight schema additions a sibling agent is wiring.

---

## §1 Current marketplace surfaces — what's there

**Routes that exist (note: detail route is `[category]/[subcategory]/[slug]`, not `[templateSlug]` as the prompt suggested — the deeper route has shipped):**

- `apps/marketing/src/app/marketplace/page.tsx` (L47–207) — landing: HeroBanner island + `MarketplaceFilters` left rail + `MarketplaceControlsBar` (sort) + `ActiveFilterChips` + Trending row + 4 category rows + Quick-to-launch row + newsletter CTA. Server-loads via `getMarketplaceTemplates()` / `getTrendingTemplates()` / `getQuickLaunchTemplates()` / `getCatalogCount()` (`apps/marketing/src/lib/templates.ts`). DB-first with sample-data fallback (`apps/marketing/src/lib/sample-templates.ts`).
- `apps/marketing/src/app/marketplace/[category]/page.tsx` (L36–136) — same shell, scoped to a category.
- `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` (L43–241) — detail page: 3-column hero (`DetailGallery` + `ProductDetailConfigurator` + `CustomizeRail`), CertStrip inside col 1, bento section (Customization + Material/properties), 5-tab content (Description / Recipe & Nutrition / Ingredients / Compliance / Packing), Related rail. Detail rows pulled from `findTemplateDetail()` in `apps/marketing/src/lib/template-detail.ts` — fully hand-authored sample data.
- `apps/marketing/src/app/launch/[niche]/page.tsx` (L16–114) — niche landing: gradient hero + subcategory chip grid (all "Coming soon" stubs) + curated row that is **literally `CATEGORY_ROWS.flatMap(...).slice(0,10)`** with no real niche filter applied.
- Shared `packages/ui`: `ProductCard.tsx`, `HeroBanner.tsx`, `CertStrip.tsx`, `PricingTierModal.tsx` (+ `pricing-tier-data.ts` helper).

---

## §2 Gap matrix — plan vs. marketplace

| Plan element | Today's marketplace coverage | Status |
|---|---|---|
| `ProductTemplate.labelingType` → Nutrition vs. Supplement vs. Pet-Facts panel render on detail page | Only `NutritionFactsRenderer` (assumes Supplement Facts) at slug page L407. No branching by labeling type. `template-detail.ts` has no `labelingType` field. | **missing — blocked-on-schema** |
| `ProductTemplatePricingTier` (per-quantity tiers wired to PricingTierModal + MOQ table) | `PricingTierModal` exists and renders, but its rows come from `buildSamplePricingRows(basePrice)` in `pricing-tier-data.ts` — **purely synthetic scaling of one number**. `ProductDetailConfigurator.tsx` L65 wires it. No DB read of `ProductTemplatePricingTier`. | **partial — UI shipped, data hard-coded** |
| Niche taxonomy (`Niche` + `ProductTemplateNiche`) → drives `/launch/[niche]` feed + marketplace filter chips | `lib/niches.ts` is a hand-coded array of 8 niches. `/launch/[niche]` ignores its own slug for the curated feed (just slices the global pool). `?niche=` query param on `/marketplace` is acknowledged as "informational pill" only (page.tsx L60-64). Sidebar has no niche filter chips. | **missing — hardcoded fixture, no DB join** |
| `ProductTemplatePackagingSystem.coPackerServiceId` → "Fulfilled by {co-packer}" + multi-partner approval surfacing | Zero co-packer presence on detail page. `PackagingPicker` shows name/leadTime/priceDelta only. No partner-attribution row anywhere. | **missing — blocked-on-schema** |
| Flavors as `FlavorPreset` (swatch + slot resolution + per-flavor allergen impact + priceDelta) | `FlavorSwatch` renders flavor color + name only. No slot resolution shown to creator, no per-flavor allergen warning, no `priceDelta` math applied to the configurator (configurator price is base × band × size × packaging — flavor is purely cosmetic). | **partial — visual only, no semantics** |
| Ingredient sourcing badges (USDA / Curated / Partner-private) on the Ingredients tab | `IngredientsTabInner` renders base ingredients with swap/add-on UI but **no source badges**. The `Source` enum from §4a.1 of the product plan is invisible to creators. | **missing** |
| Allergen Big-9 contains line | Detail page L391-400 renders a `flex-wrap` of allergen pills derived from `ingredients[].allergens` arrays. No structured "Contains:" callout matching FDA format. Cross-contamination statement absent. | **partial — pills only, no Contains: line, no cross-contam** |
| FDA Bioengineered (BE) disclosure on label / detail page | No surface anywhere. `bioengineeredStatus` field never surfaces. | **missing — blocked-on-schema-rollup** |
| Certificate stack with expiry + verified-by-iLaunchify badge | `CertStrip` (compact) renders inside the gallery col with icon + name + optional qualifier. No expiry awareness, no "Verified by iLaunchify on [date]" tooltip, no path-conditional dashed badge (CertStrip supports `unconditional?: boolean` but detail page passes `unconditional: tag.organic ?? false` — wrong semantics). No 3-tier `CertificateType` / `PartnerCertificateInstance` / `ProductCertificate` join surfaced. | **partial** |
| Partner tier badge ("Premier-tier · 18-day lead") | Hard-coded string "Premier-tier" on detail page L123. Not wired to `PartnerTier`. | **partial — fake string** |
| MOQ-aware filters | `MarketplaceFilters` sidebar has MOQ slider (`apps/marketing/src/lib/templates.ts` `moqMax`). Wired through Prisma `variants.some.moqMin.lte`. Working at variant grain. | **OK (for variant.moqMin)** |
| Partner region / market scope filter | `MARKETPLACE_DESIGN.md §7` requires Market filter (US/CA/EU). Not in the sidebar today. No `marketIds[]` join exposed. | **missing — blocked-on-schema-rollup (Market FK present, UI absent)** |
| Marketplace 4-layer category architecture (Creator Niches / Product Categories / Manufacturing Formats / Discovery Tags) | Sample sidebar only has Diet + MOQ + textbox-style chips. CATEGORY_ROWS uses a flat `categorySlug` against legacy `Category/Subcategory`. None of the four locked taxonomies (`CreatorNiche`, `ManufacturingFormat`, `DiscoveryTag`, refined `ProductCategory`) drive rendering. | **missing — blocked-on-M1 schema migration** |
| Logged-out gating (Pavel §9 — hide pricing + MOQ values from logged-out) | Detail page shows landed cost + MOQ values regardless of auth. `isAuthenticated` flag only changes the CTA destination (configurator L42-44). Logged-out visitors see "Start launching" prices. | **missing** |
| Variant matrix table (§8 "Customization options" below the fold) | Customization bento card is prose only ("Label + recipe"); no actual variant matrix table. | **missing** |
| Production paths section (Mode 4 upgrade hints) | Not rendered. Pavel's orchestration thesis Mode 4 nudges have no V1 surface here. | **missing — V2 per spec** |
| Compliance tab — Reminder + design area + picture request | Compliance tab L418-442 has copy ("designReminder", "pictureRequest") rendered from `template-detail.ts`. Useful but not aware of `labelingType`. | **partial** |
| Packing specs table | Packing tab (L444-486) renders well from `detail.packingSpecs[]`. No relation to `PackagingSystem`/`PackagingSurface` from product builder schema. | **partial — sample data, not wired to PackagingSystem** |
| Auto-pricing footnote vs. creator's quantity (PricingTierModal §8) | Footnote logic exists in `PricingTierModal.tsx` L83-98. Works with synthetic rows. Will continue working when `ProductTemplatePricingTier` lands — just swap the rows source. | **OK (mechanism), partial (data)** |
| Re-approval rule surfacing (none expected on public marketplace) | n/a | n/a |
| Status pill on card (bestseller / new / fast-ship / low-moq / top-rated / popular) | Hard-coded in sample-templates.ts; DB mapper doesn't derive these. | **partial** |

---

## §3 Concrete missing pieces — ranked

1. **Wire `ProductTemplatePricingTier` into `PricingTierModal` and the configurator** — `apps/marketing/src/components/ProductDetailConfigurator.tsx` (L65 `buildSamplePricingRows`) + `packages/ui/src/components/pricing-tier-data.ts`. Replace `buildSamplePricingRows(basePrice)` with a server-loaded `getPricingTierRows(templateId, packagingSystemId, sizeKey)`. The modal already consumes the right shape — this is a data-layer swap. **M.** Has biggest visible impact on perceived professionalism.

2. **Branch label render by `labelingType`** — `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` `RecipeNutritionTab` L378-416. Today it always renders `NutritionFactsRenderer` with `data={detail.nutrition}`. Add a switch: `FOOD` → NutritionFactsRenderer; `DIETARY_SUPPLEMENT` → existing renderer w/ supplement headers; `PET_PRODUCT` → AAFCO-style guaranteed-analysis panel; `OTC`/`COSMETIC` → minimal/no panel. Pet-Facts panel doesn't exist yet in `packages/ui` (open question §5). **L.**

3. **Real Niche taxonomy → `/launch/[niche]` curated feed + marketplace filter chip** — replace `lib/niches.ts` fixture with Prisma `Niche` rows. Build a `getTemplatesForNiche(slug)` server helper that joins `ProductTemplateNiche`. Update `apps/marketing/src/app/launch/[niche]/page.tsx` L26 (`CATEGORY_ROWS.flatMap(...).slice(0, 10)`) to use it. Add a niche chip group to `MarketplaceFilters.tsx` reading from `Niche`. **M.**

4. **Co-packer attribution line on detail page + packaging picker** — when `PackagingSystem.coPackerServiceId` is non-null, render a "Fulfilled by {service.displayName}" subline beneath the chosen packaging option in `PackagingPicker` and in the order-summary area on the detail page. Wire as nullable so the no-co-packer case (manufacturer ships direct) renders nothing. Tie into multi-partner approval signal in `ProductDetailConfigurator` (a chip: "Routes through {n} partners"). **M.**

5. **Real `Big-9 Contains:` line + cross-contamination statement on Recipe & Nutrition tab** — replace the flex-wrap of pills (L391-400) with a structured "Contains:" callout above the ingredient list. Pull `allergenCrossContamination` from `ProductTemplate`. Surface manual overrides if any. **S.**

6. **Ingredient source badges on the Ingredients tab** — `IngredientsTabInner.tsx` + `IngredientsList` in `packages/ui`. Add a small (USDA · Curated · Private) badge after each ingredient name. Backing field already lives on the `Ingredient` row (`source` enum from W2-IP1). **S.**

7. **Logged-out gating on price/MOQ values** — the detail page renders landed cost + tier modal trigger to anyone. Per `MARKETPLACE_DESIGN.md §9`, gate `Landed cost` block + `See pricing by tier` link + MOQ numeric values behind `isAuthenticated`. The flag is already threaded (L141). Cards currently show price-per-unit and MOQ regardless — gate the numeric cells too. **S.**

8. **Certificate stack from `ProductCertificate` join + expiry awareness** — `CertStrip` in detail-page gallery currently maps `template.tags` (which are sample-data Diet/Cert chips) and incorrectly equates `unconditional` with `tag.organic`. Pull from `ProductCertificate` → `PartnerCertificateInstance` → `CertificateType`, hide instances past `expiryDate`, mark path-conditional certs dashed. **M.**

9. **Partner tier badge wired to real `PartnerTier`** — replace the literal `"Premier-tier · {leadTime}-day lead"` string at L123. Compute from the selected packaging's owning partner. **S.**

10. **Variant matrix table under "Customization options"** — the prose bento card at L170-178 should be a real `flavor × size × packaging × tier` matrix per `MANUFACTURER_PRODUCT_BUILDER.md §9` (read-only). Generate from `FlavorPreset[] × ProductTemplatePackaging[]`. **M.**

11. **Bioengineered disclosure + ingredient grouping line under the panel** — V1.1-ish but the schema is shipped (task #143). Surface "Contains a bioengineered food ingredient" line when any ingredient in the resolved recipe has `BIOENGINEERED`/`DERIVED_FROM_BIOENGINEERED` status. **S.**

12. **MOQ-aware filter floor + market scope filter in sidebar** — sidebar has MOQ slider; add a Market chip group (US/CA/EU) gated by `BrandTargetMarket` once V1.1+ activates. Quick win: render the chip group disabled w/ tooltip "US-only at V1" so the affordance shows. **S.**

---

## §4 Suggested next build order

1. **Pricing data swap (item §3.1)** — smallest unit of value with most visible polish. The UI is shipped, just point at `ProductTemplatePricingTier`. Lets Pavel demo "real tier pricing" end-to-end.
2. **Co-packer + partner attribution (§3.4 + §3.9)** — pair them: both come from joining the chosen `PackagingSystem` → owning `Partner` → `PartnerTier`. One server helper, two render sites.
3. **Allergen + ingredient-source surfaces (§3.5 + §3.6)** — both feed off the Ingredient row that the sibling schema work is already landing. Cheap to ship together and elevate the "feels regulated" perception.
4. **Niche taxonomy wiring (§3.3)** — once the `Niche` + `ProductTemplateNiche` rows are seeded, replace the niches.ts fixture and the `slice(0, 10)` hack in `/launch/[niche]`. Add a sidebar niche chip group at the same time.
5. **Logged-out gating + cert stack from DB (§3.7 + §3.8)** — bundle the auth-gating sweep with the cert-stack rewrite because both touch the same DetailGallery / configurator block.
6. **Labeling-type render branch + variant matrix (§3.2 + §3.10)** — heavier lift; do after the data-layer foundation above is real. Pet-Facts panel scope is the open Q in §5 below.

---

## §5 Open questions for Pavel

- **Pet-Facts / AAFCO panel for `labelingType=PET_PRODUCT` in V1?** No renderer exists in `packages/ui` today. V1 punt = "Pet listings render no facts panel, with a `Pet products use a different label format` callout" — or do you want a real AAFCO Guaranteed Analysis renderer for V1? (Cosmetics + OTC raise the same question — V1 = panel hidden, or stub renderer?)
- **Logged-out gating granularity** — `MARKETPLACE_DESIGN.md §9` says hide pricing + MOQ values + lead time + production paths. Cert badges + variant matrix stay public. Confirm we should also hide the `Earnings calculator` from logged-out visitors (it's currently visible).
- **Co-packer name visibility** — `ilaunchify-business-model.md` says partner identity stays hidden behind the orchestration layer. Does "Fulfilled by {co-packer.displayName}" actually expose partner identity to creators, or do we surface a neutral string like "Fulfilled through iLaunchify's co-packing network"? If neutral, the `coPackerServiceId` is just internal routing info — no public surface beyond a small chip indicating "multi-partner workflow."
- **Variant matrix table size** — for a template with 5 flavors × 3 sizes × 2 packagings = 30 rows × 3 tier columns = 90 cells. Do we render the full Cartesian (Pavel's variant table screenshot pattern) or collapse to a price-band-per-size summary on the public page and reserve the full matrix for `/admin/products/[id]`?
