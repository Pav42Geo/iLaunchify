# FOD Admin Audit

**Scope:** Operational surface for iLaunchify admins (Pavel + team) in the legacy FOD codebase, and a gap map against the current rebuild in `apps/admin/`. Excludes marketplace, customize flow, storefront, and creator-facing surfaces.

**Two summary numbers up front:**
- FOD ships ~50 distinct admin routes/pages plus ~36 `/api/admin/*` route handlers, all bundled into a single Next.js app role-gated as `userRole="admin"`.
- The iLaunchify rebuild currently ships 3 admin areas (Leads, Partners, Orders) with one extra detail view (Order detail). The AdminSidebar lists Creators, Products, and Compliance but the routes do not exist.

---

## 1. Admin roles & permissions model

**FOD (single role + ad-hoc client gate)**
- Enum source: `FOD-reference/prisma/schema.prisma` lines 17-23 — `UserRole = { admin, vendor, creator, enterprise, viewer }`. A single `admin` value; no sub-roles, no RBAC table.
- Per-user `permissions Json?` field on `User` (schema line 389) — never wired to a real authz check anywhere in the routes; UI in `users/page.tsx` builds RBAC "permission sets" purely in client state.
- Route gating: client hook only — `FOD-reference/frontend/src/hooks/useAdminAuth.ts`. Falls back to a hard-coded `admin@example.com / adminpass` demo login (`useAdminAuth.ts` lines 17-18, 36-49). Bypasses backend if backend rejects.
- Backend gating: Express `authorizeRole(['admin'])` middleware on `FOD-reference/backend/admin-routes.js` (lines 29, 53, 71, 95, 119, 135). Only 6 endpoints actually guard: dashboard, users CRUD, products list, health.
- Layout: `FOD-reference/frontend/src/app/dashboard/admin/layout.tsx` simply wraps in `DashboardLayout userRole="admin"` — no server-side enforcement.
- "Associates," "Groups," "RBAC sets," "Impersonation" — all mock state inside `users/page.tsx`.

**iLaunchify**
- `packages/db/prisma/schema.prisma` line 31-35 — `UserRole = { ADMIN, CREATOR, PARTNER }`. No sub-roles.
- Enforcement is server-side: `apps/admin/src/app/(dashboard)/layout.tsx` line 6 → `requireRole('ADMIN')` from `@ilaunchify/auth`. Layout-level redirect.

**iLaunchify status:** present (simpler/cleaner). No RBAC matrix, no per-permission flags, no impersonation. Matches FOD's effective behaviour (FOD's RBAC was vapourware).

---

## 2. Leads / inbound CRM

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Lead inbox (partner applications) | n/a in FOD — no public lead form; only embedded in `users` page as "Invites" tab | FOD had no real CRM inbox | present (new in iLaunchify) |
| Qualify / disqualify a lead | n/a in FOD | n/a | present — `apps/admin/src/app/(dashboard)/leads/page.tsx`, `leads/[leadId]/page.tsx`, `LeadActions.tsx`, `actions.ts` |
| Invite email send | `frontend/src/app/api/admin/invite/route.ts` + `users/page.tsx` lines 703-734 (`handleInviteSend`) | Generic role-agnostic invite POST | present (lead-specific magic link) |
| Lead notes / applicant payload viewer | n/a | n/a | present — `leads/[leadId]/page.tsx` parses `lead.leadNotes` JSON |
| Vendor verification queue (manual review of vendor docs) | `frontend/src/app/dashboard/admin/vendor-verification/page.tsx` + API `frontend/src/app/api/admin/vendor-verification/route.ts`, `vendor-verification/[vendorId]/route.ts` | Reviews vendor-submitted compliance docs with sections: pending/verified/needs_changes/rejected | missing |

The legacy "lead pipeline" in FOD was effectively the Vendor Verification tool plus the generic `/admin/invite` endpoint. iLaunchify's Leads model (Partner.status DRAFT → INVITED → UNDER_REVIEW → ACTIVE) is a cleaner replacement.

---

