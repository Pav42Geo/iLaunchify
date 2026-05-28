# Marketplace Design — V1 Spec

**Status:** Locked 2026-05-27 (header, landing pattern, taxonomy, logged-out model, admin curation surface).
**Supersedes:** none — new foundational document.
**Companion docs:** `PRODUCTION_ORCHESTRATION.md` (what happens after a creator picks a template), `DESIGN_STUDIO_REBUILD.md` (canvas + post-canvas wizard), `PLATFORM_SPEC.md` (tier gating that drives some marketplace surfaces).
**Scope:** the public-facing marketplace, category architecture, navigation, card design, detail page CTA, filter behavior, logged-out behavior, and the admin surface that curates marketplace data. Stops at the "Start Launching" CTA on the product detail page — everything from that click onwards is `DESIGN_STUDIO_REBUILD.md` territory.

---

## TL;DR

The marketplace is iLaunchify's front door. It exists to do three things, in order:

1. **Make a visitor believe** that launching their own product is plausible (logged-out browsing, styled hover state, outcome-oriented language).
2. **Help a creator find the right starting template** (4-layer taxonomy, per-category landing, filters revealed only when the creator commits to a category).
3. **Hand the creator off to Design Studio** with the right `ProductTemplate` chosen, the right variant pre-selected, and no exposed orchestration complexity.

The marketplace is not Amazon. It does not sell finished goods. It sells **launch paths**: each card is a path from "I have an idea" to "I have a label-ready product on the way to my warehouse." That framing changes every UX decision below.

Header: **Option C Hybrid** — `[iL logo] [All Categories ▼] [Search ─────] [♡ Favorites] [🔔 Notifications] [🛒 Cart] [👤 Profile ▼]`. Category dropdown anchors the global nav; the per-category subnav (Creator Niches) sits below it on relevant pages.

Landing pattern: **left filter sidebar + content rows on the right**. Sidebar is persistent across landing and category pages so a creator's narrowing intent carries with them. Detail pages use Amazon-style 2-column layout and a single CTA, **"Start Launching"**.

---

## 1. What the marketplace is and isn't

### Is

- A curated catalog of `ProductTemplate` rows — protein powder, kombucha, energy drink, soap bar, dog treats, etc.
- A discovery surface that helps a creator narrow from "I want to launch something" to "this exact template + this exact variant."
- The only logged-out surface on the creator app. Visitors can browse, search, view detail pages, see educational content. They cannot see manufacturing pricing, MOQs at the partner level, wholesale costs, or production tooling.
- The handoff to Design Studio: the "Start Launching" CTA on a detail page creates the `Product` row and routes the creator into the canvas.

### Isn't

- A marketplace of *finished goods* for end consumers. iLaunchify does not have D2C buyers. ([[ilaunchify-business-model]] is locked.)
- A directory of partners. Creators never pick a manufacturer. Partner identity is hidden behind the orchestration layer ([[ilaunchify-orchestration-thesis]]).
- A pricing comparison tool. The card shows a single price range and a single MOQ. The decomposition (printer cost vs. manufacturer cost vs. co-packer cost) is never exposed.
- A wholesale ordering system. Creators do not "buy" templates. They customize them.

If a UX decision pulls the marketplace toward any of these, push back.

---

## 2. The 4-layer category architecture

The marketplace organizes templates along four orthogonal axes. Each axis answers a different question the creator is asking.

### Layer 1: Creator Niches (audience-first lens)

**Question it answers:** *"Who am I building this brand for?"*
**Surface:** subnav strip directly under the global header on category and home pages; also available as a filter on per-category pages.
**Cardinality:** 8 niches, each with 4–6 subcategories.

| Niche | Subcategories (illustrative; admin-curated) |
|---|---|
| Energy & Performance | Pre-workout · Energy drinks · Sports nutrition · Recovery |
| Wellness & Holistic Health | Adaptogens · Nootropics · Sleep & relaxation · Immunity |
| Beauty & Self-Care | Skincare · Haircare · Body care · Inner beauty supplements |
| Healthy Lifestyle | Plant-based · Low-sugar · High-protein · Functional snacks |
| Gourmet & Culinary | Specialty sauces · Premium pantry · Confectionery · Artisan baking |
| Family & Kids | Kids snacks · Baby nutrition · Family pantry · Lunchbox |
| Pet Wellness | Dog treats · Cat treats · Pet supplements · Specialty pet food |
| Social & Lifestyle | RTD cocktails · Mocktails · Hosting & party · Gifting |

A `ProductTemplate` can belong to multiple Creator Niches (a kombucha can serve Wellness, Healthy Lifestyle, and Social). This is many-to-many.

### Layer 2: Product Categories (product-format lens)

**Question it answers:** *"What kind of physical product is this?"*
**Surface:** the **main category dropdown** in the global header (`All Categories ▼`). This is the primary navigation spine of the marketplace.
**Cardinality:** 13 categories, each with 3–8 subcategories.

| Category | Subcategories (illustrative) |
|---|---|
| Snacks & Confectionery | Protein bars · Chocolate · Gummies · Chips · Cookies |
| Pantry Staples | Sauces · Oils · Spices · Honey & syrups |
| Breakfast & Morning | Granola · Cereal · Oatmeal · Pancake mix |
| Baking & Desserts | Baking mixes · Decorations · Specialty flours |
| Ready Meals | Soups · Meal kits · Frozen entrees |
| Coffee & Tea | Whole bean · Ground · Pods · Tea bags · Loose leaf |
| Functional & Wellness Beverages | Kombucha · Adaptogenic drinks · Functional shots |
| Refreshment Drinks | Sodas · Sparkling water · Juices · RTD cocktails |
| Supplements | Capsules · Tablets · Powders · Gummies · Liquids |
| Cosmetics & Personal Care | Skincare · Haircare · Body · Lip · Hand & nail |
| Pet Products | Dog treats · Cat treats · Pet supplements · Pet food |
| Baby & Kids Nutrition | Baby food · Toddler snacks · Kids supplements |
| Gift & Seasonal | Holiday bundles · Gift sets · Seasonal flavors |

A `ProductTemplate` belongs to **exactly one** Product Category (one-to-many). This is the canonical hierarchy and the one used in URLs (`/marketplace/coffee-tea/whole-bean/colombian-single-origin`).

### Layer 3: Manufacturing Formats (production-readiness lens)

**Question it answers:** *"What format is this physically produced in?"*
**Surface:** filter on per-category pages and detail pages. Not in nav (would be too dense).
**Cardinality:** 4 format groups, each with format-specific options.

| Format Group | Format Options |
|---|---|
| Food | Powder · Bar · Snack · Frozen · Refrigerated · Shelf-stable · Liquid · Paste |
| Supplement | Capsule · Tablet · Softgel · Gummy · Powder · Liquid · Sublingual · Effervescent |
| Beverage | Ready-to-drink · Concentrate · Powder mix · Single-serve · Multi-serve |
| Cosmetic | Cream · Lotion · Serum · Oil · Gel · Stick · Spray · Bar · Powder |

