# Marketplace Management — Strategic Plan

**Date:** 2026-06-02
**Status:** Proposal — pending Pavel decisions on §5 questions
**Author:** Planning pass paired with the marketplace audit shipped 2026-06-01.
**Prompt origin:** Pavel — "We should make a plan for Marketplace Management — Theme management, Filtering system, Category and Niches Management, Module management etc. What would you suggest me on that?"

**Companion docs:**

- `docs/MARKETPLACE_AUDIT_2026-06-01.md` — gap list this plan closes.
- `docs/MANUFACTURER_PRODUCT_BUILDER.md` — locked partner-side editor (§4.3 cards, §5 flavors, §8 approval map).
- `docs/PLATFORM_SPEC.md` — tier model (Maker / Builder / Agency on creator side; Verified / Trusted / Premier on partner side) + monetization.
- `packages/db/prisma/schema.prisma` — current `Category`, `Subcategory`, `ProductTemplate`, `Niche`, `Partner`, `Market`, `Region`, `BannedIngredient` shapes.

**Framing.** Marketplace Management is the *admin-side meta-layer* over the public marketplace surface in `apps/marketing/src/app/marketplace`. Partners populate inventory through `/partner/products`; admin approves through `/admin/products/queue`. This plan is everything that sits *between* those two flows and the public catalog — taxonomy, filtering vocabulary, visual themes, and homepage modules — without touching either the product builder or the approval queue.

The goal is to make the marketplace itself a configurable surface (taxonomy + chrome + modules) without re-coding the page every time the platform wants to push a new niche, run a holiday theme, or pin a featured collection.

---

## §1 The "who tags what" model

Pavel's first question — implicit in the brief — is *"who supplies the data behind each filter chip on the marketplace?"* If we don't answer this cleanly, we end up with two predictable failure modes the audit warned about: (a) tag pollution from free-form partner inputs, and (b) admin becoming the bottleneck for every new product going live. The model below splits each marketplace facet into a single source of record.

