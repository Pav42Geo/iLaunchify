# Design Studio Rebuild — V1 Spec

**Status:** Approved 2026-05-25
**Supersedes:** docs/DESIGN_STUDIO.md (partially), docs/BRAND_IDENTITY_STUDIO.md (entirely)
**Owner:** Pavel + Claude
**Reason:** The Brand Identity Studio shipped in #165 is the wrong shape (web design-system editor, not packaging-asset library), and the template-gallery flow shipped in #148 is the wrong shape (should not exist between product detail and canvas). This doc resets both.

---

## 1. The platform is a packaging studio, not a brand book builder

iLaunchify's job is producing printed packaging labels. Everything in the creator app must serve that job. The "Brand Identity" module exists for one reason: **to surface a creator's brand assets inside the Design Studio canvas so they can use them on their label without re-uploading every time**.

Concrete consequence: the Brand Identity feature in iLaunchify is a small asset library (logos, color swatches, fonts), **not** a brand strategy framework. Voice archetypes, banned-word linting, WCAG contrast checking, type-scale ratios, persona descriptions, brand-health scores — these are out of scope. They belong in a marketing brief, not a packaging studio.

---

## 2. Corrected creator flow

```
Marketplace
   │
   │  (creator browses products; ProductTemplate cards)
   ▼
Product detail page  (/marketplace/[templateSlug])
   │
   │  - Picks flavor / size / packing variant
   │  - Reviews recipe (if applicable)
   │  - Adjusts customization preferences
   │
   │  "Open Design Studio →"
   ▼
Design Studio Canvas  (/products/[productId]/design)
   │
   │  - Full Fabric.js canvas with die-cut frame, zones, tools
   │  - Creator designs the label
   │  - Compliance scan + mockup preview from canvas chrome
   │
   │  "Export → place production order"
   ▼
Order flow  (unchanged)
```

**What's removed from the old flow:**
- The 4-StepCard product overview at `/products/[id]` (was: Customize → Design → Compliance → Publish wizard). Customization happens on the marketplace product detail page; the rest is canvas-internal.
- The template-gallery picker at `/products/[id]/design` shipped in #148. Templates still exist server-side (DesignLibraryItem rows are still valid), but the picker UX disappears — the canvas opens with a default die-cut + zones for the product, and the creator can swap layouts from inside the canvas via the Product or Label drawers if needed.

---

## 3. Design Studio Canvas — V1 tool inventory

Direct port of the legacy implementation at `FOD-reference/frontend/src/app/design-studio/[productId]/canvas/page.tsx`. Layout dimensions, behaviors, and drawer contents documented below from Pavel's reference screenshots (2026-05-25).

### 3.1 Layout shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TOP BAR (~73px)                                                          │
│  [iLaunchify mark]  Saved ⟳   [↶ ↷]  [Compliance] [Mockup]  Exit Studio │
├────┬─────────────────────────────────────────────────────────────────────┤
│    │                                                                     │
│ L  │  [optional: top-center floating text-format toolbar when text sel]  │
│ E  │                                                                     │
│ F  │                                                                     │
│ T  │                                                                     │
│    │                          CANVAS AREA                                │
│ R  │                  (Fabric.js inside die-cut frame                    │
│ A  │                   with nested guide overlays:                       │
│ I  │                   Bleed / Trim / Safety / Zones)                    │
│ L  │                                                                     │
│    │                                                                     │
│ 80 │                                                                     │
│ px │              [bottom-center floating canvas-controls toolbar]       │
│    │                                                                     │
└────┴─────────────────────────────────────────────────────────────────────┘

                  + slide-out drawer (400px) opens from the left rail
                    next to whichever icon is clicked
