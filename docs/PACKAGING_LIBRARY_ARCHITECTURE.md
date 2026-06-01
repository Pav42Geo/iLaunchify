# Packaging Library Architecture — V1 spec

**Status:** locked 2026-05-31 (Pavel briefing). Schema additive; ships behind admin
surfaces in a single phase. V2 work explicitly out of scope.

## 1. The problem

When a creator opens the Design Studio on a product's packaging surface, four
distinct things must arrive on the canvas, correctly placed, before they touch
anything:

1. **The die-line.** Hairline crop / bleed / safety lines for that surface.
2. **Mandatory regulatory text** (FDA + jurisdiction-specific).
3. **Mandatory regulatory symbols** (recycling, allergen, organic, country-of-origin,
   pet-food AAFCO, etc.).
4. **Voluntary marketing badges** the partner or creator can choose to include
   (Non-GMO, B-Corp, Certified Organic, Made in USA, etc.).

Today, only #1 is modelled (per-surface `PackagingSurface` rows with a die-line
file). Items #2–#4 are partner-private knowledge or hand-rolled per template.
That's untenable as the catalog grows past ~50 packaging types or two markets.

The packaging library is the canonical data layer that fixes this. It is **not** a
new admin app — it is four new schema models, two admin curation surfaces, and a
canvas-side resolver that turns "this product is shipping in this jar to the US
market" into a positioned set of regulatory + marketing artefacts.

## 2. Locked decisions (Pavel, 2026-05-31)

| Question                                                                 | Decision |
| ------------------------------------------------------------------------ | -------- |
| Scope of symbols                                                         | FDA-mandated + voluntary marketing badges |
| Coverage targets                                                         | Almost every common package on the market, **per category** |
| Compliance rule unit                                                     | category × packaging-type × market |
| Partner-submitted packaging types                                        | Allowed; `status: PENDING_REVIEW` until admin approves |
| Symbol asset format                                                      | SVG (Inkscape-compatible, single root) |
| Compliance overlays on the canvas                                        | **Positioned, NOT locked.** Auto-positioned by spec; creator can move them |
| Mandatory-phrase library size for V1                                     | ~100 phrases |
| Sustainability symbols (How2Recycle, FSC, etc.)                          | Voluntary badges — admin-curated, partner can attach to a PackagingType |
| Pet-food rules (AAFCO)                                                   | Modelled as its own market-rule pack — same schema, different category |

## 3. Non-goals (V1)

- **No AI auto-position.** V1 places badges at deterministic anchor points
  defined per packaging-type. AI repositioning lands V2 alongside the OCR work
  (see `AUTO_RECOGNITION_PLAN.md` §5).
- **No print-time validation against placement.** V1 surfaces violations in the
  CompliancePanel; the print-export ack flow (DS-69) already handles the
  print-at-own-risk path.
- **No multi-language phrases.** V1 ships English + Spanish only, because Markets
  already cover only US + Canada in ACTIVE state.
- **No partner-built symbols.** All symbols are admin-curated. Partners
  *attach* approved symbols to their PackagingTypes; they can't ship new SVGs.

## 4. The four new models

All four models are additive — they slot beside the existing `PackagingType`,
`PackagingSystem`, `PackagingSurface` triad without changing any column.

### 4.1 `PackagingSymbol` — the symbol catalog

The canonical inventory of every symbol that can appear on a label. Admin-only
mutation; partner-readable for selection on their PackagingType.

