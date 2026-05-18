# Compliance — FDA Rule Pack Design

**Status:** Draft for Pavel approval. Maps the FDA labeling source documents to the iLaunchify rule-pack schema. Source of truth for `services/compliance/app/rule_packs/us-fda-food-2026.json` and `us-fda-supplements-2026.json`.

---

## Source documents

These are the FDA documents the compliance engine encodes:

| Document | Source | Local copy | Year |
|---|---|---|---|
| FDA Food Labeling Guide | https://www.fda.gov/food/food-labeling-nutrition/food-labeling-guide | [`docs/compliance-references/FDA-Food-Labeling-Guide.pdf`](compliance-references/FDA-Food-Labeling-Guide.pdf) | Jan 2013 (supersedes Oct 2009) |
| FDA Dietary Supplement Labeling Guide | https://www.fda.gov/food/dietary-supplements-guidance-documents-regulatory-information/dietary-supplement-labeling-guide | Online (HTML chapters + appendices) | April 2005 |

### ⚠️ Critical regulatory-currency note

**Both guidance documents predate the 2016 Nutrition Facts redesign** (finalized for full compliance in 2020 for large manufacturers, 2021 for small). They are *foundational* — the structure, claim taxonomy, and labeling architecture they describe is largely intact — but the actual *numeric* requirements have changed:

| Topic | Old (per the source docs) | Current (must be in rule pack) |
|---|---|---|
| Mandatory nutrients | Vit A, Vit C, Calcium, Iron | **Vitamin D, Calcium, Iron, Potassium** (Vit A and Vit C no longer mandatory) |
| Added sugars | Not separately required | **Added Sugars line item required** under Total Sugars |
| Calories from Fat | Required | **Removed** — no longer required |
| Daily Values | Old DRVs/RDIs | Updated DVs (e.g., Total Fat DV changed; Vit D DV is now 20 mcg) |
| Serving sizes (RACC) | 1993 reference amounts | Updated 2016 reference amounts for several categories |
| Allergens | Big 8 (per FALCPA 2004) | **Big 9** — sesame added by FASTER Act of 2021 |
| Label format | Old format | New format with bolder Calories, larger type sizes |

**The PDF gives us the structure; the rule pack must encode 2020+ current regulations.** The authoritative source for *current* numbers is:

1. **21 CFR 101** (Code of Federal Regulations, Title 21, Part 101) — accessed via eCFR.gov, version dated to our rule pack version.
2. **FDA "Changes to the Nutrition Facts Label" industry resources** — the 2016 redesign documentation.
3. **FASTER Act of 2021** — for the sesame allergen addition.

When building each rule pack version, cite the specific CFR sections it encodes. This is part of the rule pack's audit trail.

---

## Rule pack JSON schema

The schema is intentionally data-driven so adding a jurisdiction is data work, not code work.

```typescript
interface RulePack {
  // Identification
  id: string                    // e.g., "us-fda-food-2026.01"
  version: string               // semver: "1.0.0"
  effectiveFrom: string         // ISO date
  jurisdiction: 'US'            // enum
  productCategory: ProductCategory  // FOOD | SUPPLEMENT | (future: BEVERAGE_FUNCTIONAL, etc.)
  authoritySource: AuthorityReference[]  // CFR citations + guidance doc references

  // Panel format
  panelFormat: PanelFormat       // STANDARD | TABULAR | LINEAR | SIMPLIFIED | DUAL_COLUMN
  panelDimensions: PanelDimensions  // min widths, type sizes per format

  // Nutrients
  mandatoryNutrients: NutrientRule[]    // must appear, even if zero
  conditionalNutrients: ConditionalNutrientRule[]  // appear if quantity > threshold
  voluntaryNutrients: VoluntaryNutrientRule[]      // creator may add

  // Daily Values
  dailyValues: DailyValueMap     // { vitaminD: 20mcg, calcium: 1300mg, ... }

  // Rounding rules (from Appendix H of the food guide)
  roundingRules: RoundingRule[]

  // Allergens
  allergenList: AllergenDefinition[]      // Big 9 + tree-nut subtypes
  allergenStatementFormat: 'CONTAINS' | 'IN_INGREDIENTS' | 'BOTH_OPTIONAL'

  // Claims
  nutrientContentClaims: ClaimRule[]      // "low fat", "high in fiber", etc.
  healthClaims: ClaimRule[]                // authorized + qualified
  structureFunctionClaims: ClaimRule[]    // supplements: required disclaimer
  prohibitedClaims: ProhibitedClaim[]     // diagnose/treat/cure/prevent disease

  // Disclosure requirements
  requiredDisclosures: DisclosureRule[]   // "Contains: ..." allergen statement, "These statements have not been evaluated..." disclaimer

  // Type sizes & visual
  minimumTypeSize: TypeSizeRule[]         // by element + package size

  // Audit trail
  changes: RulePackChange[]               // what changed vs. previous version
}
```

