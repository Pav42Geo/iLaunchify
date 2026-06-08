# V1 Compliance Templates — Recipal-model facts panel management

> **STATUS: SPEC ONLY — NOTHING SHIPPED.** V1 Track C. Mirrors Recipal.com's label format UX. Cross-category coverage: FOOD + SUPPLEMENT + OTC + PET in V1; COSMETIC deferred to V1.5.

> Locked 2026-06-03 — Pavel-approved. The Recipal screenshots demonstrated the model: 30+ label formats per labeling type + per-section toggles + per-style controls + FDA claim auto-suggestion + multi-flavor multipack support.

## What Recipal does that we don't

From the screenshots Pavel shared:

1. **30+ label format presets per labeling type** — FDA Vertical / Tabular / Linear / As Packaged/As Prepared / Aggregate / Infant / Child / 100 Grams / Canadian variants / USDA Old FDA / FDA Supplement
2. **Per-section visibility toggles** — hide recipe title, hide nutrition facts, hide ingredient list, hide allergens, hide business info, hide BE claim, hide logo, hide barcode
3. **Per-style controls** — serving size, varied servings, dual column, justify left/center, uppercase/lowercase, label width slider, text color, background color
4. **Optional nutrients/vitamins toggles** — show/hide Vitamin A, C, E, K, Thiamin, Riboflavin, Niacin, B6, Folate, B12, Biotin, Pantothenic Acid, Phosphorus, Iodine, Magnesium, Zinc, Selenium, Copper, Manganese, Chromium, Molybdenum, Chloride, Choline
5. **Possible FDA nutrition claims auto-suggestion** — "Low Calorie, Low Fat, Saturated Fat Free, Cholesterol Free, Low Sodium, Sugar Free, Good Source of Calcium" — rule pack claim taxonomy applied in reverse

We currently have one render path. We need to mirror this depth.

## Architecture — LabelFormat as a first-class entity

```prisma
enum LabelFormat {
  // FDA Nutrition Facts (food) — 21 CFR 101.9
  FDA_VERTICAL                 // default standard format
  FDA_TABULAR                  // landscape table format
  FDA_LINEAR                   // single-line format for very small packages
  FDA_AS_PACKAGED_AS_PREPARED  // dual-column "as packaged" + "as prepared"
  FDA_AGGREGATE                // multi-flavor aggregate label
  FDA_INFANT                   // 0-12 mths special format
  FDA_CHILD                    // 1-3 yrs special format
  FDA_100_GRAMS                // per-100g format (export-friendly)
  
  // FDA Supplement Facts — 21 CFR 101.36
  FDA_SUPPLEMENT
  
  // FDA Drug Facts — 21 CFR 201.66 (OTC)
  FDA_DRUG_FACTS
  
  // AAFCO Pet Food panel
  AAFCO_PET_FOOD               // Guaranteed Analysis + Ingredient + Feeding Directions
  AAFCO_PET_TREAT              // simplified treat format
  
  // Canadian (V1.1 schema-ready)
  CANADIAN_VERTICAL
  CANADIAN_LINEAR
  CANADIAN_HORIZONTAL
  CANADIAN_AGGREGATE
  CANADIAN_100_GRAMS
  
  // USDA / Old FDA (legacy compat for older packs)
  USDA_OLD_FDA_VERTICAL
  USDA_OLD_FDA_TABULAR
  USDA_OLD_FDA_LINEAR
}

model LabelFormatRule {
  // Per (labelingType, LabelFormat) — what's required, what's allowed
  format              LabelFormat
  labelingType        LabelingType
  cfrCitation         String                  // "21 CFR 101.9(d)(11)"
  
  // Dimensional thresholds
  minSurfaceAreaSqIn  Decimal  @db.Decimal(8, 3)
  minLabelWidthMm     Decimal
  minLabelHeightMm    Decimal
  minFontSizePt       Decimal                 // body text minimum
  minHeaderFontSizePt Decimal                 // "Nutrition Facts" header
  
  // Capabilities
  supportsMultiColumn Boolean   @default(false)
  supportsAggregate   Boolean   @default(false)
  supportsDualColumn  Boolean   @default(false)
  
  // Layout
  panelOrientation    PanelOrientation        // VERTICAL | HORIZONTAL | TABULAR | LINEAR
  
  // Preference scoring (ties broken by this when multiple are valid)
  preferenceScore     Int       @default(50)
  
  // Notes
  notes               String?                 // "Use only when standard vertical doesn't fit"
  
  @@id([format, labelingType])
}

enum PanelOrientation { VERTICAL HORIZONTAL TABULAR LINEAR }
```

