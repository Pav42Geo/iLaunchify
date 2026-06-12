# Product Domains — architecture + phased plan

Status: PROPOSED (2026-06-11). Author: Cowork, at Pavel's request.
Supersedes the implicit "everything is a food Recipe" assumption in the
turnkey builder. Read alongside `MANUFACTURER_PRODUCT_BUILDER.md`,
`MARKETPLACE_DESIGN.md`, and the nutrition-engine memory.

## The problem

Today the whole product builder is built around **Food**: the step is called
"Recipe", ingredient search hits **USDA**, the live label is a **Nutrition
Facts** panel, and the product types are food/beverage packs. But a creator
making a **supplement**, a **cosmetic**, a **pet** product, or an **infant**
product lives in a different regulatory world — different terminology, a
different ingredient database, a different label, different product types, and
different compliance rules. Renaming the label is not enough; the *whole flow*
must adapt to the domain.

This doc defines **Product Domain** as a first-class concept and a phased path
to ship Supplement → Cosmetic → Pet → Infant without rewriting the builder each
time.

## Review findings (2026-06-11) — the substrate already exists

A code review before building turned up that **most of "Phase 0" is already in
the schema** — this is good news and shrinks the work:

- `enum LabelingType { FOOD, DIETARY_SUPPLEMENT, PET_PRODUCT, OTC, COSMETIC }`
  already exists, and `ProductTemplate.labelingType` (`@default(FOOD)`) already
  carries it. Its schema comment states it drives **both** the compliance rule
  pack **and** which Facts panel renders. **This IS the "domain" field — do not
  add a new `domain` enum.** The registry keys on `labelingType`.
- It's already **derived-from-category with a lock** (the 2026-06-07 SoI/SKU/
  label-lock decision): the panel regime is computed from the category, and an
  admin can hand-override. So "category-driven auto-format" is already the
  intended model — we just need the builder to honor it.
- The **13 locked categories already span domains** (`mainCategory` =
  Food / Beverages / Supplements / Other; category #9 Supplements, #10 Cosmetics
  & Personal Care). So adding supplement/cosmetic does **not** break the locked
  taxonomy — `labelingType` is intentionally **per-product**, not per-category
  (a "Beverage" can be a food RTD juice or a supplement RTD shot).
- There's a **6th regime already anticipated: OTC** (21 CFR 201.66 Drug Facts) —
  heavily regulated; treat like infant formula (defer / enterprise).
- **Infant/Baby is NOT a separate `labelingType`.** Baby food = `FOOD` +
  the **infant RACC** table (already in the "Find serving" modal) + infant DVs.
  Infant *formula* (21 CFR 107) is its own beast → defer.

**Naming reconciliation needed:** the builder currently passes
`'FOOD' | 'SUPPLEMENT' | 'COSMETIC'`; the enum uses `DIETARY_SUPPLEMENT` /
`PET_PRODUCT`. Align the builder + GuidedBuilder toggle to the real enum values.

**Net effect:** Phase 0 is no longer "add schema" — it's "**build the domain
registry keyed on the existing `labelingType`, wire the builder to read it, and
align the naming**." Lower risk than first written.

## The five domains (researched)

| Domain | Step name | Ingredient source | Label artifact | Reg basis |
|---|---|---|---|---|
| **Food / Beverage** | Recipe | USDA FoodData Central | Nutrition Facts | 21 CFR 101.9 |
| **Supplement** | Formulation | **NIH DSLD** (+ USDA for food-form nutrients) | **Supplement Facts** | 21 CFR 101.36 (DSHEA) |
| **Cosmetic** | Formulation | **INCI** dictionary | **Ingredient (INCI) declaration** — no facts box | 21 CFR 701 + MoCRA |
| **Pet** | Formulation / Formula | AAFCO feed library | **Guaranteed Analysis** + nutritional-adequacy statement | AAFCO Model Regs |
| **Infant / Baby** | Recipe (baby food) / Formula (formula) | USDA + infant nutrient set | Nutrition Facts w/ **infant RACC** (baby food); **own framework** (formula) | 21 CFR 101.12 (infant RACC) / 21 CFR 107 (formula) |

