# V1 Decoration Methods — separating "what container" from "how it's decorated"

> **STATUS: SPEC ONLY — NOTHING SHIPPED.** V1 Track C. Depends on `_V1_PACKAGING_COMPONENTS.md` schema.

> Locked 2026-06-03 — Pavel-approved Option 1 (DecorationMethod as a first-class V1 concept, not derived from FulfillmentMode).

## What this solves

The same container — 330ml aluminum can — can be decorated in fundamentally different ways, each with its own MOQ, lead time, per-unit cost, die-line shape, visual character, and fulfillment-mode coupling. The current schema treats `PackagingType` as if it implies the decoration; it doesn't.

This concept is load-bearing for the on-demand business model. Direct printing on cans requires 5k+ MOQ and is bulk-only. Pressure-sensitive labels work at 100-unit MOQ and natively fit on-demand. Without modeling the distinction, the platform can't accurately price, route, or surface either path.

## The DecorationMethod taxonomy

```prisma
enum DecorationMethod {
  // Primary decoration methods (one per component, required)
  DIRECT_PRINT                // offset/digital/litho printed on substrate itself
  PRESSURE_SENSITIVE_LABEL    // sticker label applied post-fill
  SHRINK_SLEEVE               // full-body shrink-wrap, gravure or digital
  IN_MOLD_LABEL               // for plastic containers, label fused at moulding
  HEAT_TRANSFER               // heat-applied label, mid-volume
  
  // Accent decoration methods (can be combined with primary)
  FOIL_STAMP                  // hot foil application (metallic finish)
  EMBOSS                      // raised impression
  DEBOSS                      // sunken impression
  SPOT_UV                     // selective glossy varnish
  
  // No decoration
  NONE                        // stock cap, blank seal, plain insert
}
```

**Primary** vs **accent** methods: a component has exactly one primary `DecorationMethod` but may layer one or more accents on top (e.g., direct print + foil stamp accent).

```prisma
model PackagingComponent {
  // ... fields from _V1_PACKAGING_COMPONENTS.md
  decorationMethod        DecorationMethod    // primary method
  accentDecorations       AccentDecoration[]
}

model AccentDecoration {
  id                  String   @id @default(uuid())
  packagingComponentId String
  decorationMethod    DecorationMethod   // must be one of FOIL_STAMP, EMBOSS, DEBOSS, SPOT_UV
  surchargePerUnit    Decimal  @db.Decimal(10, 4)
  partnerFinishId     String?            // FK to existing F1 FinishType / PartnerFinish
}
```

## Compatibility matrix

Not every (Container, Decoration) combination is physically valid. Admin maintains a compatibility table:

```prisma
model PackagingDecorationCompatibility {
  packagingTypeId     String
  decorationMethod    DecorationMethod
  notes               String?            // "Not recommended for cans < 250ml — die-cut too small"
  
  @@id([packagingTypeId, decorationMethod])
}
```

**V1 seed catalog (admin):**

| Container category | Compatible primary decorations | Notes |
|---|---|---|
| BEVERAGE_CAN (aluminum) | DIRECT_PRINT, PRESSURE_SENSITIVE_LABEL, SHRINK_SLEEVE | Direct print high-MOQ; PSL low-MOQ; sleeve mid |
| GLASS_BOTTLE | DIRECT_PRINT, PRESSURE_SENSITIVE_LABEL, SHRINK_SLEEVE | All three common |
| PLASTIC_BOTTLE (HDPE/PET) | DIRECT_PRINT, PRESSURE_SENSITIVE_LABEL, SHRINK_SLEEVE, IN_MOLD_LABEL | IML at mid-large MOQ |
| GLASS_JAR | DIRECT_PRINT, PRESSURE_SENSITIVE_LABEL, SHRINK_SLEEVE | PSL most common at small volume |
| POUCH (flexible) | DIRECT_PRINT | Flexo or digital direct print only |
| FOLDING_CARTON | DIRECT_PRINT | Offset on board |
| CORRUGATED_BOX | DIRECT_PRINT | Flexo direct print |
| TUBE (cosmetic/food) | DIRECT_PRINT, PRESSURE_SENSITIVE_LABEL, SHRINK_SLEEVE | All three valid |

Accents (FOIL_STAMP, EMBOSS, DEBOSS, SPOT_UV) compatible with any substrate-supporting primary; admin can disallow specific combinations.

## Partner offering becomes a 3-tuple

Existing `PartnerPackagingOffering` model expands. A partner offers (PackagingType, DecorationMethod, Dieline) at specific (MOQ, price, lead-time):

```prisma
model PartnerPackagingOffering {
  id                  String   @id @default(uuid())
  partnerServiceId    String
  packagingTypeId     String
  decorationMethod    DecorationMethod   // NEW required field
  dielineId           String             // FK to PackagingDieline (decoration-specific)
  
  moq                 Int
  leadTimeDays        Int
  pricingTiers        Json[]
  
  fulfillmentMode     FulfillmentMode    // BULK_PRODUCTION | ON_DEMAND | BOTH
  
  status              OfferingStatus
  
  @@unique([partnerServiceId, packagingTypeId, decorationMethod])
}
```

A partner offering Direct Print on 330ml can AND PSL on 330ml can creates TWO `PartnerPackagingOffering` rows. The marketplace surfaces both as alternative paths for the same container.

## Marketplace UX — decoration picker on product detail

The marketplace product detail page gets a new section between hero and "Start Launching" CTA: **"How do you want it decorated?"**

