---
name: ilaunchify-marketplace-decisions-2026-06-01
description: "Pavel-locked answers to the five Marketplace Management plan open questions on 2026-06-01 — niche cardinality, Pet placement, creator-price composition, partner tier confusion, marketplace theming ownership."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Pavel-locked answers to the five open questions surfaced in
`docs/MARKETPLACE_MANAGEMENT_PLAN.md §5`. Read these before touching
marketplace surfaces, the niche schema, PricingTierModal, or anything
that talks about "partner tier".

# Niches = Layer 1 of the 4-layer marketplace taxonomy (LOCKED — many-to-many)

**Rule:** Niches are NOT a free taxonomy I invent — they're the 8
**Creator Niches** locked in `docs/MARKETPLACE_DESIGN.md §2 Layer 1`.

Locked slugs (do not change): `energy-performance`, `wellness`,
`beauty`, `healthy-lifestyle`, `gourmet`, `family-kids`, `pet-wellness`,
`social-lifestyle`.

**Cardinality:** Per the locked doc line 67, a ProductTemplate belongs
to **multiple Creator Niches** (many-to-many) — example: "a kombucha
can serve Wellness, Healthy Lifestyle, and Social." No cap. No
primary/secondary distinction in V1.

`ProductTemplateNiche.isPrimary` field exists on the
`20260601062600_add_labeling_volumetiers_niche_copacker_2026_06_01`
migration but **is reserved for V1.5+** — leave all rows `isPrimary=false`
in V1 unless Pavel re-opens the question of whether one canonical home
should drive `/launch/[slug]` ordering.

**Walk-back:** My 2026-06-01 first-draft "1 primary + ≤2 secondaries"
was OVER-ENGINEERING that contradicts the locked spec. Drop that
language wherever it appears in plan docs.

**Why many-to-many is right for iLaunchify:** Audience-lens niches
naturally overlap (kombucha = wellness AND lifestyle), creators want
products to surface across their lifestyle audience overlaps, admin
review prevents the standard "tag-spam" failure mode. The locked
8-niche set is tight enough that a product can't sprawl.

**How to apply:** Submit / edit forms surface a multi-select against
the 8 locked niches. Admin review page can add/remove niches
(audit-logged). `/launch/[slug]` joins on ProductTemplateNiche where
niche.slug matches. `/marketplace?niche=` filter same. NEVER seed
beyond the 8 locked rows — `packages/db/prisma/seed-niches.ts` is
explicitly capped.

# The 4-layer marketplace taxonomy — wire ALL four

Per `docs/MARKETPLACE_DESIGN.md §2`, the marketplace organizes
templates along four orthogonal axes. **All four must be wired.** I
shipped only Layer 1 + Layer 2 in V1; Layers 3 + 4 need schema work.

**Layer 1 — Creator Niches** (audience lens, **many-to-many**, 8
locked) — Niche model + ProductTemplateNiche junction shipped on
`add_labeling_volumetiers_niche_copacker_2026_06_01` migration.

**Layer 2 — Product Categories** (product-format lens,
**exactly-one**, 13 locked) — Category + Subcategory models exist;
verify seed matches the 13 categories in §2 line 76 (Snacks &
Confectionery, Pantry Staples, Breakfast & Morning, Baking & Desserts,
Ready Meals, Coffee & Tea, Functional & Wellness Beverages, Refreshment
Drinks, Supplements, Cosmetics & Personal Care, Pet Products, Baby &
Kids Nutrition, Gift & Seasonal).

**Layer 3 — Manufacturing Formats** (production-readiness lens,
filter only) — NOT YET SHIPPED. Need new schema. 4 format groups,
each with format-specific options: Food (Powder · Bar · Snack · Frozen
· Refrigerated · Shelf-stable · Liquid · Paste), Supplement (Capsule ·
Tablet · Softgel · Gummy · Powder · Liquid · Sublingual · Effervescent),
Beverage (Ready-to-drink · Concentrate · Powder mix · Single-serve ·
Multi-serve), Cosmetic (Cream · Lotion · Serum · Oil · Gel · Stick ·
Spray · Bar · Powder). Constrains which ProductionPath rows are viable.

**Layer 4 — Discovery Tags** (lifestyle/trend lens, many-to-many,
admin-curated) — NOT YET SHIPPED. Need new schema. ~30 tags across
three groups: Lifestyle (Keto, Paleo, Vegan, Vegetarian, Gluten-free,
Dairy-free, Sugar-free, Low-carb, High-protein, Organic, Non-GMO,
Plant-based, Whole30), Audience (Kids, Adults, Seniors, Athletes,
Pregnancy-safe, Pets), Trend (Functional, Adaptogenic, Microbiome,
Mood, Energy, Sleep, Immunity, Beauty-from-within, Sustainable
packaging, Single-origin, Small-batch). Drives filter chips + cross-
category curated landing pages (e.g., `/marketplace/keto`).

**How to apply:** When you wire marketplace filters, scaffolding the
admin Categories page, or building any plan doc — assume **all four
layers exist**. Don't conflate Niche (Layer 1) with Category (Layer
2) — they're orthogonal questions. Tag = Layer 4, not freeform.

# Pet products → inline in /marketplace, NOT a separate route

**Rule:** Pet products (cat / dog supplements + treats, marked
`labelingType=PET_PRODUCT`) live **inline** in `/marketplace`. NO
`/marketplace/pet` sub-route. A `labelingType` filter chip + a small
"Pet" eyebrow on the product card disambiguates.