### Domain-by-domain specifics

**Supplement** — the big one.
- Terminology: "Recipe" → **Formulation**; ingredients are **dietary
  ingredients** (vitamins, minerals, botanicals, amino acids, probiotics).
- Data source: **NIH Dietary Supplement Label Database (DSLD)** has a public
  REST API — `https://api.ods.od.nih.gov/dsld/v9/` (v9.2.0). Search supports
  supplement **form** codes (Capsules e0159, Softgel e0161, Tablets e0155,
  Gummies e0176, Liquids e0165, Powders e0162, Lozenges e0174, Bars e0164),
  **claim type**, and brand. We can search/import labels + dietary-ingredient
  rows. (USDA still useful for food-form nutrients.)
- Label = **Supplement Facts (101.36)**, which differs from Nutrition Facts:
  ingredients **without** an established DV/RDI (e.g. botanical extracts) may be
  listed; the **source** may be shown — "Magnesium (as magnesium glycinate)";
  **botanicals must name the plant part**; **proprietary blends** list total
  blend weight + components in descending order without per-component amounts;
  an **"Other ingredients"** line below the panel for non-dietary excipients
  (fillers, capsule shell). Serving = "1 capsule / 2 gummies / 1 scoop".
- Engine already supports `format: 'SUPPLEMENT_FACTS'` — but the *ingredient
  model* (amount-per-serving + %DV + blend grouping) is different from the
  food per-100g model and needs its own data shape.
- Product types: dosage forms (capsule, softgel, tablet, gummy, powder/stick,
  liquid/tincture, lozenge) — different from food packs.

**Cosmetic.**
- No nutrition/supplement panel at all (already handled in the builder: shows
  an INCI note instead).
- Label = **ingredient declaration in descending order of predominance**
  (21 CFR 701.3); ingredients ≤1% may be unordered after the >1% block; color
  additives last. **INCI** names (International Nomenclature) are the standard —
  needs an INCI dictionary as the ingredient source, not USDA.
- **Net contents** statement on the principal display panel (weight/measure/count).
- **MoCRA**: responsible-person facility registration + product listing +
  **adverse-event contact** on the label. Capture these as product fields.
- Product types: skincare (cream/serum/lotion), haircare, color cosmetics, etc.

**Pet.**
- Label = **Guaranteed Analysis**: min % crude protein, min % crude fat,
  max % crude fiber, max % moisture (other nutrients voluntary). Vitamin/mineral
  pet supplements are exempt from protein/fat/fiber guarantees but **always**
  need a moisture guarantee.
- **Nutritional adequacy statement** (AAFCO): "complete and balanced" for a life
  stage (growth/maintenance/all life stages) via "formulated to meet" or
  "animal feeding test"; or "for intermittent/supplemental feeding only" (treats).
- **Feeding directions** required for complete-and-balanced foods.
- Domain axes: **species** (dog/cat), **life stage**, food vs treat vs supplement.
- Data source: AAFCO ingredient definitions / a curated feed-ingredient library
  (not USDA, not DSLD).

**Infant / Baby.**
- **Infant formula** (21 CFR 107) is its own labeling framework — *not* the
  standard Nutrition Facts — with 29 required nutrients per 100 kcal. Heavily
  regulated; likely **out of V1 scope** (flag as "by request / enterprise").
- **Baby food** (purées, snacks for 1–3 yrs) uses the **Nutrition Facts** label
  but with the **infant/young-child RACC table** (21 CFR 101.12) and infant DVs.
  The "Find serving" modal already carries the infant RACC set — so baby food is
  a *lighter* lift: food engine + infant RACC + infant DV set.

## The architecture: `ProductDomain` strategy

Make domain a first-class, data-driven strategy rather than `if (isCosmetic)`
branches scattered through the builder.

### 1. Schema (most already exists — see Review findings)
- **Domain field: already present** as `ProductTemplate.labelingType`
  (`FOOD | DIETARY_SUPPLEMENT | PET_PRODUCT | OTC | COSMETIC`), derived-from-
  category with a lock. No new enum. (Infant = `FOOD` + infant RACC.)