Manufacturing Formats matter because they constrain which `ProductionPath` rows (per [[ilaunchify-orchestration-thesis]]) are viable for a template. Surfaced as a filter so a creator searching "supplements" can narrow to "gummies" if they have a strong format opinion.

### Layer 4: Discovery Tags (lifestyle/trend lens)

**Question it answers:** *"What promise does this product make to its buyer?"*
**Surface:** filter chips on per-category pages. Also drives cross-category curated landing pages (e.g., `/marketplace/keto`).
**Cardinality:** ~30 tags across three groups.

| Group | Tags |
|---|---|
| Lifestyle | Keto · Paleo · Vegan · Vegetarian · Gluten-free · Dairy-free · Sugar-free · Low-carb · High-protein · Organic · Non-GMO · Plant-based · Whole30 |
| Audience | Kids · Adults · Seniors · Athletes · Pregnancy-safe · Pets |
| Trend | Functional · Adaptogenic · Microbiome · Mood · Energy · Sleep · Immunity · Beauty-from-within · Sustainable packaging · Single-origin · Small-batch |

A `ProductTemplate` can carry many tags. Tags are admin-curated, not free-form, to prevent vocabulary drift.

### How the four layers compose

A creator browsing the marketplace at `/marketplace/coffee-tea/single-origin` sees:

- Breadcrumb: Home › Coffee & Tea › Single Origin
- Hero strip with Creator Niche chips (Wellness, Gourmet & Culinary, Lifestyle) — clicking narrows the page
- Filter rail: Manufacturing Format · Discovery Tags · MOQ range · Lead time · Market (US/CA/EU)
- Rows: featured templates first, then subcategory rows alphabetical

The product detail page surfaces all four layers as breadcrumb + chips so the creator understands *why* this template matched.

---

## 3. Global header — Option C Hybrid

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [iL]  All Categories ▼   ⌕ Search recipes, templates, niches…          │
│                                                  ♡    🔔    🛒    👤 ▼  │
└─────────────────────────────────────────────────────────────────────────┘
   ┌─ Energy & Performance ─ Wellness ─ Beauty ─ Lifestyle ─ Gourmet ─ … ─┐
   │  (Creator Niche subnav — only visible on Marketplace surfaces)       │
   └──────────────────────────────────────────────────────────────────────┘