- Reason: V1 inventory is sparse, splitting surfaces fragments
  discovery, and creators who serve both human + pet audiences (common
  among lifestyle influencers) shouldn't have to context-switch.
- The right Facts-panel renderer (Guaranteed Analysis for pet, NFR for
  human, SFR for supplements) branches downstream off `labelingType`.
  Compliance rule pack also branches.

**How to apply:** When wiring marketplace filters, treat `labelingType`
as a top-level facet (alongside niche / category). Don't fork the route
tree. When building `/launch/[niche]`, allow pet niches (e.g., "Pet")
to render inline using the same shell — just swap the cert/facts chips
the niche tile renders.

# Creator-visible price — composition formula (LOCKED)

**Rule:** Every creator-facing price on the marketplace is computed
LIVE from this formula:

```
creatorPrice(productId, qty, creatorTier) =
    manufacturerPerUnitAtTier(productId, qty)           // ProductTemplatePricingTier
  + platformFee(creatorTier, manufacturerPerUnit, qty)  // FeeRule lookup
  + shippingEstimate(qty, fulfillmentMode)              // estimateShipping
  + accessoryFees                                       // optional add-ons
  + (optional) packagingFee                             // if non-default packaging
```

- Manufacturer supplies `ProductTemplatePricingTier` rows (minQty /
  maxQty / perUnitCostCents / perUnitFloorCents / leadTimeDays).
- Platform fee comes from `lookupFeeRate(creatorTier, productCategory)`
  in `packages/plans`.
- PricingTierModal MUST consume the live `ProductTemplatePricingTier`
  for the floor, then overlay the signed-in creator's
  `creatorProfile.subscriptionTier` fee. If signed out → render at
  Maker tier with a "Sign in for your tier" hint.

**Why:** Manufacturers can't pre-quote because the creator's tier
determines the platform fee. Hardcoding the popup (current state per
`docs/MARKETPLACE_AUDIT_2026-06-01.md §3.1`) breaks the moment we
honor real tiers.

**How to apply:** Rebuild `apps/marketing/src/.../PricingTierModal.tsx`
to take `(productId, viewerTier)` and call a server action
`computeCreatorPriceMatrix(productId, viewerTier)` that returns one row
per MOQ tier with the layered breakdown (manufacturer / platform fee /
shipping est / total). Top of #3 in the marketplace audit doc.

# "Premier partner" assumption — DROP it

**Rule:** The PartnerTier enum has values `VERIFIED | TRUSTED | PREMIER`
in the schema, but **what each tier gives a partner has NOT been
decided.** Don't assume Premier gets featured-module priority or
reduced-fee placement on the marketplace until Pavel locks partner
monetization.

**Why:** Pavel's quote 2026-06-01: "Premier partner? We don't have
that determination." The tier names are placeholder; the deal isn't.

**How to apply:** When writing marketplace-management code or
plan docs, NEVER write things like "PREMIER partners get X". Surface
the partner's tier name as an info chip on admin/partner detail pages
ONLY, with no behavioral binding. Marketplace ranking ignores partner
tier for V1. Featured-module priority is admin-curated only.

# Marketplace theming — 100% admin-controlled (CORRECTED — Brand Identity is CREATOR's, not Partner's)

**Rule:** Marketplace visual customization (themes, card variants,
hero layout, color accents) is **entirely admin-controlled**. Neither
partners nor creators get ANY control over how marketplace renders.

**Critical disambiguation — Pavel called this out 2026-06-01:**

- **Brand Identity is a CREATOR concept, not a Partner concept.**
  Creator's `Brand` is their D2C CPG line. Creator Brand Identity
  (logos + color swatches + fonts) lives at `/brands/[brandId]/assets`
  in the creator app, per memory `ilaunchify-brand-assets-not-design-
  system.md`. It feeds:
    (a) the Fabric.js packaging canvas (label render)
    (b) Design Studio template filtering
  Period. Creator Brand Identity does NOT touch the marketplace
  surface either — marketplace doesn't render the creator's brand
  because the marketplace is the BROWSING surface for templates,
  before the creator picks one and customizes it.

- **Partners do NOT have "Brand Identity" in the iLaunchify sense.**
  Partners are manufacturers / printers / co-packers / warehouses.
  They have a company name + verification status + maybe a logo for
  profile display. They do NOT feed Design Studio. They do NOT feed
  marketplace card render. The marketplace doesn't customize itself
  per-partner.

- The `MarketplaceTheme` model in plan §2.1 is for admin seasonal /
  niche-specific themes only — never partner-scoped, never creator-
  scoped.

**Why:** Marketplace is the platform's brand surface. Both letting
partners re-skin and letting creators re-skin would (a) destroy
visual coherence, (b) become a trust attack surface, (c) confuse
viewers about what's platform-promise vs vendor-promise.

**How to apply:**
1. NEVER write "Partner Brand Identity feeds X" — that's a
   conceptual error. Partners don't have it.
2. NEVER write "Creator Brand Identity feeds the marketplace" — it
   doesn't. Creator Brand Identity feeds Design Studio + canvas only,
   AFTER the creator has picked a template.
3. Drop any "per-partner theme customization" language from V1.5
   plans. If partner brand boost ever ships, it's a tiny "Fulfilled
   by Acme" attribution line in the card footer — not a re-skin.