```

### 3.2 Top bar elements

| Element | Behavior |
|---|---|
| iLaunchify mark | Link back to dashboard |
| Saved indicator | Real-time autosave state ("Saved", "Saving…", timestamp via history icon) |
| Undo / Redo | Standard, paired with Layers + canvas history |
| **COMPLIANCE** button | Runs the compliance scan against the current design; opens results overlay |
| **MOCKUP** button | Renders a 3D / flat product mockup of the current design (uses existing dieCutTemplate.model3dKey if present, else falls back to flat) |
| Exit Studio | Saves + returns to the marketplace product detail page |

### 3.3 Left rail tools (11 icons, top to bottom)

| # | Tool | Drawer contents | Status for V1 |
|---|---|---|---|
| 1 | **Product** | Product details (die-cut name + dimensions), Die-cut Guide toggles (Bleed / Trim / Safety / Zones), color-coded legend chips | **V1** |
| 2 | **Label** | Nutrition Facts label picker (FDA template recommendation, per-section toggles, ink + bg color, ingredient panel alignment, scale slider, Optional Vitamins panel with market/claim-aware hiding) | **V1** (we have `NutritionFactsRenderer` already) |
| 3 | **Text** | New Text Field input, Font Combinations cards, **massive Ready-to-Use chip library** (Storage & Handling, Health & Safety, Nutrition Claims, Sustainability, Usage & Serving, Alcohol-specific, Baby & Specialty). Click chip → adds text element to canvas | **V1** |
| 4 | **Images** | "My Library" — uploaded brand assets + design assets, ToS acceptance, +Upload, file format list, storage indicator. **Brand logos surface here at the top under "My Brand"** | **V1** |
| 5 | Graphics | (placeholder for V1; AI graphics in V1.5+) | **V1 stub** |
| 6 | Clipart | (placeholder for V1; curated library in V1.1) | **V1 stub** |
| 7 | Background | Background color / image picker. **Brand swatches surface here** | **V1** |
| 8 | Pattern | (placeholder for V1; pattern tile library in V1.1) | **V1 stub** |
| 9 | **QR Code** | Generate QR code dialog with Barcode Data field + type dropdown (GTIN / UPC / EAN / Code 128 / QR Code) | **V1** |
| 10 | Barcode | Same dialog as QR Code but defaults to UPC | **V1** |
| 11 | **Layers** | Photoshop-style layer stack with drag-to-reorder, visibility eye, delete trash. One row per canvas object (Text Layer "TEST TEST TEST", Object Layer, etc.) | **V1** |

### 3.4 Bottom floating toolbar (centered)

Zoom out / zoom % / zoom in / fit-to-screen / rotate left / rotate right / rotate reset / pan-mode toggle / undo / redo.

### 3.5 Top floating text-format toolbar (when text selected)

Font family dropdown (**brand fonts pinned to top**), size, color picker (**brand swatches pinned to top**), bold / italic / underline, alignment (left / center / right), close.

---

## 4. Brand Assets — the corrected scope

A creator's brand has a small, focused set of assets that surface inside canvas tools. No more, no less.

### 4.1 Data model (per Brand row)

| Field | Purpose | Where it surfaces in the canvas |
|---|---|---|
| `brandLogoVariants[]` | Up to ~5 logo assets (primary, icon, horizontal, vertical, inverse). Each a separate Asset row | Images drawer → "My Brand" section at the top |
| `brandSwatches[]` | 3-5 hex strings (named: primary, secondary, accent, ink, bg — but free-form, not enforced) | Color pickers (text color, background color, ink color, label background) → swatch row at the top |
| `brandFontIds[]` | 1-3 TypographyFont references (or uploaded TTF/OTF) | Font dropdown in Text drawer + top text-format toolbar → pinned to top |
| `tagline` | Short string (≤120 chars) | Pre-fillable text element creators can drop on the canvas |

### 4.2 What gets DELETED from the current Brand model

These columns are removed from `Brand` (and seed data, and UI) because they're scope creep:

- `voiceArchetype` (BrandArchetype enum) — Jungian framework, irrelevant to packaging
- `voiceFormality`, `voicePlayfulness`, `voiceWarmth` (sliders 1-5) — same
- `voiceNotes`, `writingToneWords`, `bannedWords`, `personaDescription` — same
- `customPaletteOverride` (bool) — derived from whether swatches differ from any palette
- `colorPaletteId` FK — no need; swatches are denormalized onto the brand
- `typographyAccentId` — overcomplication; fonts list handles this
- `typeScaleRatio` — web typography concept; doesn't apply to packaging
- `colorSystem` JSON (the 11-role token system) — replaced by `brandSwatches[]`
- `secondaryTaglines[]` — overcomplication; the single tagline + free-text in canvas covers it
- `brandStylePresetId` — preset feature is being removed (presets were "starter brand strategies", out of scope)
- `brandVoiceTags[]` — out of scope

### 4.3 What gets KEPT (or simplified)

- `colorPrimary`, `colorSecondary`, `colorAccent` — these stay as a transitional representation but get unified into `brandSwatches[]` (an array of hex strings). The top-3 swatches map to primary/secondary/accent for backwards compatibility.
- `typographyPairId` → simplifies to `brandFontIds[]`. The "pair" concept becomes "a brand has 1-3 fonts" (typically a heading + body).
- `tagline` — kept as-is.
- `logoAssetId`, `logoIconAssetId`, `logoHorizontalAssetId`, `heroAssetId` — collapsed into `brandLogoVariants[]` (an array of Asset references with a `variant` enum: PRIMARY / ICON / HORIZONTAL / VERTICAL / INVERSE).

### 4.4 What gets DELETED from the seed data

- `BrandStylePreset` model + all 12 seeded presets
- `ColorPalette` model + all 30 seeded palettes
- `TypographyPair` model + all 20 seeded pairs

Kept: the 24 seeded `TypographyFont` rows (creators can pick from these as their brand fonts).

### 4.5 What gets DELETED from the codebase

- `apps/creator/src/app/(dashboard)/brands/[brandId]/identity/` entire directory:
  - page.tsx (the 7-tab Studio shell)
  - StudioTabs.tsx
  - BrandPreview.tsx
  - BannedWordsHint.tsx, banned-words.ts
  - brand-health.ts
  - wcag.ts
  - actions.ts (the voice/tone/colors/typography save actions)
  - tabs/ColorSystemTab.tsx, TypographyTab.tsx, VoiceToneTab.tsx, TaglinesTab.tsx, LogoSuiteTab.tsx, ImageryTab.tsx, UsageTab.tsx
- Brand Identity Quickstart picker logic on `/brands/new` — simplified to: name + handle + logo upload + 3-color picker + 1 font choice
- Brand-health card from dashboard

### 4.6 The replacement: `/brands/[brandId]/assets` (3 sections, one page)

A single page, no tabs:

```
Brand: {brandName}
─────────────────────────────────────────────────────
LOGOS         [ upload variants — primary / icon / horizontal / vertical / inverse ]
COLORS        [ 3-5 swatches with hex inputs + color picker ]
FONTS         [ pick 1-3 from the curated catalog, or upload TTF/OTF ]
─────────────────────────────────────────────────────
"Use these in the Design Studio canvas — they'll appear at the top of the
 Images drawer, the color pickers, and the font dropdown automatically."
