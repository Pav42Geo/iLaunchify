# V1 Packaging Components — multi-component architecture

> **STATUS: SPEC ONLY — NOTHING SHIPPED.** Foundational schema for V1 Track C. Every other V1-C doc depends on this model.

> Locked 2026-06-03 — Pavel-approved. Architecture: every product has multiple PackagingComponents (primary container, closures, seals, secondary cartons, tertiary shipping); each component has its own dieline + decoration + design version.

## What this closes

The current schema conflates "what container the product is in" with "what artwork goes on it." Real products have multiple physical components, each with independent pricing, dieline, decoration choice, and potentially different partners. Without modeling this, the platform can't:

- Price a 12-pack correctly (carton + 12 × cans + optional outer mailer = 14+ line items)
- Handle variety packs (3-flavor multipack with auto-aggregate Nutrition Facts label)
- Price bottle products honestly (cap isn't free; tamper-evident seal isn't free)
- Offer custom-printed closures or seals as decoration upgrades
- Support brand accessories (engraved spoons, ribbons, rosette cap covers)

## The model

```prisma
model Product {
  // ... existing fields
  packagingComponents PackagingComponent[]
}

model PackagingComponent {
  id                  String   @id @default(uuid())
  productId           String
  product             Product  @relation(fields: [productId], references: [id])
  
  tier                PackagingTier      // PRIMARY | SECONDARY | TERTIARY
  role                ComponentRole      // CONTAINER | CARTON | INSERT | CLOSURE | SEAL | SHIPPER | LABEL
  
  // What it is
  packagingTypeId     String             // admin-curated PackagingType (330ml can, 6-pack carton)
  packagingType       PackagingType      @relation(fields: [packagingTypeId], references: [id])
  
  // Who makes it (selected at marketplace time)
  partnerOfferingId   String?            // PartnerPackagingOffering
  
  // Which decoration variant (closure: plain vs custom; seal: foil vs shrink band)
  selectedVariantId   String?
  selectedVariant     PackagingComponentVariant? @relation(fields: [selectedVariantId], references: [id])
  
  // The dieline this component uses (resolved from variant or default)
  dielineId           String?
  
  // The decoration method for THIS component (different from sibling components)
  decorationMethod    DecorationMethod
  
  // Design surface
  designVersionId     String?            // its own artwork; nullable for stock variants
  
  // For multi-flavor multipacks
  unitsPerParent      Int                @default(1)   // 4 of THIS flavor in a 12-pack of 3 flavors
  parentComponentId   String?            // primaries link to their secondary carton
  parent              PackagingComponent? @relation("ComponentHierarchy", fields: [parentComponentId], references: [id])
  children            PackagingComponent[] @relation("ComponentHierarchy")
  
  // Per-component flavor preset (variety pack support)
  flavorPresetId      String?
  
  // Editor sort
  displayOrder        Int                @default(0)
  
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  
  @@index([productId])
  @@index([parentComponentId])
}

enum PackagingTier {
  PRIMARY            // the container holding the product
  SECONDARY          // retail-facing carton/box around primary
  TERTIARY           // shipping/distribution outer packaging
}

enum ComponentRole {
  CONTAINER          // primary container itself (can, bottle, jar, pouch)
  CARTON             // secondary box/carton
  CLOSURE            // cap, lid
  SEAL               // tamper-evident seal (foil, shrink band, sticker)
  INSERT             // recipe card, brand-story card, instruction sheet
  LABEL              // separate-applied label when decoration is PRESSURE_SENSITIVE_LABEL
  SHIPPER            // tertiary shipping packaging (branded mailer, polybag, master case)
}

model PackagingComponentVariant {
  // Variants of a component — different decoration choices for the same slot
  id                   String   @id @default(uuid())
  packagingTypeId      String
  componentRole        ComponentRole
  partnerOfferingId    String                    // which partner offers this variant
  
  name                 String                     // "Black metal twist cap" | "Custom-printed shrink band"
  description          String?
  
  isCustomizable       Boolean                    // does selecting this open a Studio surface?
  isDefaultIncluded    Boolean   @default(false)  // is this the standard included variant?
  
  baseSurchargePerUnit Decimal   @db.Decimal(10, 4)  // cost added per unit beyond the default
  leadTimeDeltaDays    Int       @default(0)
  
  dielineId            String?                    // unlocked if isCustomizable=true
  
  // Compliance
  isFdaTamperEvident   Boolean   @default(false)  // counts toward FDA 21 CFR 211.132
  
  status               OfferingStatus
  
  createdAt            DateTime  @default(now())
}

// Accessories (per ilaunchify-accessories-are-partner-bundled-only memory)
model AccessoryOffering {
  id                          String   @id @default(uuid())
  partnerServiceId            String                    // REQUIRED — listing partner is fulfillment partner
  
  name                        String                     // "Laser-engraved wooden honey dipper"
  category                    AccessoryCategory
  description                 String
  imageFileKey                String                     // R2
  
  // Explicit ties — partner picks which of their offerings it fits
  applicablePartnerOfferingIds String[]
  
  pricingTiers                Json[]                     // [{quantity, pricePerUnit}]
  moq                         Int       @default(1)
  leadTimeDays                Int
  
  isCustomizable              Boolean                    // engraving text, color choice
  customizationFields         Json                       // [{field:"engravingText", type:"text", max:30}]
  
  status                      OfferingStatus
  
  createdAt                   DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt
}

enum AccessoryCategory {
  SPOON
  RIBBON
  TAG                // hangtag, neck tag
  INSERT             // recipe card, brand insert
  CAP_COVER          // decorative paper cover over jar lid
  TISSUE             // branded tissue paper
  WAX_SEAL
  STICKER_PACK
  OTHER
}

model ProductAccessory {
  productId             String
  accessoryOfferingId   String
  customizationValues   Json?         // {engravingText: "Pavel's Honey"}
  quantityPerProductUnit Int    @default(1)
  
  @@id([productId, accessoryOfferingId])
}
```

