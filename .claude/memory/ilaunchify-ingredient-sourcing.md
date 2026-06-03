---
name: ilaunchify-ingredient-sourcing
description: Three-tier ingredient source model (USDA + iLaunchify Curated Library + Partner-private) feeding one unified picker; two-name model (internalName vs labelDeclarationName) lets FDA-allowed generic label declarations coexist with specific supplier SKUs.
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, every ingredient — base recipe, flavor preset slot pick, flavor extras — comes from a unified IngredientPicker. Architecture is **local-first with live USDA fallback**, layered:

1. **Layer 1 (default, ~50ms p99)**: pre-loaded local DB containing (a) USDA Foundation Foods + SR Legacy (~10k lab-tested items), (b) filtered subset of USDA Branded Foods (~30-50k whole-ingredient SKUs, dropping finished consumer products), (c) iLaunchify Curated Library (~1,000-1,200 supplement-specific items, admin-curated AGGRESSIVE seed), (d) Partner-private items (scoped to one partner).
2. **Layer 1.5 (on-demand, ~500ms)**: "Search wider in USDA full catalog →" button queries USDA FDC live API. On pick, the result is COPIED into local DB so the next partner searching the same term hits Layer 1. Graceful degradation if USDA down/rate-limited.
3. **Layer 3**: Partner-private "Add custom ingredient" flow for supplier-specific SKUs (Symrise Vanilla 67-B, PuraSpec Whey 85) with COA-driven nutrient panel.

The "1.4M USDA items" figure is mostly Branded Foods (finished CPG products). The lab-tested high-quality subset (Foundation + SR Legacy) is only ~10k items. Local-first beats live-first because USDA API is slow (200-800ms), rate-limited (1000 req/hr/key), periodically down, and noisy (search "almond butter" → 800 brand variants vs 5 useful ingredients post-filter).

All three normalize to the same Ingredient shape downstream — source enum + sourceRefId + internalName + labelDeclarationName + nutrientProfilePer100g + density + allergenFlags. The downstream compliance service doesn't care where an ingredient came from.

**Two-name model:** every Ingredient has `internalName` (used in recipe editor, cost analysis, COA matching) AND `labelDeclarationName` (printed on the FDA label). FDA 21 CFR 101.22(h)(3) allows generic declarations like "Natural Flavor" / "Color (vegetable juice)" — so the internal SKU can be "Symrise Vanilla 67-B" while the printed label says "Natural Flavor." Defaults are `labelDeclarationName = internalName` unless explicitly overridden. Override lives on the Ingredient, NOT on the FlavorPreset.

**Accuracy ownership:** FDA tolerance is ±20% per 21 CFR 101.9(g). The system guarantees math correctness, USDA-authoritative source values, and rule-pack pinning per published product. Partners own picking the right source item, maintaining their private library against supplier COAs, and validating each production batch via lot-level COA. Admin owns Library curation and verification of partner uploads.

**Why:** Pavel asked 2026-05-24 how flavor ingredients (cocoa, vanilla, strawberry powder, beet juice) get sourced and how the label stays accurate. The answer was that flavors aren't a special category — they're regular ingredients selected via the same picker, and the picker has to be layered because USDA covers whole foods well but supplement actives poorly.

**How to apply:** When designing or building anything that searches/picks/displays ingredients, treat USDA / Library / Private as one unified Ingredient surface with source badges. Never special-case "flavor ingredients" — they're just ingredients. When generating the printed label, always use `labelDeclarationName`; everywhere else use `internalName`. See [[ilaunchify-flavors-as-presets]] for the flavor preset overlay model that consumes these ingredients.

Canonical spec: `docs/MANUFACTURER_PRODUCT_BUILDER.md` §4a.