| Facet | Source | Mutability | Drives | Notes |
|---|---|---|---|---|
| **Subcategory** | Manufacturer picks 1 at submit | Locked until next `PENDING_EDIT_REVIEW` | Browse rows + sidebar group + slug routing | `ProductTemplate.subcategoryId` FK. Single, not multi. Re-approval flagged per `MANUFACTURER_PRODUCT_BUILDER.md` §8b. |
| **Niche(s)** | Manufacturer picks 1–3 at submit | `PENDING_EDIT_REVIEW` on change | `/launch/[niche]` curated feed + filter chips + homepage rails | `ProductTemplateNiche` junction with `isPrimary` boolean — already in schema. Cap at 3 in the editor UI so it stays a curated overlay, not a tag soup. |
| **Labeling type** | Manufacturer + auto-default from `Subcategory.regulatoryRequirements` | Locked at publish; editable in `DRAFT` | Label render branch (`FOOD` → Nutrition Facts, `DIETARY_SUPPLEMENT` → Supplement Facts, `PET_PRODUCT` → AAFCO, `OTC` → Drug Facts, `COSMETIC` → no panel) + compliance rule pack pin | `LabelingType` enum already in schema (`ProductTemplate.labelingType`). Closes the audit's top render-branch gap. |
| **Certificates** | Manufacturer attaches `PartnerCertificateInstance` rows; admin verifies the instance | `PENDING_EDIT_REVIEW` on add (not remove) | `CertChip` filter group + `CertStrip` on cards + detail page | Three-tier model per builder spec §7. Marketplace never shows PDFs — only badge thumbnails from `CertificateType.thumbnailFileId`. |
| **Allergen Big 9** | Auto-derived from resolved recipe (base slots + selected flavor preset) | Auto-recompute on every slot edit | Allergen filter chip group + "Contains:" line on detail | Read-only on partner side. Cross-contamination string is partner-input — that's separate. |
| **Bioengineered** | Auto-derived from `Ingredient.bioengineeredStatus` rollup | Auto | Filter chip + disclosure on label | Closes audit gap #11. |
| **Volume price tiers** | Manufacturer defines per-packaging in editor | `PENDING_EDIT_REVIEW` | `PricingTierModal` rows + MOQ range filter + sorted-by-min-quantity card sort | `ProductTemplatePricingTier` already in schema (per audit, the UI is shipped but reads synthetic data — this is gap #1). |
| **Lead time** | Manufacturer per-packaging (`ProductTemplatePackaging.leadTimeDays`); falls back to `PartnerService` default | Auto | "Ships in N days" filter + card footer | Per-packaging means a partner offering both 8oz and 32oz can quote them differently. |
| **Region / Market** | Partner.country + `Partner.primaryRegionId` + `BrandTargetMarket` | Locked at partner level | Geo filter (V1.5+) | V1 = US-only, schema ready for V1.1 CA + V2 EU per memory `ilaunchify-markets-and-regions.md`. The filter chip group ships disabled with a "US-only at V1" tooltip so the affordance is discoverable. |
| **Partner tier** | `Partner.tier` (`VERIFIED` / `TRUSTED` / `PREMIER`) | Admin or Stripe webhook | "Premier-only" toggle + sort boost weight + badge on card | Per memory `ilaunchify-v15-tier-upgrade-shipped.md`, every tier write flows through `setCreatorTierWithAudit` for audit traceability; partner-side has equivalent. |
| **Brand-handle search** | `Partner.displayName` (free-text) | Locked at partner level | Search box + suggestion dropdown | Single field — partners cannot tag arbitrary search aliases. |
| **Featured / Editor's pick** | Admin curates via `MarketplaceModule` payload | Admin edit in `/admin/marketplace/modules` | Homepage rails + "Editor's picks" carousel | See §2.4. |
| **Trending** | Platform-derived from `ProductTemplateView` + completed `Order` row counts (rolling 14d window) | Auto recompute (cron, hourly) | Trending carousel on `/marketplace` home | The audit's `getTrendingTemplates()` helper is the V1 stub; V1.5 swaps in a real time-decayed signal. |
| **Status pill** (Bestseller / New / Fast-ship / Low-MOQ / Top-rated / Popular) | Mixed — admin can pin manually, but most are derived | Mostly auto; admin overrides allowed | `StatusPill` on `ProductCard` | Audit gap #45 — today it's hard-coded in `sample-templates.ts`. The derivation rules belong in `packages/products` as a pure function so admin overrides slot in cleanly. |

**The narrative.** Partners *don't* tag freely — they pick from typed vocabularies (Subcategory + Niche + LabelingType) and attach pre-verified objects (CertificateInstance). Everything else is either derived from the recipe / packaging / partner profile, or admin-curated. This keeps the marketplace's vocabulary small and stable across partners while still letting the editor surface enough variety to be interesting.

The single rule that protects the system over time: **no marketplace filter chip is ever sourced from a free-text partner field**. If we want a new filter facet, we either (a) add it to a typed vocabulary the admin owns, or (b) derive it from existing structured data. Anything else turns into the brand-handle anti-pattern we've avoided so far.

---

## §2 Marketplace Management surface — the admin module

A new top-level admin section at `/admin/marketplace`, with four sub-modules. Each sub-module is independently navigable in the admin sidebar (per memory `ilaunchify-admin-sidebar-v3-locked.md` — add under MANAGE > Marketplace, with the four children below; mark not-yet-built ones `hiddenUntilBuilt:true`).

The sidebar tree this adds:

```
MANAGE
├── Marketplace
│   ├── Themes
│   ├── Filters
│   ├── Categories & Niches
│   └── Homepage Modules
```

The shared visual treatment is the cream-header + sortable-table pattern from memory `ilaunchify-admin-surface-pattern.md` — cream `#F3EFE8` header band, hairline `border-ink-200`, semantic status pills, focus-visible:ring-pink-500. No shadcn `Card` wrappers.

### §2.1 Theme Management

The first sub-module is theme management — visual variants of the marketplace that admin can swap between or schedule. Default V1 ships exactly one theme (the locked pink/black/neon system from `ilaunchify-design-system-v1.md`); the surface exists so future seasonal / niche / regional variants don't require a code release.

**Proposed model:**

```prisma
model MarketplaceTheme {
  id                String   @id @default(cuid())
  slug              String   @unique
  name              String                          // "Default", "Holiday 2026", "Pet Supplements"
  isDefault         Boolean  @default(false)        // exactly one true at any time
  accentHex         String                          // override pink-500 — pink token stays the brand
  heroVariant       String                          // "DARK_GLOW" | "LIGHT_EDITORIAL" | "NICHE_ACCENT"
  productCardVariant String                         // "DEFAULT" | "DENSE" | "EDITORIAL"
  isSeasonal        Boolean  @default(false)
  startsAt          DateTime?
  endsAt            DateTime?
  status            MarketplaceThemeStatus          // DRAFT | ACTIVE | ARCHIVED
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

enum MarketplaceThemeStatus { DRAFT ACTIVE ARCHIVED }
```

**Use cases enumerated:**

- **Default theme** (always present, isDefault=true) — the locked pink-500 / black-pill / neon-green system. Cannot be archived.
- **Seasonal themes** — Black Friday, holiday Q4, New Year fitness push. Admin sets `startsAt` / `endsAt`; a daily cron promotes the matching seasonal theme into `ACTIVE` and back. Only one ACTIVE non-default theme at a time.
- **Niche-specific themes** — when browsing under `/launch/sports-nutrition`, the page can opt into a darker palette. This is the bridge between `Niche.accentHex` (already in schema) and the theme system — Niche's accentHex acts as a per-niche micro-theme that overrides specific tokens without swapping the whole theme.
- **Regional themes** (V2+) — when a market beyond US ships, the EU instance might use cleaner editorial typography. The schema is ready; the swap is admin-controlled.

**V1 shape:** ships one default row, schema present, admin surface is a list page only (no editor yet). V1.5 adds the editor + cron promotion. The rationale is the same as the "earn the right to multi-tenant" principle in memory `ilaunchify-earn-the-right-to-multi-tenant.md` — land the substrate, defer the rollout.

### §2.2 Filtering System

The marketplace today has a hard-coded set of sidebar facets (Diet + MOQ + a textbox-style chip pile). The audit calls out that we need real niche / market / certificate / labeling-type chip groups. Rather than hard-coding the next round, this sub-module makes filters themselves admin-managed rows.

**Proposed model:**

```prisma
model MarketplaceFilterDefinition {
  id            String   @id @default(cuid())
  slug          String   @unique               // "diet", "niche", "labeling-type", "cert", "moq", "lead-time"
  label         String                          // "Diet"
  facetSource   String                          // "TAG" | "NICHE" | "LABELING_TYPE" | "CERTIFICATE" | "RANGE_MOQ" | "RANGE_LEAD_TIME" | "PARTNER_TIER" | "MARKET"
  displayMode   String                          // "PILLS" | "RANGE_SLIDER" | "SELECT" | "TOGGLE"
  sortOrder     Int      @default(0)
  isActive      Boolean  @default(true)
  isPinned      Boolean  @default(false)        // pinned filters always visible (vs. behind "More filters")
  helpText      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**URL contract (the source of truth for what the page reads):**

```
/marketplace?subcategory=&niche=&cert=&labelingType=&minMoq=&maxMoq=&partnerTier=&search=&sort=
```

Each `MarketplaceFilterDefinition.facetSource` maps to one URL key + one Prisma `where` clause builder in `apps/marketing/src/lib/templates.ts`. The admin can add a new filter row (e.g. `Lead time` once we want it) and it shows up in the sidebar automatically — no code change.

The four filter behaviours admin sets per row:

1. **`isPinned`** — filter shows above the fold in the sidebar. If false, it goes behind a "More filters" disclosure.
2. **`sortOrder`** — controls position in the sidebar list.
3. **`isActive`** — soft-delete; preserves history without breaking URLs that link in with that param.
4. **`displayMode`** — pill group vs. range slider vs. multi-select.

V1.5 adds *saved searches* — a creator can name a filter combination and pin it to their dashboard. The current schema is enough to support this when we get there (just a small `CreatorSavedSearch` table that stores the URL queryString).

### §2.3 Category & Niches Management

Three CRUD UIs sitting at the bottom of the existing taxonomy stack — none of which exist today as admin surfaces.

**`/admin/marketplace/categories`** — existing `Category` model. Admin can add/rename/sort categories, set `mainCategory` grouping ("Food" / "Beverages" / "Supplements" / "Other"), attach `Category.regulatoryRequirements` JSON (which feeds the auto-default of `labelingType` on the partner builder). Status: should ship at the same time as the partner product builder edit-existing-category flow lands.

**`/admin/marketplace/subcategories`** — same UI shape, scoped to subcategories. The `packagingOptions` JSON column on `Subcategory` (already in schema) is the seed for default sizes that the partner editor pre-populates. Admin can also reorder subcategories within a parent.

**`/admin/marketplace/niches`** — new CRUD over the `Niche` model. The schema already has `slug` / `name` / `description` / `iconEmoji` / `accentHex` / `displayOrder` / `isActive`. **The audit's open question on this** is whether `/launch/[niche]` can pull *everything* it renders from DB (tagline + gradient + subcategory chip grid) — answer: yes, with two additive fields:

```prisma
// 2026-06-02 V1.1 plan additions to Niche
model Niche {
  // ... existing fields ...
  tagline             String?                  // hero subline on /launch/[slug]
  gradientKey         String?                  // "pink-neon" | "neon-black" | "pink-cream" — maps to themed gradient in packages/ui
  subcategoryAnchors  NicheSubcategoryAnchor[] // see below — the chip grid on /launch/[slug]
}

// 2026-06-02 V1.1 plan addition
model NicheSubcategoryAnchor {
  nicheId        String
  subcategoryId  String
  displayOrder   Int      @default(0)
  isComingSoon   Boolean  @default(false)      // renders the "Coming soon" pill the audit calls out
  niche          Niche       @relation(fields: [nicheId], references: [id], onDelete: Cascade)
  subcategory    Subcategory @relation(fields: [subcategoryId], references: [id], onDelete: Cascade)
  @@id([nicheId, subcategoryId])
}
```

I picked the normalized junction over a `subcategoriesJson` column for two reasons: (a) admin will want to reorder + retire individual chips without rewriting JSON; (b) the `Subcategory` FK enforces referential integrity so we never end up with stale subcategory slugs on a niche page after a subcategory rename. The cost is one extra table; the benefit is that the admin CRUD becomes a normal table editor rather than a JSON form.

**Admin can manually re-tag a product's niches during review** rather than rejecting the whole submission. The action lives on the admin product detail page (`/admin/products/[id]`) alongside the existing approve / request-changes / reject controls. Audit-logged via the existing `AuditLog` helper. This shortens the partner feedback loop — "your second niche choice was a bad fit, I retagged" beats "rejected, please pick a better niche, resubmit."

### §2.4 Module Management — homepage building blocks

The current marketplace homepage at `apps/marketing/src/app/marketplace/page.tsx` is one hand-stacked composition: HeroBanner → ControlsBar → ActiveFilterChips → Trending row → 4 category rows → Quick-to-launch row → newsletter. Every time the platform wants to push a new content block, that file gets edited. Module Management makes the homepage a configurable stack of `MarketplaceModule` rows that admin owns.

**Proposed model:**

```prisma
model MarketplaceModule {
  id             String   @id @default(cuid())
  slug           String   @unique
  type           MarketplaceModuleType
  title          String
  subtitle       String?
  payload        Json                            // shape varies per type — see below
  status         MarketplaceModuleStatus         // DRAFT | SCHEDULED | ACTIVE | ARCHIVED
  sortOrder      Int      @default(0)
  scheduledFrom  DateTime?
  scheduledTo    DateTime?
  audience       MarketplaceModuleAudience       // ANON | MAKER | BUILDER | AGENCY | ALL
  themeId        String?                         // optional override to a non-default theme
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  theme          MarketplaceTheme? @relation(fields: [themeId], references: [id])
  @@index([status, sortOrder])
}

enum MarketplaceModuleType {
  HERO_CAROUSEL
  FEATURED_GRID
  NICHE_RAIL
  EDITORS_PICKS
  TRENDING
  TESTIMONIAL
  CTA_BANNER
}

enum MarketplaceModuleStatus { DRAFT SCHEDULED ACTIVE ARCHIVED }
enum MarketplaceModuleAudience { ANON MAKER BUILDER AGENCY ALL }
```

**Each module type ships with one matching React component in `packages/ui`** (HeroCarouselModule, FeaturedGridModule, NicheRailModule, etc.). A renderer in `apps/marketing` maps `module.type` → component, passes `module.payload` as props, and renders the homepage as a stack:

```ts
{activeModules.map((m) => <ModuleRenderer key={m.id} module={m} session={session} />)}
```

**Payload shape per type** (kept as JSON to avoid 7 sub-tables — these are admin-editor-validated via Zod schemas in `packages/schemas`):

| Type | Payload shape |
|---|---|
| `HERO_CAROUSEL` | `{ slides: [{ heading, sub, ctaLabel, ctaHref, imageAssetId, accentHex? }] }` — 1–5 slides |
| `FEATURED_GRID` | `{ templateIds: string[], maxRows: number }` — admin curates the picks |
| `NICHE_RAIL` | `{ nicheSlug: string, maxCards: number, sortKey?: MarketplaceSortKey }` |
| `EDITORS_PICKS` | `{ templateIds: string[] }` — small curated row, 4–6 cards |
| `TRENDING` | `{ window: '7d' \| '14d' \| '30d', maxCards: number }` — pulls live from the trending helper |
| `TESTIMONIAL` | `{ quote, attribution, avatarAssetId? }` |
| `CTA_BANNER` | `{ heading, sub, ctaLabel, ctaHref, surface: 'DARK' \| 'CREAM' }` |

**Admin builds the homepage by drag-reordering an active list** with status filters (Draft / Scheduled / Active / Archived) at the top. Scheduled modules auto-promote to Active at `scheduledFrom` via the same cron the theme rotation uses.

**Audience targeting** — `audience: MAKER` means logged-out visitors don't see it; `audience: ANON` means logged-in creators skip it. This lets us run different homepages for the conversion funnel (`/marketplace` as anon-only sales surface) vs. the working surface (`/marketplace` as a tool for an active Maker / Builder / Agency creator). Closes the audit's logged-out gating gap at the module layer.

**A/B variant support deferred to V1.5** — we'll know what to test after the first round of admin-curated modules ship and we can compare CTR. Premature to bake it in now.

### §2.5 Detail-page block visibility — admin toggles per block

**Prompt origin (Pavel 2026-06-01):** "Because I'm still torn on do I want the Manufacturer Name on the Product detailed page, if in the plan for editable Marketplace I wish I can be able to turn on/off as well as other elements in the detailed page."

Module Management isn't only about the homepage. The **product detail page** is also a stack of blocks the admin should be able to switch on/off without code changes. This both defers the "do we show manufacturer name?" decision (the toggle exists; the default starts OFF until Pavel locks) and gives admin a single CMS-style surface for tuning the page over time.

**Block inventory** — the product detail page is composed of these toggleable blocks. Initial defaults shown:

| Block slug | Block name | Default V1 | Why toggleable |
|---|---|---|---|
| `gallery` | Hero gallery | ON, locked | Required — never disable |
| `breadcrumb` | Category/niche breadcrumb | ON | — |
| `name_price` | Name + price + CTA cluster | ON, locked | Required |
| `manufacturer_attribution` | "Fulfilled by {company}" footer | OFF | Pavel's open question — toggle on globally when he decides |
| `partner_tier_badge` | "Verified / Trusted / Premier" partner tier chip | OFF | Wait for partner monetization lock |
| `cert_strip` | Certification chip strip (organic, non-GMO, …) | ON | — |
| `volume_pricing` | Volume price tiers table (modal trigger) | ON | — |
| `moq_card` | MOQ + lead-time card | ON | — |
| `description` | Long-form description tab | ON | — |
| `recipe_nutrition` | Recipe / Nutrition Facts tab | ON | — |
| `ingredients_panel` | Ingredient statement | ON | — |
| `flavors` | Flavor preset picker | ON | — |
| `variants_picker` | Variant size/format picker | ON | — |
| `cross_contam_notice` | "Made in a facility that processes…" notice | ON | — |
| `bioengineered_notice` | BE disclosure | ON, derived | Conditional — surfaces when any slot has `isBioengineered=true` |
| `related_products` | Related templates row | ON | — |
| `partner_logo` | Partner logo in attribution | OFF | Coupled to `manufacturer_attribution` — only when both ON |
| `reviews` | Reviews / ratings | OFF | V1.5+ feature, schema not built |

**Scope hierarchy** — overrides resolve top-down (most specific wins):

```
product-specific (productTemplateId)  ← admin pin for one product
  ↓ falls back to
niche-specific (nicheSlug)             ← per-niche policy
  ↓ falls back to
category-specific (categoryId)         ← per-category policy
  ↓ falls back to
GLOBAL default                          ← platform-wide
```

This gives admin a path to e.g.: "Hide manufacturer name globally, BUT show it for the `gourmet` niche where culinary creators want to credit the maker."

**Schema additions** — same `MarketplaceModule` storage extended:

```ts
model DetailPageBlockVisibility {
  id                String   @id @default(cuid())
  blockSlug         String                                // 'manufacturer_attribution' etc.
  isEnabled         Boolean
  scope             DetailPageBlockScope                  // GLOBAL | CATEGORY | NICHE | PRODUCT
  // Exactly one of these is non-null per row (enforced app-layer)
  categoryId        String?
  nicheId           String?
  productTemplateId String?
  // Audit
  updatedBy         String?
  updatedAt         DateTime @updatedAt
  createdAt         DateTime @default(now())
  @@unique([blockSlug, scope, categoryId, nicheId, productTemplateId])
}

enum DetailPageBlockScope { GLOBAL CATEGORY NICHE PRODUCT }
```

**Admin surface** — new tab in `/admin/marketplace`:
- **Detail Page Layout** tab — left column = block inventory list (with default state + scope chip showing how often it's been overridden). Right column = a live preview pane showing how the detail page renders with current toggles. Per-block "Override for niche / category / product…" picker opens a scope-specific edit.
- Reorder is NOT in V1 — the detail page is a fixed top-to-bottom layout (gallery → name → price → tabs → related), so blocks can be hidden but not moved. Reorder is a V1.5+ stretch.

**Renderer** — `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` calls a helper:

```ts
const blocks = await resolveDetailPageBlocks({
  productTemplate,
  nicheSlugs: productTemplate.niches.map(n => n.slug),
  categoryId: productTemplate.subcategory.categoryId,
})
// returns { gallery: true, manufacturer_attribution: false, ... }
```

Each block component in the page then guards its render on `blocks[slug]`. Server-side resolution = no client-side flicker.

**Why this shape vs. extending `MarketplaceModule`:**
- Detail-page blocks are short, well-known, NOT user-curated content (no payload JSON to design).
- A separate model keeps the homepage Module table from carrying detail-page-only rows.
- Override scopes need to query by `(blockSlug, scope, scopeId)` — separate model gives clean indexes.

**Future: creator-side blocks** — same model could later carry creator-dashboard widgets (`scope: CREATOR_TIER`) so a Maker sees a slimmer panel than an Agency. Out of scope for V1; the schema is forward-compatible.

---

## §3 Schema additions required

All additions are additive — no existing field rename or migration of existing data. Mark each as `2026-06-02 V1.1 plan` in the schema comment so Pavel can prioritize.

| Addition | Table / field | Justification |
|---|---|---|
| **New** | `MarketplaceTheme` + `MarketplaceThemeStatus` enum | §2.1 |
| **New** | `MarketplaceFilterDefinition` | §2.2 |
| **New** | `MarketplaceModule` + `MarketplaceModuleType` + `MarketplaceModuleStatus` + `MarketplaceModuleAudience` enums | §2.4 |
| **New** | `NicheSubcategoryAnchor` (junction) | §2.3 — picked normalized junction over JSON for FK integrity + reorderability |
| **Extend** | `Niche.tagline String?` | §2.3 — hero subline on `/launch/[slug]` |
| **Extend** | `Niche.gradientKey String?` | §2.3 — maps to themed gradient component prop |
| **Extend** | `MarketplaceModule.themeId String?` + FK to `MarketplaceTheme` | §2.4 — optional theme override per module |
| **Extend** | `ProductTemplate.editorialOverridePin Boolean @default(false)` | §1 status-pill table — admin can manually pin Bestseller / Editor's-pick status regardless of derivation; otherwise auto-derived |

The two enums on existing `Niche` and `ProductTemplate` are additive single-column extensions — they don't break the existing partner editor or the admin product queue.

**Migration shape.** One CockroachDB migration adds the four new tables + four new enums + four new columns. Per memory `ilaunchify-cockroachdb-no-db-text.md` — bare `String` for unbounded text, no `@db.Text`. Per memory `ilaunchify-dev-prisma-restart.md` — Pavel needs to restart the Next dev server after running `prisma migrate dev`.

---

## §4 Build order

8 steps ordered by dependency + audit-gap-closure priority. The first three steps close the audit's top three gaps so the marketplace stops misleading creators with synthetic data.

| # | Step | Closes | Memory / task tie-in | Effort |
|---|---|---|---|---|
| 1 | **Wire `ProductTemplatePricingTier` into `PricingTierModal` + configurator** — replace `buildSamplePricingRows(basePrice)` with `getPricingTierRows(templateId, packagingSystemId, sizeKey)` server helper. Read from the table, fall through to the synthetic helper only on empty. | Audit §3 gap #1 | task #578 (prisma migrate + seed for 2026-06-01 product-plan additions) is the prereq | M |
| 2 | **Branch label render by `labelingType`** — `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx` `RecipeNutritionTab`. Add the `FOOD` → `SUPPLEMENT` → `PET_PRODUCT` → `OTC` → `COSMETIC` switch. Pet-Facts panel is the open Q in §5 below. | Audit §3 gap #2 | New work; pairs with `MANUFACTURER_PRODUCT_BUILDER.md` §4.3 ① Basics card editor flow | L |
| 3 | **Real `Niche` taxonomy → `/launch/[niche]` + filter chips** — replace `lib/niches.ts` fixture with Prisma reads via a new `getNicheBySlug(slug)` + `getTemplatesForNiche(slug)`. Add a niche chip group to `MarketplaceFilters.tsx`. Seed 8 V1 niches via a `prisma/seed-niches.ts` step. | Audit §3 gap #3 | Memory `ilaunchify-orchestration-thesis.md` framing — niches are the audience-facing wrapper around the orchestration graph | M |
| 4 | **Admin `/admin/marketplace/niches` CRUD** — first of the four sub-modules to ship. Edits flow through `AuditLog` per memory `ilaunchify-admin-surface-pattern.md`. Includes the `NicheSubcategoryAnchor` editor (the chip grid on `/launch/[slug]`). | §2.3 | New work; pattern matches existing `/admin/markets`, `/admin/regions` surfaces | M |
| 5 | **Admin `/admin/marketplace/categories` + `/admin/marketplace/subcategories` CRUD** — straightforward table editors, but the `Category.regulatoryRequirements` JSON editor needs care because it feeds the labeling-type auto-default downstream. | §2.3 | Pair with the labeling-type render branch from step 2 — both touch the same data | M |
| 6 | **`MarketplaceFilterDefinition` model + sidebar-render refactor** — convert the hard-coded `MarketplaceFilters.tsx` sidebar groups into a render loop over active definitions. Seed the 6 V1 filters (Subcategory / Niche / Cert / LabelingType / MOQ / PartnerTier). Sidebar admin in `/admin/marketplace/filters` follows the same cream-header sortable-table pattern. | §2.2 | Closes audit's mid-priority gap on missing facet groups (cert, labeling-type, market) | L |
| 7 | **`MarketplaceModule` model + homepage renderer refactor** — convert `apps/marketing/src/app/marketplace/page.tsx` to consume the active module stack via `getActiveModules(audience)`. Seed the current hard-coded composition as 6 default modules so the page renders identically on the day of swap. Admin surface in `/admin/marketplace/modules` with drag-reorder + status filter. | §2.4 | Foundational for V1.5 A/B testing | L |
| 8 | **`MarketplaceTheme` model + scheduling cron** — schema + admin list page only; default theme is the only ACTIVE row at V1. Defer the editor + theme-swap-on-niche-page to V1.5. | §2.1 | Earn-the-right pattern per memory `ilaunchify-earn-the-right-to-multi-tenant.md` — substrate now, rollout when a niche page genuinely needs a non-default theme | S |

**Weeks 1–2 = steps 1–3** (closes audit top-3). **Week 3 = steps 4–5**. **Weeks 4–5 = steps 6–7**. **Step 8 = trailing schema-only PR.**

Every step is followed by a `pnpm tsc --noEmit` pass and a single-purpose commit, matching the pattern used through R12 / R14 / R15.

---

## §5 Open product questions for Pavel

Five blocking-ish decisions that change the schema or the build order. Listed in the order I think we should resolve them.

1. **Niche multi-select shape — single primary + optional secondaries, or fully equal multi-select?** The schema already has `ProductTemplateNiche.isPrimary` so either works. My recommendation: keep `isPrimary` as a UI-only convention (the partner picks one "main" niche that drives `/launch/[niche]` membership; up to 2 secondaries appear as filter chips only). This preserves curation discipline. Counterpoint: a fully-equal 1–3 multi-select is simpler in the partner editor.

2. **Pet products in the main marketplace surface or behind `/marketplace/pet`?** AAFCO labeling regulations + the buyer mental model are different enough that bundling them risks confusing both audiences (a creator browsing for human supplements doesn't want pet products in the grid; a creator browsing for pet doesn't want to filter every other category out). My recommendation: keep one marketplace surface with a "Pet" niche that pre-filters when entered via `/launch/pet`, but expose a top-level `LabelingType` chip group so users can filter pet in or out cleanly. Defer the `/marketplace/pet` sub-route until V1.5+ if a real volume signal warrants it.

3. **Volume price tiers × creator-tier discounts — how do they compose?** This is a hidden-complexity question. If a Builder-tier creator orders 500 units, do they get the volume-tier 500-unit price *and* a Builder-tier discount on top? My recommendation: tier discount applies to the *platform fee*, not the unit cost. So volume tier sets the unit price (partner-controlled, audit-traceable), and Builder/Agency creator tier reduces the fee component of the line total. Composing them on the unit price gets gnarly fast — partners would have to model their floors against every creator tier separately. Confirm.

4. **Do Premier partners get featured-module priority by default?** The `MarketplaceModule` system makes this trivially admin-controllable (just curate Premier templates into `FEATURED_GRID` modules). The product question is whether we want a *systemic* boost — a scoring multiplier in `getMarketplaceTemplates` sort key — or only admin-curated visibility. My recommendation: admin-curated visibility only at V1. A scoring multiplier risks paying-tier-as-pay-for-placement perception when the marketplace is still small enough that admin can hand-curate.

5. **Theme management partner customization scope — do partners get *any* brand customization on their product-card render, or is the marketplace 100% admin-themed?** Memory `ilaunchify-design-system-v1.md` anti-pattern explicitly says *don't reintroduce partner identity on marketplace cards* (orchestration thesis). My recommendation: keep marketplace cards 100% admin-themed. Partner identity is hidden by design. Themes ladder into Niche + Seasonal + Regional axes — never per-partner.

---

## Appendix — file-paths referenced

- `docs/MARKETPLACE_AUDIT_2026-06-01.md`
- `docs/MANUFACTURER_PRODUCT_BUILDER.md`
- `docs/PLATFORM_SPEC.md`
- `packages/db/prisma/schema.prisma`
- `apps/marketing/src/app/marketplace/page.tsx`
- `apps/marketing/src/app/marketplace/[category]/[subcategory]/[slug]/page.tsx`
- `apps/marketing/src/app/launch/[niche]/page.tsx`
- `apps/marketing/src/components/MarketplaceFilters.tsx`
- `apps/marketing/src/lib/templates.ts`
- `apps/marketing/src/lib/niches.ts`
- `apps/marketing/src/lib/sample-templates.ts`
- `packages/ui/src/components/pricing-tier-data.ts`
- Memory: `ilaunchify-business-model.md`, `ilaunchify-orchestration-thesis.md`, `ilaunchify-design-system-v1.md`, `ilaunchify-admin-surface-pattern.md`, `ilaunchify-admin-sidebar-v3-locked.md`, `ilaunchify-earn-the-right-to-multi-tenant.md`, `ilaunchify-markets-and-regions.md`, `ilaunchify-v15-tier-upgrade-shipped.md`, `ilaunchify-cockroachdb-no-db-text.md`, `ilaunchify-dev-prisma-restart.md`.

---

## §6 Pavel decisions — 2026-06-01 (LOCKED)

Memory: `ilaunchify-marketplace-decisions-2026-06-01.md`.

### Niches — 1 primary + up to 2 secondaries (total ≤ 3)

Multi-niche is the right call BUT not unbounded. The trade-off:
*Niche-as-landing-page* needs curatorial crispness (argues single).
*Niche-as-filter-facet* needs expressive eligibility (argues multi).

The synthesis honors both:

- **Primary niche** — exactly one, mandatory. Drives `/launch/[slug]`
  ordering, canonical URL, breadcrumb. Manufacturer picks at submit;
  admin can re-pin during review (audit-logged).
- **Secondary niches** — up to two, optional. Eligibility-only. Product
  appears in `/marketplace?niche=<slug>` filter, ranked below primary
  holders.
- Schema field `ProductTemplateNiche.isPrimary` (already on the
  `add_labeling_volumetiers_niche_copacker_2026_06_01` migration)
  enforces the model; app-layer Zod enforces "exactly one true primary,
  ≤2 false."
- `/launch/[slug]` queries primary only. `/marketplace?niche=` filter
  joins on either.

Why this works for iLaunchify specifically: admin-reviewed products
make tag-spam admin-correctable, creator personas are lifestyle-led
so audience overlap is real, V1 inventory is sparse so single-niche
landing pages would look dead.

### Pet products — inline in /marketplace

Pet (`labelingType=PET_PRODUCT`) products live in the **same**
`/marketplace` browse surface. NO `/marketplace/pet` sub-route. A
`labelingType` filter chip + a small "Pet" eyebrow on the product card
disambiguates.

Right Facts-panel renderer (Guaranteed Analysis for pet, NFR for
human, SFR for supplements) branches downstream off `labelingType`.
Compliance rule pack also branches.

Why inline: V1 inventory is sparse, splitting fragments discovery,
and creators who serve both human + pet audiences (common among
lifestyle influencers) shouldn't have to context-switch.

### Creator-visible price — composition formula (LOCKED)

Every creator-facing price on the marketplace is computed LIVE:

```
creatorPrice(productId, qty, creatorTier) =
    manufacturerPerUnitAtTier(productId, qty)           // ProductTemplatePricingTier
  + platformFee(creatorTier, manufacturerPerUnit, qty)  // FeeRule lookup
  + shippingEstimate(qty, fulfillmentMode)              // estimateShipping
  + accessoryFees                                       // optional add-ons
  + (optional) packagingFee                             // if non-default packaging
```

Rebuild `apps/marketing/src/.../PricingTierModal.tsx` to take
`(productId, viewerTier)` and call a server action
`computeCreatorPriceMatrix(productId, viewerTier)` returning one row
per MOQ tier with the layered breakdown.

Signed-out viewers render at Maker tier with a "Sign in for your tier"
hint.

This closes the marketplace audit doc's §3.1 highest-leverage gap.

### "Premier partner" assumption — DROPPED

The `PartnerTier` enum has values `VERIFIED | TRUSTED | PREMIER` in the
schema, but **what each tier gives a partner has not been decided.**
Drop any "Premier gets featured-module priority" assumption from this
plan. Marketplace ranking ignores partner tier for V1. Featured-module
priority is admin-curated only. Pavel will lock partner monetization
later.

### Marketplace theming — 100% admin-controlled

Partners get **zero** control over how their products render on the
marketplace. Marketplace visual customization (themes, card variants,
hero layout, color accents) is admin-only.

**Critical disambiguation (Pavel 2026-06-01):** "Brand Identity" is a
CREATOR concept, not a Partner concept.

- **Creator Brand Identity** (`/brands/[brandId]/assets`) — the
  creator's brand presets for their D2C CPG line. Feeds the Fabric.js
  packaging canvas + Design Studio template filtering. Only after the
  creator has picked a template from the marketplace and entered the
  Studio. Does NOT touch the marketplace browse surface.
- **Partners do NOT have Brand Identity** in the iLaunchify sense.
  They have a company name + verification status + optional profile
  logo. They do NOT feed Design Studio, the canvas, or the marketplace
  card. Marketplace renders one platform-standard card per product;
  partners can't re-skin theirs.
- The `MarketplaceTheme` model in §2.1 is for admin seasonal /
  niche-specific themes only — never partner-scoped, never creator-
  scoped.

Why: Marketplace is the platform's brand surface. Letting either
partners or creators re-skin would (a) destroy visual coherence, (b)
become a trust attack surface (sketchy vendors faking certification
chips), (c) confuse viewers about what's platform-promise vs
vendor-promise.
