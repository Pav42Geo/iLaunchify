# Product Configurator & Constraints — spec (2026-06-08)

Status: **proposed** · Owner: Pavel · Folds into: the partner New-Product builder
**Variants & packs / Production** step (`apps/partner/.../products/new/VariantsPacksStep.tsx`)
and downstream the marketplace configurator + Review/submit step.

## 0. Why

Audit of an external "manufacturer product setup" brief (DeepSeek) against our
builder confirmed our thesis (configurator over blank canvas, flavors-as-presets,
packing taxonomy). It exposed seven real gaps, all on the **commercial-constraint
+ configurator-validation** layer — the layer our build has touched lightest.
This spec closes all seven and the one model generalization they depend on.

The seven:

1. Allowed-alterations **permission matrix** (what the Creator may change vs. locked).
2. **Compositional** lead-time + cost + MOQ **deltas per option**.
3. **First-run vs repeat** economics + one-time / per-unit fees (with volume waivers).
4. **Storage / temperature class** (ambient / chilled / frozen).
5. Cross-option **compatibility rules** (e.g. Decaf excludes Vanilla).
6. Generated **Product Spec Sheet (PSS)** snapshot at submit.
7. **Granular approval triggers** (which change type re-triggers which approver).

Everything here is **additive** to the schema (CockroachDB-safe: bare `String`,
`cuid()` ids, no `@db.Text`). Per the markets/regions precedent ("land no-regret
substrate now, roll out later"), Phase 1 lands all columns/models even where the
UI ships later — these are migration-hostile to add after data exists.

---

## 1. Foundation — Configurable Option Axes (enables #1, #2, #5)

The brief shows **multiple** configurable dimensions (flavor, sweetener, strength,
caffeine; bottle, closure, label, substrate), each with allowed values + a default
+ per-value economics. Our locked decision is **"flavors are presets, not freely
customizable"** ([[ilaunchify-flavors-as-presets]]). We honor it by generalizing
"preset" into a **curated option axis**: the manufacturer still defines every
allowed value (never free-form), there's just more than one axis.

> **Pavel decision required:** approve generalizing the single flavor axis into
> N curated axes. This is a model generalization, NOT a reversal — FLAVOR stays
> canonical and maps 1:1 to `FlavorPreset`; other axes are additional curated
> dimensions. If rejected, we ship only the FLAVOR axis with deltas (#2) and the
> permission flag (#1) on it, and skip multi-axis + compatibility (#5).

```prisma
enum OptionAxisKey { FLAVOR SWEETENER STRENGTH CAFFEINE BOTTLE CLOSURE LABEL_FORMAT SUBSTRATE CUSTOM }
enum OptionLayer { RECIPE PACKAGING }
enum OptionValueStatus { ACTIVE INACTIVE }

/// A configurable dimension the manufacturer exposes on a template. FLAVOR is
/// canonical and bridges to FlavorPreset; other axes are additional curated
/// dimensions. NEVER free-form — the manufacturer enumerates every value.
model ProductOptionAxis {
  id                String   @id @default(cuid())
  productTemplateId String
  key               OptionAxisKey
  label             String                 // display, e.g. "Sweetener"
  layer             OptionLayer @default(RECIPE)
  editableByCreator Boolean  @default(false) // #1 permission — locked unless true
  required          Boolean  @default(true)
  sortOrder         Int      @default(0)
  isActive          Boolean  @default(true)
  productTemplate   ProductTemplate      @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  values            ProductOptionValue[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([productTemplateId, key])
  @@index([productTemplateId, isActive, sortOrder])
}

/// One allowed value on an axis + its compositional economics (#2). Bridges to
/// the real recipe/packaging row so we never duplicate that data.
model ProductOptionValue {
  id                 String  @id @default(cuid())
  axisId             String
  label              String                 // "Vanilla", "Stevia", "Cork Stopper"
  isDefault          Boolean @default(false) // exactly one per axis (app-enforced)
  status             OptionValueStatus @default(ACTIVE)
  // #2 deltas — applied ON TOP of the base SKU economics (see §9 formula)
  leadTimeDeltaDays  Int     @default(0)
  unitCostDeltaCents Int     @default(0)
  moqOverride        Int?                    // raises resolved-SKU MOQ to >= this
  priceDeltaCents    Int     @default(0)     // optional creator-facing price delta
  // Bridges (set the one matching the axis layer/key):
  flavorPresetId     String?                 // key=FLAVOR    → FlavorPreset.id
  substrateId        String?                 // key=SUBSTRATE → Substrate.id
  packagingTypeId    String?                 // key=BOTTLE/CLOSURE → PackagingType.id
  sortOrder          Int     @default(0)
  axis               ProductOptionAxis @relation(fields: [axisId], references: [id], onDelete: Cascade)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([axisId, status, sortOrder])
}
```

**Bridge to existing models:** the FLAVOR axis does not replace `FlavorPreset` —
each FLAVOR `ProductOptionValue` carries `flavorPresetId`. The Variants step's
existing flavor table becomes the editor for the FLAVOR axis; `maxFlavorsPerPack`
(already shipped) remains the pack-level cap on that axis.

---

## 2. #1 — Permission matrix (what the Creator may change)

The brief's "Allowed Alterations [x] Flavor only / [ ] Sweetness / [ ] Color".
Modeled as `ProductOptionAxis.editableByCreator`. Locked axes (`false`) resolve to
their default value for every Creator; editable axes (`true`) become marketplace
"knobs." The immutable core (category, base recipe, primary ingredient) stays in
existing fixed `ProductTemplate` fields — it is simply the absence of any axis.

**UI (Variants step):** each axis renders a header row — `[axis label] ·
[toggle: Creator-editable | Locked] · Default: [value]`. A locked axis collapses
to just its default value chip. No new card; it lives in the Configurable Options
card (§8 UI).

---

## 3. #2 — Compositional deltas (lead time, cost, MOQ)

Today `ProductTemplateVariant` holds ONE `leadTimeDays` / `moqMin` and pricing
tiers hold one cost. The brief makes every option carry a Δ (glass +5 days, cork
+10 days, clear film +$0.10/unit and MOQ→15,000). Modeled as the three delta
fields on `ProductOptionValue`. The resolved-SKU economics = base + Σ(selected
value deltas) — see the formula in §9. This is what turns the Creator's quote
from a flat number into a live, choice-driven figure.

**UI (Variants step):** each option value row gains three columns —
**Δ lead (days)**, **Δ cost (¢/unit)**, **MOQ override**. Blank = no delta.

---

## 4. #3 — First-run vs repeat economics + fees

The brief splits "Standard lead time 21d" from "New flavor 35d (incl. stability
testing)" and adds one-time/per-unit fees (tooling /unit, $250 QA batch per SKU
waived above 12,500 units, palletization /unit).

```prisma
// ProductTemplate additive scalars:
//   leadTimeRepeatDays    Int?   // standard repeat-order lead time (seeds variants)
//   leadTimeFirstRunDays  Int?   // first run of a new SKU, incl. stability testing

enum FeeBasis { PER_UNIT PER_SKU_ONE_TIME PER_ORDER }

model ProductTemplateFee {
  id                String   @id @default(cuid())
  productTemplateId String
  label             String                 // "Tooling amortization", "QA batch testing"
  basis             FeeBasis
  amountCents       Int
  waivedAboveQty    Int?                    // PER_SKU_ONE_TIME waives at/above this qty
  sortOrder         Int      @default(0)
  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  @@index([productTemplateId])
}
```

**UI (Production block):** the single "Lead time (days)" splits into **Repeat
lead time** + **New-SKU lead time (incl. stability testing)**. A new
**"Fees"** card holds rows `{ label, basis ▼, amount, waived-above qty }` with
"+ Add fee". `waivedAboveQty` only enabled for `PER_SKU_ONE_TIME`.

---

## 5. #4 — Storage / temperature class

Drives WAREHOUSE partner routing + shipping. Migration-hostile later → land now.

```prisma
// ProductTemplate additive:
enum StorageClass { AMBIENT CHILLED FROZEN }
//   storageClass     StorageClass @default(AMBIENT)
//   storageTempMinF  Int?
//   storageTempMaxF  Int?
```

**UI (Production block):** `Storage class` select (Ambient / Chilled / Frozen) +
optional temp min/max °F. Feeds [[ilaunchify-markets-and-regions]] / warehouse
matching downstream.

---

## 6. #5 — Cross-option compatibility rules

The brief: "Decaf ❌ not available for Vanilla → choose Unflavored or Mocha."

```prisma
enum OptionRuleKind { EXCLUDE REQUIRE }

model ProductOptionRule {
  id                String   @id @default(cuid())
  productTemplateId String
  kind              OptionRuleKind          // EXCLUDE: whenValue ⇒ target unavailable
  whenValueId       String                  //          REQUIRE: whenValue ⇒ target forced
  targetValueId     String
  message           String?                 // creator-facing popup copy
  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  @@index([productTemplateId])
}
```

**UI (Variants step, collapsible "Compatibility rules" card, advanced):** rows
`When [axis:value ▼] · [Exclude | Require] · [axis:value ▼] · message`. Collapsed
by default; most templates won't need it. **Phase 3** — UI deferred, schema lands
Phase 1.

---

## 7. #7 — Granular approval triggers

Which change type re-triggers which approver (brief: "label copy + flavor changes
→ Legal reviews"; signatures Brand Ops → Manufacturer QA → Production Scheduling).
Distinct from the order-level dispatch FSM in `docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md`
— this governs **template change review**, complementing `ProductReviewItem`.

```prisma
enum ProductChangeType { LABEL_COPY FLAVOR_ADD RECIPE_CHANGE PACKAGING_CHANGE PRICE_CHANGE }
enum ApproverRole { BRAND_OPS MANUFACTURER_QA LEGAL PRODUCTION_SCHEDULING }

model ProductChangeApprovalRule {
  id                String   @id @default(cuid())
  productTemplateId String?                 // null = platform default; set = per-template override
  changeType        ProductChangeType
  requiredApprover  ApproverRole
  sortOrder         Int      @default(0)
  productTemplate   ProductTemplate? @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  @@index([productTemplateId, changeType])
}
```

**UI:** a compact "Changes that need re-approval" card (Production step) showing
the platform defaults as change-type → approver chips, manufacturer may override.
Full editor lives admin-side. **Phase 3.**

---

## 8. #6 — Product Spec Sheet (PSS) snapshot

At submit, freeze locked constraints + chosen axes/values + computed economics into
an immutable, versioned record (aligns with [[ilaunchify-operational-philosophy-v1]]
"snapshot for legal reproducibility").

```prisma
enum SpecSheetStatus { DRAFT ISSUED SUPERSEDED }

model ProductSpecSheet {
  id                String   @id @default(cuid())
  productTemplateId String
  version           Int      @default(1)
  status            SpecSheetStatus @default(ISSUED)
  snapshot          Json     // frozen core + axes + values + fees + computed quote inputs
  generatedById     String                  // User
  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())
  @@unique([productTemplateId, version])
  @@index([productTemplateId, status])
}
```

**UI (Review & submit step):** "Preview spec sheet" button renders the snapshot;
submit issues version N. **Phase 4** (PDF render can reuse the `pdf` skill later).

---

## 9. Quote composition (the contract the marketplace consumes)

The Creator-facing configurator (marketplace, separate surface) reads the axes +
values + rules + fees and computes a live quote. Resolution for a chosen
combination `S` (one value per editable axis; locked axes use default) at qty `Q`:

```
unitCostCents   = baseTierCost(Q) + Σ_{v∈S} v.unitCostDeltaCents
leadTimeDays    = (firstRun ? leadTimeFirstRunDays : leadTimeRepeatDays)
                  + Σ_{v∈S} max(0, v.leadTimeDeltaDays)
moq             = max( variant.moqMin , max_{v∈S} (v.moqOverride ?? 0) )
oneTimeFees     = Σ fee[PER_SKU_ONE_TIME] where (fee.waivedAboveQty == null || Q < fee.waivedAboveQty)
perUnitFees     = Σ fee[PER_UNIT] × Q
perOrderFees    = Σ fee[PER_ORDER]
valid           = Q >= moq  AND  Q satisfies orderIncrement  AND  no EXCLUDE rule violated by S
```

Validation states mirror the brief: ✅ available · ⚠️ surcharge / +lead / MOQ-raise
· ❌ incompatible (EXCLUDE) or below-MOQ. **Production-line throughput** (brief's
"max 10,000 units/hr → N production runs → +lead") is an **optional forward-marker**:
`monthlyCapacity` already exists; a future `ProductionLine` model can refine
"runs = ceil(Q / runSize)" → extra lead. Not in scope for these 7.

---

## 10. UI map — where each piece folds into the Variants/Production step

```
Variants & packs step
├─ Product type (dropdown)                         [unchanged]
├─ Production & availability (shared)              [+#3 lead split, +#4 storage]
│   └─ Fees card                                   [#3]   Phase 2
│   └─ Changes-need-reapproval card                [#7]   Phase 3
├─ Configurable options                            [#1 permission + #2 deltas]  Phase 2
│   ├─ Flavor axis  (existing flavor table + Δ cols + editable toggle + default)
│   └─ + Add option axis (Sweetener / Strength / Caffeine / Bottle / Closure / …)
├─ Compatibility rules (collapsible, advanced)     [#5]   Phase 3
├─ Pack composition / subscription / pick-N        [unchanged]
Review & submit step
└─ Preview / issue Product Spec Sheet              [#6]   Phase 4
```

---

## 11. Phasing

- **Phase 1 — schema substrate (one migration, no-regret). ✅ written 2026-06-08**
  (in `schema.prisma`; handoff §4). All models + enums + `ProductTemplate` scalars
  above. Additive; run on Mac:
  ```
  cd packages/db
  pnpm exec dotenv -e ../../.env.local -- prisma db push --accept-data-loss
  cd ../.. && pnpm db:generate && rm -rf apps/*/.next
  ```
- **Phase 2 — high-value UI in Variants/Production.** Storage class + lead-time
  split + Fees card (#3,#4); Configurable-options card = permission toggle + per-value
  deltas, FLAVOR axis first, then "+ Add axis" (#1,#2). Autosave like the rest of the step.
- **Phase 3 — compatibility-rule builder (#5) + approval-trigger editor (#7).**
- **Phase 4 — PSS generation at submit (#6) + marketplace configurator + quote engine (§9).**

## 12b. Label-affecting options — overlay binding + engine merge (added 2026-06-08)

A configurable axis is one of two kinds, set by the manufacturer per axis via
`ProductOptionAxis.affectsLabel`:

- **affectsLabel = false** — commercial / visual only (roast Strength when
  nutrition-equivalent; any PACKAGING-layer axis). The Facts label is unchanged;
  only the deltas (lead/cost/MOQ) apply.
- **affectsLabel = true** — each value swaps an ingredient (Sweetener, Caffeine).
  The Facts label MUST be recomputed for the chosen combination.

**No combinatorial authoring.** The label is never hand-authored per combination.
Each value declares an **ingredient operation** against the base recipe — the
complete vocabulary is four ops (covers any custom axis). `ProductOptionValue`
gains `overlayOp` + `recipeOverlay`:

```
overlayOp ∈ { NONE, SWAP, ADD, REMOVE }    // default NONE

NONE   → commercial / visual only; no recipe, label, or allergen change.
SWAP   → recipeOverlay = { slotId, toIngredientId }       (replace a base slot's ingredient)
ADD    → recipeOverlay = { addIngredientId, qty, unit }   (inject an extra ingredient)
REMOVE → recipeOverlay = { slotId }                        (drop a base slot)
```

A SWAP/REMOVE axis is **bound to a base slot** (`ProductOptionAxis.boundSlotId`);
each value fills/clears that slot. The default value = the ingredient already in
the base recipe, so the default configuration stays coherent. A custom axis is
just a generic one the manufacturer names and binds — still curated (they
enumerate every value), never free-form creator input.

**Why this is safe + correct:** because a value describes an ingredient *delta*,
not a label, the engine recomputes the ingredient statement, the Facts numbers,
**and the allergen statement** deterministically (swap peanut oil → sunflower oil
and the allergen line changes itself). The manufacturer authors the delta, never
the panel.

### Guardrails (the smart-decision layer)

- **Default NONE.** A value is commercial-only until the manufacturer explicitly
  binds an op. If `affectsLabel = true` but a value is still `NONE`, warn —
  prevents accidentally shipping a wrong panel.
- **Combination awareness.** Each label-affecting axis multiplies printed labels:
  `N flavors × M sweeteners × K caffeine = N·M·K` panels, each needing a
  compliance pass. Surface a live "this creates X distinct labels" counter.
  V1 soft-caps label-affecting axes at **2** to keep compliance review tractable;
  `NONE` (commercial-only) axes are uncapped.
- **Allergen propagation** is automatic via the engine merge (no separate step).
- **Approval routing (ties to #7).** A label-affecting axis (or a new value on
  one) is effectively a recipe variant → routes through `RECIPE_CHANGE` /
  `FLAVOR_ADD` approval (QA / Legal). A `NONE` axis does not.

**Engine merge.** `@ilaunchify/nutrition.calculateLabel` gains an overlay-merge
step: for a resolved SKU it composes
`base slots → apply flavor overlay → apply each selected label-affecting option
overlay → compute panel`. Precedence on slot conflict: option overlay > flavor
overlay > base (last-writer per slotId). Each physically-sold SKU = one resolved
combination = one deterministic panel. N flavors × M sweeteners = N×M panels, all
derived.

**Build sequence for this slice (Recipe-surface dependent — do after #32/#33 settle):**
1. Lift the option-axes list to GuidedBuilder shared state (mirror `flavors`),
   move the `saveOptionAxes` autosave up so it persists from any step.
2. In the Recipe step, render a "Label options" section: for each axis with
   `affectsLabel`, bind the controlled base slot + per value pick the replacement
   ingredient via the existing `IngredientPicker` → writes `recipeOverlay`.
3. Extend `OptionValueInput` + `saveOptionAxes` to persist `recipeOverlay`.
4. Engine: add overlay-merge to `calculateLabel`; the FactsPanel preview composes
   flavor + selected option overlays. **Touches the shared @ilaunchify/nutrition
   package — coordinate with Code (single-writer) before editing.**

Until step 4 ships, the partner captures axes + affectsLabel + deltas (done); the
live combined panel renders flavor-only. No data is lost — overlays persist.

## 12. Open decisions for Pavel

1. Approve the **multi-axis generalization** (§1) — or restrict to FLAVOR-only deltas.
2. Are non-flavor axes (sweetener, caffeine) **priced** (priceDeltaCents) or
   **cost-only** in V1? (Affects the creator landed-price formula in
   [[ilaunchify-marketplace-decisions-2026-06-01]].)
3. Should `ProductChangeApprovalRule` platform defaults be **admin-seeded** or
   hard-coded for V1?
4. Storage class — does CHILLED/FROZEN gate which WAREHOUSE partners can be
   matched in V1, or is it informational until cold-chain partners exist?
```