The full TypeScript types live in `packages/types/src/compliance.ts`; the JSON schema is what gets shipped in `services/compliance/app/rule_packs/`.

---

## V1 food rule pack — `us-fda-food-2026.json`

### What it enforces

Based on Section 7 (Nutrition Labeling) and Section 8 (Claims) of the Food Labeling Guide, updated to current 21 CFR 101 (2020+ format).

**Panel format:** STANDARD (the common vertical layout). V1 doesn't ship TABULAR, LINEAR, SIMPLIFIED, or DUAL_COLUMN — add when there's a real product that needs them.

**Mandatory nutrients (current 21 CFR 101.9, post-2016):**
1. Calories
2. Total Fat (with Saturated Fat and Trans Fat sub-listed)
3. Cholesterol
4. Sodium
5. Total Carbohydrate (with Dietary Fiber, Total Sugars, Added Sugars sub-listed)
6. Protein
7. Vitamin D
8. Calcium
9. Iron
10. Potassium

**Conditional nutrients** (must appear if present above thresholds or if claims are made):
- Polyunsaturated Fat, Monounsaturated Fat (if labeled or claims about them)
- Soluble/Insoluble Fiber (if Total Fiber is broken down)
- Sugar Alcohol (if present in product)

**Voluntary nutrients:** Vitamin A, Vitamin C, Vitamin E, B vitamins, Magnesium, Zinc, etc. (the rest of the table in Appendix G of the supplement guide).

### Daily Values (2020 update)

```json
"dailyValues": {
  "totalFat":          { "value": 78,    "unit": "g" },
  "saturatedFat":      { "value": 20,    "unit": "g" },
  "cholesterol":       { "value": 300,   "unit": "mg" },
  "sodium":            { "value": 2300,  "unit": "mg" },
  "totalCarbohydrate": { "value": 275,   "unit": "g" },
  "dietaryFiber":      { "value": 28,    "unit": "g" },
  "addedSugars":       { "value": 50,    "unit": "g" },
  "protein":           { "value": 50,    "unit": "g" },
  "vitaminD":          { "value": 20,    "unit": "mcg" },
  "calcium":           { "value": 1300,  "unit": "mg" },
  "iron":              { "value": 18,    "unit": "mg" },
  "potassium":         { "value": 4700,  "unit": "mg" }
  // … plus voluntary nutrients
}
```

(DVs from 21 CFR 101.9(c)(8)(iv) — current 2020 table for adults and children ≥4.)

### Rounding rules

Encoded directly from Appendix H of the Food Labeling Guide. The Python compliance engine reads this table:

```json
"roundingRules": [
  {
    "nutrient": "calories",
    "rules": [
      { "if": "<5",    "expressAs": "0" },
      { "if": "<=50",  "increment": 5 },
      { "if": ">50",   "increment": 10 }
    ],
    "insignificantThreshold": 5,
    "cfrCitation": "21 CFR 101.9(c)(1)"
  },
  {
    "nutrient": "totalFat",
    "rules": [
      { "if": "<0.5",  "expressAs": "0" },
      { "if": "<5",    "increment": 0.5 },
      { "if": ">=5",   "increment": 1 }
    ],
    "insignificantThreshold": 0.5,
    "cfrCitation": "21 CFR 101.9(c)(2)"
  },
  {
    "nutrient": "cholesterol",
    "rules": [
      { "if": "<2",       "expressAs": "0" },
      { "if": "2-5",      "expressAs": "less than 5 mg" },
      { "if": ">5",       "increment": 5 }
    ],
    "insignificantThreshold": 2,
    "cfrCitation": "21 CFR 101.9(c)(3)"
  },
  {
    "nutrient": "sodium",
    "rules": [
      { "if": "<5",       "expressAs": "0" },
      { "if": "5-140",    "increment": 5 },
      { "if": ">140",     "increment": 10 }
    ],
    "insignificantThreshold": 5,
    "cfrCitation": "21 CFR 101.9(c)(4)"
  },
  {
    "nutrient": "potassium",
    "rules": [
      { "if": "<5",       "expressAs": "0" },
      { "if": "5-140",    "increment": 5 },
      { "if": ">140",     "increment": 10 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(5)"
  },
  {
    "nutrient": "totalCarbohydrate",
    "rules": [
      { "if": "<0.5",     "expressAs": "0" },
      { "if": "<1",       "expressAs": "less than 1 g" },
      { "if": ">=1",      "increment": 1 }
    ],
    "insignificantThreshold": 1,
    "cfrCitation": "21 CFR 101.9(c)(6)"
  },
  {
    "nutrient": "dietaryFiber",
    "rules": [
      { "if": "<0.5",     "expressAs": "0" },
      { "if": "<1",       "expressAs": "less than 1 g" },
      { "if": ">=1",      "increment": 1 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(6)(i)"
  },
  {
    "nutrient": "totalSugars",
    "rules": [
      { "if": "<0.5",     "expressAs": "0" },
      { "if": "<1",       "expressAs": "less than 1 g" },
      { "if": ">=1",      "increment": 1 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(6)(ii)"
  },
  {
    "nutrient": "addedSugars",
    "rules": [
      { "if": "<0.5",     "expressAs": "0" },
      { "if": "<1",       "expressAs": "less than 1 g" },
      { "if": ">=1",      "increment": 1 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(6)(iii)"
  },
  {
    "nutrient": "protein",
    "rules": [
      { "if": "<0.5",     "expressAs": "0" },
      { "if": "<1",       "expressAs": "less than 1 g" },
      { "if": ">=1",      "increment": 1 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(7)"
  },
  {
    "nutrient": "vitaminsAndMinerals",
    "expressAs": "percentDailyValue",
    "rules": [
      { "if": "<2",       "expressAs": "0" },
      { "if": "<=10",     "increment": 2 },
      { "if": "10-50",    "increment": 5 },
      { "if": ">50",      "increment": 10 }
    ],
    "cfrCitation": "21 CFR 101.9(c)(8)"
  }
],
"halfwayRoundingRule": "round_up"
```

This table is what the `CalculationEngine.round_nutrient(value, nutrient, rulePack)` method consults. Today the FOD `calc_service.py` hard-codes two rounding rules and a sodium threshold; the rebuild reads from this JSON.

### Allergens — Big 9

```json
"allergenList": [
  { "id": "milk",         "label": "milk",         "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "eggs",         "label": "eggs",         "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "fish",         "label": "fish",         "requiresSpecies": true, "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "shellfish",    "label": "shellfish",    "requiresSpecies": true, "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "tree_nuts",    "label": "tree nuts",    "requiresSpecificType": true, "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "peanuts",      "label": "peanuts",      "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "wheat",        "label": "wheat",        "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "soybeans",     "label": "soybeans",     "cfrCitation": "21 CFR 101.91", "act": "FALCPA" },
  { "id": "sesame",       "label": "sesame",       "cfrCitation": "21 CFR 101.91", "act": "FASTER_Act_2021", "effectiveFrom": "2023-01-01" }
],
"allergenStatementFormat": "BOTH_OPTIONAL"
```