```

That's the entire Brand Assets surface. No archetype picker, no sliders, no contrast checker, no banned words, no persona, no preview panel, no health score.

---

## 5. Build sequence

### Phase A — Cleanup (1 PR)
1. Schema migration: drop the obsolete Brand columns + their indexes
2. Drop the `BrandStylePreset` / `ColorPalette` / `TypographyPair` models
3. Migrate existing data: collapse `colorSystem` JSON → `brandSwatches[]`, collapse logo FKs → `brandLogoVariants[]`
4. Delete `/brands/[brandId]/identity/` directory + tab components
5. Delete `BrandQuickstartForm` preset picker UI; simplify to name + logo + 3 colors + 1 font
6. Delete the dashboard brand-health card
7. Delete `seed-design-library.ts` template seeding (we keep the DesignLibraryItem model and rows for future use, but the gallery page is gone)
8. Delete `apps/creator/src/app/(dashboard)/products/[productId]/design/` (the template gallery + placeholder editor shipped in #148)

### Phase B — Brand Assets page (1 PR)
9. Build `/brands/[brandId]/assets` page (3 sections, one page)
10. Server actions: addLogoVariant, removeLogoVariant, setSwatches, setFonts, setTagline

### Phase C — Canvas foundation (1 PR)
11. `pnpm add fabric @types/fabric` in `packages/ui`
12. Export `<Stage>` Fabric.js wrapper from `packages/ui/canvas/`
13. Port die-cut frame + bleed/trim/safety/zones overlay system from `FOD-reference/`
14. Build the layout shell: top bar + left rail + drawer slot + canvas mount + bottom toolbar + (selection-aware) top text toolbar

### Phase D — Canvas tools, in priority order (1 PR each)
15. **Product** drawer (die-cut details + guide toggles)
16. **Text** drawer (input + font combinations + ready-to-use chip library + click-to-add)
17. **Label** drawer (Nutrition Facts picker, FDA template, per-section toggles, label style, optional vitamins) — reuses `NutritionFactsRenderer`
18. **Images** drawer with "My Brand" pinned section + upload + storage indicator
19. **Layers** drawer (drag-reorder, visibility, delete)
20. **QR Code / Barcode** dialog (GTIN / UPC / EAN / Code 128 / QR Code)
21. **Background** drawer with brand swatches pinned + color picker
22. **Top floating text-format toolbar** (font, size, color, B/I/U, alignment) — appears when text selected, brand fonts + swatches pinned to top
23. **Bottom floating canvas-controls toolbar** (zoom / fit / rotate / pan / undo / redo)
24. Graphics / Clipart / Pattern — V1 stubs ("coming next")

### Phase E — Brand → Canvas integration (1 PR)
25. Canvas reads the creator's `brandLogoVariants`, `brandSwatches`, `brandFontIds`
26. Images drawer renders "My Brand" section at top with brand logos
27. Color pickers render brand swatches as the first row
28. Font dropdowns pin brand fonts to the top
29. "Apply my brand" button on canvas toolbar: swap template's color placeholders with swatch #1, swap heading font with brand font #1, swap logo placeholder with primary logo

### Phase F — Compliance + Mockup + Export (out of scope for this rebuild; existing compliance service stays as-is)

### Phase G — Post-Canvas Checkout Wizard (per §8 below — separate PR sequence)

---

## 8. Post-Canvas Checkout Wizard

Added 2026-05-25 per Pavel's Vistaprint + Shutterstock reference screenshots. The Design Studio canvas is *not* the end of the creator flow — it's the entry to a multi-step checkout wizard. The top-right **Exit Studio** button becomes **Next →** and launches the wizard.

### 8.1 Wizard step inventory

```
   Canvas
     │  [Next →]
     ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  Step 1  REVIEW DESIGN                                           │
 │          - 2D / 3D preview toggle (mockup viewer)                │
 │          - Design checklist (text clear, info spelled, sharp)    │
 │          - Empty text-field warnings ("Type text here" detected) │
 │          - "Edit design" returns to canvas                       │
 │  Step 2  PRODUCTION OPTIONS                                      │
 │          - Quantity selector (MOQ-aware, per partner service)    │
 │          - Label substrate (matte / glossy / textured / clear)   │
 │          - Packaging material (when packaging type allows it:    │
 │              bottle → plastic / glass / aluminum;                │
 │              tub    → PP / PET / glass;                          │
 │              pouch  → kraft / foil-lined / clear)                │
 │          - Finish / coating (UV / soft-touch / foil accent)      │
 │          - Each pick mutates the live price breakdown            │
 │  Step 3  SUBSCRIPTION OFFER  (Shutterstock-style)                │
 │          - Side-by-side cards: CURRENT PLAN vs UPGRADE PLAN      │
 │          - Both show this exact order's price under each plan    │
 │          - "Subscribe & Save" CTA on the upgrade card            │
 │          - Skippable; non-blocking                               │
 │  Step 4  FULFILLMENT                                             │
 │          - Pick ship-to: own facility / home / closest WAREHOUSE │
 │            / specific WAREHOUSE by region                        │
 │          - Saved addresses list + "Add new address" inline       │
 │          - WAREHOUSE picker filtered by region + capability      │
 │  Step 5  ACCESSORIES                              (V2 stub in V1)│
 │          - Dynamic per packaging type:                           │
 │            bottle → neck-tag / shrink sleeve / dust cap          │
 │            jar    → twine + thank-you tag / lid wrap paper       │
 │            box    → ribbon / tissue paper / insert card          │
 │          - V1 ships an empty list with "Coming next"             │
 │  Step 6  MAKE YOUR PRODUCT VIRAL                  (V2 stub in V1)│
 │          - "Generate launch assets" upsell                       │
 │            (AI social post / AI product video / AI ad poster)    │
 │          - Subscription hook if not on the AI tier               │
 │          - Skippable                                             │
 │  Step 7  MY CART                                                 │
 │          - Final order summary + line-item breakdown             │
 │          - Promo code field                                      │
 │          - Payment: card / Apple Pay / PayPal / Stripe Link      │
 │          - Tax + shipping calculated; total locked here          │
 └──────────────────────────────────────────────────────────────────┘
     │  [Pay →]
     ▼
   Order placed → routing kicks off (existing `@ilaunchify/orders` package)