## Updated Label model on the canvas

Existing `Label` object on the Fabric canvas extends with:

```prisma
model LabelObject {
  // Persisted as part of DesignVersion JSON
  id                  String
  designVersionId     String
  packagingComponentId String         // which component this label is on
  
  format              LabelFormat     // the picked format
  labelingType        LabelingType
  
  // Visibility toggles (Recipal-model — granular section show/hide)
  sectionToggles      Json            // {hideTitle: false, hideNutritionFacts: false, ...}
  
  // Style controls
  servingSize         String
  variedServings      Boolean   @default(false)
  dualColumn          Boolean   @default(false)
  textAlign           TextAlign       // LEFT | CENTER | JUSTIFY
  textCase            TextCase        // NORMAL | UPPERCASE | LOWERCASE | TITLECASE
  widthScalePct       Int       @default(100)  // 50-150 slider
  textColor           String    @default("#000000")
  backgroundColor     String    @default("#FFFFFF")
  borderColor         String    @default("#000000")
  
  // Optional nutrient toggles (per-nutrient show/hide)
  optionalNutrients   Json            // {vitaminA: false, vitaminC: false, thiamin: false, ...}
  
  // FDA claim suggestions accepted by creator
  acceptedClaims      String[]        // ["LOW_CALORIE", "GOOD_SOURCE_CALCIUM"]
}
```

## Format auto-selection algorithm

Given a `PackagingComponent` (with dieline = decoration-specific shape) + `labelingType` + computed nutrition profile + flavor count, recommend label formats:

```typescript
function recommendLabelFormats(
  component: PackagingComponent,
  labelingType: LabelingType,
  flavorCount: number,
  recipeProfile: NutritionProfile
): { recommended: LabelFormatRule; alternatives: LabelFormatRule[] } {
  const dieline = component.dieline;
  const trimSurfaceAreaSqIn = computeTrimSurfaceArea(dieline.trimBox);
  
  // Find all valid format rules for this labeling type + dieline size
  const candidates = await prisma.labelFormatRule.findMany({
    where: {
      labelingType,
      minSurfaceAreaSqIn: { lte: trimSurfaceAreaSqIn },
      minLabelWidthMm: { lte: dieline.widthMm },
      minLabelHeightMm: { lte: dieline.heightMm }
    }
  });
  
  // Filter by flavor count
  let filtered = candidates;
  if (flavorCount > 1) {
    filtered = filtered.filter(c => c.supportsMultiColumn || c.supportsAggregate);
  }
  
  // Filter by special requirements (e.g., infant formula label only for infant products)
  filtered = filtered.filter(c => matchesProductCategory(c, recipeProfile.productCategory));
  
  // Rank by preferenceScore DESC
  const ranked = filtered.sort((a, b) => b.preferenceScore - a.preferenceScore);
  
  return {
    recommended: ranked[0],
    alternatives: ranked.slice(1)
  };
}
```

Output: default = first-ranked. Creator sees a dropdown (Recipal-style) of alternatives, all FDA-approved for their combination. Swap re-renders the panel in place on the canvas.

## Multi-flavor multipack auto-aggregate

The "3 flavors chips multipack" case Pavel raised. When `flavorCount > 1` AND the format supports aggregate (`FDA_AGGREGATE` or `FDA_AS_PACKAGED_AS_PREPARED`):

1. Format engine computes per-flavor nutrition (per `FlavorPreset` ingredient overrides)
2. Renderer outputs N columns side-by-side (one per flavor) with shared section headers
3. "AS PACKAGED" header bar above the multi-column block
4. Optional aggregate column showing average across flavors (admin-configurable)

Schema support:

```prisma
model NutritionFactsRender {
  // Computed render snapshot stored per DesignVersion
  id                  String
  designVersionId     String
  labelObjectId       String
  
  format              LabelFormat
  columnCount         Int                     // 1 for standard, N for multi-flavor
  columns             Json                    // [{flavorPresetId, nutrients:{...}, servingSize, ...}]
  
  computedAt          DateTime
  rulePackVersion     String                  // tied to specific rule pack version (per #139)
}
```

Compliance scan validates the aggregate label format follows 21 CFR 101.9(e) for dual-column presentation.

## FDA claim auto-suggestion engine

Reverse the rule pack's claim taxonomy. Given a computed nutrition profile, find all claims the product **qualifies for** under FDA regulation.