(The sesame addition is the biggest change since the 2013 PDF. The FASTER Act of 2021 made sesame the 9th major allergen effective Jan 1, 2023.)

### Claims (taxonomy from Section 8 + Appendices)

V1 ships a curated subset of the most common claims. Adding more is data work.

```json
"nutrientContentClaims": [
  {
    "id": "low_fat",
    "label": "Low Fat",
    "applicability": "PER_SERVING",
    "rule": { "nutrient": "totalFat", "operator": "<=", "value": 3, "unit": "g" },
    "cfrCitation": "21 CFR 101.62(b)(2)"
  },
  {
    "id": "fat_free",
    "label": "Fat Free",
    "rule": { "nutrient": "totalFat", "operator": "<", "value": 0.5, "unit": "g" },
    "cfrCitation": "21 CFR 101.62(b)(1)"
  },
  {
    "id": "low_sodium",
    "label": "Low Sodium",
    "rule": { "nutrient": "sodium", "operator": "<=", "value": 140, "unit": "mg" },
    "cfrCitation": "21 CFR 101.61(b)(4)"
  },
  // … expand to ~50 most common in V1 from Appendix A of Food Labeling Guide
],
"healthClaims": [
  // Authorized claims under 21 CFR 101.72 - 101.83
  // V1 ships ~5 most-used: Calcium + osteoporosis, Sodium + hypertension,
  // Dietary fat + cancer, Saturated fat + CHD, Folate + neural tube defects
  // V1.5+: full Appendix C authorized list + Appendix D qualified claims
],
"prohibitedClaims": [
  {
    "id": "diagnose_treat_cure",
    "pattern": "cure|treat|diagnose|prevent\\s+(disease|illness|cancer|diabetes|...)",
    "severity": "BLOCKING",
    "rationale": "Drug claim under FD&C Act §201(g) — disqualifies as food/supplement",
    "exceptionForSupplements": "Structure/function claims with FDA disclaimer (DSHEA)"
  }
]
```

### Required disclosures

```json
"requiredDisclosures": [
  {
    "id": "contains_allergen_statement",
    "trigger": "ingredient_contains_major_allergen",
    "format": "Contains: {allergen_list}",
    "placement": "ADJACENT_TO_INGREDIENT_LIST",
    "cfrCitation": "21 CFR 101.91"
  },
  {
    "id": "manufacturer_address",
    "trigger": "always",
    "format": "{name}, {city}, {state} {zip}",
    "placement": "INFORMATION_PANEL",
    "cfrCitation": "21 CFR 101.5"
  },
  {
    "id": "net_quantity",
    "trigger": "always",
    "placement": "PDP_LOWER_30_PERCENT",
    "cfrCitation": "21 CFR 101.105"
  }
]
```

---

## V1 supplement rule pack — `us-fda-supplements-2026.json`

Based on the FDA Dietary Supplement Labeling Guide (April 2005) + DSHEA + 21 CFR 101.36 (Supplement Facts panel).

### Key differences from food rule pack

**Panel name:** "Supplement Facts" (not "Nutrition Facts").

**Mandatory elements** (21 CFR 101.36):
1. Serving size + servings per container
2. Amount per serving (each nutrient + % DV)
3. Listing of dietary ingredients with no DV (e.g., botanicals) by weight per serving
4. "Other ingredients" list (excipients, coatings)
5. Statement of identity ("Dietary Supplement")

**Calories + macronutrients:** Required only if amounts are ≥ 5 calories, ≥ 1 g protein, ≥ 1 g fat, etc. (most supplements omit them).

**Proprietary blends:** Total weight required; individual ingredients listed in descending order of predominance without individual weights. (21 CFR 101.36(c)(2))

### Structure/Function claims (the DSHEA distinctive)