```prisma
enum SymbolCategory {
  RECYCLING            // RIC (#1–#7 resin), How2Recycle, mobius loop
  ALLERGEN             // Big-9 allergen icons (FDA-aligned)
  NUTRITION            // Heart-healthy, low-sodium check-marks (FDA voluntary)
  ORGANIC              // USDA Organic seal, EU Bio leaf (later)
  ORIGIN               // Country-of-origin marks, Made-in-USA
  CERTIFICATION        // B-Corp, Non-GMO Project, Fairtrade, Kosher, Halal
  SUSTAINABILITY       // FSC, Rainforest Alliance, BPA-free
  PET_FOOD             // AAFCO label statements (visual marks)
  WARNING              // Prop 65, choking hazard, expectant-mother
  MARKETING            // Voluntary brand badges with no regulatory weight
}

enum SymbolRequirement {
  MANDATORY            // legally required under at least one market+category rule
  VOLUNTARY            // creator/partner may choose; no compliance enforcement
}

enum SymbolStatus {
  DRAFT
  ACTIVE
  PENDING_REVIEW       // partner-submitted; awaiting admin promotion
  DEPRECATED
}

model PackagingSymbol {
  id                String              @id @default(cuid())
  slug              String              @unique             // 'how-2-recycle-store-drop-off'
  displayName       String                                   // 'How2Recycle — Store Drop-Off'
  category          SymbolCategory
  requirement       SymbolRequirement   @default(VOLUNTARY)
  status            SymbolStatus        @default(ACTIVE)
  // SVG asset — single root, viewBox 0 0 100 100, no embedded raster.
  // Stored in R2 like every other asset; the FK is soft so the symbol can
  // be imported before its file is uploaded.
  svgAssetKey       String?                                  // R2 key
  // Bounding box at the canonical viewBox — drives auto-position math.
  intrinsicWidthMm  Float?                                   // 12.0 mm
  intrinsicHeightMm Float?                                   // 12.0 mm
  // Display rules for the canvas + Design Studio.
  defaultAnchor     Json?                                    // see §6 Anchor Spec
  attribution       String?                                  // 'How2Recycle® is a trademark of GreenBlue Institute'
  // Provenance / audit.
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  submittedById     String?                                  // partner user who first proposed it
  approvedById      String?                                  // admin who promoted it to ACTIVE
  // Relations (back-pointers).
  regulationsRequiring PackagingRegulationSymbol[] @relation("RegulationSymbolList")
  attachableTo         PackagingTypeSymbolDefault[]
  @@index([category, status])
}
```

### 4.2 `MandatoryPhrase` — the regulatory phrase corpus

~100 short, market-scoped strings the renderer drops onto the canvas as text.
Examples: "Distributed by", "Contains:", "Manufactured for", "Keep refrigerated".

```prisma
enum PhraseCategory {
  ALLERGEN_DECLARATION
  CONTACT_BLOCK
  STORAGE_INSTRUCTION
  USAGE_DIRECTION
  WARNING
  ORIGIN
  NUTRITION_PREAMBLE
  PET_FOOD_AAFCO
}

enum PhraseStatus {
  DRAFT
  ACTIVE
  DEPRECATED
}

model MandatoryPhrase {
  id            String          @id @default(cuid())
  slug          String          @unique                  // 'fda-distributed-by-en'
  category      PhraseCategory
  status        PhraseStatus    @default(ACTIVE)
  marketId      String                                    // FK to Market — phrases are jurisdiction-scoped
  languageCode  String          @default("en")            // 'en' | 'es' (V1)
  // The actual text. Token interpolation uses {{brandName}} style — resolved
  // at render time from BrandIdentity + ProductTemplate context.
  body          String                                    // 'Distributed by {{brandName}}, {{city}}, {{state}} {{zip}}'
  // Display hints.
  minPointSize  Float?                                    // FDA §101.15 minimum
  preferredFont String?                                   // override the brand font for compliance text
  notes         String?                                   // admin-only context
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  // Relations.
  market        Market          @relation(fields: [marketId], references: [id])
  regulationsRequiring PackagingRegulationPhrase[] @relation("RegulationPhraseList")
  @@index([marketId, category])
  @@unique([slug, languageCode])
}
```

### 4.3 `PackagingRegulation` — the rule pack

The bridge table that says *for this category × packaging-type × market, you
must include these symbols and these phrases*. One row = one rule pack. The
renderer queries this with `(categoryId, packagingTypeId, marketId)` and gets
the full set.