```

**Why this layout:**

- **Left anchor (iL logo):** standard return-to-home affordance.
- **Category dropdown next to logo:** Product Categories is the canonical hierarchy; surfacing it here makes it the visible spine. Amazon-style mega-menu when hovered.
- **Search center-weighted:** search is a peer to the category nav, not a corner afterthought. Auto-suggest seeded with templates, recipes, niches, tags.
- **Utility cluster right-aligned:** Favorites → Notifications → Cart → Profile. Order chosen by ascending commitment (browse → alerts → buy → manage).
- **Creator Niche subnav strip below:** only renders on marketplace surfaces. Lets a creator pivot between audience-lenses without leaving the marketplace.

**Mobile collapse:**

- iL logo + hamburger (categories) + search-icon-trigger + profile avatar in top bar.
- Tapping search opens a full-screen overlay with the same auto-suggest.
- Creator Niche strip becomes a horizontal scrolling carousel (tap-and-hold is acceptable per Pavel 2026-05-27).
- Favorites / Notifications / Cart live inside the profile menu (or as bottom-nav icons on devices with notched safe area).

**Logged-out vs. logged-in:**

- Logged-out: ♡ Favorites and 🔔 Notifications hide. Profile becomes `Sign in / Get started`. Cart hides (no checkout for visitors).
- Logged-in: all four icons render. Notifications badge shows count.

**Variants:**

- `marketing` (root `/`): expanded header with hero + niche subnav.
- `marketplace` (`/marketplace/*`): compact header + niche subnav.
- `app` (`/dashboard/*`): no niche subnav; switches to app-shell navigation.

---

## 4. Landing pattern — left filter sidebar + content rows

The marketplace home (`/marketplace`), per-niche landing pages, and per-category pages share the **same two-column shell**: a persistent left filter sidebar and a content rail on the right that adapts to scope.

```
┌──────────────┬──────────────────────────────────────────────────────┐
│  Filters     │  ─────────────────────────────────────────────────── │
│              │  Coffee & Tea                              See all → │
│  Category    │  ─────────────────────────────────────────────────── │
│  ▸ Coffee    │  [card] [card] [card] [card] [card] →                │
│  ▸ Supps     │  ─────────────────────────────────────────────────── │
│  ▸ Cosmetics │  Functional & Wellness Beverages           See all → │
│  ▸ Pet       │  ─────────────────────────────────────────────────── │
│  …           │  [card] [card] [card] [card] [card] →                │
│              │  ─────────────────────────────────────────────────── │
│  Format ▾    │  Supplements                               See all → │
│  Diet ▾      │  ─────────────────────────────────────────────────── │
│  Audience ▾  │  [card] [card] [card] [card] [card] →                │
│  MOQ ▾       │  …                                                   │
│  Lead time ▾ │                                                      │
│  Market ▾    │                                                      │
│              │                                                      │
│  More ▾      │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Why a persistent sidebar:**

- Creators arriving via SEO, ads, or shared links often have a strong narrowing intent ("I want pet products that are organic") and benefit from the sidebar being available without a click.
- Persistent sidebar carries state across landing → category → subcategory transitions. A filter set on landing still applies when a creator drills into Coffee & Tea — no state loss.
- The sidebar acts as a secondary nav surface for Product Categories, complementing the `All Categories ▼` header dropdown. Power users use the sidebar; casual visitors use the header.
- Aligns with the per-category page layout (§6) — one consistent shell across all marketplace surfaces avoids the visual whiplash of "rails appear, rails disappear."

**Sidebar contents (top to bottom):**

1. **Creator Niches** — flat list of the **8 top-level Layer-1 niches** only (no subcategory expansion in the sidebar). Selecting a niche scopes the content rail to that audience lens.
2. **Product Categories** — expandable list of the **13 top-level Layer-2 categories** only. Clicking a category expands to show its subcategories inline; selecting either level scopes the content rail and updates the breadcrumb. Sidebar mirrors only the *main* category nodes — deeper drill-downs (Layer 3+ subcategories of subcategories, if any) live in the content rail's subcategory cards, not the sidebar.
3. **Filter dropdowns** — same 6 default filters as the category page (Format · Diet · Audience · MOQ · Lead time · Market) per §7.
4. **More filters** — expand to reveal Trend tags · Certifications · Allergen-free · Manufacturing process · Packaging type.
5. **Active-filter chip strip** — appears above the content rail when any filter is active, with a `Clear all` link.

The two taxonomy lists in the sidebar are deliberately **shallow** — top-level only — so the sidebar stays scannable. The deeper hierarchy lives in the content rail (subcategory cards in §6) and in the header's `All Categories ▼` mega-menu.

**Sidebar behavior:**

- **Surfaces where it shows:** marketplace landing (`/marketplace`), Creator Niche landing pages, Product Category pages, and subcategory pages. It is the persistent navigation + filter shell across all browse surfaces.
- **Surface where it hides:** the **product detail page** (`/marketplace/[category]/[subcategory]/[slug]`). The detail page is a task surface, not an exploration surface — the product layout gets full width. A `← Back to Coffee & Tea` link in the breadcrumb is the way back to the browse shell, with the prior filter state restored from URL params.
- **Responsive collapse:**
  - Desktop ≥1024px: persistent, ~260px wide, sticky on scroll.
  - Tablet 768–1023px: collapsed to a `Filters ⛶` button in the breadcrumb row; opens a left drawer.
  - Mobile <768px: same `Filters` button opens a bottom-sheet drawer covering the lower 80% of the viewport.

**Content rail mechanics:**

- Stacked horizontal rows of cards. 5 cards visible on desktop, 2.5 on tablet, 1.2 on mobile (horizontal swipe).
- "See all" link top-right of each row routes to the matching category page with the same filter set still applied.
- Row order on landing: `Category.featuredOrder` (admin-curated) with seasonal overrides.
- Card order within a row: `ProductTemplate.featuredOrder` (admin-curated; null sorts last by `createdAt`).
- Rows reflect the active filter set — applying `Diet = Vegan` filters every row's cards to vegan templates. Rows that drop below 3 cards collapse with a `+12 more in Coffee & Tea →` link.
- Empty state across all rows: never "no results." Show the helpful card from §5.

**Logged-out vs. logged-in sidebar:**

- Logged-out: full sidebar visible, all filters functional. Selecting filters works; only the gated card fields (price, MOQ values) stay hidden behind the auth wall.
- Logged-in: same sidebar with one addition above the category tree: `Your favorites (3)` quick link.

---

## 5. Product card — outcome-oriented, no extension on hover

```
┌────────────────────────────────┐
│                                │
│         [product image]        │  ← swaps to styled-mockup on hover
│                                │
├────────────────────────────────┤
│  Cold-pressed protein powder   │  ← Title
│  $4.20 – $6.80 / unit          │  ← Price range (creator landed cost)
│  MOQ from 50                   │  ← Minimum order quantity
└────────────────────────────────┘
```

**Locked decisions:**

- **Hover swaps image, does not extend the card.** Default state shows the neutral product image. Hover transitions to a styled mockup (the same template with a sample brand applied) over 200–300ms. No card growth, no overlay panels, no extra metadata appears. The card footprint is identical hover and rest.
- **Three lines under the image, in this order:** title, price range, MOQ. Nothing else on the card (no badges, no partner names, no certifications). Density of info is intentionally low — the detail page is where depth lives.
- **Price range is the *creator's landed cost per unit*** including platform fees, computed against the cheapest viable `ProductionPath` at MOQ minimum (low end) and at recommended quantity (high end). It is never partner-decomposed.
- **MOQ is the floor of the cheapest viable path.** If only a "spill" path is viable below 100 units, the card shows "MOQ from 100" — the spill option (per orchestration thesis) is surfaced on the detail page, not the card.
- **Image is admin-curated.** Two asset slots per `ProductTemplate`: `defaultImageAssetId` (neutral product, no branding) and `styledImageAssetId` (with sample brand for the hover state). Both required for marketplace listing eligibility. See §10 admin surface.

**Why no extension panel:**

- It violates Fitts's law (target jumps as the user approaches it).
- It implies more functionality than the card has — visitors expect quick-add or quick-preview affordances and don't find them.
- It clutters the row's visual rhythm.

**Variant handling on the card:** template-level. The card represents the `ProductTemplate`, not any specific flavor or size. The detail page handles variant selection. (Per Pavel 2026-05-27 recommendation accepted.)

**Loading state:** skeleton cards with shimmer. Three rows of three skeletons on landing; eight skeleton cards in a grid on category pages.

**Empty state:** never "no results found." When a filter combination returns zero templates, show a helpful card: *"No templates match this combination yet. Want us to notify you when one launches?"* + email-capture for logged-out, + "Browse Coffee & Tea instead" fallback link. Keeps momentum.

---

## 6. Category page — same shell, subcategory cards, rows by subcategory

URL: `/marketplace/coffee-tea`

The category page uses the **same two-column shell** as landing (§4). The left sidebar persists with the relevant category auto-expanded and the breadcrumb anchored at the top of the content rail.

```
┌──────────────┬──────────────────────────────────────────────────────┐
│  Filters     │  Home › Coffee & Tea                              ⌕  │
│              │  ─────────────────────────────────────────────────── │
│  Category    │  Coffee & Tea                                        │
│  ▾ Coffee    │  30+ templates · curated for US market               │
│    · Beans   │  ─────────────────────────────────────────────────── │
│    · Ground  │  [Whole Bean] [Ground] [Pods] [Tea] [Loose Leaf]     │
│    · Pods    │  ─────────────────────────────────────────────────── │
│    · Tea     │  Whole Bean                              See all →   │
│  ▸ Supps     │  [card] [card] [card] [card] →                       │
│  ▸ Cosmetics │  ─────────────────────────────────────────────────── │
│  …           │  Ground                                  See all →   │
│              │  [card] [card] [card] [card] →                       │
│  Format ▾    │  ─────────────────────────────────────────────────── │
│  Diet ▾      │  …                                                   │
│  …           │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Page structure (content rail only — sidebar is shared with landing per §4):**

1. **Breadcrumb** — clickable each segment.
2. **Hero strip** — category name + summary count + (optional) one-liner about the category.
3. **Subcategory cards** — horizontal row of clickable chips/cards, one per subcategory under this category. Each shows count. Clicking drills into the subcategory URL.
4. **Rows grouped by subcategory** — same row mechanic as landing, scoped to this category.

**Why subcategory cards in the content rail (and not in the sidebar):**

- Subcategory cards are visual + discovery-oriented; they belong in the high-traffic visual zone.
- The sidebar already has the category tree (Layer 2) as nav — subcategory cards on the page are a richer, more inviting version of the same drill-down.
- Mirrors how Wayfair, Home Depot, and IKEA structure category pages: nav exposes hierarchy, visual cards entice clicks.

**Sidebar behavior on category pages:**

- The active category's node auto-expands to show its subcategories.
- Filter dropdowns and "More filters" are identical to landing — applying a filter on landing carries through here unchanged.
- Active-filter chip strip sits above the breadcrumb row.

---

## 7. Filter behavior — foldable, grouped, 6→show-all→see-less

Pavel's instinct was right: the default filter rail must not be a wall.

**Default visible filters (6):**

1. Format (single-select dropdown sourced from Manufacturing Formats §2 Layer 3)
2. Diet (multi-select sourced from Lifestyle tags §2 Layer 4)
3. Audience (multi-select sourced from Audience tags)
4. MOQ range (slider; presets: ≤100, 100–500, 500–2k, 2k+)
5. Lead time (single-select: <2 wk, 2–4 wk, 4–8 wk, 8+ wk)
6. Market (single-select: US, CA, EU — V1 US only ACTIVE, per [[ilaunchify-markets-and-regions]])

**`More filters →` reveals (collapsed by default):**

- Trend tags (multi-select)
- Certifications (multi-select, grouped by market: USDA Organic / Non-GMO Project / NSF Certified for Sport / EU Organic / etc. — visibility scoped to selected Market)
- Allergen-free (multi-select: dairy-free, gluten-free, nut-free, soy-free, egg-free, …)
- Manufacturing process (multi-select: cold-pressed, freeze-dried, fermented, encapsulated, …)
- Packaging type (multi-select, grouped into 10 parent groups — see below)

**Packaging type grouping** (collapses Pavel's 60-item flat list into 10 parents that the creator picks first):

| Parent | Children (10 total) |
|---|---|
| Pouches | Stand-up · Flat · Spouted · Resealable |
| Bottles | PET · Glass · Aluminum · HDPE |
| Cans | Sleek · Standard · Slim · Crowler |
| Jars | Glass · PET · Metal-lid · Plastic-lid |
| Tubs | Round · Square · Single-serve · Family-size |
| Boxes | Folding carton · Rigid · Window · Drawer |
| Sachets | Single-serve stick · Pillow · Three-side seal |
| Tubes | Squeeze · Twist-up · Airless |
| Sticks | Cardboard · Plastic · Compostable |
| Capsules / Vials | Pod · Vial · Ampoule |

Parent unlocks child filter. Visitors who care about packaging picks a parent (10 choices, manageable) then drills (avg. 4 children). The full 60-item flat list is never shown.

**Filter state:**

- Stored in URL query params (`?format=powder&diet=vegan,keto`).
- Persists across page reloads and across breadcrumb navigation back to the category.
- Cleared on landing-page visit.

**Filter chips display:**

- Active filters render as removable chips above the row area: `[Vegan ×]  [Powder ×]  [MOQ ≤500 ×]  Clear all`
- Provides constant "what am I filtering by" visibility, addresses Pavel's "don't drown them in chips" concern by only showing *active* filters.

---

## 8. Detail page — Amazon-style 2-column, single CTA, full-width (no sidebar)

URL: `/marketplace/coffee-tea/whole-bean/colombian-single-origin`

The browse-shell sidebar **collapses** on the detail page. The product layout takes the full content width because this surface is task-oriented (pick variants → start launching), not exploration-oriented. A breadcrumb `← Back to Coffee & Tea` link sits above the layout and restores the previous browse state (filters, scroll position) from URL params and history.

```
Home › Coffee & Tea › Whole Bean › Colombian Single Origin

┌──────────────────────────┐  ┌──────────────────────────────────────┐
│                          │  │  Colombian Single Origin Whole Bean  │
│   [main product image]   │  │  ★★★★★  Premier-tier production       │
│                          │  │                                       │
│   ◯ ◯ ◯ ◯ thumbnails     │  │  Variants                             │
│                          │  │   ◉ 250 g  ◯ 500 g  ◯ 1 kg            │
│                          │  │                                       │
└──────────────────────────┘  │  Quantity                             │
                              │   [─][  150  ][+]   MOQ 50            │
                              │                                       │
                              │  Estimated landed cost                │
                              │   $4.20 / unit · $630 total           │
                              │                                       │
                              │  Estimated lead time                  │
                              │   18–24 days                          │
                              │                                       │
                              │  [    Start Launching    ]            │
                              │  Add to favorites  ·  Share           │
                              └──────────────────────────────────────┘

About this template
…
Recipe overview
…
What's included
…
Customization options
…
Production paths
   (visible to logged-in only; logged-out visitors see "Sign in to see options")
```

**Decisions:**

- **Single primary CTA: `Start Launching`.** Replaces "Add to cart" framing. Creates a `Product` row scoped to the creator's active brand and routes into Design Studio canvas. ([[ilaunchify-orchestration-thesis]] hides the multi-partner reality behind this one click.)
- **Variant selectors stack:** flavor → size → packing, in that order. Each updates price range and MOQ in real time.
- **Quantity entry with MOQ floor:** input cannot go below MOQ. Going above thresholds may surface a Mode 4 "increase to X to unlock Y" message (per orchestration thesis), inline below the quantity input.
- **Estimated landed cost and lead time** are shown only when the creator is logged-in. Logged-out visitors see "Sign in to view pricing." This enforces the public/private boundary in §9.
- **Pricing-tier comparison affordance** — directly next to the landed cost value, a small chart icon `📊 See pricing by tier` opens a modal that shows the full tier × quantity matrix for this template (see *Pricing-tier modal* below). This turns the static landed-cost line into a decision-making surface without bloating the conversion zone.
- **Production paths section** (also logged-in only) shows the 1–3 admin-curated paths viable at the entered quantity, framed as outcome cards: *"$4.20/unit · 18 days · Direct production"* vs. *"$3.10/unit · 32 days · Pooled with 2 other launches"* (V2). Partner names are never shown.
- **No "Add to cart"** as a secondary CTA. Cart is for finished-good orders within the dashboard, not for marketplace browsing.
- **Favorites is a heart-toggle**, logged-in only, persists to `CreatorFavorite` table.

**Certifications strip — directly below the 2-column hero, above the fold:**

```
─────────────────────────────────────────────────────────────────────────
This product can be produced with the following certifications
─────────────────────────────────────────────────────────────────────────
[ USDA ]   [ NON-GMO ]   [ NSF ]   [ KOSHER ]   [ HALAL ]   [ B-Corp ]
 Organic    Project        Sport      OU          IFANCA       Certified
            Verified
─────────────────────────────────────────────────────────────────────────
```

- Horizontal strip with the **logo thumbnail + short name + qualifier** for each certification the template can carry. Spans full width directly under the 2-column hero block; sits above "About this template."
- Logos are admin-curated and stored as `Asset` rows on the existing `CertificateType` model (per the Certificate library shipped in #129). Marketplace render uses `CertificateType.logoAssetId` at 80×80 px on desktop, 56×56 on mobile.
- **Hover (desktop):** tooltip with issuing body + one-line description (e.g., *"Non-GMO Project — independent verification that ingredients have been produced without genetic engineering."*).
- **Click:** opens a side-drawer panel with full description, verification URL to issuing body, expiration semantics (if applicable), and which production paths satisfy this cert.
- **Two tiers visually distinguished:**
  - **Solid badge** — cert is satisfied by *every* viable production path at the displayed quantity. The template carries this cert unconditionally.
  - **Dashed-outline badge** — cert is only satisfied by *some* production paths. Hovering shows *"Available with select paths — see Production Options."* Clicking scrolls to the Production Paths section.
- **Public to logged-out visitors** — certifications are trust signals; hiding them defeats their purpose. (Unlike pricing and MOQ values which stay gated per §9.)
- **Mobile:** horizontal scroll with snap points; first 3 visible without scroll.
- **Empty state:** if a template has zero applicable certs, the entire strip hides (don't show a "no certifications" message — it reads as negative).
- **Cap:** show up to 8 badges inline. If more apply, show 7 + a `+N more →` chip that opens the side-drawer with the full list.
- **Admin curation:** the existing `/admin/products/[id]` Marketplace tab gains a `Certifications` section where admin selects from the `CertificateType` library which certs apply to this template, and marks each as either *unconditional* (solid badge) or *path-conditional* (dashed badge with a list of which `ProductionPath` rows satisfy it).

**Pricing-tier modal** (triggered by the `📊 See pricing by tier` icon next to the landed cost):

```
┌─────────────────────────────────────────────────────────────────────┐
│  Pricing by tier — Colombian Single-Origin · 250 g whole bean    ✕  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                  Maker      Builder ⚡   Master 🏛   │
│   Tier  Quantity                 (current)                          │
│   ─────────────────────────────────────────────────────────────     │
│    —    Sample                   $9.80      $9.80         $9.80     │
│    1    50 – 99                  $7.20      $6.40         $5.80     │
│    2    100 – 249                $6.80      $5.95         $5.20     │
│    3    250 – 499                $6.40      $5.50         $4.80     │
│    4    500 – 999                $5.95      $5.10         $4.40     │
│    5    1,000 – 2,499            $5.50      $4.70         $3.95     │
│    6    2,500 – 4,999            $5.20      $4.30         $3.55     │
│    7    5,000+                   $4.95      $3.95         $3.20     │
│                                                                     │
│   Your current tier: Maker · @ 150 units you'd save $0.85/unit on   │
│   Builder ($127.50 / order)                                         │
│                                                                     │
│                                  [ Close ]   [ Upgrade to Builder ] │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this works:**

- Sits one click away from the landed cost — visible, not buried, doesn't crowd the conversion zone.
- Side-by-side tier comparison is the cleanest format for "should I upgrade?" reasoning. Suplifuls solved the same problem with a near-identical layout; copying the pattern is a feature, not a flaw.
- Pairs with the Mode 4 inline upgrade hint that already lives below the quantity input (per [[ilaunchify-orchestration-thesis]]) — the inline hint nudges *for this order*; the modal makes the case *for the subscription tier*.

**Locked decisions for the modal:**

- **Rows = production-path MOQ bands.** Quantities are not arbitrary — they come from the admin-curated `ProductionPath` MOQ tiers viable for this template. The same source of truth that powers the card's "MOQ from N" and the detail page's price-range computation. No new pricing engine.
- **Columns = the three creator tiers** (Maker / Builder / Master per `docs/PLATFORM_SPEC.md`). Always rendered in that order. The creator's *current* tier is highlighted with a subtle background fill and a `(current)` label.
- **Cells = landed cost per unit** at that quantity × that tier. Computed from the same `getTierPricing(templateId, variantId, quantityBand, creatorTier)` helper that powers the detail page's landed-cost render. The first row (`Sample`) is single-unit-sample pricing — typically flat across tiers because sample fees aren't tier-discounted.
- **Footnote line** below the table contextualizes the comparison for the creator's *current* quantity entry on the detail page: *"At 150 units you'd save $0.85/unit on Builder ($127.50/order)."* Uses the live quantity input value so the savings number is personalized.
- **Primary CTA = `Upgrade to [next tier]`** routes to `/settings/billing?upgrade=builder` with a return URL back to this template. Skips a step in the conversion path.
- **Secondary CTA = `Close`** — never offer a "buy now at current tier" CTA inside this modal; that's what the main detail page CTA is for. Keep the modal's purpose narrow.
- **Tier savings highlight** — if jumping to the next tier saves ≥10% at the current quantity, the next-tier column gets a small `Save 14%` chip. Threshold is admin-tunable.

**Logged-in vs. logged-out:**

- **Logged-out:** the `📊 See pricing by tier` icon does not render. Pricing is fully gated per §9 — the modal cannot do its job without knowing the visitor's tier.
- **Logged-in (any tier):** icon renders next to the landed cost. Modal opens with the visitor's current tier highlighted.

**V1 vs. V1.5:**

- V1 ships the table + current-tier highlight + footnote + upgrade CTA. The data dependency (`getTierPricing`) is the same helper that already powers the detail page — no net-new pricing engine.
- V1.5 polish: live re-computation as the visitor adjusts the detail page's quantity input *while the modal is open*; tier-jump animation showing savings; "this month's savings if you order weekly" projection.

**Schema impact:**

- No new tables. The tier discount/uplift is already represented (or will be added) on `ProductionPath` or a sibling `CreatorTierPricingModifier` model used by the pricing engine. The modal is a UI surface over data the engine already produces.
- One enhancement worth adding alongside this work: a `quantityBands` JSON column on `ProductionPath` (or equivalent) so admins can curate the *bands* shown in the modal, not just the MOQ floor. Without explicit bands, the modal has to fabricate quantity ranges from the production-path scoring function, which would be confusing for admins to debug.

**Mobile:**

- Modal becomes a full-screen sheet.
- Columns may overflow horizontally; allow horizontal scroll within the table while pinning the leftmost two columns (Tier / Quantity) so the comparison stays legible.
- The footnote and CTAs stick to the bottom of the sheet.

**Below-the-fold sections** (order matters, after the certifications strip):

1. About this template — admin-prose marketing copy
2. Recipe overview — high-level macros + key ingredients (full editing in Design Studio canvas → recipe step)
3. What's included — bullet list of platform deliverables (label design, compliance scan, mockup, production routing, fulfillment)
4. Customization options — variant matrix shown as a table
5. Reviews — placeholder for V2; hide until populated
6. Related templates — algorithm: same Product Category subcategory, then same Creator Niche, then same Discovery Tags

---

## 9. Logged-out marketplace — hybrid model with strict public/private separation

**Locked decision (Pavel 2026-05-27):** the marketplace is partially public.

### Public (no auth required)

- All category and subcategory landing pages
- All `ProductTemplate` detail pages (with private sections gated)
- Search (full-text, all templates)
- Creator Niche pages (curated landing experiences)
- Educational content (`/learn/*` — how to launch, certifications explained, packaging primer)
- Marketing copy on each template detail page
- Default product image (the neutral one)

### Private (auth required)

- Pricing (price range card-side, landed cost detail-side)
- MOQ values exposed as numbers (logged-out sees "Minimum quantities apply")
- Lead time estimates
- Production path comparison cards
- "Start Launching" CTA (logged-out CTA is **"Get started — free"** which routes to signup with a return URL)
- Favorites / Notifications / Cart
- Variant pricing matrix
- Customization deep links
- Recipe details beyond marketing summary

### Hard blocks (visitors must never see)

- Partner identity (manufacturer / printer / co-packer names)
- Partner-decomposed pricing
- Wholesale costs
- Margin breakdowns
- Production tooling internals
- Advanced customization affordances

**Why the hybrid:** the marketing case for letting visitors browse is enormous (SEO, social shares, ad landing pages, time-on-site building trust). The business case for hiding pricing is real (competitive intelligence + anchoring to a "real number" before context exists). Hybrid satisfies both.

**Sign-up flow from logged-out:**

- Any private element clicked routes to `/onboarding?return=/marketplace/...`
- After auth, return URL is restored, the gated element renders inline, no second click required to reach the same scroll position
- Signup is free, gates open immediately ([[ilaunchify-creator-onboarding]] Step 1 is the only hard-required step)

---

## 10. Admin curation surface — `/admin/products/[id]`

All marketplace data is admin-curated. There is no V1 path for partners or creators to add templates to the marketplace directly. The existing admin page at `/admin/products/[id]` is the curation surface.

### What the admin curates

| Field | Purpose | Required for marketplace eligibility |
|---|---|---|
| `name`, `slug`, `description` | Card and detail copy | ✓ |
| `defaultImageAssetId` | Card rest state + detail page hero | ✓ |
| `styledImageAssetId` | Card hover state | ✓ |
| `productCategoryId` | Layer 2 hierarchy | ✓ |
| `productSubcategoryId` | Layer 2 leaf | ✓ |
| `creatorNicheIds[]` | Layer 1 many-to-many | ≥ 1 |
| `manufacturingFormatId` | Layer 3 single | ✓ |
| `discoveryTagIds[]` | Layer 4 many-to-many | optional |
| `featuredOrder` | Sort order in rows (null = sort last) | optional |
| `marketplaceStatus` | enum DRAFT / PUBLISHED / RETIRED | must be PUBLISHED to render |
| `marketIds[]` | Which markets this template is offered in | ≥ 1 |
| `productionPathIds[]` | Which paths are viable (per [[ilaunchify-orchestration-thesis]]) | ≥ 1 |
| `recipeOverviewMarkdown` | Below-the-fold section copy | optional |
| `includedMarkdown` | "What's included" copy | optional |
| `variantMatrix` | Flavor × size × packing options | ✓ (at least one row) |

### Admin UX additions to existing page

The existing `/admin/products/[id]` page already exists for ProductTemplate editing. The marketplace surface adds:

- A `Marketplace` tab grouping all marketplace-specific fields above
- A live-preview pane rendering the card + detail page as a logged-out and logged-in visitor would see them
- A `Publish to marketplace` action that runs validation (all required fields present, at least one production path viable, at least one market enabled) and flips `marketplaceStatus` to PUBLISHED
- A `Retire from marketplace` action that flips status to RETIRED and preserves the URL with a "this template is no longer accepting launches" page (don't 404 — preserves SEO and existing creator products)

### What does *not* live on the admin page

- Production path scoring weights (lives in `/admin/orchestration/*` per [[ilaunchify-orchestration-thesis]])
- Partner assignments (paths reference partners; admin manages partners in `/admin/partners/*`)
- The **taxonomy vocabulary itself** — Creator Niches, Product Categories, Manufacturing Formats, and Discovery Tags are managed in a separate workbench (§11). The per-template admin page *picks from* that vocabulary; it doesn't define it.

---

## 11. Admin taxonomy workbench — `/admin/marketplace/taxonomy`

The legacy Suplifuls Category Management surface is the right starting pattern: cards-for-categories + drag-to-reorder + inline subcategory rows. It scales fine for one axis. Our taxonomy has **four** axes that need parallel curation, so the workbench is one route with four sub-tabs sharing the same UI primitives — but **only one tab ships V1**.

### V1 scope vs. V1.5 scope (locked 2026-05-27)

- **V1 ships only the Discovery Tags tab.** Discovery tags are the most batch-prone, most-frequently-changed axis — new trends and lifestyle filters emerge constantly and admins need to react without waiting for a deploy. The other three tabs are managed via seed.
- **V1.5 lights up Creator Niches, Product Categories, and Manufacturing Formats tabs** using the same UI primitives. The 4-tab shell exists in V1 but Tabs 1-3 render a one-line stub: *"Managed via seed in V1. Editing UI ships V1.5."* plus a `View current vocabulary →` link to a read-only list pulled from the live DB so admins can at least see what's seeded.
- **Why seed-only for Layer 1-3:** these three axes are slow-moving by nature. Creator Niches are brand-positioning territory (changes every 6-12 months, not weekly). Product Categories are the URL spine (changes break SEO + existing creator products — needs careful migration). Manufacturing Formats are tied to actual partner capabilities (changing them changes who can produce what). For all three, "edit via Pavel's PR + migration" is the right friction level in V1.
- **Why the tab shell exists in V1 even if 3 tabs are stubs:** consistent admin navigation. Admins find the workbench once and know exactly where every taxonomy lives; they aren't surprised when V1.5 lights up the other tabs.

### Route + structure

`/admin/marketplace/taxonomy` — *the route name is scoped to marketplace deliberately*. Other taxonomies (ingredient tags, certification categories, packaging types) live on their own admin routes; this one is purpose-built for marketplace discovery surfaces.

Four tabs in this order (matching the architecture in §2):

```
┌─────────────────────────────────────────────────────────────────────┐
│  Marketplace › Taxonomy                                             │
│                                                                     │
│  [ Creator Niches ]  [ Product Categories ]  [ Manuf. Formats ]     │
│  [ Discovery Tags ]                                                 │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Product Categories                          [+ Add Category]       │
│                                              [+ Add Subcategory]    │
│                                                                     │
│  ▾ Snacks & Confectionery                                ✎  🗑     │
│    Snacks, candies, and confectionery items                         │
│    ─────────────────────────────────────────────────────────────    │
│    Subcategories                              [+ Add]               │
│    ┊ Chips & Crisps        Potato chips, tortilla …      ✎  🗑     │
│    ┊ Nuts & Seeds          Roasted nuts, seeds, and …    ✎  🗑     │
│    ┊ Chocolate & Candy     Chocolates, candies, and …    ✎  🗑     │
│    ┊ Cookies & Biscuits    Cookies, biscuits, and …      ✎  🗑     │
│    ┊ Granola & Energy Bars Granola bars, energy bars …   ✎  🗑     │
│                                                                     │
│  ▾ Pantry Staples                                        ✎  🗑     │
│    …                                                                │
│                                                                     │
│  ▸ Coffee & Tea                                  (collapsed)        │
│  ▸ Functional Beverages                          (collapsed)        │
│  …                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Shared UI primitives (used by all four tabs)

- **Card** with collapsible body, draggable handle (`featuredOrder` reordering), edit-in-place / delete actions.
- **Inline subcategory rows** with their own drag handle, edit, delete. Adding a subcategory is a row-form inside the card (no modal — fewer clicks).
- **"Add" button** (top-right of each card or tab header). Opens a slide-in panel with name + slug + description + locale-keyed name fields (locale fields hidden behind a "Translations" disclosure for V1; only `en-US` rendered until other markets activate).
- **Usage counter** next to each node: `Snacks & Confectionery · 12 templates`. Clicking opens a flyout listing the templates currently mapped to that node, each linking to `/admin/products/[id]`.
- **Search box** at the top of the tab — filters cards by name across categories and subcategories. Highlights matches inline.
- **Bulk-tag action** (only on Discovery Tags tab) — multi-select tags, then "Apply to templates…" opens a template picker.

### Per-tab specifics

**Tab 1 — Creator Niches  *(V1.5)*:**
- V1 renders: stub copy + read-only vocabulary list pulled from seed.
- V1.5 unlocks: 8 top-level niches; each niche card has a Subcategories section. Deletion blocked if any `ProductTemplate` references the niche (force-delete prompts to reassign first). New field per niche: `heroImageAssetId` (used on the niche landing page).

**Tab 2 — Product Categories  *(V1.5)*:**
- V1 renders: stub copy + read-only vocabulary list pulled from seed.
- V1.5 unlocks: 13 top-level categories; card-with-subcategories shape from the legacy screenshot. Each card has a `parentManufacturingFormatGroupId` field (optional, admin mental-model hint only). Each subcategory slug must be unique within its parent — the slug is the URL primitive (`/marketplace/coffee-tea/whole-bean`).
- **Extra V1.5 guardrail:** because slug changes break URLs and creator product references, slug editing requires an explicit confirm-and-redirect step that writes a redirect rule to a `MarketplaceSlugRedirect` table so old URLs keep working.

**Tab 3 — Manufacturing Formats  *(V1.5)*:**
- V1 renders: stub copy + read-only vocabulary list pulled from seed.
- V1.5 unlocks: four format groups (Food / Supplement / Beverage / Cosmetic), each with format options as rows. Simpler card layout, no subcategories beyond the format options. Each format option has `compatibleProductionPathIds[]` for admin-side reasoning.

**Tab 4 — Discovery Tags  *(V1, full)*:**
- Three groups (Lifestyle / Audience / Trend), each with a flat list of tag chips.
- Tags are *not* draggable in the workbench — they sort alphabetically. (Featured ordering happens per-page on the consumer marketplace, not here.)
- Each tag has an optional `iconName` (Lucide icon ref) and `colorToken` (one of the marketplace color tokens) for visual rendering in filter chips and curated landing pages.
- The bulk-tag affordance lives on this tab because tagging is the most batch-prone operation (a creator-niche-launch usually needs many templates flagged at once).
- **Per-tag usage counter and delete-with-impact-preview are live in V1** — these are essential to safely add/remove tags as trends emerge.

### Differences from the legacy pattern (improvements)

1. **Format group is metadata, not container.** The legacy uses "Food" as a top-level container holding Product Categories. Our model treats Manufacturing Format as a *parallel axis*, not a parent of Product Categories — a single category like "Cookies & Biscuits" might have viable production paths in the Food/Bar format and the Food/Snack format. Forcing format as a container breaks this. We render format as a *metadata field* on the Product Category card and as its own first-class tab.
2. **Per-node usage counter + flyout.** Legacy gives no hint of which categories are actually populated. Our workbench surfaces template counts inline so admin sees impact before deleting.
3. **Per-template impact preview on delete.** Deleting a node with assignments shows: *"This tag is used by 42 templates. Choose: reassign to another tag · remove tag from those templates · cancel."* Prevents orphan rows.
4. **Locale-keyed names from V1 schema.** Legacy has separate "Languages & Markets" page implying localization is a separate concern. We bake locale fields into the same form behind a Translations disclosure — keeps the model future-proof for V1.1 Canada (English + French) and V2 EU without a second admin page.
5. **Search across all four axes.** A global search at the top of the workbench searches every tab simultaneously and surfaces matches with their axis labeled (e.g., `[Creator Niche] Wellness & Holistic Health` · `[Tag] Wellness`).

### Schema additions on top of §12 (additive — small)

```prisma
model CreatorNiche {
  // existing fields per §12 …
  heroImageAssetId  String?
  heroImageAsset    Asset?   @relation("CreatorNicheHero", fields: [heroImageAssetId], references: [id])
}

model ProductCategory {
  // existing fields …
  parentManufacturingFormatGroupId  String?  // admin-only hint, not a runtime FK
}

model DiscoveryTag {
  // existing fields per §12 …
  iconName    String?  // Lucide icon ref
  colorToken  String?  // one of the marketplace color tokens
}

// Locale-keyed names — applies to all four taxonomy models.
// V1 stores only en-US; schema is forward-compatible for V1.1 / V2.
model TaxonomyNodeTranslation {
  id              String  @id @default(cuid())
  taxonomyType    TaxonomyType
  taxonomyNodeId  String
  locale          String  // "en-US", "fr-CA", "de-DE", …
  name            String
  description     String?
  @@unique([taxonomyType, taxonomyNodeId, locale])
}

enum TaxonomyType {
  CREATOR_NICHE
  PRODUCT_CATEGORY
  PRODUCT_SUBCATEGORY
  MANUFACTURING_FORMAT
  DISCOVERY_TAG
}
```

### Access control

- Role-gated: only `ADMIN` and `MARKETPLACE_EDITOR` (new role, V1.5+ — for V1 only `ADMIN`).
- Every mutation writes an `AuditLog` entry (consistent with the existing pattern from `A6: AuditLog viewer`).
- Reorderings are batched into a single log entry to avoid log spam from drag operations.

### What doesn't live in this workbench

- Per-template assignments — those live on `/admin/products/[id]` Marketplace tab.
- The Certificate library — it's a sibling concern (already at `/admin/certificate-types` from #129).
- The Packaging type library — also a sibling concern (currently at #135 pending).
- Production paths and partner assignments — `/admin/orchestration/*` per [[ilaunchify-orchestration-thesis]].

Each of these other admin pages has the same shape philosophically (curated vocabulary the rest of the platform picks from). Worth a follow-up doc consolidating "admin vocabulary surfaces" into a coherent navigation cluster, but not blocking for V1.

- Compliance rules (separate admin surface)

---

## 11. Schema additions (additive, V1)

```prisma
model ProductTemplate {
  // existing fields …

  // Marketplace metadata (additive)
  defaultImageAssetId     String?
  defaultImageAsset       Asset?   @relation("ProductTemplateDefaultImage", fields: [defaultImageAssetId], references: [id])
  styledImageAssetId      String?
  styledImageAsset        Asset?   @relation("ProductTemplateStyledImage", fields: [styledImageAssetId], references: [id])
  featuredOrder           Int?
  marketplaceStatus       MarketplaceStatus @default(DRAFT)

  // Layer 1: Creator Niches (many-to-many)
  creatorNiches           CreatorNicheOnTemplate[]

  // Layer 2: Product Category (one-to-many, replaces existing subcategory FK if drift)
  productCategoryId       String
  productSubcategoryId    String

  // Layer 3: Manufacturing Format (one-to-many)
  manufacturingFormatId   String

  // Layer 4: Discovery Tags (many-to-many)
  discoveryTags           DiscoveryTagOnTemplate[]
}

enum MarketplaceStatus { DRAFT  PUBLISHED  RETIRED }

model CreatorNiche {
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  parentId      String?
  parent        CreatorNiche?  @relation("CreatorNicheTree", fields: [parentId], references: [id])
  children      CreatorNiche[] @relation("CreatorNicheTree")
  featuredOrder Int?
  templates     CreatorNicheOnTemplate[]
}

model CreatorNicheOnTemplate {
  creatorNicheId  String
  productTemplateId String
  creatorNiche    CreatorNiche    @relation(fields: [creatorNicheId], references: [id])
  productTemplate ProductTemplate @relation(fields: [productTemplateId], references: [id])
  @@id([creatorNicheId, productTemplateId])
}

model ManufacturingFormat {
  id        String @id @default(cuid())
  slug      String @unique
  name      String
  groupSlug String // "food" | "supplement" | "beverage" | "cosmetic"
  templates ProductTemplate[]
}

model DiscoveryTag {
  id        String @id @default(cuid())
  slug      String @unique
  name      String
  group     DiscoveryTagGroup
  templates DiscoveryTagOnTemplate[]
}

enum DiscoveryTagGroup { LIFESTYLE  AUDIENCE  TREND }

model DiscoveryTagOnTemplate {
  discoveryTagId    String
  productTemplateId String
  @@id([discoveryTagId, productTemplateId])
}

model CreatorFavorite {
  creatorProfileId  String
  productTemplateId String
  createdAt         DateTime @default(now())
  @@id([creatorProfileId, productTemplateId])
}
```

`ProductCategory` and `ProductSubcategory` models already exist (per current schema) — the Marketplace doc keeps them as Layer 2 and adds the three new taxonomies above.

---

## 12. Seed data scope

The DB seed (`packages/db/prisma/seed.ts`) must be updated to provision:

- **8 CreatorNiche rows** with subcategories (~40 total nodes)
- **13 ProductCategory rows** with subcategories (~70 total nodes; existing seed has some — reconcile + extend)
- **~25 ManufacturingFormat rows** across 4 groups
- **~30 DiscoveryTag rows** across 3 groups
- **A handful of seed `ProductTemplate` rows** flagged `marketplaceStatus = PUBLISHED` with all required taxonomy FKs populated so the marketplace renders non-empty at first boot

Seed work is tracked separately in the build sequence (§13 below).

---

## 13. Build sequence

| Phase | Scope | Status |
|---|---|---|
| M1 | Schema migration (4 new taxonomies + ProductTemplate marketplace fields + CreatorFavorite + TaxonomyNodeTranslation) | ☐ |
| M2 | Seed update — 4-layer taxonomy (Creator Niches / Product Categories / Manufacturing Formats / Discovery Tags) + 10–15 PUBLISHED templates | ☐ |
| M3 | Admin curation UX additions on `/admin/products/[id]` (Marketplace tab + publish/retire actions + live preview) | ☐ |
| M4 | Admin taxonomy workbench shell at `/admin/marketplace/taxonomy` — 4-tab nav + read-only stubs for Tabs 1-3 + **full Discovery Tags tab** (CRUD + groups + iconName/colorToken + usage counter + delete-with-impact-preview + bulk-tag) | ☐ |
| M5 | Header — Option C Hybrid + niche subnav strip + mobile collapse | ☐ |
| M6 | Marketplace landing `/marketplace` — two-column shell + persistent left filter sidebar + content rows | ☐ |
| M7 | Category page `/marketplace/[category]` — same shell + subcategory cards + grouped rows | ☐ |
| M8 | Detail page `/marketplace/[category]/[subcategory]/[slug]` — Amazon-style 2-col (sidebar collapsed) + Start Launching CTA + Certifications strip + Pricing-tier modal + logged-out gating | ☐ |
| M9 | Search (auto-suggest seeded from templates / niches / tags) | ☐ |
| M10 | Favorites + Notifications shells (data layer only; notifications content out of scope until partner workflows ship) | ☐ |
| M11 | Educational content shell (`/learn/*` — empty pages, real content lives in CMS work later) | ☐ |
| — | **V1.5 follow-up:** Light up Tabs 1-3 of taxonomy workbench (Creator Niches + Product Categories + Manufacturing Formats CRUD + MarketplaceSlugRedirect for category slug edits) | future |

---

## 14. Footer reference (from Pavel's legacy screenshot)

Five-column layout, dark background, light text. Sections:

| Section | Links (V1, subject to copy refinement) |
|---|---|
| Launch Paths | Browse all categories · Coffee & Tea · Supplements · Cosmetics · Pet · How it works |
| Resources | Launch guides · Recipe library · Certification primer · Packaging primer · Glossary |
| Platform | Pricing · For creators · For manufacturers · For label printers · For warehouses |
| Company | About · Blog · Careers · Press · Contact |
| Support | Help center · Status · Partner support · Creator support · Bug bounty |

Bottom strip: copyright · Privacy · Terms · Cookie settings · Market selector (US / CA / EU — V1 US only).

Newsletter capture above the column grid: *"Launch insights, monthly. No spam."* + email input + button.

---

## 15. Open questions, deferred to follow-up design conversation

These are out of scope for this doc. They will be addressed in a separate design-direction conversation Pavel has explicitly flagged:

1. Color system (primary/secondary/accent + state colors)
2. Typography system (display vs. body, scale, weights)
3. Motion language (hover transitions, page transitions, loader)
4. Iconography (line vs. solid, weight, custom vs. Lucide)
5. Photography direction (sample brand styling for hover-state mockups — needs an art direction primer for whoever shoots them)
6. Card density variants (compact for power users? out of V1)
7. Personalization on landing for logged-in (replace generic rows with niche-affinity rows? V1.5)
8. Reviews and social proof on detail page (V2)

---

## 16. Cross-doc references

- [[ilaunchify-business-model]] — marketplace exists to source creators only; no end-buyer surface
- [[ilaunchify-orchestration-thesis]] — every "Start Launching" click triggers production path resolution
- [[ilaunchify-markets-and-regions]] — Market filter and Market admin field
- [[ilaunchify-creator-onboarding]] — signup return-URL flow from logged-out gates
- [[ilaunchify-flavors-as-presets]] — variant matrix structure on detail page
- [[ilaunchify-subscription-tiers]] — tier-gated marketplace surfaces (Master tier sees pooled paths first, etc. — V1.5)
- `docs/PLATFORM_SPEC.md` — tier features
- `docs/PRODUCTION_ORCHESTRATION.md` — Mode 4 inline upgrade suggestions on detail page
- `docs/DESIGN_STUDIO_REBUILD.md` — what happens after the Start Launching click
- `docs/MARKETS_AND_REGIONS.md` — Market filter scoping rules

---

## 17. Out of scope for this doc

- Mobile app variants (native iOS / Android) — V2+
- Internationalization (string extraction, RTL) — schema-ready via `locale` on copy fields, not implemented in V1
- A/B testing infrastructure for landing-page variants — V1.5
- Recommendation engine beyond `featuredOrder` — V2 (requires usage data)
- Admin tooling for bulk imports (CSV upload of templates) — V2