- Generalize the ingredient model so non-food domains don't force per-100g:
  keep `Ingredient.nutritionPer100g` for food/baby; add a typed
  `dietaryIngredient` shape (amount, unit, %DV, blendId, plantPart) for
  supplements, an `inci` shape (inciName, function, maxPct) for cosmetics, and a
  `guaranteedAnalysis` shape for pet. Model as additive optional columns / a
  typed JSON `domainData` keyed by domain, not five parallel tables.
- `IngredientSource` enum already exists (USDA/LIBRARY/PARTNER_PRIVATE) — add
  `DSLD`, `INCI`, `AAFCO`.
- Product-type taxonomy (`PackingProfile`) gains a `domain` tag so the
  product-type gate only shows types valid for the chosen domain.

### 2. Domain registry (one config object per domain)
A `packages/domains` (or `apps/partner/.../domains.ts`) registry:

```ts
interface ProductDomainConfig {
  key: 'FOOD' | 'SUPPLEMENT' | 'COSMETIC' | 'PET' | 'INFANT'
  label: string                     // "Supplement"
  stepName: string                  // "Formulation" vs "Recipe"
  ingredientNoun: string            // "dietary ingredient" vs "ingredient"
  searchAdapter: 'USDA' | 'DSLD' | 'INCI' | 'AAFCO'
  labelKind: 'NUTRITION_FACTS' | 'SUPPLEMENT_FACTS' | 'INCI_DECLARATION'
            | 'GUARANTEED_ANALYSIS' | 'INFANT'
  raccTable: 'GENERAL' | 'INFANT' | 'NA'
  productTypeFilter: (p: PackingProfile) => boolean
  rulePack: string                  // compliance rule pack id
  extraFields?: ('mocra' | 'feedingDirections' | 'adequacyStatement' | 'netContents')[]
}
```

The builder reads the active domain's config to swap: the **step title**, the
**ingredient search source**, the **label renderer**, the **product-type list**,
the **serving/RACC table**, and the **compliance rule pack**. No per-branch code.

### 3. Search adapter abstraction (admin-managed, hybrid)
`searchIngredients()` becomes domain-routed: FOOD/baby → USDA; supplement →
DSLD; cosmetic → INCI dictionary; pet → AAFCO library. Each returns a normalized
`IngredientResult` plus a `domainData` payload the recipe rows carry into the
label.

**Sourcing model (Pavel 2026-06-11): hybrid, mirror-by-default, admin-controlled.**
Each external source is **mirrored/imported into our `Ingredient` table** as the
default (fast, offline-safe, reproducible recipes), with a per-source **mode**:
`MIRROR` (DB only) · `LIVE` (call the external API) · `HYBRID` (live discovery,
snapshot the chosen row into the DB). **Failover:** if a source is set to LIVE
and the API is down, automatically route to the mirrored DB copy. This is **not
hard-coded** — it's configured per source type.

### 5. Ingredient Data Source admin module (new)
A first-class admin management surface for **every** ingredient data source,
by type (USDA · DSLD · INCI · AAFCO · Curated Library · Partner-private):
- per-source **mode** (MIRROR / LIVE / HYBRID) + **failover-to-DB** toggle,
- sync schedule + "last synced" + row counts + run-now,
- API health/credentials, rate-limit ceilings,
- enable/disable a source, and which `labelingType`(s) it feeds.

Backed by an `IngredientSourceConfig` singleton-per-source table; the search
adapter reads it at query time. Follows the existing admin v2 surface pattern
(cream hero / KPI / table / RowActionsMenu).

### 4. Label renderer registry
The engine already emits `PanelData` for Nutrition/Supplement Facts. Add
renderers/adapters for **INCI declaration**, **Guaranteed Analysis**, and the
**infant** variant. The builder picks the renderer from `labelKind`.

## Phased roadmap (ship value each phase, no rework)