```

The wizard is a horizontal stepper at the top of the page. The right column shows a sticky **Order Summary** that updates live with every choice (Vistaprint pattern). Left column is the active step's content.

### 8.2 Live price breakdown — what feeds the running total

| Component | Source | Mutates with |
|---|---|---|
| Label production cost | PartnerService LABEL_PRINTING — per-unit cost × quantity | quantity, die-cut, label substrate, finish |
| Packaging cost | PackagingSystem — per-unit cost × quantity | quantity, packaging material |
| Co-pack / fill cost | PartnerService MANUFACTURING — per-unit cost × quantity | quantity, packaging system chosen, complexity |
| Accessories | (V2) each accessory's per-unit cost × quantity | accessory picks |
| AI add-ons | (V2) flat one-time fee per generated asset | viral-kit picks |
| Shipping | computed at fulfillment step from ship-to + carrier rates | ship-to choice |
| Tax | computed at My Cart step from ship-to ZIP | ship-to + subtotal |
| iLaunchify platform fee | `PlatformFeeConfig` table (already exists) | subtotal |
| Subscription discount | if creator is on a subscription plan that includes production credits / % off | subscription tier |
| **Total** | sum, displayed in sticky summary | every choice above |

Each step shows a per-step "this choice changes total by ±$X.XX" microcopy under the picked option (Vistaprint pattern).

### 8.3 Subscription offer step (Step 3) — Shutterstock pattern

This is the most strategically-loaded step. Per Pavel's reference screenshot, Shutterstock shows two cards at the moment of purchase:

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  ✓ Subscribe & Save          │  │   One-time purchase          │
│  10 production credits / mo  │  │   For that "need it now"     │
│  $29 / mo (1-year)           │  │   moment                     │
│  This order = $14.50 / credit│  │   This order = $XX.XX flat   │
│  Cancellation fee applies    │  │   No commitment              │
└──────────────────────────────┘  └──────────────────────────────┘
```