## 3. Partner CRM (operational, not partner-facing)

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| All Partners overview | `frontend/src/app/dashboard/admin/partners/page.tsx` | 4 stat cards (Print Providers / Packaging Suppliers / Fulfillment Warehouses / Packaging Engineers) + descriptive text, no real list | present — `apps/admin/src/app/(dashboard)/partners/page.tsx` lists all partners grouped by status |
| Partner type subpages | Sidebar links in `components/admin/AdminSidebar.tsx` lines 396-453: `partners/print-providers`, `partners/packaging-suppliers`, `partners/fulfillment-warehouses`, `partners/packaging-engineers`, `partners/transportation-logistics` | All sidebar entries point to URLs that have no `page.tsx` (404) | missing — but iLaunchify treats partners as one collection (Partner.services discriminates) |
| Partner detail page | n/a in FOD (only stub `partners/page.tsx`) | n/a | present — `apps/admin/src/app/(dashboard)/partners/[partnerId]/page.tsx` (company, services, die-cut support, Stripe Connect status) |
| Partner activation / suspension actions | n/a in FOD | n/a | present — `apps/admin/src/app/(dashboard)/partners/[partnerId]/PartnerActions.tsx`, `actions.ts` (Activate, Request changes, Suspend, Reactivate) |
| Vendor (manufacturer) directory | `frontend/src/app/dashboard/admin/vendors/page.tsx` + API `api/admin/vendors/route.ts`, `vendors/[id]/route.ts` | Real CRUD of vendor companies: name, contact, lead time, MOQ, cost per unit, rating, certifications, payment terms | missing — no vendor directory; vendors collapsed into Partner |
| Supplier directory | `frontend/src/app/dashboard/admin/suppliers/page.tsx` + API `api/admin/suppliers/route.ts` | Same shape as vendors but separate table | missing |
| Print providers ("logistics") legacy view | `frontend/src/app/dashboard/admin/providers/page.tsx` | Mock single-row table (Printify hard-coded) | obsolete in iLaunchify |
| Creators directory (admin view) | `frontend/src/app/dashboard/admin/creators/page.tsx` | One-row mock table (Jane Creator, Pending, Approve button) | missing in iLaunchify rebuild (sidebar links to `/creators`, route does not exist) |

---

## 4. Order operations

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| All Orders list | `frontend/src/app/dashboard/admin/orders/page.tsx` | Pure mock data, client-side search/filter/pagination, no API call | present — `apps/admin/src/app/(dashboard)/orders/page.tsx` (real Prisma query, urgent vs. recent buckets) |
| Order detail / drill-in | not in FOD admin (only mock rows) | n/a | present — `apps/admin/src/app/(dashboard)/orders/[orderId]/page.tsx` (items, charge, dispatches, transfers, notes) |
| Returns & Refunds queue | `frontend/src/app/dashboard/admin/orders/returns-refunds/page.tsx` | Mock list of return/refund requests with approve/reject dialog | missing |
| Fulfillment status board | `frontend/src/app/dashboard/admin/orders/fulfillment-status/page.tsx` | Mock fulfillment stepper view per order | partial — iLaunchify order detail shows dispatch status inline, no separate board |
| Order settings | `frontend/src/app/dashboard/admin/orders/settings/page.tsx` | Mock list of toggles (auto-cancel timeout, default shipping, payment-required flag) | missing |
| Logistics tracking | `frontend/src/app/dashboard/admin/logistics/tracking/page.tsx` (uses `OrdersTable`, `LabelTimeline`) | Real components for orders table + label print timeline | missing |
| Logistics data & logs | `frontend/src/app/dashboard/admin/logistics/data/page.tsx` (`ExportPanel`, `LogsTable`, `LabelMetadataInspector`) | Bulk export + system logs + label metadata inspector | missing |
| Logistics analytics | `frontend/src/app/dashboard/admin/logistics/analytics/page.tsx` | SLA charts, fulfillment chart, label approval pie | missing |
| Dispatch reassignment / manual intervention | n/a in FOD | n/a | missing in both — iLaunchify shows dispatches read-only, no admin override action |
| Refund issuance | `frontend/src/app/dashboard/admin/payments/page.tsx` ("Coming Soon" placeholder) | Stub | missing |

---