**Phase 0 — registry + wire to existing `labelingType` (small, do first).**
No new domain field (it exists). Build the domain registry with one config per
`LabelingType` value, align the builder/GuidedBuilder naming to the enum
(`DIETARY_SUPPLEMENT`/`PET_PRODUCT`), and wire the builder to read
`stepName`/`ingredientNoun`/`labelKind` from the registry (replaces the current
`isCosmetic`/`labelingType` ad-hoc logic). Add only the additive `domainData`/
source-enum bits the later phases need. Outcome: "Recipe" → "Formulation" for
non-food; cosmetic no-panel already works; category still drives the regime via
the existing lock. **Lowest risk, unblocks everything.**

**Phase 1 — Supplement, end-to-end (the headline).**
DSLD search adapter; dietary-ingredient model (amount/serving, %DV,
proprietary blends, plant part, "Other ingredients"); Supplement Facts via the
engine's `SUPPLEMENT_FACTS` format extended for blends; dosage-form product
types; "Formulation" flow. This is the meaty one.

**Phase 2 — Cosmetic.**
INCI dictionary source; ingredient-declaration renderer (descending order, ≤1%
rule, color additives last); MoCRA fields (responsible person, adverse-event
contact, facility/product listing) + net contents; cosmetic product types.

**Phase 3 — Pet.**
AAFCO feed-ingredient library; Guaranteed Analysis renderer; nutritional-
adequacy statement (life stage + method) + feeding directions; species/life-stage
axes; pet product types. Ties into the existing "Pet products inline" marketplace
decision.

**Phase 4 — Baby food (light, optional).**
Baby food = food engine + infant RACC + infant DV set. Infant **formula**
(21 CFR 107) and **OTC** Drug Facts are **deferred** (enterprise/by-request) per
the 2026-06-11 scope decision.

## Decisions (Pavel 2026-06-11)

- **Scope:** Supplement + Cosmetic + Pet are IN. **OTC and infant formula are
  deferred** (enterprise/by-request). Baby food is a light optional follow-on.
- **Data sourcing:** hybrid, **mirror-into-DB by default**, with an
  **admin-managed mode** per source (MIRROR / LIVE / HYBRID) and **auto-failover
  to the DB copy** if a live API is down. Build an **Ingredient Data Source admin
  module** (§5) to manage every source by type.
- **Ingredient model:** typed **JSON `domainData`** keyed by domain (not parallel
  tables) — additive and fast to ship.
- **Domain field:** reuse the existing `ProductTemplate.labelingType` enum; no
  new `domain` column.

## Recommendation

Make it happen in this order: **Phase 0 now** (substrate + registry +
terminology — low risk, makes the architecture real), then **Phase 1 Supplement**
as the first full domain (highest demand, biggest differentiation), then Cosmetic,
Pet, and Baby. Infant formula stays out of V1.

Per the platform's "earn the right to multi-tenant / defer" principle: land the
no-regret substrate (domain field, source enums, domain registry) immediately;
build each domain's depth when there's pull for it.

## Sources

- [NIH DSLD API Guide](https://dsld.od.nih.gov/api-guide) · [DSLD Label API v9](https://api.ods.od.nih.gov/dsld/v9/)
- [21 CFR 101.36 — Nutrition labeling of dietary supplements](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-C/section-101.36) · [FDA Dietary Supplement Labeling Guide Ch. IV](https://www.fda.gov/food/dietary-supplements-guidance-documents-regulatory-information/dietary-supplement-labeling-guide-chapter-iv-nutrition-labeling)
- [21 CFR 701.3 — Designation of ingredients (cosmetics)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-A/section-701.3) · [FDA Cosmetics Labeling Guide](https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/cosmetics-labeling-guide)
- [AAFCO Nutritional Labeling](https://www.aafco.org/resources/startups/nutritional-labeling/) · [AAFCO Reading Labels](https://www.aafco.org/consumers/understanding-pet-food/reading-labels/)
- [21 CFR Part 107 — Infant Formula](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-107) · [21 CFR 101.12 — Reference amounts (incl. infant table)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A)
