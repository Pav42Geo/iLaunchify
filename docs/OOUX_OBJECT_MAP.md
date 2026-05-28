# OOUX Object Map — iLaunchify Platform

**Status:** Foundational. Locked 2026-05-28.
**Methodology:** Sophia Prater's Object-Oriented UX (OOUX) — design the interface around the platform's underlying objects rather than around tasks or screens. Components, surfaces, and CTAs all derive from objects.
**Owner:** Pavel + Claude
**Companion docs:** `DESIGN_SYSTEM.md` (visual tokens + components), `MARKETPLACE_DESIGN.md` (Object → Surface layout), `PRODUCTION_ORCHESTRATION.md` (Order → ProductionGraph mechanics), `PARTNER_ONBOARDING.md`, `CREATOR_ONBOARDING.md`.
**Scope:** every persistent noun in iLaunchify, what users can DO to it, what shows up on its card / detail / list surface, and how it relates to other objects.

---

## Why OOUX

A platform with 15+ first-class objects, two audiences, and orchestration across N partners can't be designed screen-by-screen — the same object shows up in many screens, the same screen lists many objects, and a "task" like "launch a product" actually means orchestrating a graph of object state transitions across many surfaces.

OOUX flips the design process:

1. **Identify the objects** first (the nouns).
2. **Define what users can do to each object** (the verbs — CTAs).
3. **Decide what attributes show up on each object's surfaces** (the content).
4. **Design the components around objects**, not screens. Screens become *compositions* of object views.

Output: a clean, queryable, decision-resistant interface where the same `Product` looks recognizably like itself on the dashboard, the marketplace, the order detail page, and inside an admin queue.

---

## 1. Object inventory

The 17 first-class objects in iLaunchify V1. Each has a row in the object map below; the rest of the doc details attributes, CTAs, content priorities, and relationships per object.

| Object | One-line definition | Lives in app |
|---|---|---|
| **Creator** | A person who launches a brand on iLaunchify. Owns brands, places production orders. | creator |
| **Brand** | A creator's brand identity (name, logo, palette, fonts, assets). One creator can have N brands. | creator |
| **ProductTemplate** | The marketplace catalog item — an admin-curated, production-ready recipe + packaging combination. | creator (browse), admin (curate) |
| **Product** | A creator's customized instance of a ProductTemplate — has its own recipe overrides, label design, packaging variant. The thing the creator launches. | creator |
| **Variant** | A flavor / size / packing-type permutation of a Product (e.g., Vanilla 250g pouch). | creator, partner |
| **Recipe** | The list of ingredients + percentages making up a Product (or its base on a ProductTemplate). | creator, partner |
| **Ingredient** | An entry from USDA / iLaunchify Library / Partner-private feed. Sourced via the unified IngredientPicker. | creator, partner, admin |
| **LabelDesign** | The Fabric.js canvas state for a Product's packaging label. Versioned, render-pipeline output. | creator |
| **Order** | A production order placed by a creator. Spawns a ProductionGraph across partners. | creator, partner, admin |
| **ProductionGraph** | The orchestrated workflow of partner nodes (manufacturer + printer + co-packer + warehouse) that fulfills an Order. Hidden from creator behind one quote/timeline/approval. | admin, internal |
| **ProductionPath** | Admin-curated route options for an Order — direct routing (V1), pooled batches (V2), buffer-inventory (V2). | admin, routing engine |
| **Partner** | A business entity (manufacturer / printer / co-packer / warehouse / logistics) onboarded to fulfill orders. | partner, admin |
| **PartnerService** | A specific service a Partner offers (e.g., a printer offering "flexographic label printing for 1k+ MOQ"). One Partner has N PartnerServices. | partner, admin |
| **Niche** | Creator-aspirational category (Wellness, Beauty, Energy & Performance, etc.). 8 top-level. | marketplace |
| **Category** | Product-format category (Beverages, Supplements, Snacks, etc.). 13 top-level with subcategories. The marketplace's canonical URL hierarchy. | marketplace, admin |
| **Certification** | A compliance/quality marker (USDA Organic, NSF, Non-GMO, Kosher, etc.). Belongs to ProductTemplate or Partner. | creator, partner, admin |
| **ManufacturingFormat** | Format dimension (Powder/Capsule/RTD/Bar/Gummy/etc.) — a filter axis on the marketplace. | marketplace |
| **DiscoveryTag** | Lifestyle/audience/trend tag (Vegan, Keto, Athletes, Adaptogenic, etc.). Filter axis on marketplace. | marketplace, admin |
| **CreatorMembership** | (V1.5+) A teammate of a Creator with scoped permissions. Forward-pointer per `[[ilaunchify-creator-team-model-v1.5]]`. | creator (V1.5+) |
| **PartnerMembership** | A teammate of a Partner with service-scoped roles per `[[ilaunchify-partner-team-model]]`. | partner |