## 5. User management

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Master users page (multi-tab) | `frontend/src/app/dashboard/admin/users/page.tsx` (>1000 lines) — tabs: All Users, Invites, Associates & Permissions, Activity Logs, Role Management, Partner Management, Settings, Groups | Single mega-page combining user list + invites + permission sets + RBAC editor + bulk import + impersonation + activity log + groups | missing |
| Users by role subpages | sidebar entries `users/admins`, `users/vendors`, `users/creators`, `users/print-providers`, `users/packaging-suppliers`, `users/fulfillment`, `users/packaging-engineers`, `users/logistics`, `users/marketing`, `users/designers` (`AdminSidebar.tsx` lines 322-394) | Only `users/vendors/page.tsx` exists; the other nine 404 | missing |
| Invite user | `frontend/src/app/api/admin/invite/route.ts` + users page `handleInviteSend` lines 693-734 | POST to backend, sends invite email | partial — iLaunchify has lead-qualify invite only, no generic "invite a user" |
| Impersonate user | client-only mock — `users/page.tsx` lines 751-760 (`handleImpersonate` / `handleReturnToAdmin`) sets local state, no real session swap | Fake | missing (mock-only in FOD anyway) |
| Activity logs / audit log viewer | client-side mock array `mockActivityLogs` in `users/page.tsx` lines 159-280; real DB model `AuditLog` (`prisma/schema.prisma` line 657-674) and `SystemLog` (line 676-688) exist but no admin UI reads them | Mock | missing — schema not yet ported either |
| Role management UI | `frontend/src/components/admin/RoleManagement.tsx` + `users/page.tsx` Role Management tab | Client-state CRUD of "permission sets" | missing |
| Bulk import users (CSV) | `users/page.tsx` `handleBulkImportOpen` (line 798+) | Mock CSV upload dialog | missing |
| Export users CSV | `users/page.tsx` `handleExportCSV` (line 737-749) | Real CSV download from client state | missing |
| Password reset | `frontend/src/app/admin/forgot-password/page.tsx` + `useAdminAuth.forgotPassword` (line 64-80) | Demo-mode stub (1.5s sleep then success if email matches `admin@example.com`) | n/a — iLaunchify uses magic-link auth, no passwords |
| Admin onboarding wizard | `frontend/src/app/admin/onboarding/page.tsx` + `OnboardingStepper.tsx` + 6 step components (Welcome, OrganizationInfo, ConfigureSettings, InviteTeam, Tour, Finish) | First-run setup wizard for new admin org | missing |
| Notification settings | `frontend/src/app/dashboard/admin/notification-settings/page.tsx` (multi-tab notification prefs UI) | User-facing notification config | missing |
| Notification center | `frontend/src/app/dashboard/admin/notification-center/page.tsx` + `components/admin/NotificationCenter.tsx` | In-app notification feed for admin | missing |

---

## 6. Catalog / ingredient management

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Products & Categories master | `frontend/src/app/dashboard/admin/products-categories/page.tsx` — 3 tabs: ProductCatalog, CategoriesManagement, PackagingMaterials | Real CRUD on categories, products, packaging materials | missing in admin app (catalog management is currently seed-driven; sidebar `/products` route does not exist) |
| Subcategories CRUD | `frontend/src/app/api/admin/subcategories/route.ts`, `subcategories/[id]/route.ts` | REST API | missing |
| Categories CRUD + stats | `frontend/src/app/api/admin/categories/route.ts`, `categories/[id]/route.ts`, `categories/stats/route.ts` | REST API | missing |
| New product builder | `frontend/src/app/dashboard/admin/products/new/page.tsx` → `ProductBuilderStepper` | Admin-side product template creator | missing (creators build products in iLaunchify; no admin product builder) |
| Admin products list/CRUD | `frontend/src/app/api/admin/products/route.ts`, `products/[id]/route.ts`, `products/[id]/approve`, `products/[id]/reject`, `products/[id]/status`, `products/[id]/revert`, `products/[id]/inventory`, `products/stats`, `products/bulk-status`, `products/bulk-delete` | Approval workflow + bulk status/delete + inventory adjust | missing — iLaunchify has no admin product moderation |
| Packaging types CRUD | `frontend/src/app/api/admin/packaging-types/route.ts` | REST API | partial — `PackingType` model is in iLaunchify schema, no admin CRUD UI |
| Recipes index (admin view) | `frontend/src/app/dashboard/admin/recipes/page.tsx` | Lists all creator + template recipes with status chips | missing |
| Die-cut shape library | `frontend/src/app/admin/die-cut-shapes/page.tsx` + `frontend/src/app/dashboard/admin/design-templates/die-cut/page.tsx` | Catalog of die-cut packaging shapes | partial — iLaunchify schema has `DieCutTemplate` and partner profile attaches them, no admin CRUD UI |
| Design templates library | `frontend/src/app/dashboard/admin/design-templates/page.tsx`, `design-templates/mockups/page.tsx` | Template uploader + product mockup gallery | missing |
| Templates page (generic) | `frontend/src/app/dashboard/admin/templates/page.tsx` | Disabled — alert says "temporarily disabled due to MUI v7 compatibility issues" | obsolete |
| Barcodes / QR codes | `frontend/src/app/dashboard/admin/barcodes/page.tsx` | Mock GTIN ranges + barcode templates UI | missing |
| Assets management | `frontend/src/app/dashboard/admin/assets/page.tsx` (multi-tab: gallery, upload, pending approval, deprecated) | Real `AssetService`-backed CRUD on compliance pictograms, logos, fonts, templates, barcodes | missing |
| Nutrition Facts demo | `frontend/src/app/dashboard/admin/nutrition-facts-demo/page.tsx` | Interactive Nutrition Facts label demo | obsolete — iLaunchify has its own NutritionFactsRenderer |