```prisma
enum RegulationStatus {
  DRAFT
  ACTIVE
  DEPRECATED
}

model PackagingRegulation {
  id                String           @id @default(cuid())
  // Triple-key — uniqueness enforced at the constraint level.
  subcategoryId     String                                // Subcategory (not the broader Category) — finer-grained
  packagingTypeId   String                                // FK PackagingType
  marketId          String                                // FK Market (US, CA, EU, etc.)
  status            RegulationStatus @default(DRAFT)
  effectiveFrom     DateTime         @default(now())
  effectiveTo       DateTime?                             // null = open-ended
  // Free-form admin note explaining the legal basis (CFR cite, EU directive number).
  legalBasis        String?
  // Snapshot of which rule-pack version compiled this row, so a label
  // generated last week can be reproduced verbatim even if the regulation
  // changes today (per Pavel's "Operational trust > margin optimization in V1"
  // — see [[ilaunchify-operational-philosophy-v1]]).
  rulePackVersionId String?
  // Relations.
  subcategory       Subcategory      @relation(fields: [subcategoryId], references: [id])
  packagingType     PackagingType    @relation(fields: [packagingTypeId], references: [id])
  market            Market           @relation(fields: [marketId], references: [id])
  symbols           PackagingRegulationSymbol[]
  phrases           PackagingRegulationPhrase[]
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  @@unique([subcategoryId, packagingTypeId, marketId, effectiveFrom])
  @@index([marketId, status])
}

// Join table — which symbols a regulation requires, and where they auto-anchor.
model PackagingRegulationSymbol {
  id              String           @id @default(cuid())
  regulationId    String
  symbolId        String
  required        Boolean          @default(true)        // mandatory vs. optional within the pack
  anchorOverride  Json?                                  // override PackagingSymbol.defaultAnchor for this rule
  // Relations.
  regulation      PackagingRegulation @relation(fields: [regulationId], references: [id], onDelete: Cascade)
  symbol          PackagingSymbol     @relation("RegulationSymbolList", fields: [symbolId], references: [id])
  @@unique([regulationId, symbolId])
}

// Join table — which phrases a regulation requires.
model PackagingRegulationPhrase {
  id              String           @id @default(cuid())
  regulationId    String
  phraseId        String
  required        Boolean          @default(true)
  anchorOverride  Json?
  // Relations.
  regulation      PackagingRegulation @relation(fields: [regulationId], references: [id], onDelete: Cascade)
  phrase          MandatoryPhrase     @relation("RegulationPhraseList", fields: [phraseId], references: [id])
  @@unique([regulationId, phraseId])
}
```

### 4.4 `DieCutComplianceGrid` — the shape compatibility matrix

When a creator picks a die-line shape (round label, square box, hex jar lid),
not every regulation pack fits. A 22 mm round capsule lid physically cannot
display a Nutrition Facts panel — the FDA permits a "Small Package" exception.
The compliance grid tells the renderer which exceptions apply.

```prisma
enum DieCutFamily {
  ROUND_LABEL
  RECTANGULAR_LABEL
  WRAP_AROUND
  POUCH_FACE
  BOX_PANEL
  LID_TOP
  STICK_PACK_BODY
  SACHET_BODY
}

enum ComplianceException {
  SMALL_PACKAGE          // FDA 21 CFR 101.9(j)(13) — partial Nutrition Facts allowed
  AAFCO_INTERMEDIATE     // pet food intermediate-package rule
  WRAP_AROUND_FOLD       // PDP must be the largest unfolded panel
  STICK_PACK_BACK        // mandatory text can flow onto the back panel
  NONE
}

model DieCutComplianceGrid {
  id                  String                @id @default(cuid())
  dieCutFamily        DieCutFamily
  minSurfaceAreaMm2   Float                                   // below this, exception applies
  maxSurfaceAreaMm2   Float?
  marketId            String
  exception           ComplianceException   @default(NONE)
  // The reduced set of regulation rows that still apply under the exception.
  // Null means "no override — use the full regulation pack."
  reducedRegulationIds String[]
  notes               String?
  market              Market                @relation(fields: [marketId], references: [id])
  @@index([dieCutFamily, marketId])
}
```

### 4.5 Surface area connectors

Two small connector tables keep V1 from coupling these models to the schema
they care about:

```prisma
// Partner-attachable symbol defaults per PackagingType. Lets a partner
// declare "my 12 oz pouches always carry How2Recycle" without rewriting the
// global regulation rows.
model PackagingTypeSymbolDefault {
  id              String           @id @default(cuid())
  packagingTypeId String
  symbolId        String
  displayOrder    Int              @default(0)
  packagingType   PackagingType    @relation(fields: [packagingTypeId], references: [id], onDelete: Cascade)
  symbol          PackagingSymbol  @relation(fields: [symbolId], references: [id])
  @@unique([packagingTypeId, symbolId])
}
```

(No new field on `Market`, `Subcategory`, `PackagingType`, or `PackagingSurface`.
Everything else is FK-only.)

## 5. The resolver — how rules get to the canvas

Single server action, called by the Design Studio when a creator opens a
packaging surface:

```ts
export async function resolvePackagingArtefacts(input: {
  productTemplateId: string
  packagingSystemId: string
  surfaceId: string
  marketId: string
}): Promise<{
  dieLine: DieLineSnapshot
  regulationPack: PackagingRegulation
  symbols: ResolvedSymbol[]      // each with computed anchor in mm
  phrases: ResolvedPhrase[]      // each with computed anchor + interpolated body
  exceptions: ComplianceException[]
}>
```

