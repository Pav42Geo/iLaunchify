# Markets & Regions — Spec

**Status:** V1 schema locked 2026-05-24 with Pavel.
**Related:** [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [COMPLIANCE.md](./COMPLIANCE.md) · [MANUFACTURER_PRODUCT_BUILDER.md](./MANUFACTURER_PRODUCT_BUILDER.md) · [DESIGN_STUDIO.md](./DESIGN_STUDIO.md) · [FOD_ADMIN_DELTA.md](./FOD_ADMIN_DELTA.md)

## Why this exists

When a creator browses the iLaunchify marketplace looking for a partner to manufacture their product, "any random partner" is not the right answer. They need a partner that:

1. **Can legally produce for the market(s) the creator sells in** (regulatory jurisdiction) — a partner without FDA facility registration can't produce for the US market; a partner without Health Canada listing can't produce for Canada.
2. **Is physically near enough that shipping cost + lead time stay reasonable** (geographic proximity) — a California creator ordering 500 units of frozen product from a Vermont partner has a different cost structure than one ordering from a partner in Nevada.
3. **Carries the certifications the creator's brand wants on the label** (NSF, USDA Organic, cGMP, Kosher, Halal, etc.).
4. **Has the manufacturing capabilities the product requires** (powder blending, cold-fill bottling, gummy production, hot-fill, etc.).

The same logic applies on the partner side — partners want to know which markets they're certified to serve and which products in their region they're best-positioned to win.

Pavel built a substantial market system in FOD (`Market` + `MarketConfig` + `MarketLanguage` models, 5,783-line admin across 6 tabs). The iLaunchify rebuild preserves the *concepts* (because they're load-bearing for the whole platform) while shipping a leaner V1 implementation (US-only, lighter admin surface). Schema is architected so V1.1 can add Canada and V2 can add EU without rewriting.

## The two-concept distinction (important)

"Market" and "region" are easy to conflate but should NOT be the same data structure. They drive different decisions:

| Concept | Definition | What it drives |
|---|---|---|
| **Market** | A regulatory + commercial jurisdiction the product is *sold into* | Label rules (font sizes, allergen format, mandatory phrases), allergen policy (US Big 9 vs EU 14), language requirements (Canada REQUIRES bilingual), currency display, tax model, rule pack selection |
| **Geographic Region** | A physical *location* of a partner facility, creator brand, or shipping destination | Shipping cost, lead time, partner-proximity matching, freight options, weather considerations for cold-chain |

A partner can serve multiple markets (US + Canada) while being physically located in one region (California). A creator can target multiple markets (US + Canada) while operating from one region (New York).

## V1 schema

```prisma
// =============================================================================
// MARKET — regulatory jurisdiction
// =============================================================================

model Market {
  id                String   @id @default(cuid())
  code              String   @unique   // "US", "CA", "GB", "EU-FR"
  name              String              // "United States — FDA"
  regulator         String              // "FDA", "CFIA", "EFSA", "FSA"
  currency          String              // ISO 4217: "USD", "CAD", "EUR"
  region            String              // "North America", "EU", "UK" — display grouping
  status            MarketStatus        // ACTIVE | COMING_SOON | DEPRECATED
  rulePackId        String              // FK to RulePack — what compliance rules apply
  defaultLanguageId String              // FK to Language

  // Policy JSON — flexible, validated by the rule pack:
  typography        Json     // { minFontSizePt, requiredFonts[], boldRules, contrastMinimum }
  allergenPolicy    Json     // { allergenList[], declarationFormat, "Contains:" phrasing, mayContainPhrasing }
  barcodeRules      Json     // { allowedSymbologies[], placementRules, requiredOnPackaging }

  // Relations:
  rulePack          RulePack  @relation(fields: [rulePackId], references: [id])
  defaultLanguage   Language  @relation("DefaultLanguage", fields: [defaultLanguageId], references: [id])
  languages         MarketLanguage[]
  regions           Region[]
  partnersServing   PartnerMarketCert[]
  brandsTargeting   BrandTargetMarket[]
  products          ProductTemplate[] @relation("ProductTargetMarkets")
  labelTemplates    LabelDesignTemplate[] @relation("LabelTemplateMarkets")
  configs           MarketConfig[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([status, code])
}

enum MarketStatus { ACTIVE COMING_SOON DEPRECATED }

model MarketConfig {
  // Cultural / locale variation within a regulatory market.
  // Example: number_format, date_format, weight_unit_default
  id        String   @id @default(cuid())
  marketId  String
  key       String
  value     Json
  market    Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  @@unique([marketId, key])
}

// =============================================================================
// LANGUAGE + MARKET-LANGUAGE — bilingual labels, translations
// =============================================================================

model Language {
  id          String   @id              // "en-US", "fr-CA", "es-MX"
  code        String                     // "en", "fr", "es"
  name        String                     // "English (US)"
  region      String?                    // "US", "CA"
  isActive    Boolean  @default(true)
  marketLinks MarketLanguage[]
  defaultIn   Market[] @relation("DefaultLanguage")
}

model MarketLanguage {
  id           String  @id @default(cuid())
  marketId     String
  languageId   String
  isDefault    Boolean @default(false)
  isRequired   Boolean @default(false)   // CFIA Canada requires bilingual EN+FR
  displayOrder Int     @default(0)
  market       Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  language     Language @relation(fields: [languageId], references: [id], onDelete: Cascade)
  @@unique([marketId, languageId])
}

// =============================================================================
// REGION — geographic location for proximity matching
// =============================================================================

model Region {
  id              String   @id @default(cuid())
  code            String   @unique     // "US-CA", "US-NY", "US-NE" (region cluster), "CA-ON"
  name            String                // "California", "Northeast US", "Ontario"
  marketId        String                // belongs to a market for hierarchical filtering
  parentRegionId  String?               // "US-NE" can be parent of "US-NY"
  kind            RegionKind            // COUNTRY | SUBNATIONAL_GROUP | STATE_PROVINCE | METRO
  centroidLatLng  Json?                 // { lat, lng } — for distance math
  shippingZone    String?               // freight-zone identifier per major carrier
  isActive        Boolean  @default(true)
  market          Market   @relation(fields: [marketId], references: [id])
  parent          Region?  @relation("RegionTree", fields: [parentRegionId], references: [id])
  children        Region[] @relation("RegionTree")
  partnersAtRegion Partner[] @relation("PartnerPrimaryRegion")
  brandsOperating  Brand[]   @relation("BrandOperatingRegion")
  @@index([marketId, kind])
}

enum RegionKind { COUNTRY SUBNATIONAL_GROUP STATE_PROVINCE METRO }

// =============================================================================
// PARTNER ↔ MARKET ↔ REGION
// =============================================================================

// Partner gets:
//   primaryRegionId  String?    (their main facility's region)
//   marketsCert      PartnerMarketCert[]

model PartnerMarketCert {
  partnerId        String
  marketId         String
  certifiedAt      DateTime
  expiresAt        DateTime?
  certificationRef String?               // FDA registration number, Health Canada licence number
  status           PartnerMarketStatus   // ACTIVE | LAPSED | REVOKED
  partner          Partner @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  market           Market  @relation(fields: [marketId], references: [id])
  @@id([partnerId, marketId])
  @@index([marketId, status])
}

enum PartnerMarketStatus { ACTIVE LAPSED REVOKED }

// =============================================================================
// BRAND (CREATOR) ↔ MARKET ↔ REGION
// =============================================================================

// Brand gets:
//   operatingRegionId  String?   (where the brand operates from)
//   targetMarkets      BrandTargetMarket[]

model BrandTargetMarket {
  brandId    String
  marketId   String
  isPrimary  Boolean @default(false)
  brand      Brand  @relation(fields: [brandId], references: [id], onDelete: Cascade)
  market     Market @relation(fields: [marketId], references: [id])
  @@id([brandId, marketId])
  @@index([marketId])
}

// =============================================================================
// PRODUCT TEMPLATE ↔ MARKETS
// =============================================================================

// ProductTemplate gets:
//   targetMarkets    Market[] @relation("ProductTargetMarkets")
// Many-to-many: a product may be saleable in multiple markets. Each market gets
// its own rendered label, allergen panel, etc.
```

## V1 seed

```typescript
// 1 market: US
{
  code: "US",
  name: "United States — FDA",
  regulator: "FDA",
  currency: "USD",
  region: "North America",
  status: "ACTIVE",
  rulePackId: <FDA-21-CFR-101 rule pack id>,
  defaultLanguageId: "en-US",
  typography: { minFontSizePt: 8, requiredFonts: ["Helvetica"], boldRules: "..." },
  allergenPolicy: { allergenList: ["milk","eggs","fish","shellfish","tree_nuts","peanuts","wheat","soybeans","sesame"], declarationFormat: "Contains: {list}.", mayContainPhrasing: "May contain: {list}." },
  barcodeRules: { allowedSymbologies: ["UPC-A","EAN-13","Code-128"] }
}

// 1 language seeded for V1, expandable:
{ id: "en-US", code: "en", name: "English (US)", region: "US", isActive: true }

// MarketLanguage:
{ marketId: <US>, languageId: "en-US", isDefault: true, isRequired: true, displayOrder: 0 }

// Regions seeded:
//   1 COUNTRY-kind:                 "US"
//   5 SUBNATIONAL_GROUP-kind:        "US-NE", "US-SE", "US-MW", "US-SW", "US-NW"
//   50 STATE_PROVINCE-kind:          "US-CA", "US-NY", "US-TX", ... (all 50 states)
//                                     with parentRegionId pointing to the appropriate sub-group
//   ~30 METRO-kind (V1.1):           NYC, LA, Chicago, etc. — only seeded if shipping math benefits

// Canada is seeded as COMING_SOON market (visible in admin, not yet selectable by partners):
{
  code: "CA",
  name: "Canada — CFIA",
  regulator: "CFIA",
  currency: "CAD",
  region: "North America",
  status: "COMING_SOON",   // hides from partner cert flow + brand target picker
  defaultLanguageId: "en-CA",
  ...
}
```

## The matching algorithm

When a creator on `/marketplace` browses partners (or when the system suggests partners during product creation), the result list is sorted by a score:

```typescript
// packages/marketplace/src/matchPartners.ts
function rankPartnersFor(creator, product, candidates) {
  // Hard filters first — eliminate, don't rank
  const eligible = candidates.filter(p =>
    // (1) Partner must be certified for every target market the creator sells into
    creator.brand.targetMarkets.every(m =>
      p.marketsCert.some(c => c.marketId === m.id && c.status === 'ACTIVE')
    )
    // (2) Partner must have every capability the product requires
    && product.requiredCapabilities.every(c => p.capabilities.includes(c))
    // (3) Partner must currently be onboarded + activated
    && p.status === 'ACTIVE'
  );

  // Soft ranking — score eligible partners
  return eligible
    .map(p => ({
      partner: p,
      score:
        + 50 * proximityScore(creator.brand.operatingRegion, p.primaryRegion)
        + 30 * certificationOverlapScore(creator.preferredCertifications, p.certifications)
        + 15 * leadTimeScore(p.averageLeadTimeDays)
        + 10 * priceScore(p.estimatedPricePer1000)
        - 20 * (p.recentDisputeCount > 0 ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score);
}

// proximityScore returns 1.0 for same-state, 0.7 for same-sub-region,
// 0.4 for same-country, 0.0 for cross-country.
function proximityScore(creatorRegion, partnerRegion) {
  if (!creatorRegion || !partnerRegion) return 0.5;  // neutral if unknown
  if (creatorRegion.id === partnerRegion.id) return 1.0;
  if (creatorRegion.parentRegionId === partnerRegion.parentRegionId) return 0.7;
  if (creatorRegion.marketId === partnerRegion.marketId) return 0.4;
  return 0.0;
}
```

This is intentionally simple for V1. V1.5 can add:
- Real distance math (haversine on centroids) instead of region hops
- Carrier freight zone overlap
- Per-creator learned preferences (you keep picking partners in NE — boost NE partners over time)

## Marketplace UI changes (V1)

On `/marketplace`, the existing 4‑filter sidebar gets two additions:

```
Filter by:
  ▾ Market
    ◉ United States (FDA)  [auto-selected from your brand's primary target market]
    ☐ Canada (CFIA)        — marked "Coming soon"

  ▾ Proximity to your brand (Brooklyn, NY)
    ◉ Anywhere
    ○ My region (Northeast US)
    ○ My state (New York)

  ▾ Capabilities                [existing]
  ▾ Certifications              [existing]
  ▾ Packaging types they support [existing]
  ▾ Categories                  [existing]
```

Search results show a small chip per partner card:
```
┌─────────────────────────────┐
│ 🏭 Acme Co-Pack             │
│ Brooklyn, NY · Northeast US │  ← proximity chip
│ ✓ Serves: US                │  ← market certification chip
│ ✓ NSF, USDA Organic, cGMP  │  ← cert chips
│ [Request quote]             │
└─────────────────────────────┘
```

## Admin UI scope (V1)

FOD's 6‑tab admin (Markets / Assignments / Translations / Settings / TemplateSpecs / RulePacks — 5,783 lines) is overbuilt for V1. Ship:

- `/admin/markets/` — list view (1 active row, US; 1 draft row, CA) + create + edit. Each market row shows its rule pack, default language, language list, and a "Used by" counter (N partners, M brands, P products).
- `/admin/markets/[id]/languages` — assign languages, set default, mark required (for bilingual jurisdictions like Canada).
- `/admin/regions/` — read‑only list of seeded regions (50 US states + 5 sub‑groups + 1 country row). Admin can edit display names + assign shipping zones. Cannot delete (regions referenced by partners/brands).

V1.5 expansion (when Canada lands):
- `/admin/markets/[id]/rule-packs` — assign rule packs per market
- `/admin/markets/[id]/template-specs` — per-market label template assignments
- `/admin/markets/[id]/settings` — number/date format, currency display, weight unit defaults
- `/admin/translations/` — translation strings UI

V2 expansion (when EU lands):
- `/admin/markets/bulk-import` — for adding 27 EU member-state markets in one pass

## Onboarding additions

**Partner onboarding** gains a step in the verification flow:
- "Which markets are you certified to produce for?" — checkbox list of ACTIVE markets
- For each checked market: ask for certification number / regulator registration (FDA registration #, Health Canada licence #, etc.) and expiry date
- These create `PartnerMarketCert` rows in `PENDING_REVIEW` status; admin verifies during the existing Vendor Verification queue (#94)
- Partner can't list products as available in a market until that market's cert is ACTIVE

**Creator/Brand onboarding** gains:
- "Where does your brand operate from?" — region picker (defaults to inferred-from-address if available)
- "Which markets do you sell into?" — checkbox list of ACTIVE markets; at least one required (auto-selects US for V1 launch)
- Brand can edit later in profile settings

## V1.1 / V1.5 / V2 roadmap

### V1 (now)
- Schema: all models above
- Seed: 1 ACTIVE market (US), 1 COMING_SOON market (CA, hidden from selection), 1 language (en‑US), full US region tree (1 country + 5 sub‑regions + 50 states)
- Partner onboarding: market certification step (defaults to US‑only)
- Brand onboarding: operating region + target markets (US only selectable)
- Marketplace: matching algorithm + proximity/market filters in sidebar + chips on partner cards
- Admin: minimal `/admin/markets` + `/admin/regions` (read-only) — see above

### V1.1 — Canada activation
- Flip CA to ACTIVE in seed
- Bilingual label template rendering (EN + FR side‑by‑side or stacked)
- Translation strings UI for admin
- Per‑market rule pack management UI
- Health Canada certification field validation
- French language seed + MarketLanguage(CA, fr‑CA, isRequired=true)
- Currency display per market (CAD for Canadian creators)

### V1.5 — Per‑market label template assignments + per‑market settings
- TemplateSpecs admin UI (which label templates apply to which market)
- Settings admin UI (number/date format, currency, weight units)
- Real distance math (haversine) in matching algorithm
- Carrier freight zone integration

### V2 — EU activation
- Seed 27 EU member-state markets with EFSA rule packs
- Multi‑currency Stripe billing
- Per‑member‑state language assignments
- Tax integration per market (TaxJar or Avalara)
- VAT handling at checkout
- Per‑market shipping carriers + customs documentation

### V2.5 — APAC / international
- AU, NZ, JP, SG markets with their respective regulators
- Asian language support
- Region-specific compliance research

## Why this matters strategically

A creator launching a wellness brand in California targeting US consumers should never see a partner in Quebec who can't legally produce for the US market. They should see California partners first, Western US partners second, then the rest of the country. That's what makes the marketplace feel intelligent rather than chaotic.

As iLaunchify expands beyond the US, the same architecture serves Canadian creators looking for Canadian partners, EU creators looking for partners certified for their target member states, and eventually cross‑market creators ("I sell in both US and Canada") who need partners certified for both.

The schema lands in V1 because **adding it later is migration-hostile** — once partners and products are referencing each other without market scoping, retroactively adding markets creates ambiguous historical data. Better to ship it from day 1 with US as the only ACTIVE market and let the model prove itself in production before V1.1 turns on Canada.

## Open items to revisit

- **State-level granularity for V1** — do we seed all 50 states immediately, or start with just the 10 most common partner states and expand on demand? **Default: all 50 at launch (cheap).**
- **Sub-region groupings** — my proposed 5 (NE / SE / MW / SW / NW) follows Census Bureau conventions. Pavel may prefer industry-specific clustering. **Default: Census Bureau for V1, refine later.**
- **Brand/Partner address → auto-derived region** — should onboarding parse address and pre-fill region, or require explicit pick? **Default: derive, allow override.**
- **Should target market default to all ACTIVE markets** or just inferred from creator's operating region? **Default: infer + allow add.**

## Changelog

- **2026-05-24** Spec written. Pavel raised the region/market gap; previous FOD audit had filed `languages-markets` as "V2 defer" which was wrong — the *idea* is V1‑critical even if V1 scope is US‑only. Schema lands V1 to avoid migration pain later. Canadian (V1.1) and EU (V2) expansion baked into the model.