```
How do you want it decorated?

┌──────────────────────────┐ ┌─────────────────────────────┐ ┌───────────────────────────┐
│  ◆ Direct print          │ │  ◆ Pressure-sensitive label │ │  ◆ Shrink sleeve          │
│                          │ │                             │ │                           │
│  5,000 unit MOQ          │ │  250 unit MOQ               │ │  1,000 unit MOQ           │
│  $0.45/unit              │ │  $0.80/unit                 │ │  $0.65/unit               │
│  28-day lead time        │ │  7-day lead time            │ │  14-day lead time         │
│  ⛟ Bulk production       │ │  ⛟ On-demand or Bulk        │ │  ⛟ Bulk production        │
│                          │ │                             │ │                           │
│  Best for: scale launch  │ │  Best for: market testing   │ │  Best for: full-wrap look │
│                          │ │                             │ │                           │
│  [Start Launching →]     │ │  [Start Launching →]        │ │  [Start Launching →]      │
└──────────────────────────┘ └─────────────────────────────┘ └───────────────────────────┘
```

Each card:
- Decoration method name + visual icon
- MOQ, per-unit price (volume-tier dependent — show range or starting at)
- Lead time
- Fulfillment mode tag (Bulk / On-demand / Flexible)
- "Best for…" one-liner — auto-generated or partner-curated
- Start Launching CTA → carries `decorationMethod` into the Product creation

The card variants follow the locked marketplace fulfillment-mode visual treatment (gradient backgrounds + corner badges).

## Carry-through into Product Builder + Studio

When creator clicks "Start Launching" on a specific decoration variant:
1. `Product` is created with the picked `PartnerPackagingOffering` (which knows decoration + dieline)
2. Default `PackagingComponent` rows generated per the PackagingType implications
3. Primary component's `decorationMethod` = the picked decoration
4. Primary component's `dielineId` = the offering's dieline (decoration-specific)
5. Studio loads with the correct dieline shape (sticker = flat rectangle; direct print on can = cylindrical projection)
6. Checkout's `estimateProductionCost` reads the offering's MOQ/price tiers

The decoration choice is immutable for the product — switching decoration after launch means re-creating the product (the dieline is fundamentally different). Surface this as a warning: "Switching decoration requires starting over."

## Algorithm — auto-route accent decorations to FinishType

Phase F1 already shipped `FinishType` + `PartnerFinish` + `DesignFinishApplication`. Accent decorations (FOIL_STAMP, EMBOSS, DEBOSS, SPOT_UV) map onto FinishType entries. The accent decoration is a stronger constraint than the existing finish offering — admin manages the mapping:

```prisma
model FinishType {
  // ... existing fields
  decorationMethod    DecorationMethod?   // null for general finishes; set for accent-mapped ones
}
```

When creator picks "Add foil stamp accent" on a component, the system filters available `PartnerFinish` rows by the partner offering that component AND `FinishType.decorationMethod = FOIL_STAMP`.

## Tasks for Claude Code

| # | Slice | Lift |
|---|---|---|
| C8.a | Schema — DecorationMethod enum + AccentDecoration model + PackagingDecorationCompatibility model | ~¼ day |
| C8.b | Schema — extend PartnerPackagingOffering with decorationMethod + dielineId required + unique constraint | ~¼ day |
| C8.c | Seed PackagingDecorationCompatibility for the V1 PackagingType catalog | ~¼ day |
| C8.d | Admin /admin/decoration-compatibility CRUD (small page, low traffic) | ~½ day |
| C8.e | Marketplace product detail — decoration picker section between hero and Start Launching | ~1 day |
| C8.f | Carry decorationMethod through createProductFromMarketplaceSelection action (existing R5) | ~¼ day |
| C8.g | Studio dieline load by component.dielineId (already coupled to PackagingComponent) | covered in C7.g |
| C8.h | Wire accent decorations to F1 FinishType pickers in Product Builder | ~½ day |
| C8.i | OrderSummary surfaces decoration line + accent line | ~¼ day |
| C8.j | Partner `/partner/packaging` extension — partner picks decoration when listing an offering | ~½ day |

Total: **~3-4 days** of focused work.

## Paste-ready Claude Code prompt — C8.a (after C7.a ships)

```
Ship Slice C8.a — DecorationMethod schema. Brief at
docs/builds/_V1_DECORATION_METHODS.md. Depends on C7.a
(_V1_PACKAGING_COMPONENTS.md) having shipped first.

Add to packages/db/prisma/schema.prisma (additive only):

1. enum DecorationMethod — full set from the brief (primary + accent + NONE)
2. model AccentDecoration — full definition
3. model PackagingDecorationCompatibility — admin-curated compatibility table
4. Add decorationMethod field to PackagingComponent (already created in C7.a)
5. Add accentDecorations relation to PackagingComponent

Use prisma migrate dev (or hand-author SQL + migrate deploy if it hangs).

Verify: pnpm --filter @ilaunchify/db prisma generate &&
        pnpm --filter @ilaunchify/partner typecheck.

Then /ship "C8.a decoration method schema — DecorationMethod enum +
AccentDecoration + PackagingDecorationCompatibility".
```

## See also

- `_V1_PACKAGING_COMPONENTS.md` — PackagingComponent model that holds decorationMethod
- `_V1_DIELINE_NORMALIZATION.md` — PackagingDieline shape varies by decoration method
- `ON_DEMAND_BUSINESS_MODEL.md` — fulfillment mode coupling (PSL → on-demand-friendly)
- F1 phase (#426-428) — existing FinishType model that accents map onto
