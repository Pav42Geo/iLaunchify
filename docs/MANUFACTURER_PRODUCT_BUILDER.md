# Manufacturer Product Builder — V1 Spec

**Status:** Locked 2026‑05‑24 with Pavel
**Owner:** Partner role (manufacturer / co‑packer)
**Replaces:** FOD's `EnhancedRecipeBuilder` (`FOD-reference/frontend/src/components/product-builder/EnhancedRecipeBuilder.tsx`) and `ProductBuilderStepper`.
**Related:** [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [DESIGN_STUDIO.md](./DESIGN_STUDIO.md) · [COMPLIANCE.md](./COMPLIANCE.md) · [USER_ROLES.md](./USER_ROLES.md)

---

## 1. Why this exists

The partner side of the marketplace lives or dies on this surface. A manufacturer who logs into iLaunchify needs to publish a **ProductTemplate** — a manufacturable, compliant, priceable, packageable thing a creator can later customize, brand, and order. Today there is no such builder in the rebuild repo; what we have in `FOD-reference/` is one 4 000‑line React component that got us 80 % of the way there last year and then collapsed under its own state.

This doc specifies the new builder. It keeps everything that worked in FOD, removes the architectural choices that hurt, and adds the two structural pieces we always wished we had: a reusable **Partner Packaging Catalog** and an admin‑curated **Certificate Library** with private documents and public "Verified" badges.

## 2. Goals & non‑goals

**Goals (V1)**
- A manufacturer can publish a compliant, priceable ProductTemplate in **≤ 15 minutes** the first time, **≤ 3 minutes** to clone & adjust an existing one.
- The product can be **drafted, autosaved, abandoned, and resumed** without losing a keystroke.
- Every published template carries a server‑validated nutrition panel, a slot‑based ingredient model, supported packaging configurations from the partner's catalog, a tiered price ladder, and verified certifications.
- Admins approve / request changes / publish from a queue. No silent publishes.
- A creator on the marketplace sees a clean detail page with badge thumbnails for verified certs — never the underlying PDF.

**Non‑goals (V1)**
- No AI‑generated recipes (V1 has *paste‑in* assist only, behind a flag).
- No multi‑partner production handoffs (see PLATFORM_SPEC.md — V1.5/V2).
- No partner‑side storefront customisation (creator side handles that).
- No inventory tracking after delivery (V1.1+).
- No automatic OCR of uploaded labels (V1.1; vision LLM in V1.2).

## 3. The user, the moment, the friction

**Who:** A US‑based manufacturer or co‑packer who has already been approved through partner onboarding (see Phase A in `FOD_RECOVERY_PLAN.md`). They have a Stripe Connect account, at least one verified address, and at least one signed capability section.

**Moment:** They want to add a new manufacturable product to their catalog — typically because (a) they've just signed up and are seeding their offering, (b) a creator asked for something they can do but don't yet list, or (c) they're cloning an existing product with a tweak.

**Friction we observed in FOD that we are eliminating:**
- "I lost my recipe when the page refreshed" → server‑owned canonical draft, autosaves every 1.2 s of idle.
- "Why do I need to fill in 18 fields before I can save?" → only **name + category + at least one ingredient** are required to save a draft.
- "I don't know what packaging I support" → packaging is picked from the partner's own catalog, not re‑typed each time.
- "Compliance failed but I don't know what's wrong" → live label preview shows the panel as it will print, with red‑outlined cells on failure and a click‑to‑jump to the offending field.
- "I uploaded a NSF cert as a 4 MB PDF — does the creator see this?" → no. Only an admin‑curated badge thumbnail surfaces publicly.

## 4. Architecture — single‑page editor with stepper‑first creation

### 4.1 Hybrid layout decision (locked)

**First‑time create** = guided stepper (4 steps). Reduces the empty‑state paralysis we saw on FOD.
**Every subsequent visit** = single‑page editor with autosave + live label preview. Faster for cloning & editing.

```
NEW PRODUCT (first time)                EXISTING PRODUCT (any subsequent visit)
─────────────────────────              ──────────────────────────────────────
┌────────────────────────────┐         ┌──────────────────────────────┬───────────────┐
│ Step 1 / 4   ●─○─○─○       │         │ ProductTemplate: "Whey …"    │               │
│                            │         │ Status: Draft  Last saved 4s │  📋 LIVE      │
│   What are we making?      │         ├──────────────────────────────┤   LABEL       │
│   ┌──────────────────────┐ │         │ ① Basics                     │   PREVIEW     │
│   │ Name                 │ │         │ ② Ingredients (slots)        │               │
│   │ Category ▾           │ │         │ ③ Packaging (from catalog)   │   ┌────────┐  │
│   │ Subcategory ▾        │ │         │ ④ Pricing tiers              │   │  Nutr  │  │
│   └──────────────────────┘ │         │ ⑤ Certificates               │   │  Facts │  │
│           [Continue →]     │         │ ⑥ Media + Description        │   └────────┘  │
└────────────────────────────┘         │                              │               │
                                       │   [Submit for approval]      │  ✅ Compliant │
                                       └──────────────────────────────┴───────────────┘
```

The stepper ends by writing a Draft ProductTemplate and routing to `/partner/products/[id]/edit`, the single‑page editor. The partner never sees the stepper again for that product.

### 4.1a Start‑from options on the New Product screen

Before the stepper begins, the partner picks how they want to start. This is the small "Choose template" pattern from shipturtle, tailored:

| Start from | Behaviour |
|------------|-----------|
| **Blank** | Stepper opens with all fields empty |
| **Clone an existing product of mine** | Picker over the partner's own published / draft templates; everything copies except the SKU, name, and status (back to Draft) |
| **iLaunchify starter** | A small admin‑curated catalog (Standard whey protein · Pre‑workout powder · Greens powder · Hot sauce · Gummy multivitamin · …) seeded with FDA‑compliant defaults and example slots. Pulls the rule pack defaults from the compliance service. |

Starter templates are global, read‑only, curated by admin. Cloning a starter creates a normal Draft owned by the partner — no link back. V1 ships with ~6 starters seeded by admin.

### 4.2 The 4 stepper steps (first‑time only)

| # | Step             | Required to advance                                            | Why |
|---|------------------|----------------------------------------------------------------|-----|
| 1 | **What**         | Name + Category + Subcategory                                  | Without this we can't pick the right FDA rule pack or unit defaults. |
| 2 | **How it's made**| ≥ 1 base ingredient with a quantity                            | Anchors the recipe so live nutrition can compute. |
| 3 | **How it ships** | ≥ 1 PackagingSystem selected from catalog (or "Add to catalog")| Without this, a creator can't actually order. |
| 4 | **What it costs**| Base price + ≥ 1 quantity tier                                 | Marketplace pricing depends on this. |

Steps 5 (Certificates), 6 (Media) and full editing happen in the single‑page editor — they're optional for the first save.

### 4.3 Single‑page editor sections

Each section is a self‑contained card; collapsing one doesn't hide validation errors from another. The right sidebar is sticky and shows the live FDA nutrition panel as it will print.

| Section | Required for publish? | Re‑approval on edit? | Notes |
|---------|----------------------|--------------------:|-------|
| ① Basics | Yes | Partial | Name + category + subcategory require re‑approval. Internal SKU and tags do not. |
| ② Ingredients (slots) | Yes (≥ 1 base) | **Yes** | Any change → re‑approval. Recipe changes the compliance label. |
| ②a Flavors (presets) | Auto‑one if single‑flavor; partner‑defined if multi | **Yes** for content changes, **No** for swatch‑only or retire | §5. Lives at the bottom of the IngredientsCard panel. |
| ③ Allergens | Yes (auto‑derived) | **Yes** | Big 9 contains‑list auto‑derived from ingredient flags. Cross‑contamination warnings and manual overrides are partner‑input. Prints on label. |
| ④ Packaging | Yes (≥ 1 system) | **Yes** | Adding / removing a PackagingSystem on a live product re‑triggers approval. Per‑pack price delta edits do not (admin re‑approves prices at the tier level). |
| ⑤ Pricing | Yes (base + ≥ 1 tier) | **Yes** | Price changes always re‑approve (creator protection). Per‑flavor price delta lives on the FlavorPreset, not here. |
| ⑥ Certificates | Optional | **Yes** | New certificate badge appearing publicly requires verification. Removing one does not. |
| ⑦ Media + Description | Optional | No | Free to swap photos / edit description on live products. |
| ⑧ Custom meta fields | Optional | No | Free to edit. |
| ⑨ Finished‑product weight | Yes | No | Per‑recipe and per‑flavor, varies with slot fills. Used for shipping calcs. |
| ⑩ Notes thread (partner ↔ admin) | n/a | n/a | Persistent thread for clarifications, requested photos, etc. |

The visual treatment in the editor: every field that re‑triggers approval shows a small "🅰" badge in the label. Editing it on a `PUBLISHED` product flips a status banner: "These changes will go back to admin for review when you save. Photo and description edits go live immediately." (See §8 for the queue split.)

## 5. The slot‑based ingredient model (kept from FOD, refined)

FOD's strongest idea was treating ingredients as **slots** rather than a flat list. Keep it. Refine the schema so the tier is explicit at the DB level instead of a UI convention.

```
Recipe
  ├── Slot 1: "Protein Source"   tier=base       qty=24g
  │     └── Ingredient: Whey Protein Isolate (USDA fdc_id 173430)
  ├── Slot 2: "Sweetener"        tier=replaceable
  │     ├── Option A: Stevia Extract           (default)
  │     ├── Option B: Monk Fruit Extract
  │     └── Option C: Erythritol
  ├── Slot 3: "Flavor"           tier=replaceable
  │     ├── Option A: Cocoa Powder             (default)
  │     ├── Option B: Vanilla Extract
  │     └── Option C: Strawberry Powder
  └── Slot 4: "Probiotic Blend"  tier=optional   qty=1 billion CFU
        └── Ingredient: Lactobacillus blend
```

**Why this matters for creators:** when a creator hits `/products/[slug]/customize`, the slots become the customisation surface. Base = locked. Replaceable = swap dropdowns. Optional = checkbox add‑ons. The price ladder updates per‑swap.

**Live nutrition recalc:** every slot edit triggers a debounced server action against the compliance service which returns the rounded FDA panel. The label preview swaps in.

**Dual‑unit support:** every quantity has `{value, unit}`. Unit conversions happen server‑side using the USDA ingredient density. The UI never does math.

## 4a. Ingredient sourcing & nutrition‑label accuracy

Every ingredient — whether it's whey isolate in a base slot, cocoa powder in a flavor preset, or beet juice in a flavor's extras list — comes from the same unified IngredientPicker. The picker queries three sources in priority order; the resolved ingredient row always has the same shape downstream, regardless of where it originated.

### 4a.1 The three sources (hybrid local + live USDA fallback)

| # | Source | What it covers | Coverage estimate |
|---|---|---|---|
| 1 | **USDA FoodData Central** (FDC) — pre‑loaded subset | Whole foods, commodities, lab‑tested raw ingredients (Foundation + SR Legacy) + filtered Branded Foods (whole‑ingredient SKUs only, drop finished consumer products) | ~40–60k items in local DB. The full 1.4M USDA universe (mostly finished CPG products) is reachable via live API "search wider" — see below. |
| 2 | **iLaunchify Curated Library** | Supplement‑specific items USDA misses: whey isolates, BCAAs, creatine, beta‑alanine, stevia/monk fruit fractions, generic flavor concentrates ("Natural Vanilla Flavor"), pectin, gums, colors | ~1,000–1,200 items at V1 launch (aggressive seed), admin‑maintained |
| 3 | **Partner‑private library** | Supplier‑specific SKUs partner uploads with COA‑derived nutrient panels ("Symrise Vanilla 67‑B", "PuraSpec Whey 85") | Per‑partner, unlimited |

The picker UI shows source badges on every result so the partner can tell whether they're picking a USDA whole food, an iLaunchify curated item, or one of their own private SKUs. If nothing matches at Layer 1 (local), the partner sees two next steps: "Add custom ingredient →" (Layer 3) or "Search wider in USDA full catalog →" (Layer 1.5 — live API fallback, see §4a.1a).

### 4a.1a USDA strategy — local‑first with live API "search wider" fallback

USDA FoodData Central is five datasets glued together; the "1.4M items" figure is overwhelmingly the **Branded Foods** subset, which is finished consumer products (labels scraped from CPG manufacturers) — not the kind of ingredient a partner builds a formulation from. The high‑quality lab‑tested data is concentrated in Foundation Foods (~2k) and SR Legacy (~7.8k). So the picker behavior is local‑first with optional live reach:

**Layer 1 — local DB (default search, ~50ms p99):**
- USDA Foundation Foods (~2,000) — gold‑standard lab data
- USDA SR Legacy (~7,800) — older lab data, still high quality
- USDA Branded Foods, FILTERED to whole ingredients / commodities only (~30–50k) — explicit whitelist of dataCategories + heuristic name filter to drop finished products
- iLaunchify Curated Library (~1,200) — supplement‑specific
- Partner‑private (visible only to that partner)

**Layer 1.5 — live USDA API "search wider" button:**
- Appears at the bottom of the picker results list when local returns < N matches OR partner clicks the explicit "Search wider" link.
- Opens a separate panel that queries `https://api.nal.usda.gov/fdc/v1/foods/search` live with the partner's query.
- Returns the full USDA universe including the noisy Branded Foods catalog.
- If the partner picks a live result, the system COPIES it into our local Ingredient table at that moment — so the next partner searching the same term gets it from Layer 1. Library grows organically with use.
- Graceful degradation: if USDA API is down / rate‑limited, the panel shows "Live USDA search temporarily unavailable — using local results only" without breaking the picker.

**Why local‑first beats live‑first:**
- Speed: local search returns in < 100ms vs 200–800ms per live API call. Matters at every keystroke during autocomplete.
- Reliability: USDA API has periodic outages (1–2x per quarter, sometimes hours). Live‑first means picker breaks during those windows.
- Rate limits: USDA's free API key allows 1,000 requests/hour. With 50 active partners doing autocomplete, we'd hit it on a busy morning.
- Quality: pre‑filtering Branded Foods drops the noise — searching "almond butter" returns ~5 useful options instead of 800 brand variants.
- Allergen tagging: we parse ingredientText for allergen flags at import time once, not on every live call.

**Why the live fallback exists at all:**
- Some partners genuinely need a niche item that's in Branded Foods but not in our filtered subset. They get to reach it without leaving the picker.
- Every "search wider" pick that gets imported into Layer 1 reduces the need for the next partner to do the same — the platform's local coverage improves as a function of use.

**USDA refresh schedule:**
- USDA updates Foundation Foods and SR Legacy about quarterly. We re‑import via a scheduled job (cron, monthly run) that upserts by `fdc_id`. Branded Foods updates more often but matters less for us. Re‑import is idempotent.

### 4a.2 The normalized ingredient shape

Regardless of source, every Ingredient row carries the same fields used downstream:

```
Ingredient
├── id
├── source                      // USDA | LIBRARY | PARTNER_PRIVATE
├── sourceRefId                 // FDC fdc_id, library slug, or partner UUID
├── internalName                // "Symrise Natural Vanilla 67-B"  — used in recipe editor, cost, COA matching
├── labelDeclarationName        // "Natural Flavor"                — used in printed label + public detail page
├── nutrientProfilePer100g      // calories, fat, carb, protein, vitamins, minerals
├── densityGPerML               // for volume↔mass conversion
├── allergenFlags[]             // Big 9 + iLaunchify-extended set
├── compliance.notes            // e.g., "FDA class I nutrient", "21 CFR exemption"
├── verificationStatus          // SELF_ATTESTED | ADMIN_VERIFIED | LIBRARY_PROMOTED
├── coaFileId                   // optional uploaded COA PDF (PartnerFile)
├── createdById / verifiedById  // who created, who admin-verified
├── ownerPartnerId              // NULL for USDA + LIBRARY; partner id for PRIVATE
└── promotedFromIngredientId    // breadcrumb if this LIBRARY row was promoted from a PRIVATE one
```

The two‑name model exists because FDA 21 CFR 101.22(h)(3) allows generic declarations like "Natural Flavor" on the printed label while the internal recipe holds the specific supplier SKU. Same applies to natural colors. Defaults: `labelDeclarationName = internalName` unless overridden by admin (Library) or partner (Private). The flavor preset never carries its own name override — names belong to the ingredient.

### 4a.3 How the nutrition label is computed (per flavor × per size)

When the compliance service resolves `(productTemplateId, flavorPresetId, packagingSystemId)`:

1. Materialise the recipe: base slots + flavor preset's slotResolution + flavor preset's extras.
2. For each ingredient row, multiply `nutrientProfilePer100g` by quantity (normalised to grams via density if the partner entered a volume unit).
3. Sum across all ingredients to get the per‑serving total.
4. Apply FDA rounding rules per nutrient (21 CFR 101.9(c)) — calories nearest 5 below 50, nearest 10 above; macros nearest 1 g if >5 g; etc.
5. Compute % Daily Value against 2020‑update Reference Daily Intakes.
6. Derive the Contains: line by union‑ing `allergenFlags` across all ingredients (see §5a Allergens).
7. Generate the printed ingredient list ordered by weight descending, using each ingredient's `labelDeclarationName`.
8. Run the rule pack pinned to this ProductTemplate; return pass/fail per rule + the rendered label HTML.

Cached label artefacts are keyed by `(templateId, flavorPresetId, packagingSystemId, rulePackVersion)`. Cache invalidates when any of those change.

### 4a.4 Accuracy — what we guarantee, what the partner owns

FDA tolerance per 21 CFR 101.9(g): most nutrients ±20 % on a per‑label basis. Class I added vitamins/minerals must be ≥100 % of declared; class II ≥80 %; calories/fat/sat fat/sugars/cholesterol/sodium ≤120 %. So the bar is "reasonable accuracy validated by COA at production," not "lab‑precise at recipe authoring."

| Owner | Responsibility |
|---|---|
| **System (compliance service)** | Correct math (rounding, % DV, summation). Authoritative USDA values for items it covers. Pinned rule pack version per published product so labels can't silently fail after a future rule‑pack update. |
| **Admin** | Maintain Curated Library accuracy (supplement‑specific items USDA does poorly). Verify partner uploads when partner requests review. |
| **Partner** | Pick the right source item (the picker shows nutrient summary side‑by‑side to make wrong picks visible). Maintain their private library against supplier COAs. Validate each production batch against the declared label (typically via per‑lot third‑party COA). |

### 4a.5 Verification levels — sliding governance, not gating

Every Ingredient — but especially partner‑private ones — carries a `verificationStatus`. The model balances partner velocity (don't block product submission on admin queues) with admin control (concentrate attention on the ingredients that actually move nutrient or allergen numbers).

| Level | Created how | Allowed in published products? | Surfaces to admin? |
|-------|-------------|-------------------------------:|--------------------|
| `SELF_ATTESTED` | Partner adds via "Add custom ingredient", ticks "COA on file" | **Yes, immediately** | Soft flag in product approval queue ("N self‑attested ingredients") |
| `ADMIN_VERIFIED` | Admin reviewed COA / nutrient values | Yes | No flag |
| `LIBRARY_PROMOTED` | Admin promoted a private ingredient to the public Curated Library | Yes, for all partners | Library entry; partner gets "Contributed to Library" courtesy badge |

Default flow: partner creates a private ingredient → SELF_ATTESTED → usable in a product immediately → submitting product surfaces the soft flag in `/admin/products/queue` → admin can verify ingredients inline during product review OR batch‑verify later in `/admin/ingredients/verify` → product approval is not blocked by ingredient verification. Admin is informed, not in the critical path.

**Risk‑weighted attention — the rules that escalate the flag:**

- **Hard block** at creation if the ingredient name / CAS# matches the banned‑substance dictionary (ephedra, sibutramine, undeclared stimulants, certain SARMs precursors, etc.). Partner cannot save.
- **Soft warn** at creation if it matches a controversial dictionary (high‑dose caffeine combinations, kratom, certain herbal extracts). Partner can save but admin gets a high‑priority notification.
- **Red flag** in product queue if a self‑attested ingredient is > 5 % of recipe weight (it actually moves the label numbers). Admin should verify before approving.
- **Allergen confirmation** dialog — if a self‑attested ingredient is declared as containing zero Big‑9 allergens, the partner sees an "Are you sure?" with a "I'm not sure — please flag for admin review" default option.

**Library promotion — the compounding tool that scales admin's work:**

`/admin/ingredients/library‑promote` shows private ingredients ranked by cross‑partner usage. After 6 months, admin's verification work concentrates on genuinely new ingredients because the long tail has been absorbed into the library:

```
Suggested promotions (sorted by usage):

  Stevia Reb M (95% min)         used by 8 partners across 23 products
  Citrulline Malate 2:1          used by 6 partners across 14 products
  Beet Juice Powder (granular)   used by 5 partners across 11 products
```

Promoting a private ingredient:
1. Admin opens the row, sees all partner‑submitted variants + COAs side by side.
2. Cleans the name + `labelDeclarationName` to FDA conventions.
3. Reconciles allergen flags across the variants.
4. Saves as a new `LIBRARY` Ingredient.
5. System auto‑relinks matching private ingredients (heuristic + admin confirms each relink).
6. Partners whose private ingredient got absorbed get a notification + a "Contributed to Library" courtesy badge on their company profile.

**Duplicate detection at creation time — the kill‑most‑creations lever:**

When the partner clicks "Add custom ingredient" inside the IngredientPicker, the form does a fuzzy name + nutrient panel similarity check against Library + their own private + other partners' private items (anonymized). Shows up to 5 matches with a "Use this instead" / "Request admin review for promotion" prompt. Expected to kill 60–70 % of new private ingredient creations before they happen.

### 4a.5a Personalized search ranking — the "feels fast" trick

Recipal's secret sauce — confirmed from their marketing copy 2026‑05‑24 — is that ingredient search results are *"prioritized based on your usage."* When a partner has used "Cocoa Powder (Foundation)" three times, every subsequent search for "cocoa" returns it as result #1 instantly. The DB is the same speed; what changes is that the partner never has to scroll.

Our scoring function for the IngredientPicker (composable boost ranks added to the base name‑match score):

```
score(ingredient, query, partnerId) =
    +50  if exact name match
    +20  if prefix match
    +10  if substring match
    +30  per use by this partner in the last 90 days (capped at +90)
    +5   per use globally by other partners in the last 30 days (capped at +25)
    +10  if verificationStatus = LIBRARY_PROMOTED or ADMIN_VERIFIED
    +15  if same category as the product's category
    -10  if RETIRED or DEPRECATED status
```

Tracks an `IngredientUsage` table: `{partnerId, ingredientId, lastUsedAt, useCount}` updated on every "save preset" or "save slot" action. Index on `(partnerId, lastUsedAt desc)`. Cost is one extra row write per save — negligible.

### 4a.5b AI spec‑sheet PDF parser (V1.1 — pairs with COA flow)

When a partner clicks "Add custom ingredient," the form has a "Drop spec sheet PDF →" zone. On drop, the file is sent to an AI extraction service (vision LLM via the AI service) that returns a structured nutrient panel + allergen flags + likely `labelDeclarationName`. The form is pre‑filled; partner reviews and edits before save. Cuts custom ingredient creation from ~5 minutes of typing to ~30 seconds of reviewing.

V1.1, not V1, because the AI service infrastructure depends on the broader compliance‑AI roll‑out from [PLATFORM_SPEC.md Tier 3]. V1 ships with manual entry only.

### 4a.5c Manual nutrient overrides (V1)

Every Ingredient row gets an optional `overrides` field that lives at the ProductTemplate (or FlavorPreset) level rather than on the Ingredient — because the override is recipe‑specific, not ingredient‑wide. Example: a baked good loses 12 % moisture in the oven, so the partner overrides the final calorie density on the resolved label. The compliance service applies the override AFTER summing and BEFORE rounding.

```
ProductTemplate.nutrientOverrides : Json?
  // [{ nutrient: "calories", value: 145, reason: "moisture loss in baking" }]
FlavorPreset.nutrientOverrides   : Json?
  // same shape, per-flavor (e.g., Strawberry's added water content shifts moisture)
```

Override always requires a typed `reason` (captured for audit, not shown publicly). Re‑triggers approval if changed on a live product.

### 4a.5d Ingredient grouping on the label statement (V1)

FDA 21 CFR 101.4 allows certain categorical names on the printed ingredient list ("Spices," "Natural Flavors," "Artificial Flavors," "Color (vegetable juice)" — see FDA labeling guide). A "Group" is a partner‑configured bundle of ingredients that prints as a single category name with a sub‑list in parentheses or just the category name alone.

```
ProductTemplate.ingredientGroups : Json?
  // [{
  //   groupName: "Spices",
  //   ingredientIds: ["...salt...", "...pepper...", "...turmeric..."],
  //   displayMode: "CATEGORY_ONLY" | "CATEGORY_WITH_SUBLIST",
  //   sortAs: "GROUP_TOTAL_WEIGHT"   // group ranks in ingredient list by its summed weight
  // }]
```

Rendering: when the compliance service generates the ingredient statement, grouped ingredients are summed by weight, the group occupies a single slot in the descending‑weight list, and is displayed as either "Spices" or "Spices (Salt, Black Pepper, Turmeric)" depending on `displayMode`. Subrecipe combining (Recipal's "combine ingredients from subrecipes to avoid duplication") falls out naturally from this — sub‑recipes appearing twice contribute weight to the same parent group.

### 4a.5e Bioengineered ingredient flag (V1, federal compliance)

USDA's National Bioengineered Food Disclosure Standard (2022) requires manufacturers to disclose bioengineered ingredients on the label. We add a third disclosure status to every Ingredient: `bioengineeredStatus: NONE | BIOENGINEERED | DERIVED_FROM_BIOENGINEERED | NOT_APPLICABLE`.

- USDA imports: set based on USDA's BE flag where available; otherwise NOT_APPLICABLE.
- Library curation: admin sets explicitly when seeding.
- Partner‑private: partner declares; admin verifies during the verification step.
- Banned/controversial dictionaries: irrelevant here.

If any ingredient in a resolved recipe has `BIOENGINEERED` or `DERIVED_FROM_BIOENGINEERED`, the compliance service renders the appropriate disclosure on the label (text, symbol, QR code, or phone option per the standard) and the rule pack validates that the disclosure is present.

### 4a.6 Curated Library V1 seed — aggressive (~1,000–1,200 items)

V1 launch seed structured for partner velocity from day 1. Categorical breakdown (full counts in §16 task description):

- Protein actives (~80), Amino acids (~40), Vitamins by form (~80), Minerals by form (~60)
- Botanicals + adaptogens (~150), Sweeteners (~30), Flavor systems generic (~150), Colors natural (~40)
- Fats + oils (~60), Carriers / fillers / processing aids (~80), Food bases (~150), Common allergen‑bearing (~80)

Each entry needs: source citation, nutrient panel per 100 g, density, allergen flags, default `labelDeclarationName`, generic vs branded note. Roughly 70–100 hours of curator work — a one‑time investment, structured as a spreadsheet‑driven contractor brief.

### 4a.7 Allergens follow the same model

Allergen flags are a normalized field on every Ingredient row, regardless of source. When the AllergensCard (§5a) runs its Big‑9 auto‑derive on a resolved recipe, it union‑s the `allergenFlags` across all ingredients in the resolved set (base + preset's slot picks + preset's extras). For USDA items we map the ingredientText to Big‑9 at import time; for Library and Private items, the contributor (admin or partner) ticks the flags explicitly. This means picking "Almond Flavor" as a flavor preset's slot resolution → automatically adds Tree Nuts to that flavor's Contains: line → AllergensCard's `CustomizationImpactWarning` fires on the partner side if the flavor is replaceable for the creator.

## 5. Flavors — one product, many curated variations (NOT separate recipes)

**Decision:** a product is *one* ProductTemplate with *one* base recipe. Flavor variation is expressed as a list of partner‑curated `FlavorPreset` rows that overlay the base — never as separate products and never as separate recipes the partner has to maintain in parallel.

(Flavor ingredients themselves — cocoa powder, vanilla extract, beet juice, the actual physical inputs — are sourced through the unified IngredientPicker against USDA + iLaunchify Curated Library + partner‑private library. See §4a for the source priority, the two‑name model, how nutrients propagate to the label, and accuracy guarantees.)

This replaces FOD's MY RECIPES tab (which was a flat list of per‑flavor recipes the partner had to keep in sync). Pavel raised the question 2026‑05‑24; the rationale is in §5.4.

### 5.1 The data shape

```
ProductTemplate "Whey Protein"
├── Base slots (shared by every flavor; the "spine" of the formula)
│     • base:        Whey Protein Isolate 24g
│     • base:        Lecithin 1g
│     • replaceable: Sweetener slot      [Stevia | Monk Fruit | Erythritol]
│     • replaceable: Flavor system slot  [depends on flavor preset]
│     • optional:    Color additive slot [depends on flavor preset]
│
└── FlavorPresets[]  (named, curated overlays — order matters for display)
      ├── 🟫 Chocolate    { sweetenerSlot: Stevia, flavorSlot: Cocoa+ChocFlavor,
      │                    colorSlot: none, extras: [], priceDeltaCents: +20 }
      ├── 🟡 Vanilla      { sweetenerSlot: Stevia, flavorSlot: Vanillin 0.4g,
      │                    colorSlot: none, extras: [], priceDeltaCents: 0 }
      └── 🟥 Strawberry   { sweetenerSlot: Stevia, flavorSlot: Strawberry powder 5g,
                           colorSlot: Beet Juice 0.3g, extras: [], priceDeltaCents: +50 }
```

When the system needs to "resolve a flavor preset to a concrete recipe" (for compliance label, allergens, cost, weight) it:
1. Starts from the base slots (immutable).
2. Applies the preset's slot picks to each replaceable and optional slot.
3. Appends any flavor‑specific `extras` (ingredients not in the base slot list).
4. Runs the compliance service against the resolved recipe.

The resolved recipe is *derived*, not stored. The source of truth is `ProductTemplate.slots[]` + `FlavorPreset[]`. Cached compliance label artefacts are keyed by `(templateId, flavorPresetId, packagingSystemId)` so we don't recompute on every page view.

### 5.2 What the partner sees (IngredientsCard, Flavors sub‑section)

Bottom half of the IngredientsCard. After the slot editor, a "Flavors" panel:

```
Flavors offered on this product:

  ┌─────────────────────────────┐  ┌─────────────────────────────┐
  │ 🟫 Chocolate           [···] │  │ 🟡 Vanilla            [···] │
  │ Sweetener: Stevia           │  │ Sweetener: Stevia           │
  │ Flavor: Cocoa 8g + Choc 0.5 │  │ Flavor: Vanillin 0.4g       │
  │ Color: —                    │  │ Color: —                    │
  │ +$0.20 / unit · No new      │  │ Base price · No new         │
  │   allergens                 │  │   allergens                 │
  └─────────────────────────────┘  └─────────────────────────────┘

  ┌─────────────────────────────┐  [+ Add flavor]
  │ 🟥 Strawberry          [···] │
  │ Sweetener: Stevia           │
  │ Flavor: Strawberry pwd 5g   │
  │ Color: Beet juice 0.3g      │
  │ +$0.50 / unit · No new      │
  │   allergens                 │
  └─────────────────────────────┘
```

Clicking a flavor card opens an inline editor (not a modal — modals break the autosave + live preview loop):

- Name, swatch color (HEX or picker), optional swatch image (small jar/scoop photo)
- For each replaceable / optional slot in the base recipe: a dropdown of the options declared on that slot, with "Use base default" as a choice
- An "Extras" sub‑list to add ingredients that exist only in this flavor (the beet juice example)
- A `priceDeltaCents` field for per‑flavor cost (often positive — premium flavors cost more)
- Status: Active / Draft / Retired

Saving the inline editor autosaves the preset. The live label preview in the right sidebar shows the currently‑edited preset's panel.

A single‑flavor product gets one auto‑created FlavorPreset named "Standard" on save, with no swatch and no slot overrides — the partner doesn't have to think about the Flavors panel at all. They only engage with it if they have more than one flavor to offer.

### 5.3 What the creator sees (on `/products/[slug]/customize`)

Depends entirely on the PackagingSystem the creator has picked (from §6):

| PackagingSystem | Creator UI for flavor | Order payload |
|---|---|---|
| `flavorMode: SINGLE` (1 jar = 1 flavor) | Single‑select swatch row of active FlavorPresets, one must be picked | `{ flavorPresetId: "vanilla" }` |
| `flavorMode: MULTI`, `flavorPolicy: CREATOR_PICK` (variety pack creator composes) | Multi‑select with per‑flavor quantity inputs that must sum to the pack's unitCount | `{ assortment: [{flavorPresetId, qty}, ...] }` |
| `flavorMode: MULTI`, `flavorPolicy: PARTNER_FIXED` (variety pack with fixed composition) | Read‑only display of "Includes: 4× Chocolate, 4× Vanilla, 4× Strawberry" with no creator choice | `{ assortment: <copy of partner's fixed bundle> }` |

In every case, the customize page's live preview swaps the label, the Contains: line, the cost, and the per‑unit weight whenever the creator changes their flavor selection.

### 5.4 Why presets over either alternative

| Alternative | Why we rejected it |
|---|---|
| **One ProductTemplate per flavor** (i.e., "Whey Chocolate", "Whey Vanilla" as 3 separate products) | Forces creators to publish 3 separate storefront products. Forces partners to manually duplicate any base‑formula change across 3 templates. Forces variety packs to be a special 4th kind of product. Rejected. |
| **FOD's flat MY RECIPES list** (separate recipe objects per flavor under one product) | Partners had to manually keep them in sync. No structural enforcement that "all flavors share the same base spine." Easy to drift. Rejected. |
| **Free‑form slot customization by the creator** (no presets, creator picks every slot option) | Partner would have to QA an exponential combination space. We'd have orders for flavor combinations the partner has never tested. Rejected. |

Presets are the right intermediate: structured enough that the partner stays in control of what they're willing to manufacture, dynamic enough that the creator gets clear per‑flavor previews and the system can compute compliance correctly for each one.

### 5.5 Schema

```prisma
model FlavorPreset {
  id                   String   @id @default(cuid())
  productTemplateId    String
  name                 String                                   // "Chocolate", "Vanilla"
  swatchHex            String?                                  // "#5C3317"
  swatchImageFileId    String?
  slotResolution       Json                                     // [{ slotId, optionId | { customIngredientId, qty, unit } }]
  extras               Json?                                    // [{ name, ingredientId, qty, unit }] for flavor-only ingredients
  priceDeltaCents      Int      @default(0)                     // additive to per-size base price
  status               FlavorPresetStatus                       // ACTIVE | DRAFT | RETIRED
  sortOrder            Int      @default(0)
  productTemplate      ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  @@index([productTemplateId, status, sortOrder])
}
```

Order rows store `flavorPresetId` (single‑flavor packs) or `flavorAssortment: Json` (multi‑flavor packs). Resolved‑recipe snapshots are written into the Order at checkout time (per §11) so a later partner edit to the FlavorPreset doesn't change the historical order.

### 5.6 Re‑approval rules

| Change | Re‑approval? |
|---|---|
| Add a new FlavorPreset on a published product | Yes — it appears publicly, label is new |
| Edit a published FlavorPreset's slot picks / extras | Yes — label content changes |
| Edit `swatchHex` or `swatchImageFileId` only | No — cosmetic, no label impact |
| Edit `priceDeltaCents` | Yes — pricing change |
| Retire a FlavorPreset | No — removes from creator selection going forward, doesn't affect existing orders |

Folded into the canonical approval map in §8b.

---

## 5a. Allergens (auto‑derive + partner overrides)

FDA 21 CFR 101.22 requires a "Contains:" statement for any of the Big 9 (milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame). This is too important to bury inside MediaCard, and the data shape is unusual — it's *partially auto‑derived from the recipe* and *partially manual partner input*. So it gets its own card.

### What auto‑derives

Every USDA ingredient row carries an `allergenFlags` set (loaded into the compliance service from the FDA dataset + our overrides). The AllergensCard runs through the resolved recipe (base + currently‑selected defaults for each replaceable slot) and shows:

```
Auto‑detected from your recipe:
  ☑ Milk          (from Whey Protein Isolate)
  ☑ Soy           (from Lecithin)
  ☐ Eggs
  ☐ Fish          ☐ Shellfish    ☐ Tree Nuts
  ☐ Peanuts       ☐ Wheat        ☐ Sesame
```

Auto‑detected rows are read‑only checkmarks. Partner cannot uncheck "Milk" if whey is in the recipe — they have to remove the ingredient.

### What's partner input

```
Cross‑contamination warnings (facility‑level):
  Statement:  "Manufactured in a facility that also processes
              tree nuts, peanuts, and sesame."
  [Edit ✎]

Manual overrides (rare, requires justification):
  ☑ Add "Soy" even though no soy ingredient is in this recipe?
     Reason: ____________________________
  [+ Add manual allergen]
```

Cross‑contamination is facility‑wide so it's also defaulted from the partner's company profile (set once on `/partner/company-profile`, applied to all new products, editable per‑product). Manual overrides require a typed reason — captured for audit, not shown publicly.

### How it surfaces

1. On the **live label preview** in the sidebar, the "Contains:" line and the cross‑contamination statement are visible and update as the recipe changes.
2. On the public product detail page (for creators / end buyers), allergens render as a clear callout above the ingredient list with proper formatting.
3. On the **AllergensCard itself**, a warning chip flashes if a creator's typical customisation could *introduce* a new allergen (e.g., partner offers a "vanilla → almond extract" swap as one of the replaceable‑slot options → AllergensCard shows "⚠ Customizing this slot to 'Almond Extract' will add Tree Nuts to the Contains list").

### Re‑approval rule

Any change to the partner‑input fields (cross‑contamination string, manual overrides) re‑triggers admin review on a live product — because they print on the label. Auto‑derived changes can't happen in isolation (they only change when the recipe changes, which is already a re‑approval trigger).

## 6. Partner Packaging Catalog + Admin PackagingType library (two‑tier)

### 6.1 The decision — and the bootstrap problem

Die‑lines do **not** belong inside the product builder. They belong in a **Partner Packaging Catalog** that the partner maintains independently. The product builder *picks* from that catalog.

Why: most partners run dozens of products on the same handful of physical containers. A "16 oz HDPE jar with screw lid" runs 12 different flavors. Each of those products should not re‑upload the same die‑line.

**The bootstrap problem** (Pavel, 2026‑05‑24): at launch the iLaunchify master taxonomy is empty. Partners need to be able to add packaging on day 1 with their own names and photos. But if every partner names their own, we end up with 30 different names for the same 16 oz jar and creators can't filter across partners. So we use a two‑tier model with an admin normalization overlay:

```
┌──────────────────────────────────────────────────────────────┐
│  PackagingType  (admin‑curated, canonical taxonomy)          │
│  Slug: "hdpe-jar-16oz-wide-mouth"                            │
│  Display name: "16 oz HDPE Wide‑Mouth Jar"                   │
│  Reference image (admin uploads, style‑consistent)            │
│  Default topology, default dimensions, allowed surfaces       │
└──────────▲───────────────────────────────────────────────────┘
           │ optional FK (nullable)
┌──────────┴───────────────────────────────────────────────────┐
│  PackagingSystem  (partner‑owned, physical implementation)   │
│  Belongs to: Partner X                                       │
│  Inherits canonical name + image from PackagingType (if FK)  │
│  Falls back to partner‑uploaded name + image (if no FK)      │
│  Partner adds: die‑line per surface, MOQ, exact dimensions,  │
│                price delta, lead time delta                  │
│  ─────────────────────────────────────                       │
│  Admin override fields (always present, win over partner):    │
│    overrideDisplayName, overrideImageFileId                  │
└──────────────────────────────────────────────────────────────┘
```

What the public marketplace shows for a PackagingSystem (priority order):
1. Admin override fields (if set)
2. Linked PackagingType's canonical name + image (if linked)
3. Partner's own name + image (fallback)

This means partners can ship on day 1 with their own photos and names, and admin gradually pulls the catalog into a consistent canonical taxonomy without ever blocking partner work.

### 6.1a Admin powers on PackagingSystem (new)

Admin can, on any partner's PackagingSystem:
- **Edit display name** — writes to `overrideDisplayName`. Partner sees it as the new name with a small "Renamed by admin" note next to the field.
- **Replace image** — writes to `overrideImageFileId`. Partner's original is preserved (we never destroy partner uploads, only override what surfaces).
- **Link to a canonical PackagingType** — sets `packagingTypeId`. After this, name/image fall through the priority above.
- **Promote to canonical PackagingType** — opens a "Create PackagingType from this" modal that pre‑fills name, image, topology, dimensions. After save, admin chooses which existing PackagingSystems (across partners) should be linked to the new type. Bulk re‑link.

All four actions write an AuditLog row + drop a system message in the per‑PackagingSystem notes (same threading model as ProductNote). Partner gets notified.

### 6.1b The collection loop

This gives admin a quiet, ongoing curation task:

1. Partner adds a PackagingSystem ("Round Plastic Jar 16oz") — no PackagingType link, partner image.
2. Two more partners do the same thing with different names ("16oz Jar", "Wide HDPE Container").
3. Admin's `/admin/packaging` queue shows: "3 unlinked PackagingSystems look similar — review?"
4. Admin clicks the cluster, creates a new PackagingType `"16 oz HDPE Wide‑Mouth Jar"` with the best image of the three, and bulk‑links all three PackagingSystems to it.
5. From this moment on: creators searching "16 oz jar" find all three partners. Future partners adding similar packaging see the canonical type in the dropdown.

This is a slow drip — V1 ships with **zero** seeded PackagingTypes, and the catalog matures organically as real partners onboard. By month 6, the most common 50‑100 types should be canonical.

### 6.2 New route: `/partner/packaging`

A small CRUD surface where partners manage their PackagingSystems. Each row maps 1:1 to a `PackagingSystem` from `DESIGN_STUDIO.md`.

| Column            | Example                                            |
|-------------------|----------------------------------------------------|
| Name              | "16 oz HDPE jar — single flavor"                    |
| Topology          | `single_container` / `multi_container_box` / etc.   |
| Unit count        | 1 (single) … 24 (case)                              |
| Flavor mode       | `single` / `multi`                                  |
| Flavor policy     | `creator_pick` / `partner_fixed`                    |
| Surfaces          | Front, Side, Lid (each its own die‑line file)        |
| Status            | `draft` / `active` / `retired`                      |

### 6.3 Adding a packaging system

When the partner clicks **+ Add Packaging**:

1. Choose topology (visual picker: single jar / pouch / box of jars / box of sticks / etc.)
2. Set unit count, flavor mode, flavor policy
3. **Upload one die‑line per surface** (PDF or SVG; we read viewBox + bleed)
4. Tag each surface with its name (Front / Back / Side / Lid / Inner Tray)
5. Optionally: dimensions (LxWxH), max weight, max label area in sq‑in

Once saved, this PackagingSystem is available in any product's step 3.

### 6.4 In the product builder — size‑aware

```
③ Packaging (sizes available on this product)
─────────────────────────────────────────────────────────────────
Pick which of your packaging systems this product ships in. Each
size carries its own pricing, MOQ, lead time, certifications,
and label preview.

  ┌──────────────────────────┐  ┌──────────────────────────┐
  │ ☑ 8oz HDPE jar           │  │ ☑ 16oz HDPE jar          │
  │   single flavor          │  │   single flavor          │
  │   MOQ 100 · lead 14d     │  │   MOQ 100 · lead 14d     │
  │   3 surfaces · die‑lines │  │   3 surfaces · die‑lines │
  └──────────────────────────┘  └──────────────────────────┘

  ┌──────────────────────────┐  [+ Add new packaging system →]
  │ ☑ 32oz HDPE jar          │
  │   single flavor          │
  │   MOQ 50 · lead 18d      │
  │   3 surfaces · die‑lines │
  └──────────────────────────┘
```

The size‑aware sections below now show a **size tab strip** so the partner can address each size independently:

```
④ Pricing                                    [ 8 oz │ 16 oz │ 32 oz ]
────────────────────────────────────────────────
                       Currently editing: 16 oz HDPE jar

   Base price per unit:  $14.20
   ┌──────────────────────────────────────────┐
   │  Quantity  │   Unit price   │   Margin   │
   │     100    │    $14.20      │    34%     │
   │     500    │    $12.10      │    28%     │
   │   1,000    │    $10.80      │    23%     │
   └──────────────────────────────────────────┘
   [+ Add tier]                              [Copy from 8 oz ▾]
```

```
⑤ Certificates                               [ 8 oz │ 16 oz │ 32 oz ]
────────────────────────────────────────────────
                       Currently editing: 16 oz HDPE jar

   ☑ NSF                  ◉ This size only   ○ All sizes
   ☑ USDA Organic         ○ This size only   ◉ All sizes
   ☑ cGMP                 ○ This size only   ◉ All sizes
   ☐ Kosher
```

The "All sizes" / "This size only" toggle writes to `ProductCertificate.appliesToPackagingSystemIds`. Default is "All sizes" — partners only narrow when they need to (e.g., NSF only certified the 16 oz SKU).

The **live label preview** in the right sidebar also gains the same size tabs at the top — switching size re‑renders the panel with that size's total weight, servings per container, and net contents. The compliance scan runs per size and surfaces failures scoped to whichever tab the partner is on.

When a creator orders, the chosen PackagingSystem + creator‑selected flavors flow into the canonical order; the Design Studio (separate spec) is where the actual label artwork lives.

### 6.5 Per‑product die‑line override (optional, advanced)

By default, the die‑lines on a PackagingSystem (catalog level) are what get used for every product running on that system. But sometimes a product needs a tweaked artwork prep — slightly different bleed, extra registration marks, a panel mask for a window cutout. Each ProductTemplatePackaging row gains an optional `surfaceOverrides` map:

```
{ surfaceId: "<id of PackagingSurface>", overrideFileId: "<PartnerFile id>" }[]
```

If present, the override file is used for this product on this size; otherwise the PackagingSystem's catalog die‑line applies. Surfaced in the editor as a small `[Override die‑line ↗]` link next to each surface listing on the size's detail panel. Almost no V1 partner will use this; it's there for when they need it.

## 7. Admin Certificate Library + Partner CertificateInstances

### 7.1 The decision (your idea, confirmed)

Three‑level model:
1. **`CertificateType`** — admin‑curated catalog of recognised certifications. Admin uploads a branded thumbnail per type.
2. **`PartnerCertificateInstance`** — partner uploads their *actual* certificate PDF + expiry date + issuing body. Linked to one CertificateType. Private to admin until verified.
3. **`ProductCertificate`** — partner ticks which of their verified CertificateInstances apply to this specific product. This is what surfaces publicly as a badge.

### 7.2 New admin route: `/admin/certificates`

Admin manages the CertificateType catalog. Each type has:
- Display name ("USDA Organic")
- Slug ("usda-organic")
- Branded badge thumbnail (uploaded by admin, ~256×256, rendered at 64×64 on product pages)
- Description (1–2 sentences — shown on hover)
- Verification requirements (free text — what admin looks for to accept a partner's upload)
- Status: `active` / `deprecated`

Seed catalog at V1 launch (12 types should cover ~95 % of requests):
NSF · USDA Organic · Non‑GMO Project Verified · Kosher · Halal · Gluten‑Free Certified · Vegan Certified · cGMP · FSSC 22000 · SQF · Informed Sport · ISO 22000

### 7.3 New partner route: `/partner/certifications`

Partner manages their CertificateInstances at the company level — not per product. Each instance:
- Picks one CertificateType from the curated dropdown
- Uploads the actual PDF (stored in R2, `partner-certifications/` prefix)
- Sets issuing body, certificate number, issue date, expiry date
- Optional notes for admin

Status flow: `pending_review` → `verified` (admin sets) → `active` until expiry → `expired` (auto‑transitions)
Only `active` instances appear in the product builder's certificate picker.

### 7.4 In the product builder

```
⑤ Certificates                                          (optional)
─────────────────────────────────────────────────────────────────
Verified certifications on your company profile:

  ┌────┐  ☑ NSF                            (Cert #ABC-123, exp 2027‑01‑15)
  │ NSF│
  └────┘
  ┌────┐  ☑ USDA Organic                   (Cert #ORG-456, exp 2026‑12‑01)
  │USDA│
  └────┘
  ┌────┐  ☐ Kosher                         (Cert #K-789, exp 2025‑09‑01) ⚠ expires in 14d
  │ ✡  │
  └────┘

  Pick which of your verified certs apply to this specific product.
  Don't see one you have? [+ Add a new certification to your company →]
```

### 7.5 On the public product detail page

What buyers/creators see:

```
┌─────────────────────────────────────────────────────┐
│  Verified                                            │
│  ┌────┐ ┌────┐ ┌────┐                                │
│  │ NSF│ │USDA│ │ cGMP│   [ⓘ How we verify]          │
│  └────┘ └────┘ └────┘                                │
└─────────────────────────────────────────────────────┘
```

No PDF link. No certificate number. Hover tooltip shows the CertificateType's description + "Verified by iLaunchify on [date]". Click on the small ⓘ opens a modal explaining the verification process and linking to the public certification list page.

**Auto‑hide on expiry:** ProductCertificate badges disappear from the public page when the underlying PartnerCertificateInstance crosses its expiry date. Partner gets an in‑app notification 30 days before expiry.

## 8. The approval workflow (from your shipturtle screenshots — tailored)

Shipturtle had a useful pattern: a partner submits a product and admins have an "Approve / Request Changes / Reject" queue. We're keeping that, with tweaks specific to iLaunchify.

### 8.1 ProductTemplate states

```
draft  ──Submit──▶  pending_review  ──Approve──▶  published
                          │                          │
                          ├──Request changes──▶ needs_changes ──Resubmit──▶ pending_review
                          │
                          └──Reject───────────▶  rejected

           published  ──edit approval‑marked field──▶ pending_edit_review
                                                              │
                                                  Approve ──▶ published
                                                  Request changes ──▶ needs_changes (live ver. kept)
```

Key rule: a product in `pending_edit_review` **still serves its previously published version on the marketplace.** The pending edits are held until admin approves. Creators ordering during this window see the old recipe / pricing.

A `published` product can be **paused** (admin or partner) → `paused`; un‑pausing returns to `published`.

### 8.2 Admin queue at `/admin/products/queue`

The queue is split into two tabs, mirroring the shipturtle pattern:

- **New products** — submissions in `pending_review` (never published before)
- **Edited products** — submissions in `pending_edit_review` (changes to a live product)

Each tab has its own count badge. Default sort = oldest first (FIFO, fairness for partners).

| Column | Notes |
|--------|-------|
| Partner | Company name + link |
| Product | Name + thumbnail |
| Category | |
| Submitted | Relative time |
| Compliance | Green check (passed compliance scan) / Red X with issue count |
| Certificates | Badge stack + "expires soon" warning if any < 30 days |
| Diff (Edited tab only) | "5 changes" pill — opens side‑by‑side diff of old vs proposed |
| Notes | Unread count from the per‑product notes thread |
| Actions | Approve · Request changes (opens checklist modal) · Reject |

Top of the page: search box (partner name, product name, SKU) + filter pills (Category · Compliance failed · Notes unread · Certificates expiring).

**Compliance pre‑check:** before admin sees the row, the compliance service has already run. Red rows include the failed rule IDs from the rule pack — admin doesn't need to manually inspect the panel.

**Diff view on the Edited tab:** clicking the row opens a panel showing each changed approval‑marked field side‑by‑side (left = live, right = proposed). Admin can approve the whole submission or check off individual changes to accept while requesting changes on the rest.

### 8.3 Request changes — checklist modal

A structured checklist of things to fix, not a free‑text comment box. Each ticked item becomes a `ProductReviewItem` row that shows up in the partner's editor as a red callout next to the offending section. Examples:
- "Ingredient slot 2 needs USDA fdc_id, not a custom name"
- "Packaging system X is in draft — make active before submitting"
- "Hero image must be ≥ 1200×1200 px"
- Free‑text "Other" allowed but discouraged.

When partner re‑submits, all items must be resolved (checked off) or the submission is blocked client‑side.

## 8a. Per‑product Notes thread (partner ↔ admin)

Every product carries a lightweight comment thread, scoped to that single product. Not for structured "fix this" items (those are ProductReviewItems — checkable, blocking) but for the messy human stuff: "Hey, can you reshoot the hero with better lighting?" / "We swapped supplier on the whey, here's the new spec sheet PDF" / "OK approved but heads up the cocoa source is on a 2‑week lead in May".

Implementation:
- Renders in the right rail of the admin queue's detail panel and in a collapsible card on the partner's editor.
- Threaded list, each message has author + timestamp + optional file attachment.
- Notifications fire to the other side (partner notified when admin posts; admin notified when partner posts).
- Stored as `ProductNote` rows, no soft delete — only edit‑within‑5‑minutes, then locked.
- Unread count appears in the queue table for admins and in the partner's products list.

## 8b. Field‑level approval map (which edits re‑trigger review)

The boundary between "edit goes live immediately" and "edit holds for admin" is defined by the table in §4.3 plus this canonical map, stored once in code and referenced by both the UI (to show the 🅰 badge) and the autosave handler (to set the next status):

| Field path on ProductTemplate | Re‑approval? |
|-------------------------------|:------------:|
| `name`                         | Yes |
| `categoryId` / `subcategoryId` | Yes |
| `slots[*].*`                   | Yes |
| `flavorPresets[*]` (add or edit slot picks / extras / priceDelta) | Yes |
| `flavorPresets[*].swatchHex` / `swatchImageFileId` | No (cosmetic only) |
| `flavorPresets[*]` (retire) | No |
| `packagingSystems[*]` (add/remove) | Yes |
| `packagingSystems[*].priceDeltaCents` | Yes |
| `pricingTiers[*]`              | Yes |
| `certificates[*]` (add only)   | Yes |
| `allergens.crossContamination` | Yes |
| `allergens.manualOverrides[*]` | Yes |
| `internalSku` / `manufacturerSku` | No |
| `tags[*]`                      | No |
| `description`                  | No |
| `media[*]`                     | No |
| `customMeta[*]`                | No |
| `finishedProductWeight`        | No (it's deterministic from slots) |
| `storage`                      | No |
| `certificates[*]` (remove only) | No |
| `allergens.autoDerivedBig9[*]` | n/a (derived — only changes when ingredients change) |

Lives in `packages/products/src/approval-map.ts`. Adding a new approval‑sensitive field = update the map, write a migration, ship.

## 9. Variants — what we take from shipturtle, what we change

Shipturtle showed a clean "Variants" table with thumbnails, SKU, price, stock per row. We use a similar visual pattern but the semantics are different:

**Shipturtle's variants** = SKU‑level inventory units (Red T‑shirt L, Red T‑shirt M, Blue T‑shirt L …)
**Our variants** = a derived combination of (PackagingSystem × selected slot options × pricing tier) that the partner can preview but not directly edit.

The partner edits the *generators*: ingredient slots, packaging catalog selections, pricing tiers. The variant table is **read‑only** — a confidence check showing "given everything you've set, here's what creators will see as available SKUs." Eg:

| Variant preview              | Packaging        | Flavor (slot 3) | Tier  | Per‑unit | MOQ |
|------------------------------|------------------|-----------------|-------|----------|-----|
| Whey Protein — Chocolate jar | 16oz HDPE jar    | Cocoa Powder    | 100   | $14.20   | 100 |
| Whey Protein — Vanilla jar   | 16oz HDPE jar    | Vanilla Extract | 100   | $14.20   | 100 |
| Whey Protein — Strawberry jar| 16oz HDPE jar    | Strawberry Pwd  | 100   | $14.20   | 100 |
| Whey Protein — Chocolate jar | 16oz HDPE jar    | Cocoa Powder    | 500   | $12.10   | 500 |
| … (24 rows)                                                                            |

This is a debugging surface, not a data‑entry surface. If a partner thinks "wait, why is there no 32oz vanilla?" they jump to step 3 and check what they ticked.

## 10. AI paste‑in assist (V1 scope locked)

A "Paste a recipe" button at the top of step 2 (Ingredients). Opens a textarea. User pastes anything — a supplement facts panel, a Google Doc, a hand‑typed list. We send it to the compliance service which runs the same parser FOD had (lines 3521–3620 in `EnhancedRecipeBuilder.tsx`) and pre‑fills slots.

**V1:** text only. No OCR. No image upload here.
**V1.1:** add an image upload that runs through Tesseract OCR before paste parsing.
**V1.2:** swap Tesseract for a vision LLM (likely Claude Haiku via the AI service) for higher accuracy on complex panels.

The parsed result is always shown in a preview side‑by‑side with the textarea before applying. Partner can edit any field before clicking Accept. Nothing auto‑commits.

## 11. Template versioning — V1 decision: snapshot at order

When a creator orders, we snapshot the full ProductTemplate (recipe + packaging + pricing) into the Order row. The partner editing the template afterwards does not change in‑flight orders.

V1 = always snapshot. No opt‑in upgrades, no "latest" behaviour. Reasoning: it's the safest path and matches creator expectations ("what I customized is what I'm getting").

V1.1+ may add an opt‑in "Subscribe to template updates" toggle on the creator side for recurring orders, but it's out of scope here.

## 12. Autosave, drafts, and offline behaviour

- Every keystroke schedules a 1.2 s debounced save to `PATCH /api/partner/products/[id]`.
- The autosave indicator in the editor header shows: `Saving…` → `Saved 4s ago` → `Saved 1m ago` (relative).
- A network failure shows a non‑dismissable banner: "Couldn't save your last change. Retrying…" Auto‑retries with exponential backoff.
- Conflict resolution: if two tabs edit the same template, last writer wins for sections, but the editor warns when the version stamp it loaded with no longer matches the server.
- No localStorage persistence — server is canonical. (FOD's localStorage caused the duplicate‑recipe bug in `RECIPE_MANAGEMENT_CRITICAL_FIXES.md`.)

## 13. Live label preview (sticky right sidebar)

- Renders the FDA Nutrition Facts / Supplement Facts panel as it will print.
- Re‑renders on every successful save (so it always matches what the server has).
- Click any cell in the preview → scrolls the left‑panel editor to the slot/field that produces that cell.
- Compliance failures show as red‑outlined cells with the failed rule ID on hover.
- A **Download PDF** button generates a high‑res PDF via the WeasyPrint route already wired in the compliance service (`apps/services/compliance/.../label.py`).

## 14. Custom meta fields (from shipturtle, scoped)

A small key‑value pairs section at the bottom of the editor. Use cases:
- Partner wants to declare "Made in: California" on the product page
- Partner wants to add an "Award" line
- Storage condition strings ("Keep refrigerated below 4°C")

Strings only in V1. No structured types. Capped at 10 pairs per product. Rendered on the public detail page in a `<dl>` below the description. No effect on compliance or pricing.

## 15. Schema additions (V1.5 migration)

```prisma
model PackagingType {
  // admin-curated canonical taxonomy. Starts empty at V1 launch and grows
  // as admin clusters partner-contributed PackagingSystems.
  id            String   @id @default(cuid())
  slug          String   @unique
  displayName   String                            // canonical name shown publicly
  imageFileId   String?                           // admin-curated reference photo
  defaultTopology   PackagingTopology
  defaultDimensions Json?
  defaultSurfaces   Json?                         // [{name, defaultBleedMm}]
  status        PackagingTypeStatus               // ACTIVE | DEPRECATED
  systems       PackagingSystem[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model PackagingSystem {
  id                    String   @id @default(cuid())
  partnerId             String
  packagingTypeId       String?                       // optional FK to canonical type
  // Partner-supplied (used as fallback when no type or no admin override):
  partnerName           String
  partnerImageFileId    String?
  // Admin override layer (wins over partner if set):
  overrideDisplayName   String?
  overrideImageFileId   String?
  // Physical implementation:
  topology              PackagingTopology
  unitCount             Int      @default(1)
  flavorMode            FlavorMode
  flavorPolicy          FlavorPolicy
  moq                   Int
  dimensions            Json?                         // { lengthMm, widthMm, heightMm }
  maxWeightG            Int?
  status                PackagingStatus               // DRAFT | ACTIVE | RETIRED
  surfaces              PackagingSurface[]
  partner               Partner          @relation(fields: [partnerId], references: [id])
  packagingType         PackagingType?   @relation(fields: [packagingTypeId], references: [id])
  templates             ProductTemplatePackaging[]
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  @@index([partnerId, status])
  @@index([packagingTypeId])
}

// Display-name resolution (computed in app, not stored):
//   1. overrideDisplayName  if set
//   2. packagingType.displayName  if linked
//   3. partnerName  (fallback)
// Image resolution mirrors the same priority.

model PackagingSurface {
  id                String   @id @default(cuid())
  packagingSystemId String
  name              String              // "Front", "Lid", "Inner Tray"
  dieLineFileId     String?             // PartnerFile
  printableAreaSqIn Float?
  bleedMm           Float?              @default(3)
  packagingSystem   PackagingSystem @relation(fields: [packagingSystemId], references: [id], onDelete: Cascade)
  dieLineFile       PartnerFile?    @relation(fields: [dieLineFileId], references: [id])
}

model CertificateType {
  id                  String   @id @default(cuid())
  name                String
  slug                String   @unique
  thumbnailFileId     String?             // AdminFile, ~256×256
  description         String
  verificationNotes   String?
  status              CertStatus          // ACTIVE | DEPRECATED
  partnerInstances    PartnerCertificateInstance[]
  createdAt           DateTime @default(now())
}

model PartnerCertificateInstance {
  id                  String   @id @default(cuid())
  partnerId           String
  certificateTypeId   String
  pdfFileId           String              // PartnerFile, private
  certificateNumber   String?
  issuingBody         String?
  issueDate           DateTime?
  expiryDate          DateTime
  status              InstanceStatus      // PENDING_REVIEW | VERIFIED | EXPIRED | REJECTED
  reviewedById        String?             // admin User
  reviewedAt          DateTime?
  rejectionReason     String?
  partner             Partner          @relation(fields: [partnerId], references: [id])
  certificateType     CertificateType  @relation(fields: [certificateTypeId], references: [id])
  productAssignments  ProductCertificate[]
  @@index([partnerId, status])
  @@index([expiryDate])
}

model ProductCertificate {
  productTemplateId            String
  instanceId                   String
  // Per-size scope. NULL = applies to ALL PackagingSystems on this product.
  // If set, applies only to the listed PackagingSystems (e.g., NSF cert for
  // 16oz SKU only).
  appliesToPackagingSystemIds  String[]
  productTemplate              ProductTemplate            @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  instance                     PartnerCertificateInstance @relation(fields: [instanceId], references: [id])
  @@id([productTemplateId, instanceId])
}

model ProductReviewItem {
  id                  String   @id @default(cuid())
  productTemplateId   String
  category            String              // "ingredients" | "packaging" | "media" | "compliance" | "other"
  description         String
  resolved            Boolean  @default(false)
  resolvedAt          DateTime?
  createdById         String              // admin User
  productTemplate     ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt           DateTime @default(now())
}

// ProductTemplate gains:
model ProductTemplate {
  // ... existing fields ...
  status                  ProductTemplateStatus  // DRAFT | PENDING_REVIEW | NEEDS_CHANGES | PUBLISHED | PENDING_EDIT_REVIEW | PAUSED | REJECTED
  pendingEditPayload      Json?                  // proposed edits while in PENDING_EDIT_REVIEW; live row keeps serving until approved
  customMeta              Json?                  // [{key, value}] up to 10 pairs
  finishedProductWeightG  Int?                   // derived from slots; cached for shipping calc
  // Allergens: auto-derived big9 is computed from slots and not stored.
  // What IS stored = partner-input fields:
  allergenCrossContamination String?             // free-text statement
  allergenManualOverrides    Json?               // [{ allergen: "soy", reason: "trace shared line" }]
  packagingSystems        ProductTemplatePackaging[]
  certificates            ProductCertificate[]
  reviewItems             ProductReviewItem[]
  notes                   ProductNote[]
  // ... existing relations ...
}

model ProductNote {
  id                  String   @id @default(cuid())
  productTemplateId   String
  authorId            String
  authorType          NoteAuthor          // PARTNER | ADMIN
  body                String
  attachmentFileId    String?
  editedAt            DateTime?
  productTemplate     ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt           DateTime @default(now())
  @@index([productTemplateId, createdAt])
}

model ProductTemplatePackaging {
  // The bridge between a product and one of its sizes. Each row owns its
  // own pricing tiers, lead time, MOQ override, and optional die-line overrides.
  productTemplateId String
  packagingSystemId String
  basePriceCents    Int                            // per unit at base MOQ
  moqOverride       Int?                            // overrides PackagingSystem.moq if set
  leadTimeDays      Int                             // absolute, not delta
  pricingTiers      Json                            // [{ minQuantity, unitPriceCents }]
  surfaceOverrides  Json?                           // [{ surfaceId, overrideFileId }]
  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  packagingSystem   PackagingSystem @relation(fields: [packagingSystemId], references: [id])
  @@id([productTemplateId, packagingSystemId])
}
```

Forward‑only migration. New enums added carefully (Cockroach default ADD VALUE rules).

## 16. API surface

```
# Partner — packaging catalog
GET    /api/partner/packaging
POST   /api/partner/packaging
PATCH  /api/partner/packaging/[id]
POST   /api/partner/packaging/[id]/surfaces
DELETE /api/partner/packaging/[id]/surfaces/[surfaceId]

# Partner — certifications (company‑level)
GET    /api/partner/certifications
POST   /api/partner/certifications              # creates pending_review instance
PATCH  /api/partner/certifications/[id]

# Partner — products
GET    /api/partner/products
POST   /api/partner/products                    # creates draft, returns id (stepper landing)
GET    /api/partner/products/[id]
PATCH  /api/partner/products/[id]               # the autosave endpoint
POST   /api/partner/products/[id]/submit        # draft → pending_review
POST   /api/partner/products/[id]/pause
POST   /api/partner/products/[id]/resume

# Admin — review
GET    /api/admin/products/queue
POST   /api/admin/products/[id]/approve
POST   /api/admin/products/[id]/request-changes # body: [{category, description}]
POST   /api/admin/products/[id]/reject

# Admin — certificates
GET    /api/admin/certificates                  # CertificateType catalog
POST   /api/admin/certificates
PATCH  /api/admin/certificates/[id]
GET    /api/admin/certificate-instances/queue   # PartnerCertificateInstance pending_review
POST   /api/admin/certificate-instances/[id]/verify
POST   /api/admin/certificate-instances/[id]/reject

# Admin — packaging curation (two-tier overlay)
GET    /api/admin/packaging-types                       # canonical taxonomy
POST   /api/admin/packaging-types
PATCH  /api/admin/packaging-types/[id]
GET    /api/admin/packaging-systems                     # all partners' systems
GET    /api/admin/packaging-systems/clusters            # heuristic similarity groupings
PATCH  /api/admin/packaging-systems/[id]                # set override name/image, set typeId
POST   /api/admin/packaging-systems/promote-to-type     # body: { sourceSystemId, typeFields, linkSystemIds[] }

# Compliance (used by editor + queue)
POST   /api/compliance/preview                  # body: ProductTemplate JSON → label HTML + rule failures
POST   /api/compliance/label.pdf                # WeasyPrint route
```

## 17. Component tree (frontend)

```
apps/partner/src/app/(authed)/products/
├── page.tsx                       # list (table)
├── new/page.tsx                   # 4‑step stepper
└── [id]/
    ├── edit/page.tsx              # single‑page editor
    └── edit/components/
        ├── BasicsCard.tsx
        ├── IngredientsCard/
        │   ├── SlotEditor.tsx
        │   ├── IngredientPicker.tsx        # USDA + custom
        │   ├── PasteRecipeDialog.tsx       # V1 paste‑in assist
        │   └── FlavorsPanel/
        │       ├── FlavorPresetCard.tsx    # the small swatch card
        │       ├── FlavorInlineEditor.tsx  # opens inline, not modal
        │       └── ExtrasList.tsx
        ├── AllergensCard/
        │   ├── Big9AutoDerived.tsx         # read‑only checkmarks from recipe
        │   ├── CrossContaminationEditor.tsx
        │   ├── ManualOverrideDialog.tsx    # requires typed reason
        │   └── CustomizationImpactWarning.tsx
        ├── PackagingCard/
        │   ├── CatalogPicker.tsx           # from /partner/packaging
        │   └── PerPackagingOverrides.tsx
        ├── PricingCard/
        │   ├── TierLadderEditor.tsx
        │   └── CostBreakdown.tsx
        ├── CertificatesCard/
        │   ├── InstancePicker.tsx          # from /partner/certifications
        │   └── ExpiryWarning.tsx
        ├── MediaCard.tsx
        ├── CustomMetaCard.tsx
        ├── VariantPreviewTable.tsx
        ├── LiveLabelPreview.tsx            # sticky sidebar
        └── ReviewItemsBanner.tsx           # if status=NEEDS_CHANGES
```

State: TanStack Query for server state (the autosave mutation, the compliance preview query). React Hook Form per card. Zod schemas in `packages/schemas`. No global Redux/Zustand — every card owns its slice via form context.

## 18. What we deliberately are NOT building (yet)

| Feature                                        | Why deferred | Lands in |
|------------------------------------------------|--------------|----------|
| OCR of pasted label images                     | Tesseract accuracy uneven on supplement panels | V1.1 |
| AI spec‑sheet PDF parser for custom ingredients | Depends on broader AI service infrastructure | V1.1 |
| Vision‑LLM recipe extraction                   | Cost + latency unknown until V1 is live | V1.2 |
| Bulk import (CSV / shipturtle‑style)           | First need to learn how many products partners actually have | V1.5 |
| Sub‑recipes (recipe‑as‑ingredient) | Powerful but adds circular‑reference detection, parent‑label propagation, allergen union across nested levels — non‑trivial. Recipal has it after 15 years; we don't need it on day 1. | V1.5 |
| Nutrient content claims auto‑alerts ("qualifies as high‑in‑protein") | Useful marketing aid; not blocking compliance | V1.1 |
| Moisture / yield loss adjustment as a category default | Manual overrides cover this for V1; default presets help baked / dehydrated / fermented partners | V1.1 |
| Public ingredient + recipe API for partners | Wait for V1 patterns to stabilise | V2 |
| Multi‑partner packaging handoffs                | Cross‑partner FSM is a separate scoping exercise | V2 |
| Creator‑subscribable template updates           | Most creators want snapshot semantics | V1.1 |
| Inventory tracking after delivery               | Out of scope per PLATFORM_SPEC.md | V1.1 |
| Structured custom meta types (numbers, lists)   | Strings cover 95 % of asks | V1.5 |
| Per‑variant SKU codes                           | Variant table is derived in V1; SKU codes can come from packaging+slots later | V1.5 |

## 19. Migration strategy from FOD's EnhancedRecipeBuilder

We are **not** porting the component. We are porting the *ideas*. The strengths we carry over:

| FOD concept                                   | New home |
|-----------------------------------------------|----------|
| Slot‑based ingredient model (line 44)         | `IngredientsCard/SlotEditor.tsx` + Prisma `RecipeSlot` |
| Live nutrition calculation (line 1016)        | TanStack Query against `/api/compliance/preview` |
| Dual‑unit support (2043)                      | Server‑side unit conversion via USDA density |
| Intelligent defaults per category (3001)      | Compliance rule‑pack‑driven defaults loaded on category select |
| AI paste‑in (3521)                            | `PasteRecipeDialog.tsx` (V1, text only) |
| Replaceable tiers (3857)                      | Native to the schema; UI is `SlotEditor` |
| Cost analysis (2566)                          | `CostBreakdown.tsx` in PricingCard |
| Duplicate detection (1584)                    | Server‑side validation on save |

The mistakes we explicitly avoid:
- One mega‑component with 209 useHooks → many small cards, each ≤ 200 LOC
- localStorage as canonical → server canonical, no localStorage at all
- Manual unit conversion chains in UI → server does the math
- Implicit recipe IDs leaking through async params → typed route params + Zod parse at the boundary
- Compliance check as a separate "Run check" button → continuous live preview

## 20. Build plan (rough — ~3 weeks elapsed)

| Week | Scope |
|------|-------|
| **W1** | Schema migration + Packaging Catalog CRUD (`/partner/packaging`) + Certificate Library admin CRUD + PartnerCertificateInstance flow + admin verification queue |
| **W2** | Product builder stepper (4 steps) + editor shell + Basics/Ingredients/Pricing cards + autosave + live label preview wired |
| **W3** | Packaging/Certificates/Media/CustomMeta cards + admin review queue + request‑changes checklist + variant preview table + paste‑in dialog + smoke‑test seed |

V1.1 work (OCR, expiry notifications, inventory) starts after this lands.

## 21. Open questions (none blocking)

- Should the partner packaging catalog be limited to active count (eg max 25) in V1 to keep the picker UX tight? — Default: no limit, add a search box if a partner exceeds 15.
- Should Custom Meta values support markdown? — Default: no. Plain text only.
- Where do the "expires in N days" warnings surface besides the certificate card? — Default: notification bell + a banner on `/partner/dashboard`. Detail in B1 wiring (already shipped).

---

## Appendix A — How this compares to shipturtle's pattern

| shipturtle pattern                  | Used in iLaunchify?                | How tailored |
|-------------------------------------|------------------------------------|--------------|
| Variants table with thumbnails       | Yes — `VariantPreviewTable.tsx`     | Read‑only / derived from slots × packaging × tiers |
| Approve queue                       | Yes — `/admin/products/queue`       | Adds compliance pre‑check + structured checklist instead of free‑text comments |
| Status pills                        | Yes                                | Adds `PAUSED` and `NEEDS_CHANGES`; status drives the editor banner |
| Custom meta fields                  | Yes — `CustomMetaCard.tsx`          | Strings only, capped at 10, plain text |
| Single‑page product form            | Yes for edit                       | Combined with stepper for first‑create |
| Per‑product file uploads (free‑form)| **No** — we use Catalogs           | Die‑lines and certificates are catalog‑managed, not per‑product uploads |
| Per‑product certificate uploads     | **No**                             | Admin curates types, partners maintain verified instances at company level |
| Public PDF certificate links        | **No**                             | Public sees badge thumbnail only; PDFs stay private to admin verification |