## Decision rules

**When a `PackagingType` is created in admin curation, what required components does it imply?**

Implicit by `PackagingType.category`:

| Container category | Implied required components |
|---|---|
| `BOTTLE`, `JAR` | CONTAINER + CLOSURE (always) + SEAL (if labelingType requires) |
| `CAN` (aluminum, steel) | CONTAINER + SEAL (if labelingType requires) — closure is integral |
| `POUCH`, `SACHET` | CONTAINER only — sealing is structural |
| `BOX`, `CARTON` | CONTAINER only |
| `TUBE` | CONTAINER + CLOSURE |

When the creator picks a ProductTemplate, the system creates the implied component slots. Slots with `selectedVariantId = null` use the partner's default variant.

**When `labelingType` is `DIETARY_SUPPLEMENT` or `OTC`, SEAL is mandatory.** Per FDA 21 CFR 211.132. The slot is created automatically and cannot be omitted (UI disables the "remove" action with a tooltip explaining the regulation).

## Creator UX — three touchpoints

### Touchpoint 1: Marketplace product detail "What's included"

Always-visible panel below the product hero:

```
This 8oz Glass Jar product includes:
✓ 8oz amber glass jar (primary container)
✓ Metal twist cap (closure — customization available)
✓ Induction foil seal (tamper-evident, FDA-required for supplements)

Decoration options available — see customization step
[12 brand accessories available — preview at checkout]    ← only if partner has offerings
```

### Touchpoint 2: Product Builder "Components" section

For each component slot, show:
- Component role label (Primary / Closure / Seal)
- Variant radio group (default selected, others priced as surcharge)
- "Design this surface" link if variant is customizable

```
Primary: 8oz amber glass jar              [Design front + back →]

Closure: ◉ Plain black cap (included)
          ○ Custom-printed cap (+$0.12/unit, +5 days)
                                          [Design cap top →]   ← visible if selected

Seal:    ◉ Standard induction foil (included)
          ○ Branded foil seal (+$0.08/unit)
          ○ Custom shrink band (+$0.22/unit, +3 days)
                                          [Design shrink wrap →]
          
[Preview brand accessories →]   ← only if partner has linked offerings
```

### Touchpoint 3: Checkout — "Brand Add-ons" step

The G7 stub (`#445 G7 · Steps 5 + 6 stubs — Accessories + Make Viral "Coming next" panels`) is renamed and built out. Conditionally rendered: the entire step skips when no `AccessoryOffering` rows match the product+partner combination.

```
Brand Add-ons — make your unboxing memorable

[Wooden Honey Dipper]    [Rosette Paper Cap Cover]   [Branded Recipe Card]
  Fulfilled by partner     Fulfilled by partner         Fulfilled by partner
  $1.20/unit              $0.18/unit                    $0.35/unit
  +5 days                 in stock                      +3 days
  
  [Engrave: ___ ]         [Color: ▼ Pink]               [Customize →]
  [+ Add]                 [+ Add]                       [+ Add]
```

Every accessory shows "Fulfilled by [partner name]" — transparency about ships-together-with-primary vs. separate-dispatch when V2 allows cross-partner.

## Partner UX — `/partner/accessories` (new V1 page)

Cream-header list page following the locked admin v2 surface pattern. Partner creates `AccessoryOffering` rows. Required fields:

- Name + category (SPOON / RIBBON / TAG / etc.)
- Image upload (R2)
- Description
- Linked offerings (multi-select of partner's existing PartnerPackagingOffering rows — these are "this accessory goes with my 8oz jar offering and my 16oz jar offering")
- Pricing tiers
- MOQ + lead time
- Customizable fields (if any)

On create: status starts as `PENDING_REVIEW`. Admin verification queue extension surfaces it. Approved → `ACTIVE` → visible to creators on those offerings.

## Studio implication — multi-component design surfaces

The Studio currently has a tabs-style surface picker (front / back / sides). Multi-component customization extends this into a two-level navigation:

```
Studio left rail — COMPONENTS panel:
  ▾ Primary — 8oz Amber Jar
    [Front]  [Back]
  ▾ Closure — Metal Cap (custom variant selected)
    [Top]
  ▾ Seal — Branded Shrink Band (custom)
    [Wrap]
```

Each component has its own `DesignVersion`. Compliance scan runs per component (the cap doesn't need a Nutrition Facts panel; the jar does). Export bundle includes separate PDFs per component, sent to whichever partner produces that component.

## Pricing aggregation

`estimateProductionCost` (already shipped via G3c) extends to walk the PackagingComponent tree:

```
fn estimateProductionCost(checkoutDraft):
  total = 0
  for component in product.packagingComponents:
    offering = component.partnerOffering
    variant = component.selectedVariant ?? offering.defaultVariant
    
    componentCost = offering.basePricePerUnit + variant.baseSurchargePerUnit
    componentCost *= component.unitsPerParent
    componentCost *= checkoutDraft.quantity
    
    total += componentCost
  
  for accessory in product.productAccessories:
    accessoryCost = lookupPricingTier(accessory.accessoryOffering, checkoutDraft.quantity)
    total += accessoryCost * checkoutDraft.quantity
  
  total += shipping + platformFee
  return total
```

Cost breakdown in OrderSummary surfaces per-component lines:

```
Primary: 12 × 330ml can            $5.40
Secondary: 1 × 12-pack carton      $1.20
Seal: 12 × induction foil          $0.96
Accessories: 12 × wooden coaster   $14.40
Production subtotal                $21.96
Shipping (carrier)                  $4.50
iLaunchify platform fee (10%)       $3.00
─────────────────────────────────────────
Total                              $29.46
```

## Pre-flight per component

Compliance + print pre-flight runs PER component, not just per product. Errors/warnings show which component:

```
✓ Primary (8oz Jar Front): all checks pass
⚠ Closure (Cap Top): text element within 1.2mm of trim — fix or ack
✗ Seal (Shrink Wrap): RGB color detected, partner requires CMYK — must fix
```

## Tasks for Claude Code

| # | Slice | Lift |
|---|---|---|
| C7.a | Schema migration — PackagingComponent + PackagingComponentVariant + ComponentHierarchy self-relation + tier/role enums + flavor preset linkage | ~½ day |
| C7.b | Schema migration — AccessoryOffering + ProductAccessory + AccessoryCategory enum | ~¼ day |
| C7.c | Seed PackagingTier+role implications per existing PackagingType.category — generate default component slots for existing seed templates | ~¼ day |
| C7.d | Server actions — addPackagingComponent / setComponentVariant / removePackagingComponent (with FDA seal-required guard) | ~½ day |
| C7.e | Touchpoint 1 — "What's included" panel on marketplace product detail | ~½ day |
| C7.f | Touchpoint 2 — Components section in Product Builder customize step | ~1 day |
| C7.g | Studio multi-component left rail + per-component DesignVersion routing | ~1-1.5 days |
| C7.h | Pricing aggregation extension in estimateProductionCost — per-component walk | ~½ day |
| C7.i | Per-component pre-flight in ExportModal (compliance + print checks per component) | ~½ day |
| C7.j | Partner accessory CRUD page `/partner/accessories` (cream-header v2 pattern) | ~1 day |
| C7.k | Admin accessory verification queue extension | ~½ day |
| C7.l | Touchpoint 3 — "Brand Add-ons" checkout step (rename G7 stub, build out grid) | ~1 day |
| C7.m | Stepper conditional skip when no accessories for partner+product | ~¼ day |

Total: **~8-9 days** of focused work. Parallelizable: C7.a-d (schema/server) → C7.e-i (creator UX) in series; C7.j-k (partner/admin) independently.

## Paste-ready Claude Code prompt — C7.a (start here)

```
Ship Slice C7.a — schema migration for multi-component packaging. Brief at
docs/builds/_V1_PACKAGING_COMPONENTS.md.

Add the following to packages/db/prisma/schema.prisma (additive only, no drops):

1. enum PackagingTier { PRIMARY SECONDARY TERTIARY }
2. enum ComponentRole { CONTAINER CARTON CLOSURE SEAL INSERT LABEL SHIPPER }
3. model PackagingComponent — full definition from the brief, with
   self-relation ComponentHierarchy + flavor preset FK
4. model PackagingComponentVariant — full definition from the brief
5. Add packagingComponents relation to Product model

Do NOT touch existing PackagingSystem / PackagingType models — additive only.

Use prisma migrate dev. If it hangs locally, hand-author SQL per memory
ilaunchify-migrate-dev-hangs-use-deploy.md.

Verify: pnpm --filter @ilaunchify/db prisma generate &&
        pnpm --filter @ilaunchify/partner typecheck.

Then /ship "C7.a packaging components schema — PackagingComponent +
PackagingComponentVariant + tier/role enums + ComponentHierarchy
self-relation".
```

## See also

- `_V1_DECORATION_METHODS.md` — DecorationMethod enum used by PackagingComponent
- `_V1_DIELINE_NORMALIZATION.md` — PackagingDieline model attached to PackagingComponent
- `_V1_COMPLIANCE_TEMPLATES.md` — per-component compliance scan
- `docs/PACKAGING_LIBRARY_ARCHITECTURE.md` — existing PackagingType admin curation
- Memory: `ilaunchify-accessories-are-partner-bundled-only.md` — accessory model lock