---

## 2. Per-object detail

For each object: **attributes** (what it knows about itself), **CTAs** (what verbs apply), **content priorities** (what shows on each surface size), **relationships** (who it's connected to).

### 2.1 Creator

**Attributes:**
- `id`, `displayName`, `email`, `avatarUrl`
- `creatorTier` (Maker / Builder / Master — per `PLATFORM_SPEC.md`)
- `region`, `markets[]` (US / CA / EU)
- `stripeAccountId`, `signupCompletedAt`
- `onboardingProgress` (5-step stepper state)

**CTAs:**
- View profile · Edit settings · Manage brands · Upgrade tier · Sign out · (V1.5+) Invite teammate

**Content priorities:**
- *Header avatar* (32px): avatar image + tier badge dot
- *Profile dropdown*: name, email, tier, "Settings" link, "Sign out"
- *Settings page*: full attribute list + payment connection + market selection

**Relationships:**
- `Creator` **owns** N `Brand`
- `Creator` **places** N `Order`
- `Creator` **favorites** N `ProductTemplate`
- `Creator` **has** N `CreatorMembership` (V1.5+)

---

### 2.2 Brand

**Attributes:**
- `id`, `name`, `slug`, `tagline`
- `logoAssets[]` (PRIMARY / ICON / HORIZONTAL variants — per Brand Assets spec)
- `swatches[]` (color swatches for canvas use)
- `fontIds[]` (curated TypographyFont references)
- `creatorProfileId` (owner)

**CTAs:**
- Edit name / tagline · Manage assets · Switch active brand · Delete brand · (V1.5+) Invite teammate to brand

**Content priorities:**
- *Brand switcher pill in nav* (32px tall): logo mark + name (truncated to 12ch)
- *Brand card on dashboard*: logo + name + tagline + product count + "Manage" CTA
- *Brand Assets page*: full asset library across logos/colors/fonts/tagline tabs

**Relationships:**
- `Brand` **belongs to** one `Creator`
- `Brand` **has** N `Product`
- `Brand` **has** N `Asset` (logos)

---

### 2.3 ProductTemplate

The marketplace's primary object. Most-rendered, most-photographed.

**Attributes:**
- `id`, `name`, `slug`, `description`
- `defaultImageAssetId`, `styledImageAssetId` (the two card-image slots)
- `categoryId`, `subcategoryId` (Layer-2 hierarchy)
- `creatorNicheIds[]` (Layer-1 many-to-many)
- `manufacturingFormatId` (Layer-3)
- `discoveryTagIds[]` (Layer-4)
- `productionPathIds[]` (which paths can fulfill — per orchestration thesis)
- `marketIds[]` (which markets it's offered in)
- `priceRange` (computed: low end at MOQ, high end at recommended quantity)
- `moqFloor` (computed: cheapest viable path's MOQ)
- `leadTimeRange` (computed)
- `certifications[]` (USDA / NSF / etc. — pulled from active production paths)
- `marketplaceStatus` (DRAFT / PUBLISHED / RETIRED)
- `featuredOrder` (admin sort)
- `statusBadge` (Bestseller / New / Fast ship / Low MOQ / Top rated / Popular — computed from sales + lead-time data)

**CTAs:**
- Favorite (heart toggle) · Start Launching (creates Product) · Share · View detail · (admin) Edit metadata · (admin) Publish/Retire

**Content priorities:**

| Surface | What shows |
|---|---|
| **Card** (marketplace) | gradient image + status badge + verify check + heart + niche caps label + title + cert tag chips + MIN UNITS · LEAD TIME · PRICE footer. **No partner identity. No CTA button.** Whole card is clickable. |
| **Detail page** | full hero (gallery + variants + quantity + landed cost + Start Launching CTA + favorites/share) → cert strip → about → recipe overview → what's included → variants → production paths (logged-in) → related |
| **Admin metadata page** | every attribute editable + marketplace preview pane + publish/retire actions |

**Relationships:**
- `ProductTemplate` **belongs to** one `Category` (+ optional `Subcategory`)
- `ProductTemplate` **belongs to** N `Niche` (many-to-many)
- `ProductTemplate` **belongs to** one `ManufacturingFormat`
- `ProductTemplate` **carries** N `DiscoveryTag`
- `ProductTemplate` **carries** N `Certification`
- `ProductTemplate` **fulfilled by** N `ProductionPath`
- `ProductTemplate` **spawns** N `Product` (creator instances)
- `ProductTemplate` **available in** N `Market`

---

### 2.4 Product

**Attributes:**
- `id`, `name`, `status` (DRAFT / CUSTOMIZING / LABEL_READY / COMPLIANCE_PASSED / ORDERED / IN_PRODUCTION / SHIPPED / DELIVERED)
- `brandId` (owner brand)
- `productTemplateId` (parent template — inherits recipe, packaging, etc.)
- `recipe` (override of template recipe)
- `labelDesign` (Fabric.js canvas state)
- `variants[]` (chosen flavor / size / packing-type)
- `lastComplianceCheck` (PASS / WARN / FAIL + timestamp)
- `createdAt`, `updatedAt`

**CTAs:**
- Customize recipe · Open Design Studio · Run compliance · Order production · Duplicate · Archive

**Content priorities:**

| Surface | What shows |
|---|---|
| **List row on dashboard** | thumbnail + name + brand chip + status badge + last-updated + Continue CTA |
| **Detail / overview page** | 4 step cards (Customize · Design · Compliance · Order) showing per-step status |
| **Inside Design Studio** | canvas chrome shows brand context + product name + status |

**Relationships:**
- `Product` **belongs to** one `Brand`
- `Product` **derives from** one `ProductTemplate`
- `Product` **has** one `Recipe`
- `Product` **has** one `LabelDesign`
- `Product` **has** N `Variant`
- `Product` **spawns** N `Order` (each production run is an order)

---

### 2.5 Order

**Attributes:**
- `id`, `orderNumber` (IL-2026-XXXXX format)
- `productId`, `variantId`, `quantity`
- `status` (10-state FSM: REQUESTED / VALIDATING / SUBMITTED / IN_REVIEW / APPROVED / IN_PRODUCTION / QC / SHIPPING / DELIVERED / CLOSED)
- `productionPathId` (the chosen path)
- `productionGraph` (the partner-node graph)
- `landedCost`, `partnerPayouts[]`
- `leadTimeEstimate`, `actualShipDate`
- `revisionRequests[]`, `changeOrders[]`

**CTAs:**
- View timeline · Approve proof · Request revision · Track shipment · Cancel (limited window) · (partner) Accept · (partner) Decline · (partner) Mark shipped

**Content priorities:**

| Surface | What shows |
|---|---|
| **Creator dashboard row** | order number + product name + quantity + status badge + lead-time estimate + next-action CTA |
| **Creator detail page** | full timeline + per-stage approvals + revision thread + shipment tracking |
| **Partner dashboard row** | order number + template name + quantity + net-to-you + deadline + Accept/View CTA |
| **Partner detail page** | partner-scoped view of their slice of the graph + approval gates + comms |
| **Admin queue row** | order number + creator + production path + status + escalation flag |

**Relationships:**
- `Order` **belongs to** one `Product`
- `Order` **placed by** one `Creator`
- `Order` **routed via** one `ProductionPath`
- `Order` **fulfilled by** one `ProductionGraph` (which has N `Partner` nodes)
- `Order` **has** N `RevisionRequest` and N `ChangeOrder`

---

### 2.6 Partner

**Attributes:**
- `id`, `companyName`, `slug`, `region`
- `partnerType` (MANUFACTURER / CO_PACKER / LABEL_PRINTER / WAREHOUSE / LOGISTICS)
- `tier` (Verified / Trusted / Premier — per `PLATFORM_SPEC.md`)
- `status` (10-state activation FSM)
- `certifications[]` (verified instances)
- `services[]` (PartnerService rows)
- `stripeAccountId`
- `operationalStandards` (contract version + per-product overrides)

**CTAs:**
- Apply / Continue application (during onboarding) · Edit profile · Manage services · Manage certifications · View earnings · View order queue · (admin) Verify · (admin) Activate · (admin) Suspend

**Content priorities:**

| Surface | What shows |
|---|---|
| **Admin partner CRM row** | company name + type + tier + status + region + active services count |
| **Admin partner detail** | full 5-section model + activation panel + audit log + certifications + services |
| **Partner own profile page** | self-edit view of application + services + certs + payment + standards |
| **Business landing partner-type card** | icon + type name + one-line description + "X active" count chip |
| ***Never shown to creators*** | partner identity, name, location stays hidden per orchestration thesis |

**Relationships:**
- `Partner` **has** N `PartnerService`
- `Partner` **has** N `Certification` (verified instances)
- `Partner` **belongs to** N `ProductionPath` (as a node)
- `Partner` **fulfills** N `Order` (via its services)
- `Partner` **has** N `PartnerMembership` (team members)

---

### 2.7 Niche, Category, ManufacturingFormat, DiscoveryTag

These four form the marketplace's 4-layer taxonomy (per `MARKETPLACE_DESIGN.md`).

**Niche** (Layer 1): audience-first. Attributes: `id`, `slug`, `name`, `heroImageAssetId`, `featuredOrder`. CTAs: filter marketplace · (admin V1.5+) edit. Surfaces: subnav strip + marketplace filter + niche landing page hero.

**Category** (Layer 2): the URL spine. Attributes: `id`, `slug`, `name`, `parentManufacturingFormatGroupId`. CTAs: navigate · filter · (admin V1.5+) edit. Surfaces: `All Categories ▼` header dropdown + category page + breadcrumb.

**ManufacturingFormat** (Layer 3): production-format dimension. Attributes: `id`, `slug`, `name`, `groupSlug`. Surfaces: marketplace filter only.

**DiscoveryTag** (Layer 4): lifestyle/audience/trend. Attributes: `id`, `slug`, `name`, `group`, `iconName`, `colorToken`. CTAs: filter · (admin) curate · bulk-tag. Surfaces: filter chips + curated landing pages.

---

### 2.8 Certification

**Attributes:**
- `id`, `name`, `shortName`, `slug`, `description`
- `issuingBody`, `verificationUrl`
- `logoAssetId` (the badge image for marketplace + landing)
- `marketScope` (which markets it applies to — US / CA / EU)
- `expirationPolicy`

**CTAs:**
- View detail · (partner) Upload my cert instance · (admin) Curate library · (admin) Verify partner instance

**Content priorities:**

| Surface | What shows |
|---|---|
| **Card tag chip** (marketplace card) | short name (e.g., "USDA Organic"). USDA Organic chip uses neon-green fill; others neutral. |
| **Detail-page cert strip** | logo + short name + qualifier per cert. Hover = tooltip with issuing body + 1-line description. |
| **Side-drawer detail** (opened on click) | full description + verification URL + which production paths satisfy it |
| **Filter chip** (sidebar) | short name in pill button |
| **Admin library row** | logo + full name + issuing body + market scope + status |
| **Partner profile** | partner's own held certifications with verification status |

---

## 3. Relationship matrix (cardinalities)

A compact summary of who connects to whom. Cardinalities matter for designing list / filter / detail surfaces correctly.

```
Creator        1 — N Brand
Creator        1 — N Order
Creator        N — N ProductTemplate            (via favorites)
Brand          1 — N Product
Product        N — 1 ProductTemplate
Product        1 — N Order
Product        1 — 1 Recipe
Product        1 — 1 LabelDesign
Product        1 — N Variant
ProductTemplate N — 1 Category
ProductTemplate N — N Niche
ProductTemplate N — 1 ManufacturingFormat
ProductTemplate N — N DiscoveryTag
ProductTemplate N — N Certification
ProductTemplate N — N ProductionPath
ProductTemplate N — N Market
Order          1 — 1 ProductionPath
Order          1 — 1 ProductionGraph
Order          N — N Partner                    (via ProductionGraph nodes)
Partner        1 — N PartnerService
Partner        N — N Certification              (verified instances)
Partner        N — N ProductionPath
Partner        1 — N PartnerMembership
ProductionPath N — N PartnerService             (which services it consumes)
```

---

## 4. CTAs grouped by surface

The verb library, organized by where it appears. This is what the design system's primary/secondary/ghost buttons get filled with.

### Marketplace home (logged-out + logged-in)
- *On ProductTemplate card*: Favorite (heart), Open detail (whole card)
- *Global*: Browse all categories, Open niche, Apply filter, Clear filters, Start launching (header CTA)

### ProductTemplate detail page
- *Primary*: Start launching (creates Product, routes to Design Studio) — logged-in only
- *Secondary*: Favorite, Share, See pricing tiers (opens modal), View production paths
- *Logged-out CTA*: Get started — free (signup with return URL)

### Creator dashboard
- *Per Product*: Continue (resumes wherever they left off), Customize recipe, Open Design Studio, Run compliance, Order production, Duplicate, Archive
- *Per Brand*: Manage assets, Switch active, Add new
- *Global*: Browse marketplace, Open Launch Checklist

### Design Studio canvas
- *Global*: Save, Undo, Redo, Run compliance, Mockup preview, Exit
- *Per tool* (drawer-scoped): tool-specific verbs (add text, add image, etc.)

### Partner dashboard
- *Per Order*: Accept, Decline (with reason), View detail, Request clarification, Mark shipped, Upload proof
- *Per PartnerService*: Edit, Pause, Resume
- *Per Certification*: Upload new instance, Renew

### Admin
- *Per Partner*: Verify section, Approve, Suspend, Activate, View audit log
- *Per ProductTemplate*: Edit metadata, Preview marketplace, Publish, Retire, Set featured order
- *Per Order*: Escalate, Reassign, Refund, Mark resolved

### Business landing
- *Primary*: Apply now (creates Partner application)
- *Secondary*: How it works, View pricing, Partner login

---

## 5. Content priorities — the 3-size rule

Every object has three rendering sizes: **list row** (densest), **card** (mid), **detail surface** (full). Each shows a different priority subset of the object's attributes.

| Object | List-row priorities | Card priorities | Detail priorities |
|---|---|---|---|
| ProductTemplate | name + price-range + MOQ | image + niche + name + 3 certs + MOQ/lead/price | gallery + full variants + landed cost + lead time + paths + about + recipe + included + reviews |
| Product | thumb + name + brand + status + updated-at | thumb + name + status + 4 step-card statuses | full 4-step canvas-led overview + per-step deep links |
| Order | order# + status + ETA | (rare — usually lives in list/detail) | full timeline + per-partner-stage + revision thread + tracking |
| Brand | logo + name + product-count | logo + name + tagline + product count | brand assets editor (logos/colors/fonts/tagline tabs) |
| Partner | name + type + tier + status | (admin-only card) | full 5-section + activation + audit + services + certs |
| Certification | short-name + issuer | logo + short name + qualifier | full description + verification URL + paths satisfying |
| Niche | name + count | icon + name + 1-line desc + count | hero image + curated template feed |

**Design system implication:** the `<ProductCard>` component, the `<ProductListRow>` component, and the `<ProductDetailHero>` component are all object-views of the same `ProductTemplate` object — they share the data fetch, attribute formatting, and CTAs but differ in which attributes they render at which sizes. Build them as a family, not as separate components.

---

## 6. Object → Component map

How the OOUX objects map to the design system's component library (per `DESIGN_SYSTEM.md` §8).

| Object | Primary components |
|---|---|
| ProductTemplate | `<ProductCard>` (marketplace card) · `<ProductDetailHero>` · `<TemplateListRow>` (admin) · `<TemplatePreview>` (admin marketplace pane) |
| Product | `<ProductOverviewCard>` (creator dashboard) · `<StepCard>` (4-step progress) · `<CanvasContext>` (chrome) |
| Order | `<OrderTimelineCard>` · `<OrderTableRow>` (partner queue) · `<OrderDetail>` |
| Brand | `<BrandSwitcher>` (nav) · `<BrandCard>` (dashboard) · `<BrandAssetsEditor>` (deep page) |
| Partner | `<PartnerCRMRow>` (admin) · `<PartnerDetail>` · `<PartnerTypeCard>` (business landing) |
| Certification | `<CertChip>` (card tag) · `<CertStrip>` (detail) · `<CertSideDrawer>` · `<CertFilterChip>` |
| Niche | `<NicheSubnavLink>` · `<NicheHero>` · `<NicheFilterPill>` |
| Category | `<CategoryDropdown>` (header mega-menu) · `<CategoryBreadcrumb>` · `<CategoryPageHeader>` |
| DiscoveryTag | `<TagFilterChip>` · `<ActiveFilterChip>` (pink pill above content rail) |
| ManufacturingFormat | `<FormatFilterCheck>` (sidebar checkbox) |
| Creator | `<AvatarChip>` (nav) · `<ProfileDropdown>` · `<TierBadge>` |
| Recipe | `<RecipeEditor>` (slot-based) · `<RecipePreview>` (template detail) |
| LabelDesign | `<CanvasStage>` (Fabric.js) · `<DieCutFrame>` · `<ToolDrawer>` |

The build sequence (`DESIGN_SYSTEM.md` §14) walks through these components in priority order — `ProductCard` first (marketplace is the front door), then `Button` / `Input` / `Badge` / `Chip` primitives that the object components compose, then the heavier object components.

---

## 7. Surfaces as object compositions

Every screen in iLaunchify is a *composition* of object views. This is the OOUX inversion: stop thinking "the dashboard screen needs these widgets," start thinking "the dashboard surface composes Brand objects (one per row), Product objects (with status), and Order objects (recent activity feed)."

| Surface | Object composition |
|---|---|
| Marketplace home (`/marketplace`) | filter sidebar (DiscoveryTag + ManufacturingFormat + Certification filters) + content rail (Category rows of ProductTemplate cards) + hero (Niche or seasonal feature) |
| Niche landing (`/launch/wellness`) | Niche hero + curated ProductTemplate feed (composed of cards) + creator testimonial cards |
| ProductTemplate detail (`/marketplace/[cat]/[sub]/[slug]`) | ProductTemplate detail composition (hero + variants + cert strip + production paths + related templates) |
| Creator dashboard (`/dashboard`) | Brand cards (active brand) + Product list (recent) + Launch Checklist + Order activity |
| Product overview (`/products/[id]`) | Product header + 4 StepCards (composition of Recipe state + LabelDesign state + Compliance state + Order state) |
| Design Studio (`/products/[id]/design`) | Canvas chrome (Product context) + Stage (LabelDesign) + tool drawers (per-tool component) |
| Partner dashboard (`/partner`) | Order table (Order rows) + Service list (PartnerService cards) + Earnings summary |
| Admin partner CRM (`/admin/partners`) | Partner table (Partner rows) + filter rail + activation queue |
| Business landing (`business.ilaunchify.com`) | Hero + stats + PartnerType cards (4) + why-join + how-it-works + testimonial + final CTA |

---

## 8. The OOUX-driven build discipline

When building any new surface, follow this sequence (don't shortcut it):

1. **What objects live on this surface?** List them.
2. **What size view of each?** (card / list-row / detail / chip)
3. **What CTAs are available on each object instance here?** (verb subset)
4. **What attributes show at this size?** (priority subset)
5. **What's the layout composition?** (where do the object views sit relative to each other?)

If a proposed component doesn't map cleanly to an object — STOP. It's probably either:
- An object you haven't named yet (add to the inventory)
- A composition pattern (belongs in a parent surface spec, not a component)
- Decoration that doesn't earn its place

---

## 9. Schema → object alignment

Most of these objects already have Prisma models or are in the pending schema migrations. Cross-reference:

| Object | Prisma model (current / pending) |
|---|---|
| Creator | `User` + `CreatorProfile` |
| Brand | `Brand` |
| ProductTemplate | `ProductTemplate` |
| Product | `Product` |
| Variant | `ProductVariant` |
| Recipe | `Recipe` + `RecipeSlot` + `IngredientUsage` |
| Ingredient | `Ingredient` (multi-source per `[[ilaunchify-ingredient-sourcing]]`) |
| LabelDesign | `LabelDesign` |
| Order | `Order` + `OrderDispatch` |
| ProductionGraph | (V1: implicit in OrderDispatch; V2: explicit graph model per `[[ilaunchify-orchestration-thesis]]`) |
| ProductionPath | `ProductionPath` (pending — per orchestration thesis Production Paths model) |
| Partner | `Partner` |
| PartnerService | `PartnerService` |
| Niche | `CreatorNiche` (pending — per `MARKETPLACE_DESIGN.md`) |
| Category | `ProductCategory` + `ProductSubcategory` |
| Certification | `CertificateType` + `PartnerCertificateInstance` |
| ManufacturingFormat | `ManufacturingFormat` (pending) |
| DiscoveryTag | `DiscoveryTag` (pending) |
| CreatorMembership | (V1.5+ — see `[[ilaunchify-creator-team-model-v1.5]]`) |
| PartnerMembership | `PartnerMembership` + `PartnerServiceMembership` |

Schema decisions trace back to objects, not to UI. When the schema changes (e.g., adding a field), ask: *which object does this attribute belong to?* If it belongs to two objects, you have a relationship to model, not a field to add.

---

## 10. Anti-patterns

- ❌ **Designing a screen without listing its objects first** — produces inconsistent compositions
- ❌ **Inventing a component that doesn't map to an object** — usually a sign of a missing object or a misplaced composition
- ❌ **Putting an object's attribute on a surface that doesn't render that object** — couples surfaces to other objects via implicit data fetch
- ❌ **CTAs that don't act on an object** — every verb has a noun; if you can't say which object it acts on, it doesn't belong
- ❌ **Inconsistent attribute priority across surfaces** — a `Product`'s status should appear in the same position on the dashboard row, the card, and the detail header. If it moves around, that's a system bug
- ❌ **Showing partner identity on a creator-facing object view** — `Partner` is hidden behind `Order` for creators per `[[ilaunchify-orchestration-thesis]]`. The OOUX rule is: a creator's view of an `Order` does not render its `Partner` nodes

---

## 11. Build cadence

OOUX work is continuous, not a one-time exercise. The cadence:

- **Every new feature**: walk the 5-step build discipline (§8) before opening any design tool
- **Every new object**: add to §1 inventory + §2 detail + §3 relationships + §6 component map. Don't merge schema changes without updating this doc
- **Every screen / surface added**: add to §7 composition list with the objects it shows
- **Quarterly**: review the inventory — any retired objects? any objects that should be merged or split?

---

## 12. Cross-doc references

- `DESIGN_SYSTEM.md` — the visual tokens + component library that the object views render with
- `MARKETPLACE_DESIGN.md` — Object → Surface composition for the marketplace
- `PRODUCTION_ORCHESTRATION.md` — how Order, ProductionGraph, ProductionPath, and Partner interact
- `PARTNER_ONBOARDING.md` — Partner object lifecycle (10-state FSM)
- `CREATOR_ONBOARDING.md` — Creator object onboarding
- `DESIGN_STUDIO_REBUILD.md` — LabelDesign + Brand + Product interaction
- `[[ilaunchify-orchestration-thesis]]` — why Partner is hidden from Creator
- `[[ilaunchify-design-system-v1]]` — locked visual direction (memory)
- `[[ilaunchify-flavors-as-presets]]` — Variant model
- `[[ilaunchify-ingredient-sourcing]]` — Ingredient multi-source