---

## 7. Compliance review queue

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Compliance Library (root) | `frontend/src/app/dashboard/admin/compliance/page.tsx` | Self-deprecated — banner says "this page has been consolidated into Languages & Markets Management"; lists market profiles | n/a |
| Global Compliance Center | `frontend/src/app/dashboard/admin/compliance/global-compliance/page.tsx` | Global compliance dashboard | missing |
| Advanced compliance dashboard | `frontend/src/app/dashboard/admin/compliance/advanced-dashboard/page.tsx` | Advanced metrics | missing |
| AI Design Studio | `frontend/src/app/dashboard/admin/compliance/ai-design-studio/page.tsx` | AI-assisted compliance design | missing |
| Phase 6 Blockchain | `frontend/src/app/dashboard/admin/compliance/phase6-blockchain/page.tsx` | Speculative blockchain anchor for compliance | obsolete |
| Compliance test runner | `frontend/src/app/dashboard/admin/compliance-test/page.tsx` | Manual rule pack tester | missing |
| Sidebar-promised but no `page.tsx`: `compliance/rules`, `compliance/templates`, `compliance/updates`, `compliance/audit` (per `AdminSidebar.tsx` lines 181-211) | – | All 404 in FOD | n/a |
| Compliance Rule Manager component | `frontend/src/components/admin/compliance/ComplianceRuleManager.tsx` | Rule editor used inside subscriptions/RuleManager | missing |
| Subscriptions > Rule Manager | `frontend/src/app/dashboard/admin/subscriptions/RuleManager/page.tsx`, `AuditLogViewer.tsx`, `Overview.tsx` | RuleManager subroute exists; Overview is a stub ("Subscription overview component coming soon") | partial — iLaunchify has rule packs as files in `services/compliance/`, no admin UI for editing |
| Compliance monitoring dashboard | `frontend/src/components/admin/ComplianceMonitoringDashboard.tsx` (used in performance-monitoring tabs) | Live compliance health metrics | missing |
| Label moderation queue | `frontend/src/app/dashboard/admin/label-moderation/page.tsx` | Mock approve/reject queue for submitted labels | missing |
| Label moderation deep links | sidebar `label-moderation/pending`, `label-moderation/reviews` (`AdminSidebar.tsx` lines 624-637) | 404 | n/a |
| Label status table | `frontend/src/components/admin/LabelStatusTable.tsx` | Tabular status of label review pipeline | missing |
| Compliance documents | `frontend/src/app/api/admin/labels/route.ts` + schema `ComplianceDocument` (line 305-320) | Per-market compliance doc storage | partial — schema not ported |
| Override compliance violation | n/a in FOD | n/a | missing in both |

---