Per DSHEA, supplements can make **structure/function claims** that food cannot ("supports immune health," "promotes joint comfort"). But the claim MUST be accompanied by the FDA disclaimer:

```
*These statements have not been evaluated by the Food and Drug Administration.
This product is not intended to diagnose, treat, cure, or prevent any disease.
```

Rule pack:

```json
"structureFunctionClaims": [
  {
    "permitted": true,
    "examples": ["supports immune health", "promotes restful sleep", "helps maintain healthy joints"],
    "requiredDisclaimer": {
      "id": "dshea_disclaimer",
      "text": "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.",
      "placement": "ADJACENT_OR_LINKED_TO_CLAIM",
      "typeSizeMin": "1/16in",
      "cfrCitation": "21 CFR 101.93(b)"
    }
  }
],
"prohibitedClaims": [
  {
    "id": "drug_claim",
    "pattern": "cure|treat|diagnose|prevent\\s+(disease|illness|cancer|diabetes|...)",
    "severity": "BLOCKING",
    "rationale": "Drug claim under FD&C Act §201(g) — even with DSHEA disclaimer, naming a disease state crosses the line"
  }
]
```

### Iron warning (21 CFR 101.17(e))

Supplements containing iron **must** display the accidental-overdose warning if they contain ≥ 30 mg iron per serving:

```json
"conditionalWarnings": [
  {
    "id": "iron_overdose_warning",
    "trigger": { "nutrient": "iron", "perServing": ">=", "value": 30, "unit": "mg" },
    "text": "WARNING: Accidental overdose of iron-containing products is a leading cause of fatal poisoning in children under 6. Keep this product out of reach of children. In case of accidental overdose, call a doctor or poison control center immediately.",
    "placement": "INFORMATION_PANEL_NEAR_SUPPLEMENT_FACTS",
    "typeSizeMin": "6pt",
    "cfrCitation": "21 CFR 101.17(e)"
  }
]
```

### Allergens

Same Big 9 allergen rules apply to supplements as to food (21 CFR 101.91 applies broadly).

---

## How the engine uses the rule pack

The Python compliance service exposes:

```
POST /v1/compliance/check
Body: {
  "productId": "...",
  "recipeId": "...",
  "rulePackId": "us-fda-food-2026.01" | "us-fda-supplements-2026.01"
}
```

Response:

```typescript
interface ComplianceResult {
  passed: boolean
  violations: Violation[]    // BLOCKING — product cannot publish
  warnings: Warning[]        // ADVISORY — product can publish with note
  disclosures: Disclosure[]  // MUST appear on the label

  panelData: {
    format: 'STANDARD' | 'SUPPLEMENT_FACTS',
    rows: NutrientRow[]      // already rounded per rule pack
    requiredFooter: string   // allergen statement, disclaimers
    requiredWarnings: string[]  // iron, etc.
  }

  auditRef: string           // ID of ComplianceCheck row written to DB
  rulePackVersion: string
  evaluatedAt: string        // ISO timestamp
}

interface Violation {
  severity: 'BLOCKING' | 'WARNING'
  ruleId: string             // e.g., "drug_claim"
  cfrCitation: string
  message: string            // human-readable
  field: string              // which field on the recipe/product triggered it
  suggestedFix?: string
}
```

The same response shape works for both rule packs — the rule pack is just data the engine reads.

---

## Validation strategy

### Static validation (CI)

`packages/compliance-client` ships TypeScript types matching the rule-pack JSON schema. CI checks that every rule pack file validates against the schema.

### Test corpus

`services/compliance/tests/fixtures/` contains hand-crafted recipes paired with expected ComplianceResult outputs:

- `fixtures/food/protein_bar.json` → expect Calcium %DV = 8%, no violations
- `fixtures/supplements/multivitamin.json` → expect required iron warning if ≥30mg
- `fixtures/edge_cases/drug_claim_present.json` → expect BLOCKING violation

These tests are the audit trail for rule-pack accuracy.

### Real-world checking