Adapted for iLaunchify:

| Side | Content |
|---|---|
| **Left (Subscribe)** | Show how this order plus the next N orders would price out on the next-tier subscription plan. Highlight the per-order savings. CTA: "Subscribe and apply to this order →" |
| **Right (One-time)** | Show this order's exact total under the creator's current plan. CTA: "Continue with one-time" |

Already-subscribed creators on the top tier skip this step. Free-tier creators always see it. Mid-tier creators see the next-tier offer.

**Schema implication:** iLaunchify doesn't yet have a creator subscription plan model in code, but the **tier names, prices, and per-tier feature gates are already locked in `docs/PLATFORM_SPEC.md` §Tier 1** (lines ~90-125). Read that section before writing this schema — do not invent values.

The locked tier names are **`MAKER` / `BUILDER` / `MASTER`** (per [[ilaunchify-subscription-tiers]]). Per-tier values to seed from PLATFORM_SPEC.md:

| Tier | Monthly | Annual | Production fee | Active products | Brands | Channels (V1.1+) |
|---|---|---|---|---|---|---|
| MAKER (free) | $0 | — | 15% | 1 | 1 | 1 |
| BUILDER | $49-99 | $490-990 | 12% | Unlimited | 3 | 3 |
| MASTER | $199-299 | $1990-2990 | 9% | Unlimited | Unlimited | All 6 |

Plus per-tier perks documented in PLATFORM_SPEC: AI label design depth, compliance check depth, Premier-partner access (Master-only), support SLA, analytics depth, bulk pricing visibility (Master-only gate per Pavel 2026-05-19), co-marketing, early V1.5+ access.

```prisma
model SubscriptionPlan {
  id                 String   @id @default(cuid())
  code               String   @unique  // "MAKER" | "BUILDER" | "MASTER"
  displayName        String
  monthlyPriceCents  Int                                            // 0 for MAKER
  yearlyPriceCents   Int?                                           // ~17% off monthly × 12
  productionFeeBps   Int                                            // 1500 / 1200 / 900
  maxActiveProducts  Int?                                           // null = unlimited
  maxBrandProfiles   Int?
  maxChannelConnections Int?
  premierPartnerAccess Boolean @default(false)
  bulkPricingVisibility Boolean @default(false)                     // Master-only V1
  // Other gates per PLATFORM_SPEC: aiLabelTier, complianceTier, supportSlaHours, analyticsTier
  status             SubscriptionPlanStatus @default(ACTIVE)
  // ...
}

model CreatorSubscription {
  id              String   @id @default(cuid())
  creatorUserId   String   @unique
  planId          String
  status          SubscriptionStatus  // ACTIVE | PAST_DUE | CANCELED
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)
  // Stripe Subscription handle
  stripeSubscriptionId String?
  // Per-period usage counters
  creditsUsedThisPeriod    Int @default(0)
  aiGenerationsUsedThisPeriod Int @default(0)
  // ...
}
```