## 8. Financial / payouts oversight

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Payments page | `frontend/src/app/dashboard/admin/payments/page.tsx` | 20 lines — "Stripe Integration (Coming Soon)" + an Export CSV button | partial — iLaunchify order detail shows Charge + Transfers but no dedicated payouts page |
| Transfer / payout monitor | n/a | n/a | partial — order detail only |
| Hold / release payouts | n/a in FOD | n/a | missing |
| Refund issuance UI | n/a (Returns & Refunds queue is mock approve/reject, doesn't trigger Stripe) | n/a | missing |
| Reconciliation | n/a | n/a | missing |
| Subscription/billing settings | sidebar `settings/subscription-billing` → 404 | – | missing |
| Currency & Tax settings | sidebar `settings/currency-tax` → 404 | – | missing |

---

## 9. System health / observability

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| System health API | `frontend/src/app/api/admin/system-health/route.ts` | DB ping + market/rule-pack counts → marketHealth / dataCompleteness / systemStability scores | missing |
| Performance monitoring page | `frontend/src/app/dashboard/admin/performance-monitoring/page.tsx` — tabs for USDA monitoring, Performance overview, Advanced analytics, Compliance monitoring, Regulatory notifications | Real performance metrics dashboard | missing |
| USDA system monitoring | `frontend/src/app/dashboard/admin/analytics/usda-monitoring/page.tsx` + `components/admin/USDAMonitoringDashboard.tsx` | USDA ingredient sync health | missing (no USDA sync in iLaunchify yet) |
| Monitoring integrations | `frontend/src/app/dashboard/admin/monitoring-integrations/page.tsx` + `components/admin/MonitoringIntegrations.tsx` | External monitor connectors (e.g. Datadog) | missing |
| Integrations dashboard | `frontend/src/app/dashboard/admin/integrations/page.tsx` + `components/admin/integrations/IntegrationsDashboard.tsx` + API `api/admin/integrations/route.ts` | Real list/edit of integrations (webhooks, REST, GraphQL, third-party) | missing |
| Security dashboard | `frontend/src/app/dashboard/admin/security/page.tsx` + `components/admin/security/SecurityDashboard.tsx` | Role mgmt, MFA, API security, audit logs (all surfaced under one page per sidebar) | missing |
| Enterprise security broken page | `frontend/src/app/dashboard/admin/security/enterprise-security/page.tsx.broken` | Renamed `.broken`, dead | obsolete |
| Dev tools (mock notification injector) | `frontend/src/app/dashboard/admin/dev-tools/page.tsx` | AddMockNotificationPanel — dev-only test fixture | n/a |
| Tools (consolidated) | `frontend/src/app/dashboard/admin/tools/page.tsx` | Tabbed view: UsageMonitor + FraudReview + Subscription Overview — all stubs | obsolete |
| Test DB connectivity | `frontend/src/app/api/admin/test-db/route.ts` | DB connection check | missing |
| Activity / system audit feed API | `frontend/src/app/api/admin/activity/route.ts` | Returns recent activity rows | missing |
| Enterprise & Production hub | `frontend/src/app/dashboard/admin/enterprise-production/page.tsx` redirects to `/final-production`; sidebar exposes pipeline / scaling / storage / api / migration-test subroutes (`AdminSidebar.tsx` lines 487-554) | Cluster of speculative "production migration" tools | obsolete in iLaunchify |
| SystemTestRunner | `frontend/src/components/admin/SystemTestRunner.tsx` | Browser-based smoke test runner | obsolete |

---

## 10. Reports & analytics

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Analytics hub | `frontend/src/app/dashboard/admin/analytics/page.tsx` | Tile menu: Performance, Business Insights, Market Intelligence, Geographic Analysis, Seasonal Trends, USDA Monitoring, ML Analytics | missing |
| Performance analytics | `frontend/src/app/dashboard/admin/analytics/performance/page.tsx` | Real-time perf charts | missing |
| Business insights | `frontend/src/app/dashboard/admin/analytics/business/page.tsx` | GMV, partner growth, market analytics | missing |
| ML analytics | `frontend/src/app/dashboard/admin/analytics/ml-analytics/page.tsx` | Model accuracy, predictions | obsolete |
| USDA monitoring (analytics) | `frontend/src/app/dashboard/admin/analytics/usda-monitoring/page.tsx` | Compliance/update rate | missing |
| Advanced analytics component | `frontend/src/components/admin/AdvancedAnalytics.tsx` | Embedded inside performance-monitoring | missing |
| Regional distribution | `frontend/src/components/admin/RegionalDistributionDashboard.tsx` | Geo distribution viz | missing |
| Top vendors | `frontend/src/components/admin/TopVendorsList.tsx` | Top-N performers | missing |
| Admin stats endpoint | `frontend/src/app/api/admin/stats/route.ts` | Proxies to backend `/api/admin/stats`, returns totals (users/products/orders/revenue/pendingReviews/etc.) | missing |
| FOD admin dashboard "Recent Activity" card | `frontend/src/app/dashboard/admin/page.tsx` lines 332-363 | Four hard-coded activity strings | missing (and was never real) |

---

## 11. Other admin features

| Feature | FOD path | What it does | iLaunchify status |
|---|---|---|---|
| Languages & Markets master | `frontend/src/app/dashboard/admin/languages-markets/page.tsx` — 6 tabs: Markets, RulePacks, Translations, TemplateSpecs, Assignments, Settings (`components/admin/languages-markets/*Tab.tsx`) | Multi-market / multi-language compliance config console — large, real | missing |
| Markets CRUD API | `frontend/src/app/api/admin/markets/route.ts`, `markets/[id]/route.ts` | REST | missing |
| Themes CRUD API + activate | `frontend/src/app/api/admin/themes/route.ts`, `themes/[id]/route.ts`, `themes/activate/route.ts` | Theme system for white-label storefronts | missing |
| Theme editor UI | `frontend/src/app/dashboard/admin/settings/theme/page.tsx` + `ThemeEditor.tsx` + `ThemeGallery.tsx` + `AddThemeModal.tsx` | Visual theme editor + gallery | missing |
| Global config API | `frontend/src/app/api/admin/global-config/route.ts`, `global-config/[type]/[code]/route.ts` | CRUD on `GlobalPlatformConfig` (region/market/language/feature/integration toggles) | missing — `GlobalPlatformConfig` model is in FOD schema (line 129-145), not in iLaunchify schema |
| Marketing hub | `frontend/src/app/dashboard/admin/marketing/page.tsx` + sidebar children `marketing/promotions`, `marketing/campaigns`, `marketing/referral-loyalty`, `marketing/landing-pages`, `marketing/affiliates` | Stubs — only marketing root exists; all sidebar children 404 | missing |
| Settings hub | `frontend/src/app/dashboard/admin/settings/page.tsx` (Legal Templates / Tax & Country Config / Notification Controls cards — all but Legal say "Coming Soon") + sidebar children: `settings/global`, `settings/control-panel`, `settings/marketplace`, `settings/currency-tax`, `settings/api-keys`, `settings/subscription-billing` | Mostly 404; `settings/control-panel/page.tsx` exists | missing |
| Control panel | `frontend/src/app/dashboard/admin/settings/control-panel/page.tsx` | Real settings page (alerts, toggles, feature flags) | missing |
| Services API | `frontend/src/app/api/admin/services/route.ts` | Generic service registry | missing |
| Admin invite endpoint | `frontend/src/app/api/admin/invite/route.ts` | Already noted above | partial (lead-only) |
| Inventory notifications | `frontend/src/components/admin/InventoryNotifications.tsx` | Low-stock alerts feed | missing |
| Fraud review | `frontend/src/app/dashboard/admin/fraud-review/page.tsx` | Five lines — "Fraud review component coming soon..." | obsolete (was never built) |
| Vendors stub component | `frontend/src/app/dashboard/admin/users/vendors/page.tsx` | The one real `users/<role>` subpage | missing |

---

## 12. Inventory: features present in iLaunchify

The admin app currently ships:

1. **Leads inbox + qualify/disqualify** — `apps/admin/src/app/(dashboard)/leads/page.tsx`, `leads/[leadId]/page.tsx`, `LeadActions.tsx`, `actions.ts`. Pending review + invited buckets, magic-link invite, deletion on disqualify. Cleaner than anything FOD had.
2. **Partners CRM** — `apps/admin/src/app/(dashboard)/partners/page.tsx`, `partners/[partnerId]/page.tsx`, `PartnerActions.tsx`, `actions.ts`. Status-grouped list, detail view shows company / services / die-cut support / Stripe Connect, transitions: Activate / Request changes / Suspend / Reactivate.
3. **Orders list (real)** — `apps/admin/src/app/(dashboard)/orders/page.tsx`. Real Prisma read of last 100, segregates `ON_HOLD/DISPUTED/ROUTING` into a "Needs attention" bucket.
4. **Order detail** — `apps/admin/src/app/(dashboard)/orders/[orderId]/page.tsx`. Shows items, charge, dispatches (with partner + decline reason), transfers, internal notes. Read-only.
5. **Server-side role guard** — `apps/admin/src/app/(dashboard)/layout.tsx` via `requireRole('ADMIN')`.
6. **Magic-link auth** — `apps/admin/src/app/(auth)/login/`, `apps/admin/src/app/api/auth/[...nextauth]/route.ts`.

Sidebar (`apps/admin/src/components/nav/AdminSidebar.tsx`) lists three more items — Creators, Products, Compliance — but the routes do not exist.

---

## 13. Inventory: features missing or partial in iLaunchify

Grouped by recovery priority signal (not redesign — just what FOD had vs. what we have now).

**Real and load-bearing in FOD, missing in iLaunchify:**
- Vendor verification queue (`dashboard/admin/vendor-verification/page.tsx` + APIs)
- Vendor directory CRUD (`dashboard/admin/vendors/page.tsx` + APIs)
- Supplier directory CRUD (`dashboard/admin/suppliers/page.tsx` + APIs)
- Products & Categories management (`dashboard/admin/products-categories/page.tsx`, `api/admin/categories/*`, `api/admin/subcategories/*`)
- Admin product moderation (`api/admin/products/[id]/approve|reject|status|revert|inventory`, bulk endpoints)
- Languages & Markets console (`dashboard/admin/languages-markets/page.tsx` — 6 tabs, real components)
- Markets CRUD (`api/admin/markets/*`)
- Themes system (`api/admin/themes/*`, `dashboard/admin/settings/theme/*`)
- Global platform config (`api/admin/global-config/*`, schema `GlobalPlatformConfig`)
- Assets management (`dashboard/admin/assets/page.tsx` + `AssetService`)
- Integrations dashboard (`dashboard/admin/integrations/page.tsx` + `api/admin/integrations`)
- Logistics tracking + data + analytics (`dashboard/admin/logistics/*`)
- Recipes index (`dashboard/admin/recipes/page.tsx`)
- Notification center + notification settings (`dashboard/admin/notification-center`, `notification-settings`)
- Admin onboarding wizard (`app/admin/onboarding/*`)
- AuditLog / SystemLog schema (`prisma/schema.prisma` lines 657-688) — not ported

**Partial in iLaunchify:**
- Order operations — list + detail are real and richer than FOD's mock; missing returns/refunds workflow, fulfillment board, refund issuance, dispatch reassignment, hold/release controls, order settings
- Invite flow — works for lead qualification only; no generic invite-by-role
- Compliance — engine + rule packs exist as code in `services/compliance/`, but no admin UI to view/edit/test/audit
- Die-cut templates — schema present, no admin CRUD UI

**Real in FOD but obsolete in iLaunchify (don't port):**
- Phase 6 Blockchain compliance page
- Enterprise & Production / Final Production / Service Migration / Production Migration / Migration Test pages (artifacts of the dual-write migration)
- ML Analytics (no ML in iLaunchify)
- Compliance test runner / Compliance "Phase 6" / AI Design Studio (FOD speculative)
- Demo admin login fallback (`useAdminAuth.ts` hard-coded creds)
- Templates page (was explicitly disabled in FOD due to MUI v7)
- SystemTestRunner browser smoke tests
- USDA monitoring (no USDA sync wired up yet in iLaunchify)
- Fraud review stub
- Backend `admin-routes.js` / `admin-routes-prisma.js` / `admin-routes-old.js` triplet — iLaunchify has no separate Express backend

**Mock-only in FOD (FOD didn't actually ship these either — they're aspirational UI):**
- Users mega-page tabs: Activity Logs, RBAC editor, Groups, Impersonation, Associates & Permissions, Partner Management tab
- Returns & Refunds approve/reject
- Fulfillment status stepper
- Order settings toggles
- Label moderation queue
- Marketing promotions/campaigns/referrals/landing-pages/affiliates subpages
- Most `settings/*` subpages (currency-tax, api-keys, subscription-billing, marketplace, global)
- All `partners/<type>` and `users/<role>` subroutes from the sidebar (404 in FOD)
- Barcodes & QR codes overview
- Most `compliance/*` subroutes (rules, templates, updates, audit) — sidebar 404 in FOD
- Creators page (single hard-coded row)
- Providers page (single hard-coded Printify row)
- Marketing page

---

## 14. UX / architecture pain points worth flagging

Brief observations from reading FOD's admin code (not redesigns). Pavel's "needs optimized" maps cleanly to most of these:

1. **Sidebar oversells.** `AdminSidebar.tsx` lists ~120 nav entries across nested groups. Conservatively a third are dead links (`/users/admins`, `/users/creators`, `/users/print-providers`, `/marketing/promotions`, `/settings/currency-tax`, `/compliance/rules`, `/compliance/templates`, `/compliance/updates`, `/compliance/audit`, `/label-moderation/pending`, `/barcodes/gtin`, all `/partners/*` subroutes, every `/enterprise-production/*` subroute except the root redirect, etc.). Every admin click is a coin flip between a working page, a stub, and a 404.

2. **`users/page.tsx` is doing 8 jobs.** Single file (>1000 lines) hosts All Users, Invites, Associates & Permissions, Activity Logs, Role Management, Partner Management, Settings, Groups. Mixes real backend calls with extensive mock data and client-only state for permission sets / impersonation / activity feeds. Splitting users / invites / RBAC / activity / groups into separate routes is the obvious decomposition.

3. **Mock data masquerading as features.** Orders, Returns/Refunds, Fulfillment Status, Label Moderation, Fraud Review, Subscriptions Overview, Providers, Creators, Marketing all render hard-coded arrays with full UI. Anyone clicking around the admin would reasonably think the platform supports things it doesn't.

4. **Two compliance UIs that have already self-deprecated.** `compliance/page.tsx` shows a banner saying "use Languages & Markets instead". `templates/page.tsx` shows "temporarily disabled due to MUI v7". Cruft is in production.

5. **No real authorization layer.** Demo password hard-coded in `useAdminAuth.ts` (lines 17-18); RBAC is client-state only. Backend `admin-routes.js` only guards 6 endpoints, all the heavy admin work happens through unguarded `/api/admin/*` Next.js routes that just trust the client.

6. **Stat cards everywhere, none from real data.** Every overview page (Partners, Label Moderation, Marketing, Barcodes, Vendors, Orders) opens with 4 hard-coded stat cards. There is no shared metrics service — each page would need its own backend wiring to become real.

7. **Two nav structures.** The sidebar in `AdminSidebar.tsx` doesn't match the QuickActions grid on `dashboard/admin/page.tsx` (e.g. QuickActions sends users to `/dashboard/admin/fraud-review` and `/design-studio/admin`; sidebar surfaces neither). Top-down dashboard discoverability is disconnected from left-nav.

8. **No pagination for several real lists.** Vendors, suppliers, recipes, assets all pull whole tables into the browser. (Orders mock has `Pagination` but it operates over the mock array.)

9. **Three competing partner taxonomies.** Sidebar splits partners into Print Providers / Packaging Suppliers / Fulfillment Warehouses / Packaging Engineers / Transportation. Users page splits into the same plus Logistics / Marketing / Designers. The `dashboard/admin/providers/page.tsx` (singular) page exists as a parallel concept. iLaunchify collapses this into one Partner model with `services[].type` — a clear win to preserve.

10. **Audit log model exists, no viewer.** `AuditLog` and `SystemLog` are well-defined in `prisma/schema.prisma` (lines 657-688). No admin page reads them; the only "activity log" UI is `users/page.tsx`'s mock array. Easy port — schema + 1 page.

11. **Magic numbers in route hierarchy.** Mixed depths: `analytics/usda-monitoring/page.tsx` vs `analytics/business/page.tsx`; `compliance/phase6-blockchain/page.tsx` vs `compliance-test/page.tsx` (sibling of compliance/, not inside). Suggests organic growth without an IA pass.

12. **Onboarding wizard is decoupled.** `app/admin/onboarding/*` sits at root, not under `dashboard/admin/onboarding`. Easy to miss and never linked from anywhere we found.

13. **`recent activity` block is fake.** `dashboard/admin/page.tsx` lines 332-363 hard-codes four activity strings ("New vendor registration: Fresh Foods Co.", etc.). Visible on every admin login.

14. **Vendor verification is real but isolated.** `dashboard/admin/vendor-verification/page.tsx` is one of the most substantive working pages, lives under Users & Roles in the sidebar, but is the only working item there. Worth promoting in the IA.

15. **Theme system is real and ported zero%.** `api/admin/themes/*` plus the editor UI is a fully working white-label theme registry. iLaunchify's storefront has theming via brand metadata but no admin theme management surface yet.