Order of operations:

1. Read the `PackagingSystem` → resolve the linked `PackagingType` (or fall back
   to partner-private definitions).
2. Read the `PackagingSurface` → get the die-line, surface dimensions, and
   `DieCutFamily`.
3. Find the matching `PackagingRegulation` row by
   `(subcategoryId, packagingTypeId, marketId)` where `effectiveFrom ≤ now ≤
   effectiveTo` and `status = ACTIVE`.
4. Apply `DieCutComplianceGrid` reductions if the surface area falls under an
   exception threshold.
5. For each remaining symbol + phrase, compute the anchor (see §6) using the
   regulation's `anchorOverride` or the canonical `defaultAnchor`.
6. Interpolate phrase templates against `BrandIdentity` + `ProductTemplate`
   context (`{{brandName}}`, `{{netWeight}}`, etc.).
7. Stamp `rulePackVersionId` onto the returned snapshot so the resulting
   DesignVersion records exactly which rule-pack edition compiled the artefacts
   (mirrors the FlavorPreset rule-pack-pinning pattern in #139).

The renderer's job is then simple: place each artefact as a Fabric.js group
with `customType: 'compliance-symbol'` or `'compliance-phrase'`, at the computed
position, with `lockMovementX/Y = false` (positioned, **NOT** locked — Pavel's
explicit decision).

## 6. Anchor specification

Anchors are an ergonomic grid plus an offset, not raw pixels. The canvas
resolves them at render time against the die-line's surface dimensions in mm:

```ts
type Anchor = {
  edge:    'top' | 'right' | 'bottom' | 'left' | 'center'
  align:   'start' | 'center' | 'end'
  insetMm: number              // distance from the edge, in mm
  // Optional sequence — multiple symbols anchored to the same edge get
  // packed along it in `order` ascending, separated by `gapMm`.
  order?:  number
  gapMm?:  number
}
```

Three reasons for the grid abstraction:

1. **Surface-area-independent.** A 12-mm symbol at `{edge: 'bottom', align:
   'center', insetMm: 4}` works on a 50×80 mm round label *and* a 200×180 mm
   pouch face without per-die-line work.
2. **Reflows correctly under exceptions.** When `DieCutComplianceGrid` strips
   half the regulation pack, the remaining symbols rearrange via `order`
   without admin intervention.
3. **Creator can move them.** Once positioned, the symbol is a Fabric.js
   object the creator can drag anywhere — V1 records the offset back into the
   DesignVersion JSON, V1.5 may add a "snap-back to compliance anchor" affordance.

## 7. Admin surfaces

Two new pages under `/admin/packaging-library`. Sidebar entry under Catalog
(per the v3 sidebar tree shipped 2026-05-31).

| Page                          | Purpose |
| ----------------------------- | ------- |
| `/admin/packaging-library/symbols` | CRUD on `PackagingSymbol`. SVG upload + preview. Promote `PENDING_REVIEW` partner-submitted symbols. |
| `/admin/packaging-library/phrases` | CRUD on `MandatoryPhrase`. Market filter, category filter, search. |
| `/admin/packaging-library/regulations` | Three-axis matrix view: rows by subcategory × packaging-type, columns by market. Click a cell to edit symbols + phrases attached to that regulation pack. |
| `/admin/packaging-library/die-cut-grid` | Read-only V1 — the compliance grid is admin-seeded, not edited per-row. |

Each page follows the existing /admin/ingredients pattern: cream header band,
sortable table, inline row actions. No new chrome.

## 8. Partner surfaces

One new section on the existing `/partner/packaging/new` and
`/partner/packaging/[id]/edit` pages — **"Approved symbols"** — where a partner
can:

- Pick from the `PackagingSymbol` library (filtered to `status=ACTIVE`).
- Submit a new symbol as `PENDING_REVIEW` (uploads an SVG, fills the metadata
  form). The new symbol is usable ONLY by that partner's packaging until an
  admin promotes it. Mirrors the SELF_ATTESTED ingredient flow exactly.

No surface for editing phrases — those are admin-only.

## 9. Seed strategy

Phase the data load into four scriptable seeds:

| Seed                                       | Volume target (V1) | Source |
| ------------------------------------------ | ------------------ | ------ |
| `seed-packaging-symbols.ts`                | ~80 symbols         | Curated from FDA, USDA, How2Recycle, FSC, USDA Organic, B-Corp public assets |
| `seed-mandatory-phrases.ts`                | ~100 phrases        | FDA Food Labeling Guide §3–§7 + AAFCO Model Regulations |
| `seed-packaging-regulations.ts`            | ~40 rule packs      | One per Subcategory × top-3-most-common-PackagingType × US market |
| `seed-die-cut-compliance-grid.ts`          | ~12 grid rows       | FDA Small Package threshold (≤40 in² PDP), AAFCO intermediate-package |

V1 seeds US-only; Canada lands V1.1 against the same schema with new
`marketId` rows.

## 10. Versioning + reproducibility

A label printed in March 2026 must reproduce *byte-for-byte* in March 2028
even if the regulation has changed in between. Two mechanisms:

1. **`rulePackVersionId` on `PackagingRegulation`.** The existing
   `RulePack` + `RulePackVersion` models (from the compliance service) get an
   additional row family for packaging regulations. Each ACTIVE regulation row
   pins to one version; admin edits create a new `RulePackVersion` rather than
   mutating in place.
2. **Snapshot on DesignVersion.** When `resolvePackagingArtefacts` returns,
   the `DesignVersion.compliancePackVersionId` column (added in this phase)
   freezes the version used. Re-rendering the same DesignVersion two years
   later resolves against the snapshotted version, not the current ACTIVE row.

This matches the Operational Trust > Margin Optimization principle locked
2026-05-25 ([[ilaunchify-operational-philosophy-v1]]).

## 11. Migration order

A single migration adds all four models. No backfill needed — every existing
PackagingType keeps working without an attached regulation pack (the resolver
returns an empty artefact set, the canvas opens blank, the creator designs
unguided, the print-export ack flow already covers this with at-own-risk).

```
20260601_packaging_library_schema
  ├── PackagingSymbol + enums
  ├── MandatoryPhrase + enums
  ├── PackagingRegulation + join tables
  ├── DieCutComplianceGrid + enums
  ├── PackagingTypeSymbolDefault
  └── DesignVersion.compliancePackVersionId (nullable)
```

## 12. V1 → V1.5 → V2 sequencing

| Phase | What ships                                                                |
| ----- | ------------------------------------------------------------------------- |
| **V1**   | Schema + admin curation pages + partner symbol picker + resolver + US seed |
| **V1.5** | Canada market seed + partner SVG submission queue (mirrors ingredient queue) |
| **V2**   | AI auto-position (replaces deterministic anchors), OCR cross-check on print |
| **V2.5** | EU market seed (EFSA + EU 1169/2011 mandatory particulars)               |

V1 explicitly skips:
- The "promote partner symbol to library" admin flow (modelled in schema, no
  UI yet — partners can submit; admin sees them in the symbols list with a
  `PENDING_REVIEW` chip, manual flip to `ACTIVE` is the V1 UX).
- Multi-language phrase rendering (Spanish phrases land in V1, but the
  Studio's UI is English only — the resolver picks the language from
  `BrandTargetMarket.languageCode`).

## 13. Open questions deferred to V1.5

1. **Phrase token grammar.** V1 hard-codes a small set
   (`{{brandName}}`, `{{netWeight}}`, `{{address}}`, `{{flavor}}`). V1.5 needs
   either an admin-controlled token registry or a strongly-typed substitution
   helper to avoid runtime resolver crashes.
2. **Symbol licensing.** How2Recycle and FSC are *trademarks*. V1 surfaces
   `PackagingSymbol.attribution` as small text below the symbol; V1.5 needs
   an actual licensing-status field per partner ("has paid the FSC licensing
   fee" before they can attach the FSC mark).
3. **Multi-language phrase fallback chain.** US bilingual labels need en + es
   stacked. V1 renders one language; V1.5 needs a stacked-phrase grouping.

## 14. Cross-references

- `MANUFACTURER_PRODUCT_BUILDER.md` §4b — partner packaging system shape.
- `COMPLIANCE.md` — existing FDA Food Labeling Guide mapping to rule packs.
  This doc extends that pattern from nutrition compliance to packaging
  compliance.
- `MARKETS_AND_REGIONS.md` — Market + Region split. Packaging regulations key
  off Market, not Region.
- `DESIGN_STUDIO_REBUILD.md` §7 — canvas-side rendering of compliance artefacts.
- `PRINT_PRODUCTION_WORKFLOW.md` §9 — print-export ack flow that covers the
  "creator moved the symbol off the safe zone" failure mode.
- Memory: `ilaunchify-operational-philosophy-v1.md` — why we snapshot.
