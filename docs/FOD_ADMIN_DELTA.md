# FOD Admin Delta — Features Not Yet in Current Spec

**Audit date:** 2026-05-24
**Audited:** `FOD-reference/frontend/src/app/dashboard/admin/` + `app/admin/` + `components/admin/` + `app/api/admin/`
**Methodology:** Compared FOD admin surfaces against current `PLATFORM_SPEC.md`, `MANUFACTURER_PRODUCT_BUILDER.md`, `FOD_RECOVERY_PLAN.md`, and the task list (#127–#145). Listed only what's NOT yet covered.

This is a delta list, not a port-everything plan. The intent: capture the *ideas* Pavel built into FOD's admin so they don't get lost during the rebuild. Implementation should follow the patterns in our current spec (queue model, library model, override layer, FSM-driven approvals), not FOD's code.

---

## 1. Critical gaps — should land in V1 or V1.1

### 1.1 Die-line Template Management (`/admin/design-templates/die-cut/`)

**FOD source:** `dashboard/admin/design-templates/die-cut/page.tsx` (1,436 lines) — full CRUD for die-line templates with a visual zone editor (drag mandatory regions: nutrition panel, ingredients list, allergen statement, barcode area, branding area), per-template print specs (DPI, color mode, bleed, registration marks), and bulk-link/cluster actions to associate similar templates across partners.

**What we have:** `MANUFACTURER_PRODUCT_BUILDER.md` §6.1a already has the two-tier PackagingType + admin override model + cluster/promote workflow. Task #135 covers the admin packaging curation. **What's missing** is the *visual zone editor* and the print-spec metadata.

**Where it lands in our spec:** extend `MANUFACTURER_PRODUCT_BUILDER.md` §6 with a "die-line zone editor" subsection. Visual zone editor itself is a V1.1 deliverable (it's a non-trivial canvas component); the print-spec metadata fields (DPI, color mode, bleed) can be added to `PackagingSurface` in the V1 schema.

**Suggested home:** `/admin/packaging-types/[id]/die-line-editor` route, opens a fabric.js / Konva canvas. Add new fields to `PackagingSurface`: `printDpi Int`, `colorMode enum (CMYK|RGB|BW)`, `bleedMm Float`, `registrationMarks Json?`, `mandatoryZones Json` (array of `{type, x, y, w, h, required}`).

**V1 ship target:** Schema fields + admin CRUD without the canvas editor (manual JSON entry through a form). **V1.1 adds the visual editor.**

---

### 1.2 Asset Management Library (`/admin/assets/`)

**FOD source:** `dashboard/admin/assets/page.tsx` (1,054 lines) — full asset library with approval workflow, deprecation, versioning, usage tracking, categories (pictograms, allergen icons, certification badges, manufacturer logos, generic product imagery, regulatory documents, brand kits). Partners upload, admin approves, deprecated assets don't break old products (versions pin at publish time).

**What we have:** Scattered file storage — `PartnerFile` (Phase A), `AdminFile` (mentioned for certificate thumbnails), no unified asset library.

**Where it lands in our spec:** Net-new section in a future `docs/ADMIN_DASHBOARD.md` doc. Introduces an `Asset` model unified across categories, with approval status, version chain, usage count, and lifecycle (`active | deprecated | archived`).

**Suggested schema:**
```
Asset
├── id, kind enum (PICTOGRAM | LOGO | CERT_BADGE | PRODUCT_PHOTO | MARKETING | REGULATORY)
├── name, description, tags[]
├── fileId (R2), thumbnailFileId
├── status (DRAFT | PENDING_REVIEW | ACTIVE | DEPRECATED | ARCHIVED)
├── versionOf (nullable self-ref), versionNumber Int
├── usageCount Int (cached), usageRefs Json (where used)
├── uploadedBy, approvedBy, deprecatedAt + deprecationReason
```

**V1 ship target:** Schema + admin CRUD + use it for certificate thumbnails (already in §7) and starter-template hero photos. **V1.1 adds** partner upload + approval workflow + the visual gallery. **V1.5 adds** version-pinning at product publish time.

**Why critical:** the moment partners want to show "Certified NSF" badges, allergen pictograms, or branded marketing imagery, you need a managed asset library. Without it you're hard-coding image URLs forever.

---

### 1.3 Mockups Library (`/admin/design-templates/mockups/`)

**FOD source:** `design-templates/mockups/page.tsx` (629 lines) — gallery of 3D product mockups (jar with label applied, pouch with print, box rendering) that partners can preview their designs against. Templates show "this is what your label will look like on a 16 oz HDPE jar."

**What we have:** Nothing. Current Design Studio spec talks about die-lines and label artwork, but nothing about *previewing* the final product as it would look.

**Where it lands in our spec:** extend `DESIGN_STUDIO.md` with a "Product mockups" section. Each PackagingType gets an optional `mockupAssetId` (a 3D render or high-quality flat photo of the container). When a partner is in the Design Studio working on a label, a preview button shows their design composited onto the mockup.

**Suggested home:** Per-PackagingType field. Admin uploads mockup assets via `/admin/packaging-types/[id]/mockups`. Front-end compositing is V1.5+ (fabric.js or threejs); V1 just stores the assets and shows a static preview when partner clicks "How will this look?"

**V1 ship target:** Asset upload only — no compositing. **V1.5** adds the live compositing preview.

---

### 1.4 Notification Center + Notification Settings UI (`/admin/notification-center/` + `/admin/notification-settings/`)

**FOD source:** `notification-center/page.tsx` (29 lines — likely a stub or thin shell) but `notification-settings/page.tsx` (1,488 lines!) is the actual surface — admin authors notification templates per event type (per-channel: email, in-app, SMS placeholder), manages recipient rules ("notify admin when partner submits a high-percentage unverified ingredient"), schedules broadcasts ("FDA rule change affects supplement labels"), views delivery analytics (sent / delivered / opened / clicked / bounced), and per-user override controls.

**What we have:** B1 work (#104–#107) shipped the *delivery* engine + per-user prefs. **Admin-side template authoring + broadcast + analytics is missing.**

**Where it lands in our spec:** Net-new section in `docs/ADMIN_DASHBOARD.md`. Introduces `NotificationTemplate` model + `NotificationBroadcast` model. Existing `Notification` delivery rows get linked to either a template (transactional) or a broadcast (one-off campaign).

**Suggested schema additions:**
```
NotificationTemplate
├── id, eventType (enum matching the events from B1 wiring)
├── channelVariants Json   // { email: {subject, html, text}, inApp: {title, body}, sms: {body} }
├── recipientRules Json    // who gets this — roles, attributes
├── status (DRAFT | ACTIVE | DEPRECATED)
├── version, createdById, updatedAt

NotificationBroadcast
├── id, title, scheduledAt, sentAt
├── audienceFilter Json    // partner role, region, capability flags
├── channelVariants Json
├── deliveryStats Json     // sent, delivered, opened, clicked, bounced counts
├── createdById, status (DRAFT | SCHEDULED | SENT | CANCELLED)
```

**V1 ship target:** Hardcoded transactional notification templates in code (matches what B1 wired). **V1.1 adds** the admin template-editor UI + broadcast scheduling. **V1.5 adds** the delivery analytics dashboard. The schema for templates should land in V1.1 so we can stop hardcoding.

**Why critical:** the moment you add 30+ partners, ops needs to send broadcast announcements (FDA rule updates, holiday production deadlines, maintenance windows). Doing this through code deploys is unworkable.

---

### 1.5 Returns / Refunds Queue (`/admin/orders/refunds/`)

**FOD source:** Stub surfaces in the orders area. Models referenced but flow incomplete in FOD.

**What we have:** Order schema exists, payments are Stripe Connect, but no admin refund-approval queue. Orders are one-way.

**Where it lands in our spec:** extend `PAYMENTS.md` with a refund flow + admin queue. Partner-side initiates the refund request; admin reviews; on approve, triggers Stripe refund + writes AuditLog entry.

**Schema:** `RefundRequest` model with `orderId`, `requestedById`, `requestedAt`, `reason`, `amountCents`, `status (PENDING | APPROVED | REJECTED | PROCESSED | FAILED)`, `decisionById`, `decidedAt`, `stripeRefundId`.

**V1.1 ship target.** V1 ships without refunds — return policy is "contact support, manual refund via Stripe dashboard."

---

### 1.6 Fraud Review Queue (`/admin/fraud-review/`)

**FOD source:** `fraud-review/page.tsx` (10 lines — stub). The *concept* matters more than FOD's implementation.

**What we have:** Nothing.

**Where it lands in our spec:** extend `PAYMENTS.md` with a fraud-signal queue. Stripe Radar already flags risky checkouts; the queue surfaces those for admin review. Decisions: approve and proceed, reject and refund, mark as fraud (auto-suspends the partner / blocks the creator account).

**V1.1 ship target.** V1 relies on Stripe Radar's auto-blocking; admin gets a notification per flagged event.

---

## 2. Useful additions — V1.5+

### 2.1 Categories & Subcategories Management UI (`/admin/products-categories/`)

**FOD source:** `CategoriesManagement.tsx` (864 lines) — full CRUD for the category tree + drag-to-reorder + filter rules per category + per-category compliance rule pack defaults.

**What we have:** Categories seeded from `category-tree-export.json` (#67) but no admin UI to edit. Currently requires a code change to add a new category.

**Where it lands:** `docs/ADMIN_DASHBOARD.md`. Surface at `/admin/library/categories`. Adds the ability to: rename, reparent, set per-category compliance rule-pack defaults, set per-category nutrition-label layout defaults, soft-archive.

**V1.5 ship target.** V1 ships with the seed and a JSON-editing CLI for changes.

---

### 2.2 Packaging Materials Library (`/admin/products-categories/PackagingMaterials.tsx`)

**FOD source:** 460 lines. Catalog of packaging *materials* (HDPE, PET, glass, aluminum, kraft paper, BPA-free liner types) used as attributes on PackagingType. Partners can filter their catalog by material; creators can filter the marketplace by "glass only" or "no plastic."

**What we have:** PackagingSystem has a `topology` enum and dimensions, but no material attribute.

**Where it lands:** extend `MANUFACTURER_PRODUCT_BUILDER.md` §6 schema. Add `materials String[]` to PackagingType (and inherited / overridable on PackagingSystem). Admin maintains a controlled vocabulary at `/admin/library/packaging-materials`.

**V1.5 ship target** (V1 can live with materials as free-text tags on PackagingType).

---

### 2.3 Supplier Directory (`/admin/suppliers/`)

**FOD source:** `suppliers/page.tsx` (1,143 lines) — directory of upstream suppliers that partners source from. Tracks supplier name, regions served, certifications they hold, common products supplied. Partners can declare which suppliers they use; admin can flag suppliers with known issues; ingredient lineage links back to the supplier.

**What we have:** Partial — `PartnerCertificateInstance` has an `issuingBody` text field. No first-class Supplier object.

**Where it lands:** New section in `docs/ADMIN_DASHBOARD.md`. Adds a `Supplier` model: `{ id, name, country, regions[], certifications[], website, contactEmail, notes, status }`. PartnerPrivateIngredient gains `sourcedFromSupplierId` optional FK. Partner CertificateInstance gains `issuingSupplierId` optional FK.

**V1.5 ship target.** V1 ships with text-only supplier names; V1.5 normalizes into a real Supplier object once we see how partners actually use the field.

---

### 2.4 Performance Monitoring + USDA Monitoring (`/admin/performance-monitoring/`, `components/admin/USDAMonitoringDashboard.tsx`)

**FOD source:** 264 lines for performance, plus USDAMonitoringDashboard component. Surfaces: USDA API health (rate-limit usage, error rate, refresh job status), compliance service health (request latency, error rate), background job status (refresh jobs, library promotion suggestions), DB query slowness.

**What we have:** OBSERVABILITY.md has the stack (logs, metrics, traces) but no admin-visible dashboard.

**Where it lands:** `docs/ADMIN_DASHBOARD.md`. Surface at `/admin/observability` — read-only dashboards pulling from Grafana / our metrics backend. Embed iframe is fine for V1.

**V1.5 ship target.** V1 ops watches Grafana directly.

---

### 2.5 Languages & Markets (`/admin/languages-markets/`)

**FOD source:** 897 lines for the admin page + 5,783 lines across 6 component tabs (Markets, Assignments, Translations, Settings, TemplateSpecs, RulePacks). Pavel built a real `Market` model + `MarketConfig` + `MarketLanguage` + ~13 entities cross-referenced to Market.

**Status correction (2026-05-24):** My first-pass call of "V2 defer" was wrong. The *idea* of market-and-region awareness is V1-critical — even if V1 only serves the US — because adding it later is migration-hostile (existing partner/product references become ambiguous when retroactively scoping). The *FOD admin implementation* (6 tabs, 5,783 lines) is overbuilt for V1; ship a leaner version.

**Where it lands:** New dedicated `docs/MARKETS_AND_REGIONS.md` spec, written 2026-05-24. V1 schema for Market + Region + Language + MarketLanguage + PartnerMarketCert + BrandTargetMarket (tasks #150–#154). V1 seeds US-only + CA-as-COMING_SOON. V1.1 activates Canada (bilingual labels + Health Canada cert verification). V2 adds EU.

---

### 2.6 Marketing Pages / CMS (`/admin/marketing/`)

**FOD source:** 184 lines — placeholder for marketing site content management.

**Where it lands:** Lower priority. V1.5+. Marketing site content can be edited as code through V1; CMS is a quality-of-life add when you stop wanting to deploy for copy changes.

---

### 2.7 Barcodes (`/admin/barcodes/`)

**FOD source:** 183 lines. Per-product UPC-A, EAN-13, Code128 generator and bulk-assign tooling.

**Where it lands:** Add to `MANUFACTURER_PRODUCT_BUILDER.md` as a small section under the Basics card. Partner enters their GS1 prefix once on the company profile; system auto-generates barcodes per (product × packaging × flavor) variant.

**V1.1 ship target.** V1 partners use external barcode tools.

---

### 2.8 Subscriptions / Billing Rules Manager (`/admin/subscriptions/RuleManager.tsx`)

**FOD source:** 110 lines — manages Stripe Billing subscription rules (which tiers exist, what they cost, what they include).

**Where it lands:** `PAYMENTS.md`. Admin UI for plan management at `/admin/billing/plans`. Currently plans live in code + Stripe dashboard.

**V1.5 ship target.**

---

### 2.9 Label Moderation Queue (`/admin/label-moderation/`)

**FOD source:** 182 lines — queue of label designs that triggered compliance pre-check failures, admin reviews and overrides or sends back to partner.

**What we have:** Compliance pre-check runs in the product approval queue and surfaces failures inline. Don't need a separate moderation queue — same workflow.

**Where it lands:** Already covered by the product approval queue (#133). **Don't build this separately.**

---

### 2.10 Compliance Test Sandbox (`/admin/compliance-test/`)

**FOD source:** Mentioned in dashboard listing — a sandbox where admin can manually test arbitrary recipes against rule packs without going through a product.

**Where it lands:** `COMPLIANCE.md`. Useful for admin debugging when a partner reports "my recipe says it fails but I don't understand why." Surface at `/admin/compliance/sandbox`.

**V1.1 ship target** — useful but not blocking.

---

## 3. Pavel's named-but-not-yet-speced list — deep dives

### 3.1 Nutrition Facts Template Management

**FOD source:** `dashboard/admin/nutrition-facts-demo/page.tsx` (947 lines) + `dashboard/admin/design-templates/nutrition-facts/` directory. Surfaces a library of FDA layout variants (Vertical, Tabular, Linear, Per-Serving, Aggregate, Infant, Child, Supplement Facts, multicolumn, proprietary blend) — for each, a preview, allowed configurations, per-category defaults, and (in FOD's UI) drag-to-position element editor.

**What iLaunchify needs (V1):**
- Read-only catalog of available layout variants
- Per-category default selection ("supplements default to Supplement Facts Adult vertical")
- Preview generator that renders a sample recipe against the layout
- Versioning: each layout is tied to a rule pack version so labels don't silently change

**What iLaunchify does NOT need V1:**
- Drag-to-position custom-layout editor (V2 if ever — most partners don't need custom layouts, FDA-approved variants cover virtually every case)
- Multi-region layouts (CFIA, EU) — US-only

**Where it lands:** new `docs/LABEL_TEMPLATES.md` doc OR a major section under `COMPLIANCE.md`. Admin route at `/admin/library/label-templates`. Schema: `LabelTemplate` model linked to rule pack version, with a JSON definition of the rendered layout.

**Schema sketch:**
```
LabelTemplate
├── id, slug, displayName    // "FDA Vertical Standard", "FDA Tabular", "FDA Supplement Adult"
├── ruleSet enum (FDA_NUTRITION | FDA_SUPPLEMENT | FDA_INFANT | FDA_CHILD)
├── format enum (VERTICAL | TABULAR | LINEAR | AGGREGATE)
├── layoutDefinition Json   // declarative — used by WeasyPrint renderer
├── status, ruleVersionMin, ruleVersionMax
├── allowedCategories String[]
├── createdAt, deprecatedAt
```

**V1 ship target:** seed 6–8 canonical templates (FDA Vertical, Tabular, Linear; Supplement Facts Adult; Aggregate; one or two infant/child). Hardcode the rendering. Admin can view + set per-category default. **V1.1** adds a custom-layout editor.

---

### 3.2 Die-line Template Management

(Covered in §1.1 above.)

The full deep-dive: FOD's die-cut page has a fabric.js canvas where admin drags rectangles to define mandatory zones (nutrition panel area, ingredient list area, barcode area, brand-logo area, allergen statement area). Each zone has a type, a required flag, and dimensions. When a partner uploads their label artwork to Design Studio, the rendering engine checks that the mandatory content lands inside the right zones. This connects directly to the Design Studio AI compliance scan from `DESIGN_STUDIO.md`.

**Where it lands:** extend `DESIGN_STUDIO.md` AND `MANUFACTURER_PRODUCT_BUILDER.md` §6 with the zone-definition concept. The PackagingSurface gains `mandatoryZones Json` and `printSpec Json`. Admin canvas editor at `/admin/packaging-types/[id]/surfaces/[surfaceId]/zone-editor`.

**V1 ship target:** schema fields + manual JSON entry. **V1.1** adds the visual editor.

---

### 3.3 Asset Management

(Covered in §1.2 above.)

Deep dive: FOD's asset page has 6 categories (pictograms, allergen icons, certification badges, manufacturer logos, generic product imagery, regulatory documents). Each asset has approval status, version history (so deprecating an asset doesn't break old labels that pinned a specific version), usage tracking (admin sees "this NSF logo is used by 47 products"), tag-based search, and admin-only deprecation with reason.

**Critical insight from FOD:** assets must be *version-pinned at publish time* on products. When admin uploads a v2 of the NSF logo, products that published against v1 keep showing v1. New products start using v2 by default but can opt to a specific version. This avoids labels silently changing without re-approval.

**Where it lands:** new `docs/ADMIN_DASHBOARD.md`. Schema in §1.2 above. Wire into FlavorPreset / ProductTemplate where assets are pinned.

---

### 3.4 Notification Management

(Covered in §1.4 above.)

Deep dive: FOD's notification-settings page (1,488 lines) is huge because it covers 4 distinct concerns smashed together: (a) per-event-type template editor (subject, body, channel variants), (b) recipient rules (which roles get which events), (c) per-user opt-out overrides for critical messages, (d) broadcast composition + scheduling. Our V1 should split these into separate routes: `/admin/notifications/templates`, `/admin/notifications/recipients`, `/admin/notifications/broadcasts`. Don't replicate FOD's single-page god-form.

**Critical insight:** FOD has a `ComplianceMonitoringDashboard` component that ties into notifications — when partner products fail compliance pre-check, ops gets a notification with a deep-link. This pattern (queue → notification → deep-link → action) should be standard across all admin queues.

---

## 4. Things we deliberately leave behind

| FOD surface | Why skip |
|---|---|
| `vendors_new/` | Duplicate / WIP fork of `vendors/` — pick one direction, not both |
| `dev-tools/` (9 lines) | Stub. Dev tools belong in code, not in admin UI |
| `templates/` (18 lines) | Empty stub — superseded by design-templates and label-templates |
| `tools/` (80 lines) | Grab-bag of one-off admin scripts. Each becomes its own purpose-built page or a CLI |
| `enterprise-production/` (30 lines) | Stub. The concept (enterprise tier partner workflows) is real but should be designed fresh, not ported |
| `security/` (8 lines) | Stub. Use Stripe Radar + standard auth controls; build security dashboards only when there's a real need |
| `monitoring-integrations/` (26 lines) | Stub. Integrations live in `OBSERVABILITY.md` |
| `compliance/` (89 lines) | Thin — content lives in compliance service + rule packs, admin UI is mostly read-only |
| `subscriptions/Overview.tsx` (10 lines) | Stub |
| `creators/page.tsx` (41 lines) | Thin — covered by Partner CRM pattern applied to creators, not its own surface |
| `nutrition-facts-demo/` | The "-demo" suffix tells you everything — replace with the canonical `/admin/library/label-templates` (see §3.1) |
| `LabelStatusTable.tsx` | Probably overlapping with product approval queue |
| `IntegrationMonitor.tsx` / `MonitoringIntegrations.tsx` | Naming collision suggesting duplicate work in FOD |
| `RegionalDistributionDashboard.tsx` | US-only V1; defer |
| `EnterpriseDashboard.tsx` | Premature tier-specific dashboard |
| `SystemTestRunner.tsx` | Admin should not run tests — that's CI |
| `AddMockNotificationPanel.tsx` | Mock-data testing harness — leave behind |
| `analytics/page.tsx` (278 lines) | Stub-ish — covered by §2.4 performance monitoring |
| `AdvancedAnalytics.tsx` | Empty box — build real analytics when you have signal |
| `barcodes/` (183 lines, V1.1) | Defer per §2.7 |
| `marketing/` (184 lines, V1.5+) | Defer per §2.6 |
| `languages-markets/` (897 lines, V2) | Defer per §2.5 |
| `label-moderation/` (182 lines) | Redundant with product approval queue per §2.9 |

---

## 5. Cross-cutting patterns worth standardizing

These patterns appear across multiple FOD admin surfaces. Worth designing once and applying consistently — this is the OOUX "consistent interaction vocabulary" Pavel and I discussed earlier today.

### 5.1 The Queue pattern
Every approval/review surface (Leads, Vendor verification, Product approval, Edit approval, Certificate verification, Ingredient verification, Packaging cluster review, Refund requests, Fraud review) has the same shape: table with status pills + filter chips + search + bulk select + open-detail-drawer + take-action buttons + audit log mini-widget + notes thread.

**Recommendation:** Build a `<Queue>` component once with slot-based customization. All queue surfaces consume it. Defines the platform's "feel" of admin work.

### 5.2 The Library pattern
Every curated catalog (Ingredients, Certificates, Packaging types, Label templates, Starter templates, Categories, Assets, Email templates, Notification templates, Banned dictionary, Suppliers, Materials) has the same shape: browseable grid or table + search + filter + tags + open-detail + version history + status (active/deprecated/archived) + promotion workflow.

**Recommendation:** Build a `<Library>` component once. Same justification.

### 5.3 The Record pattern
Every entity-detail surface (Partner CRM card, Order detail, AuditLog entry, Product detail) has: header with key facts + status + tabs for sub-sections + related-records widget + timeline + actions toolbar.

**Recommendation:** Build a `<RecordDetail>` component with consistent tab + timeline layout.

### 5.4 Diff view (Edited tab on product queue)
Used by: product edits, packaging edits, ingredient edits, partner profile edits. Show old vs proposed side-by-side, allow checkbox-level accept/request-changes.

**Recommendation:** Generic `<DiffView>` component parameterized by field map.

### 5.5 Promotion wizard
Used by: library promotion (ingredients, packaging types, certificates). Three steps: select source → normalize → relink matches.

**Recommendation:** Generic `<PromotionWizard>` component with adapter per object type.

### 5.6 Audit log embed
Every action everywhere writes to AuditLog. Every detail view shows the recent log entries inline.

**Recommendation:** Already shipped per #92. Just keep using it consistently — every action writes.

---

## 6. Suggested rollout into the build plan

### Add to V1 (the current 3-week W1/W2/W3 plan)
- **§1.1 Die-line schema fields** (printDpi, colorMode, bleedMm, mandatoryZones Json) — fold into task #127 schema migration
- **§1.2 Asset model + admin CRUD** — extend task #129 (Certificate Library) to share an Asset table
- **§3.1 LabelTemplate seed + read-only admin** — fold into compliance service work

### Add to V1.1 (post-launch quick wins)
- **§1.1 Die-line visual zone editor** (fabric.js / Konva canvas)
- **§1.2 Partner asset upload + approval workflow + version pinning**
- **§1.3 Mockups library** (upload only; compositing in V1.5)
- **§1.4 NotificationTemplate + recipient rules editor** (broadcast in V1.5)
- **§1.5 Refund request queue**
- **§1.6 Fraud review queue**
- **§2.7 Barcodes per-product**
- **§2.10 Compliance test sandbox**

### Add to V1.5
- **§2.1 Category management UI**
- **§2.2 Packaging materials library**
- **§2.3 Supplier directory**
- **§2.4 Performance monitoring dashboard**
- **§2.6 Marketing CMS**
- **§2.8 Billing plan management**
- **§1.4 Notification broadcasts + analytics**

### V2+
- **§2.5 Languages / markets**
- Custom nutrition-label layout editor
- Mockup compositing

---

## 7. Net new tasks recommended

Beyond #146 (this audit itself), suggest creating:

- **W1 schema extension:** add Asset + LabelTemplate + die-line zone fields to the #127 migration
- **W2:** Asset library admin CRUD (extends #129 cert library — same Asset table backs both)
- **W3:** Seed 6–8 canonical LabelTemplates + per-category default picker

The V1.1 items become a separate phase (Phase C) once V1 lands.

---

## Closing observation

FOD's admin is ambitious — Pavel was thinking ahead about real ops needs. The duplicated / hardcoded / stub state is what happens when a single founder builds the whole platform and runs out of time. The *concepts* are mostly right; the implementations need to be rebuilt against the cleaner object model we're now establishing.

Worth doing the OOUX object map (from the previous turn's conversation) BEFORE writing `docs/ADMIN_DASHBOARD.md` — because the patterns in §5 above (Queue, Library, Record, Diff, Promotion) become the building blocks the entire admin product is composed from.