Before V1 ships, run the compliance engine against 10–20 real FDA-approved product labels we can buy at any grocery store. If our engine flags a published product as non-compliant, our rule pack has a bug. Catch and fix before any creator depends on it.

---

## V1 enforces vs. V1.5+

### V1 enforces

- All mandatory nutrient declarations (Vit D, Calcium, Iron, Potassium for food; supplement-specific for supplements)
- Updated DVs (2020 numbers)
- Big 9 allergen detection from ingredient list + Contains statement generation
- All Appendix H rounding rules
- ~50 most common nutrient content claims (free, low, reduced, light, more, fewer, fortified, enriched, high, good source)
- ~5 highest-trust authorized health claims
- Structure/function claim DSHEA disclaimer enforcement
- Iron warning conditional
- Drug-claim blocking (regex-based — naive but effective for V1)
- Statement of identity, net quantity, manufacturer address placement
- Type size minimums

### V1.5+ adds

- Full appendix A (Nutrient Content Claims) — every defined claim
- Full appendices C and D (Authorized + Qualified Health Claims)
- Beverage-specific rules (juice labeling 101.30, vending machines, etc.)
- Small package exemptions (21 CFR 101.9(j)(13))
- Dual-column labeling for products sold both as single-serve and multi-serve
- Tabular and Linear panel formats
- Soft-deprecation handling (when FDA updates rules mid-version, mark old rule-pack as deprecated)
- AI-assisted plain-English explanation of each violation
- Multi-language compliance (Spanish primarily; some products require it)

### Out of scope (V2 minimum)

- EU EFSA + FIC regulations
- Canada CFIA
- FSANZ (Australia / New Zealand)
- MoCRA (cosmetics, US)
- AAFCO (pet food)
- Infant formula (21 CFR 107)
- Medical foods (21 CFR 101.9(j)(8))

---

## How rule packs get updated

When FDA publishes a new rule (e.g., a new claim definition, a DV change, a new allergen):

1. Open a new branch.
2. Add a new rule-pack file: `us-fda-food-2026.02.json` (semver bump).
3. Cite the source CFR section and FR (Federal Register) notice.
4. Update `effectiveFrom` to the new compliance deadline.
5. Add a `changes` entry in the rule pack listing what changed and why.
6. Update the test corpus with new expected outputs.
7. Submit PR; CI validates schema and runs the full test suite.
8. Once merged + deployed, the compliance service can serve both versions; products opt in (or are migrated by an admin tool).

Old rule-pack versions never disappear — historical ComplianceCheck rows reference them for audit reproducibility ("why did this 2024 product get approved? Show me the rule pack it was evaluated against").

---

## Open questions

1. **Spanish-language compliance — V1 or V1.5+?** Some products (notably those targeting Hispanic markets) require bilingual labeling. The FDA Supplement Labeling Guide has a Spanish version. Recommendation: V1.5+ (one language done well first).

2. **Beverage-specific rules — V1 or V1.5?** Functional beverages are in V1 scope per `RESEARCH_SYNTHESIS_2026-05-18.md`. 21 CFR 101.30 (juice labeling) and 21 CFR 102.33 (beverages containing fruit or vegetable juice) need to be in the food rule pack. Recommendation: **V1** — add them to `us-fda-food-2026.01` from the start.

3. **Who maintains rule packs long-term?** Someone has to track FDA regulation changes. Recommendation: V1 = Pavel + outside compliance consultant on retainer for a quarterly review. V1.5+ = part-time regulatory affairs role.

4. **Pre-V1 third-party validation?** Strong recommendation: have a regulatory affairs consultant review the V1 rule packs before any creator depends on them. Budget for one ~$3K–$5K engagement.

5. **What happens when a creator publishes a product, FDA updates a rule, and the existing label is now non-compliant?** The platform should detect this (rule-pack diff) and either auto-warn the creator or pull the product. Recommendation: V1.5 — implement a "rule pack migration check" cron that scans existing products against the latest rule pack and flags drift. V1 ships without this; creators are responsible until V1.5 lands.