```typescript
interface ClaimQualification {
  claimKey: string;          // "LOW_CALORIE"
  claimText: string;         // "Low Calorie"
  cfrCitation: string;       // "21 CFR 101.60(b)(3)"
  qualifies: boolean;
  qualificationReason: string;  // why it qualifies (or not)
  additionalDisclosureRequired?: string; // e.g., "Must declare total fat next to claim"
}

function suggestClaims(profile: NutritionProfile, rulePack: RulePack): ClaimQualification[] {
  const results: ClaimQualification[] = [];
  
  for (const claim of rulePack.nutrientContentClaims) {
    const passes = evaluateClaim(claim, profile);
    if (passes.qualifies) {
      results.push({
        claimKey: claim.id,
        claimText: claim.displayText,
        cfrCitation: claim.cfrCitation,
        qualifies: true,
        qualificationReason: passes.reason,
        additionalDisclosureRequired: claim.requiresDisclosure ? claim.disclosureText : undefined
      });
    }
  }
  
  return results;
}
```

Surface in the Label drawer of the Studio:

```
Possible FDA nutrition claims for this product:

✓ Low Calorie (21 CFR 101.60(b)(3))         [Add to label]
✓ Low Sodium (21 CFR 101.61(b)(4))           [Add to label]
✓ Cholesterol Free (21 CFR 101.62(d)(1))     [Add to label]
✓ Sugar Free (21 CFR 101.60(c)(1))           [Add to label]
✓ Good Source of Calcium (21 CFR 101.54(c))  [Add to label]
  └ Note: must declare amount of total fat next to claim
```

Creator picks which to add. Accepted claims save to `LabelObject.acceptedClaims` and render as a separate text element on the label.

## Cross-category coverage

| Labeling Type | Format set | Renderer | V1 scope |
|---|---|---|---|
| FOOD | 8 FDA Nutrition Facts variants + 5 Canadian + 3 USDA Old FDA | NutritionFactsRenderer (existing, extend per-format) | ✓ V1 |
| DIETARY_SUPPLEMENT | FDA_SUPPLEMENT (1 format) | SupplementFactsRenderer (new, similar to Nutrition Facts but different rules) | ✓ V1 |
| OTC | FDA_DRUG_FACTS (1 format) | DrugFactsRenderer (new, distinctly different — Active Ingredients table + Uses + Warnings + Directions) | ✓ V1 |
| PET_PRODUCT | AAFCO_PET_FOOD + AAFCO_PET_TREAT (2 formats) | AafcoPanelRenderer (new — Guaranteed Analysis + Ingredient + Feeding Directions, NOT a Nutrition Facts panel) | ✓ V1 |
| COSMETIC | None (cosmetics have INCI ingredient declaration only, no facts panel) | InciIngredientRenderer (new, simple descending-order list) | V1.5 |

Per memory `ilaunchify-flavors-as-presets.md`, the FlavorPreset model already exists. NutritionFactsRender reads from FlavorPreset overrides for multi-column / aggregate output.

## Per-section toggle catalog

Mirror Recipal's section toggle UI per format. Stored as `sectionToggles` JSON on LabelObject:

**Universal across formats:**
- `hideTitle` — hide "Nutrition Facts" / "Supplement Facts" / "Drug Facts" header
- `hideBusinessInfo` — hide manufacturer name/address line
- `hideBarcode` — hide UPC/GTIN barcode area
- `hideLogo` — hide brand logo placement

**Food/Supplement only:**
- `hideAllergens` — hide "Contains:" allergen line
- `hideFacilityAllergens` — hide "Processed in a facility that handles..." line
- `hideBioengineeredClaim` — hide "Contains bioengineered..." disclosure
- `indicateBioengineeredFood` — show "BE" mark on ingredients
- `hideIngredientList` — hide "Ingredients: ..." section
- `hideNutritionFacts` — hide entire facts panel (rare; for ultra-small SKUs)

**Style controls:**
- `simplifiedFormat` — abbreviated layout
- `showInsignificantNutrients` — show nutrients at 0 quantity (normally hidden)
- `showUnsaturatedFats` — break out poly/mono-unsaturated
- `showSugarAlcohols` — show sugar alcohol line
- `hideAddedSugars` — hide added sugars line (rare, regulatory restrictions)
- `showProteinPercentage` — include %DV for protein

Each toggle has an associated CFR rule that controls whether it's permitted. Compliance scan flags violations (e.g., creator can't hide `hideNutritionFacts` on a product over the labeling exemption threshold).

## Updated B2 task — branch label render by labelingType

Originally V1 Track B item B2. The full implementation:

1. Replace `NutritionFactsRenderer` single-format dispatch with format-aware renderer
2. Switch on `labelingType` to select Nutrition / Supplement / Drug / AAFCO renderer
3. Each renderer reads from `LabelFormatRule` for layout constants
4. Section toggles apply per-format
5. Multi-column rendering for aggregate / dual-column formats
6. Bind to per-component compliance scan (each component's label scans against the rule pack independently)

## Dieline → label format integration (the C4 algorithm)

When creator drops a Label drawer element on a component:
1. System reads the component's dieline + labelingType + flavor count
2. Calls `recommendLabelFormats` to get default + alternatives
3. Default format auto-loads in the panel
4. Format picker shows alternatives — switching re-lays-out in place
5. If creator manually changes format and it doesn't fit the dieline, pre-flight warns

This auto-assignment unlocks the "Creator can pick FDA Tabular for the back of their product if they want" experience Pavel described, while keeping the system safe by only offering FDA-approved alternatives.

## Tasks for Claude Code

| # | Slice | Lift |
|---|---|---|
| C1.a | Schema — LabelFormat enum + LabelFormatRule model with full V1 catalog | ~½ day |
| C1.b | Seed LabelFormatRule rows for 19 V1 formats (8 food + 1 supplement + 1 drug + 2 AAFCO + 5 Canadian + 3 USDA legacy) | ~1 day |
| C1.c | LabelObject schema extension — format + sectionToggles + style controls + optionalNutrients + acceptedClaims | ~¼ day |
| C2.a | SupplementFactsRenderer in packages/ui — 21 CFR 101.36 layout | ~1.5 days |
| C2.b | DrugFactsRenderer in packages/ui — 21 CFR 201.66 layout (very different from facts panels) | ~2 days |
| C2.c | AafcoPanelRenderer in packages/ui — Guaranteed Analysis + Ingredient + Feeding Directions | ~1.5 days |
| C3.a | Format-aware NutritionFactsRenderer refactor — per-format layout dispatching | ~1 day |
| C3.b | Per-section toggle UI in Label drawer (mirror Recipal screenshots) | ~1 day |
| C3.c | Per-style controls UI in Label drawer (serving size, width slider, text color, etc.) | ~½ day |
| C3.d | Optional nutrient toggle panel | ~½ day |
| C4.a | recommendLabelFormats algorithm — dieline + labelingType + flavor count → ranked formats | ~½ day |
| C4.b | Format picker dropdown in Label drawer with alternatives | ~½ day |
| C5.a | Multi-column / aggregate renderer for variety packs (reads FlavorPreset nutrient overrides) | ~1.5 days |
| C6.a | suggestClaims engine — reverse rule pack taxonomy | ~½ day |
| C6.b | Claim suggestion panel in Label drawer with one-click add | ~½ day |
| C6.c | Claim rendering on canvas as separate text element | ~¼ day |
| C-extend.a | Extend rule packs us-fda-food-2026.json + us-fda-supplements-2026.json with format-specific layout constants + claim taxonomy reverse-evaluable | ~1 day |
| C-extend.b | New rule packs us-fda-otc-2026.json + us-aafco-pet-2026.json | ~1.5 days |

Total: **~14-16 days** focused. Biggest single doc in V1 by scope. Parallelizable: C1 schema → C2 renderers (parallel across labelingType) → C3 UI → C4 + C5 + C6.

## Paste-ready Claude Code prompt — C1.a (start)

```
Ship Slice C1.a — LabelFormat schema. Brief at
docs/builds/_V1_COMPLIANCE_TEMPLATES.md.

Add to packages/db/prisma/schema.prisma (additive only):

1. enum LabelFormat — full V1 set from the brief (19 entries)
2. enum PanelOrientation { VERTICAL HORIZONTAL TABULAR LINEAR }
3. model LabelFormatRule — full definition with composite primary key
   on (format, labelingType)
4. Extend LabelObject (or wherever the canvas Label is persisted) with
   format, sectionToggles, style controls, optionalNutrients, acceptedClaims

Use prisma migrate dev (or hand-author SQL + migrate deploy).

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm typecheck.

Then /ship "C1.a LabelFormat schema — 19-format enum + LabelFormatRule
+ LabelObject extension".
```

## See also

- `docs/COMPLIANCE.md` — existing rule pack schema and source documents
- `_V1_PACKAGING_COMPONENTS.md` — per-component label render
- `_V1_DIELINE_NORMALIZATION.md` — dieline shape drives format auto-selection
- Recipal.com — visual reference for the UX (per Pavel's screenshots 2026-06-03)
- Memory: `ilaunchify-flavors-as-presets.md` — flavor preset model used in multi-column rendering