**V1 scope decision needed:** Ship the upsell step UI now with placeholder copy, OR defer Step 3 entirely until the subscription billing infra lands? See Open Question §9.

### 8.4 Fulfillment step (Step 4) — leverage existing schema

The `Order.shipToType` + `shipToPartnerServiceId` + full address fields already exist (see §1 audit). What's missing is:
- A **SavedAddress** model on the creator (or User) so they don't re-type addresses every order
- A **WAREHOUSE picker** UI that lists ACTIVE PartnerService rows of type=WAREHOUSE, filtered by region (proximity to creator) + capability (can it handle this product category / packaging type / temperature requirements?)

```prisma
model CreatorSavedAddress {
  id              String   @id @default(cuid())
  creatorUserId   String
  label           String   // "Home", "Studio", "Garage", etc.
  contactName     String
  contactPhone    String?
  addressLine1    String
  addressLine2    String?
  city            String
  state           String?
  postalCode      String
  country         String   @default("US")
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())
  @@index([creatorUserId])
}
```

The picker UI offers 4 modes (radio group):

1. **Closest WAREHOUSE** — auto-picks the nearest ACTIVE WAREHOUSE service based on creator region (per [[ilaunchify-markets-and-regions]] memory)
2. **Specific WAREHOUSE** — searchable list of all eligible WAREHOUSE services, grouped by region
3. **Saved address** — pick from `CreatorSavedAddress[]`
4. **New address** — inline form, optionally save for later

**Hard dependency:** at least one ACTIVE WAREHOUSE PartnerService must exist in the database, OR a creator must have at least one SavedAddress, OR they must be willing to type one. The product onboarding for warehouse partners (per [[ilaunchify-partner-onboarding]]) already covers this.

### 8.5 Accessories step (Step 5) — V2 spec, V1 stub

V1 ships an empty "Coming next" panel. The V2 model:

- `Accessory` table — per-accessory metadata: name, image, compatible packaging types, dynamic-suggest rules
- `OrderAccessoryItem` — junction with quantity + per-unit cost on the Order
- Suggestion engine: a function `suggestAccessoriesFor(product, packagingSystem)` returns the top 6 accessories for the picked product
- Example seed rules:
  - `packaging.topology = JAR && product.category = FOOD` → suggest twine + kraft lid square + thank-you tag
  - `packaging.topology = BOTTLE && product.category = BEVERAGE_FUNCTIONAL` → suggest neck-tag + shrink sleeve

### 8.6 Make Your Product Viral step (Step 6) — V2 spec, V1 stub

V1 ships an empty "Coming next" panel. The V2 model:

- Three AI generators: social post (still image), short product video (≤30s), ad poster
- Each generator consumes 1 "AI generation credit" from `CreatorSubscription.aiGenerationsUsedThisPeriod`
- If creator has 0 credits left in their plan: show subscription upsell ("Upgrade to PRO for 20 generations/month")
- Generated assets land in the creator's brand asset library (`Asset` table with `source=AI_GENERATED`) so they can re-use them elsewhere
- Each generation reads the brand's Logos + Colors + Fonts + tagline + product details + design preview as context

### 8.7 Build sequence — wizard PRs (Phase G)

After Phases A-E land (the canvas itself), the wizard rolls in:

1. **G1** — Wizard shell: 7-step horizontal stepper, sticky right-rail Order Summary, Next/Back navigation, draft auto-save between steps
2. **G2** — Step 1 (Review Design) with 2D/3D toggle + design checklist + empty-field detection
3. **G3** — Step 2 (Production Options) — quantity / label substrate / packaging material / finish; live price recompute
4. **G4** — Step 4 (Fulfillment) — saved-addresses model + warehouse picker + inline new-address form
5. **G5** — Step 7 (My Cart) — final summary, promo code, payment (reuses existing Stripe Checkout pipeline)
6. **G6** — Step 3 (Subscription Offer) — schema (SubscriptionPlan + CreatorSubscription), Stripe Subscription wiring, side-by-side cards. *(May defer to V1.5 — see Open Q below.)*
7. **G7** — Step 5 (Accessories) and Step 6 (Make Your Product Viral) — V1 stubs only

### 8.8 What the existing `/products/[id]/order/page.tsx` becomes

The existing single-page order form from #112 is the V0 of this wizard. It either:
- **(a)** Becomes the legacy fallback for products that don't go through the canvas (unlikely — all V1 products go through canvas)
- **(b)** Gets deleted in Phase G1 and replaced entirely by the new wizard at `/products/[id]/checkout` (or similar)

Recommendation: **(b)**. The wizard subsumes everything the old form did and more. The old form is one screen; the wizard is seven screens that share a sticky summary.

---

## 9. Additional open questions for Pavel (post-canvas wizard)

Layered on top of the original 6 in §6:

7. **Subscription step timing:** Ship Step 3 (the Shutterstock-style upsell) as part of V1, or defer until the SubscriptionPlan + CreatorSubscription + Stripe Subscription infra is built (V1.5)? My recommendation: **defer to V1.5** — V1 wizard ships with steps 1, 2, 4, 7. Step 3/5/6 land as "coming soon" panels until billed features are real.
8. ~~**Subscription plan shape:**~~ **RESOLVED 2026-05-25** — tiers are Maker / Builder / Master, fully specified in `docs/PLATFORM_SPEC.md` §Tier 1. Use those values verbatim when seeding `SubscriptionPlan`.
9. **AI generation tier:** Is the "Make Your Product Viral" AI module tied to the same subscription plans (i.e. higher tier = more AI generations), or a separate add-on bundle?
10. **Warehouse onboarding gate:** When a creator hits Step 4, what should they see if **no ACTIVE WAREHOUSE PartnerService** exists in their region yet? Force "Ship to my own address"? Block with "no warehouses available"? Show a list of "Pending — coming soon" partners?
11. **Substrate / material catalog:** Where does the list of label substrates + packaging materials live? On `PackagingType` (admin-curated), on `PartnerService` LABEL_PRINTING (per-partner), or both? Affects how the Step 2 dropdowns get populated.
12. **Saved addresses model:** Per-creator (one address book for all their brands) or per-brand (each brand has its own ship-to list)? I assume per-creator.
13. **Free-economy-shipping threshold:** Vistaprint shows "Your order is $X away from free Economy shipping." Should iLaunchify do the same? Threshold = $100? Configurable per region?


These are intentionally listed and *not* assumed:

1. **Migration vs. nuke:** Local dev DB is presumably full of stale brand rows from the over-built version. Do we write a migration that preserves what we can (logos, primary color, tagline) and drops the rest, or just nuke the brand rows and have you re-create your test brand fresh after the migration runs?
2. **Logo variant enum:** Confirm the 5 variants — PRIMARY, ICON, HORIZONTAL, VERTICAL, INVERSE — match how you think about brand logos. Want to add MONOGRAM? Drop INVERSE?
3. **Swatch count:** Cap at 5, or let creators add up to N? Legacy doesn't show me a number; the screenshots imply 3-5 is typical.
4. **Font upload vs. catalog-only:** Should creators be able to upload arbitrary TTF/OTF files (with all the legal mess that entails — license validation, font fingerprinting), or pick from a curated catalog only? I'd recommend catalog-only for V1 to dodge font-licensing landmines.
5. **Existing `DesignLibraryItem` rows:** I shipped 12 seeded templates in #148. Keep them for future use even though the gallery page is being deleted? Or drop the seed too?
6. **`/products/[id]/customize` page:** This already exists for recipe/flavor selection. Should it become the "product detail with preferences" page in the new flow, or stay separate from the marketplace product detail page?

---

## 7. What I'm NOT doing without your sign-off

- No code changes yet. This doc is the deliverable.
- No new tasks created beyond the planning ones for this rebuild.
- The existing wrong code stays on `main` until you approve the cleanup PR.

When you've reviewed: answer the 6 open questions above and we kick off Phase A.
