# FOD Partner Audit

Scope: only Partner/Vendor surfaces (onboarding, dashboard, order workflows, capability profile, payouts, admin views that manage partners). Out of scope: marketplace, customize, storefront, recipe builder, creator app. Comparison target: `apps/partner`, `apps/admin/src/app/(dashboard)/partners`, and `packages/db/prisma/schema.prisma` in the rebuild.

Terminology note: FOD used three overlapping role names — `vendor`, `partner`, and `provider`. The data model treated `vendor` and `partner` as separate `UserRole` values; in the UI, "partner" was used for the broader Partner Center (multiple sub-roles: print provider, packaging supplier, fulfillment, packaging engineer, logistics, manufacturer) and "vendor" was the manufacturer/copacker-shaped dashboard (orders + products + payments). Both share the onboarding pipeline and verification model.

---

## 1. Data model (schema)

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| `UserRole` enum includes `vendor` + `partner` + `creator` + `admin` | `FOD-reference/backend/prisma/schema.prisma:22-28` | Two distinct service-provider roles in one enum | partial — iLaunchify collapses to single `PARTNER` role (`packages/db/prisma/schema.prisma:31`) |
| `CompanyType` enum (`vendor`, `creator`, `enterprise`, `marketplace`) | `FOD-reference/backend/prisma/schema.prisma:30-35` | Distinguishes company kinds | missing — iLaunchify uses `Partner` model instead of a `CompanyType` enum |
| `Company` model (id, name, type, settings, billingInfo, compliance, isActive) | `FOD-reference/backend/prisma/schema.prisma:391-407` | Tenant entity owning Users, Products, Orders | partial — replaced by `Partner` (company-shaped) and `CreatorProfile`/`Brand` |
| `Partner` SQL table (Postgres init) — partnerType enum (`DISTRIBUTOR`, `WHOLESALER`, `RETAILER`, `MARKETPLACE`, `BRAND_AGENCY`), status (`PENDING/APPROVED/REJECTED/SUSPENDED`), regions[], industries[], certifications[], contact*, address | `FOD-reference/migrations/20250830022506_init/migration.sql:61-78` | First-class Partner record with type/region/cert metadata | partial — iLaunchify has `Partner` + `PartnerService` but no `partnerType` enum at the company level (type lives on the service); no `regions[]`, no `industries[]`, no `certifications[]` on `Partner` |
| `Vendor` SQL table (status, specialties[], certifications[], address) | `FOD-reference/migrations/20250830022506_init/migration.sql:155-172` | Separate vendor record distinct from `Partner` | missing — no second model; `Partner` covers both |
| `VendorStatus` enum | `FOD-reference/migrations/20250830022506_init/migration.sql:25-26` | PENDING/APPROVED/REJECTED/SUSPENDED | present (`PartnerStatus`: DRAFT/INVITED/IN_PROGRESS/UNDER_REVIEW/ACTIVE/SUSPENDED at `schema.prisma:50-57`) |
| `PartnerStatus` SQL enum | `FOD-reference/migrations/20250830022506_init/migration.sql:11` | PENDING/APPROVED/REJECTED/SUSPENDED | present (broader) |
| `ApiClient` + `ApiKey` tables tied to Partner (scopes, rateLimit, secretHash) | `FOD-reference/migrations/20250830022506_init/migration.sql:81-107` | OAuth-style API access for partners | missing |
| `OrderLifecycleStatus` enum (PENDING / REJECTED / ACCEPTED / IN_PRODUCTION / QUALITY_CHECK / FULFILLMENT / SHIPPED / IN_TRANSIT / DELIVERED / COMPLETED / CANCELLED / CLOSED / ON_HOLD / RETURN_REQUESTED / REFUNDED / FAILED_PRODUCTION / FAILED_QC / EXCEPTION) | `FOD-reference/backend/prisma/schema.prisma:98-118` | 18-state vendor order pipeline | partial — iLaunchify uses `OrderStatus` + `DispatchStatus` (PENDING_ACCEPT/ACCEPTED/PRODUCING/READY/SHIPPED/IN_TRANSIT/DELIVERED/DECLINED/TIMED_OUT/CANCELLED at `schema.prisma:220-231`); missing QUALITY_CHECK, ON_HOLD as a partner-visible state on dispatch, RETURN_REQUESTED, FAILED_QC, FAILED_PRODUCTION, EXCEPTION |
| `Order.vendorCompanyId` + `Order.vendorInternalNotes` + `Order.rejectionReason` + per-state timestamps (`acceptedAt`, `productionStartedAt`, `qualityCheckStartedAt`, `fulfillmentReadyAt`, `shippedAt`, `deliveredAt`, `completedAt`, `cancelledAt`, `rejectedAt`, `closedAt`, `autoCancelAt`) | `FOD-reference/backend/prisma/schema.prisma:643-678` | Audit trail at every state transition + per-vendor private notes + auto-cancel deadline | partial — iLaunchify tracks `shippedAt` + `deliveredAt` on `OrderDispatch` + `declineReason`/`declineNotes`; missing per-state timestamps, `internalNotes` exists on Order but not on Dispatch, no `autoCancelAt` field |
| `OrderStatusEvent` model (audit log of every transition with actor + role + message + private internalPayload) | `FOD-reference/backend/prisma/schema.prisma:680-698` | Append-only state history visible per-actor | missing |
| `Partner.certifications[]` text array | `FOD-reference/migrations/20250830022506_init/migration.sql:73` | Top-level cert list on partner record | missing — certs live inside `PartnerService.capabilities` JSON only |
| `Ingredient.certifications` + `Ingredient.supplier` | `FOD-reference/backend/prisma/schema.prisma:579-585` | Supplier-of-ingredient metadata | partial (no supplier field on iLaunchify ingredient) |
| `GlobalPlatformConfig.scope` includes `partner_onboarding` | `FOD-reference/backend/prisma/schema.prisma:164` | Toggle features specific to onboarding wave | missing |
| `Vendor` Python service schema (separate Prisma client) | `FOD-reference/services/python/vendor-order-api/schema.prisma:14-24` | Tiny standalone vendor table for the FastAPI service | n/a — iLaunchify uses single Prisma client |

---

## 2. Partner onboarding flow

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Public-facing "for partners" + "for vendors" marketing pages | `FOD-reference/frontend/src/app/for-partners/page.tsx`, `for-vendors/page.tsx`, `partners/page.tsx`, `partners/layout.tsx` | Marketing pages explaining the program | present — `apps/partner/src/app/partners/{copackers,manufacturers,print,thanks}/page.tsx` |
| Self-serve onboarding entrypoint at `/partners/onboard` | `FOD-reference/frontend/src/app/partners/onboard/page.tsx` | Container page hosting `PartnerOnboardingWizard` | partial — `apps/partner/src/app/partners/apply/page.tsx` is a lead form, not a 7-step wizard |
| 7-step `PartnerOnboardingWizard` component (966 lines) | `FOD-reference/frontend/src/components/partner/PartnerOnboardingWizard.tsx` | Steps: GET_STARTED → CATEGORIES_MARKETS → BUSINESS_PROFILE → PARTNER_QUESTIONNAIRES → COMPLIANCE_DOCUMENTS → API_USAGE → REVIEW_SUBMIT, defined in `types/partner.ts:24-32, 516-568` | partial — iLaunchify has 5 steps (company → service → documents → stripe → review) under `apps/partner/src/app/(onboarding)/onboarding/` |
| Conditional step engine that adds/drops steps based on market/category/partner-type | `FOD-reference/frontend/src/lib/partner/partnerOnboardingFlow.ts:96-124` | `buildPartnerOnboardingSteps()` picks `market_compliance` and `integration` only when applicable (US + food + physical-supply-chain triggers US food compliance step; EU/UK targets trigger GDPR step; designer/marketing partner types skip integration step) | missing — iLaunchify flow is linear and identical for all partners |
| `PartnerOnboardingStepper` (499-line alternative entry under Partner Center) | `FOD-reference/frontend/src/components/partner/PartnerOnboardingStepper.tsx` | Stepper used inside the dashboard shell while user is mid-onboarding | missing |
| Per-step components: `CategoryMarketStep`, `PartnerInfoStep`, `MarketComplianceStep`, `DynamicRequirementsStep`, `ApiPortalStep`, `ReviewSubmitStep` | `FOD-reference/frontend/src/components/partner/steps/*.tsx` | Each step is its own ~200-630 LOC component with file uploads, conditional field policies, supplements | partial — iLaunchify has `CompanyForm.tsx`, `ServiceProfileForm.tsx`, `DocumentsStep` placeholder, `ConnectButton.tsx`, `SubmitForReviewButton.tsx` — much simpler shape, no role-questionnaire engine |
| Role/partner-type selection with 5 partner types (PRINT_PROVIDER, PACKAGING_SUPPLIER, FULFILLMENT, PACKAGING_ENGINEER, LOGISTICS) and labels/descriptions/icons | `FOD-reference/frontend/src/types/partner.ts:492-514`, `frontend/src/components/partner/PartnerRoleSelection.tsx` | Visual picker; partner can hold multiple roles | partial — iLaunchify has `ServiceType` enum with only 3 values (`MANUFACTURING`, `COPACKING`, `LABEL_PRINTING`) (`schema.prisma:59-63`); missing PACKAGING_SUPPLIER, FULFILLMENT, PACKAGING_ENGINEER, LOGISTICS |
| Field policy per registration region (EIN required for US, VAT shown for EU/UK) | `FOD-reference/frontend/src/lib/partner/partnerOnboardingFlow.ts:128-142` | `getPartnerInfoFieldPolicy()` | missing |
| Role-requirements with US food / multi-region contextual supplements | `FOD-reference/frontend/src/lib/partner/partnerOnboardingFlow.ts:163-220` | `buildRoleRequirementsContext()` injects extra questions per role + market combo (food safety attestation for US food, multi-region note for ≥4 markets) | missing |
| Role requirements schema | `FOD-reference/frontend/src/lib/partner/roleRequirementsSchema.ts` | Per-role JSON schema driving `DynamicRequirementsStep` | missing |
| Onboarding payload type (`OnboardingData`) covering legal name, registration number, registration date, certificate of incorporation files, registered address, EIN, VAT, businessOwnerInfo (KYB), partner name, partner logo, dataSharing consent, marketCompliance attestations, integrationMode, apiScopes, terms/privacy/DPA acceptance timestamps | `FOD-reference/frontend/src/lib/partner/onboardingTypes.ts:13-56` | Single canonical payload type for the wizard | missing — iLaunchify captures only companyName/legalName/address/phone/website + service capabilities JSON |
| KYB beneficial-owner sub-form (idType, idNumber, fullName, DOB, residentialAddress, idDocument files) | `FOD-reference/frontend/src/lib/partner/onboardingTypes.ts:28-36` | Pre-Stripe identity collection | missing — iLaunchify delegates KYB entirely to Stripe Connect |
| Onboarding persistence helpers + snapshot reload | `FOD-reference/frontend/src/lib/partner/partnerOnboardingPersistence.ts`, `partnerSnapshotToOnboardingPartial.ts` | Save/restore wizard payload from localStorage so users can resume | missing |
| File-stub collection + grouping by verification section | `FOD-reference/frontend/src/lib/partner/collectPartnerFileStubs.ts`, `partnerVerificationSectionFiles.ts` | Collects uploaded file references and groups them by admin review section (business / facility / documents / publicProfile) | missing |
| Verification-section → onboarding-step jump map | `FOD-reference/frontend/src/lib/partner/partnerVerificationSectionNav.ts:1-20` | "Edit section" jumps back to the right wizard step | missing |
| Welcome routing (post-onboarding handoff) | `FOD-reference/frontend/src/app/dashboard/partner/welcome/page.tsx`, `dashboard/vendor/welcome/page.tsx`, `lib/partner/partnerWelcomeRouting.ts` | Routes partner to next destination based on application submission state | partial — iLaunchify has `/onboarding/review` submit but no separate welcome page |
| Pre-approval restricted-shell mode | `FOD-reference/frontend/src/lib/partner/partnerNavAccess.ts:1-110` | When account is `pending/needs_changes/rejected` or pre-submit, hides most nav and shows a minimal review-only shell | missing — iLaunchify gates only via partner status check on dashboard query |
| Plans selection page after approval (`/auth/partner/plans`, three-tier basic/standard/premium) | `FOD-reference/frontend/src/lib/partner/partnerPlans.ts` | Post-approval tier picker with localStorage persistence + dev preview flag | missing |
| Rejected-success training screen | `FOD-reference/frontend/src/components/partner/RejectedSuccessTraining.tsx`, `dashboard/{partner,vendor}/rejected-training/page.tsx` | Educational content shown to rejected applicants explaining how to improve and resubmit | missing |
| Stripe Connect onboarding step | n/a in FOD wizard | (FOD did not yet wire Stripe Connect through the wizard) | present — `apps/partner/src/app/(onboarding)/onboarding/stripe/page.tsx` + `ConnectButton.tsx` + `actions.ts` (iLaunchify advance) |
| Magic-link login for partners | `FOD-reference/frontend/src/app/auth/login/partner/`, `auth/register/partner/`, `auth/register/vendor/` | Separate login routes per role | present — `apps/partner/src/app/(auth)/login/page.tsx` |

---

## 3. Partner dashboard pages

### Partner Center (`/dashboard/partner/(center)/`) — 16 pages

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Center home / index | `FOD-reference/frontend/src/app/dashboard/partner/(center)/page.tsx` | Routing/landing logic between welcome / home / restricted | partial — iLaunchify dashboard exists at `apps/partner/src/app/(dashboard)/dashboard/page.tsx` but no welcome/restricted variants |
| Restricted "home" (pre-approval card view) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/home/page.tsx` | Branded landing with explainer videos + handbook + support links for pre-approval partners | missing |
| Welcome page | `FOD-reference/frontend/src/app/dashboard/partner/welcome/page.tsx` | Post-signup landing | missing |
| Analytics | `FOD-reference/frontend/src/app/dashboard/partner/(center)/analytics/page.tsx` | "Coming soon" stub for production KPIs | missing |
| Compliance Center | `FOD-reference/frontend/src/app/dashboard/partner/(center)/compliance/page.tsx` | "Coming soon" stub for partner-owned certifications | missing |
| Messaging | `FOD-reference/frontend/src/app/dashboard/partner/(center)/messaging/page.tsx` | "Coming soon" stub for vendor↔admin chat | missing |
| Settings | `FOD-reference/frontend/src/app/dashboard/partner/(center)/settings/page.tsx` | Profile/security/integrations stub | partial — `apps/partner/src/app/(dashboard)/settings/page.tsx` exists but only shows account info + Stripe status |
| Subscriptions / plan picker | `FOD-reference/frontend/src/app/dashboard/partner/(center)/subscriptions/page.tsx`, `PrinterScheduler.tsx` | Starter/Pro plan cards + printer-slot allocator card with usage progress | missing |
| Help | `FOD-reference/frontend/src/app/dashboard/partner/(center)/help/page.tsx` | Static help/FAQ page | missing |
| Notifications preferences | `FOD-reference/frontend/src/app/dashboard/partner/(center)/notifications/page.tsx` | Channel preferences UI (email/SMS/in-app) per notification type with quiet-hours | missing — iLaunchify settings page mentions "V1.5: toggles + Slack" |
| Onboarding (in-shell variant) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/onboarding/page.tsx` | Hosts `PartnerOnboardingStepper` from within dashboard | missing |
| Center setup wizard (4-step quick setup) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/center-setup/page.tsx`, `OnboardingStepper.tsx` | Business info → Service areas → Capabilities → Verification | missing |
| My Application (read-only of submitted application + admin status) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/my-application/page.tsx`, `components/partner/PartnerApplicationStatusView.tsx` (690 LOC), `PartnerSubmittedApplicationReadOnly.tsx` (303 LOC) | Shows submitted application data, verification status per section, admin notes per section, "Edit section" buttons | missing |
| Orders inbox (with mock data) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/orders/lib/{mockOrders,useOrders}.ts`, `orders/components/NutritionAlert.tsx` | Mock order list + compliance alerts hook | partial — iLaunchify has real DB-backed `apps/partner/src/app/(dashboard)/orders/page.tsx` |
| Next-gen certificate validator | `FOD-reference/frontend/src/app/dashboard/partner/(center)/next-gen/CertValidator.tsx` | OCR/validate certificate uploads | missing |
| Rejected training | `FOD-reference/frontend/src/app/dashboard/partner/(center)/rejected-training/page.tsx` | Education screen for rejected partners | missing |
| Partner Center branded header | `FOD-reference/frontend/src/components/partner/PartnerCenterHeader.tsx` | Custom green-on-cream header for the partner shell (distinct from the rest of the app) | missing |

### Vendor Dashboard (`/dashboard/vendor/`) — manufacturer/co-packer-shaped UI, 12 pages

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Vendor home with summary cards | `FOD-reference/frontend/src/app/dashboard/vendor/page.tsx` + `lib/vendor/buildVendorDashboardSummary.ts` + `lib/vendor/dashboardMetrics.ts` | KPI tiles for orders/products/messages/payments with restricted-state variants | partial — `apps/partner/src/app/(dashboard)/dashboard/page.tsx` has pending/in-prod/active-services tiles but no messages/payments KPI |
| Orders catalog page | `FOD-reference/frontend/src/app/dashboard/vendor/orders/{page.tsx,VendorOrderCatalog.tsx}` + `lib/vendor/vendorOrderTablePreferences.ts` | Tabbed (all/open/fulfilled/cancelled) table with sortable/hideable columns, per-account column prefs persisted, search, paginated, row menus | partial — iLaunchify has a section-grouped list at `apps/partner/src/app/(dashboard)/orders/page.tsx`; no tabs, no column prefs, no search, no pagination |
| Products catalog page | `FOD-reference/frontend/src/app/dashboard/vendor/products/{page.tsx,VendorProductCatalog.tsx,ChannelGlyphs.tsx}` + `lib/vendor/vendorProductTablePreferences.ts` | Vendor's own product catalog with channel chips (Shopify/Amazon/eBay/WooCommerce/Etsy), publish toggles | missing — iLaunchify has no per-partner product catalog page |
| New product wizard | `FOD-reference/frontend/src/app/dashboard/vendor/products/new/page.tsx` + `components/product-builder/ProductBuilderStepper.tsx` | Multi-step product creation from the vendor side | missing |
| Edit product (full form with nutrition + allergens) | `FOD-reference/frontend/src/app/dashboard/vendor/products/[id]/edit/page.tsx` | Edit nutrition facts, allergens, ingredient categories, options | missing |
| Recipes (vendor side) | `FOD-reference/frontend/src/app/dashboard/vendor/recipes/page.tsx` | Vendor's recipe library | missing |
| Payments page | `FOD-reference/frontend/src/app/dashboard/vendor/payments/page.tsx` | Placeholder for payment management | missing — settings page mentions Stripe Connect status only |
| Subscriptions (with `StoreAllocator`) | `FOD-reference/frontend/src/app/dashboard/vendor/subscriptions/{page.tsx,StoreAllocator.tsx}` | Store-slot allocator with usage progress bar against subscription tier maxStores | missing |
| Messages (full inbox) | `FOD-reference/frontend/src/app/dashboard/vendor/messages/page.tsx` | Real-message inbox UI (folders, attachments, dialog composer) | missing |
| Help | `FOD-reference/frontend/src/app/dashboard/vendor/help/page.tsx` | Static help page | missing |
| Onboarding (vendor variant) | `FOD-reference/frontend/src/app/dashboard/vendor/onboarding/page.tsx` | Vendor wizard entry inside dashboard | missing |
| My Application | `FOD-reference/frontend/src/app/dashboard/vendor/my-application/page.tsx` | Vendor read-only application status view | missing |
| Welcome | `FOD-reference/frontend/src/app/dashboard/vendor/welcome/page.tsx` | Post-signup welcome with "Start onboarding" CTA | missing |
| Rejected training | `FOD-reference/frontend/src/app/dashboard/vendor/rejected-training/page.tsx` | Education for rejected vendors | missing |
| Notifications dir (empty in repo) | `FOD-reference/frontend/src/app/dashboard/vendor/notifications/` | Stub | n/a |

### Public manufacturer page

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Per-manufacturer public profile at `/[manufacturerSlug]` | `FOD-reference/frontend/src/app/[manufacturerSlug]/page.tsx` + `app/api/manufacturers/[slug]/verification/route.ts` | Public-facing brand-themed profile with verified-badge logic, controlled by `publicVerified` + `autoBadgeSync` flags on `VendorVerificationRecord` | missing — iLaunchify has only the brand storefront for creators |

---

## 4. Order workflows (partner side)

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Vendor orders REST API (proxy to FastAPI) | `FOD-reference/frontend/src/app/api/vendor/orders/route.ts` | List with optional mock fallback (`ALLOW_VENDOR_ORDERS_MOCK`) | partial — iLaunchify uses Prisma directly in server component `apps/partner/src/app/(dashboard)/orders/page.tsx`; no list API |
| Order action handler with 9 actions: `accept`, `reject`, `start-production`, `enter-quality-check`, `complete-quality-check`, `skip-to-fulfillment`, `mark-shipped`, `mark-in-transit`, `mark-delivered` | `FOD-reference/frontend/src/app/api/vendor/orders/[id]/[action]/route.ts` | Single endpoint dispatches by `[action]` param to backend | partial — iLaunchify server actions `acceptDispatch`, `declineDispatch`, `markProducing`, `markReady`, `shipDispatch` (`apps/partner/src/app/(dashboard)/orders/[dispatchId]/actions.ts`); missing `enter-quality-check`, `complete-quality-check`, `skip-to-fulfillment`, `mark-in-transit`, `mark-delivered` |
| Auto-cancel deadline on PENDING orders (`autoCancelAt` field) | `FOD-reference/backend/prisma/schema.prisma:666` | Vendor must accept by `autoCancelAt` or it auto-cancels | partial — iLaunchify has `acceptDeadlineAt` on `OrderDispatch` and decline path, but no automated timeout job; auto-decline relies on `TIMED_OUT` status enum value with no executor |
| Vendor internal notes (private to vendor, not surfaced to creator) | `FOD-reference/backend/prisma/schema.prisma:654` | `Order.vendorInternalNotes` | missing |
| Per-state timestamps on Order | `FOD-reference/backend/prisma/schema.prisma:655-666` | acceptedAt / productionStartedAt / qualityCheckStartedAt / fulfillmentReadyAt / shippedAt / deliveredAt / completedAt / cancelledAt / rejectedAt / closedAt | partial — iLaunchify only stores `shippedAt`/`deliveredAt` on Dispatch |
| Order status event log with actor + role + message + private internalPayload | `FOD-reference/backend/prisma/schema.prisma:680-698` | `OrderStatusEvent` model; append-only history | missing |
| Compliance alerts proxy | `FOD-reference/frontend/src/app/api/provider/compliance-alerts/route.ts` | Lists active compliance alerts for the provider | missing |
| Nutrition alert component for orders | `FOD-reference/frontend/src/app/dashboard/partner/(center)/orders/components/NutritionAlert.tsx` | Inline alert on order rows when a recipe fails compliance | missing |
| Print jobs endpoint | `FOD-reference/frontend/src/app/api/provider/print-jobs/route.ts` | Lists print jobs the provider owes | missing |
| Shipping integrations endpoint | `FOD-reference/frontend/src/app/api/provider/shipping/route.ts` | Shipping configuration | missing |
| Provider stats endpoint | `FOD-reference/frontend/src/app/api/provider/stats/route.ts` | KPI numbers feeding the dashboard | missing |
| Order routing endpoints (creator/marketplace) | `FOD-reference/backend/order-routes.js`, `backend/marketplace-order-routes.js`, `backend/order-management-dualwrite.js`, `backend/services/python/order-management/app.py` (incl. print-providers CRUD at `:335-411`) | Backend order pipeline | partial — iLaunchify has `packages/orders/` |
| Partner dispatch detail page (accept / decline with reason picker / mark producing / mark ready / ship with tracking) | n/a in FOD (only mock orders inbox) | FOD never built dispatch granularity — orders were vendor-scoped, not dispatch-scoped | present (iLaunchify advance) — `apps/partner/src/app/(dashboard)/orders/[dispatchId]/page.tsx` + `DispatchActions.tsx` + `actions.ts` |

---

## 5. Capability profile management

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Service-type capability shapes per partner role | `FOD-reference/frontend/src/components/partner/steps/DynamicRequirementsStep.tsx`, `lib/partner/roleRequirementsSchema.ts` | Each partner_type has its own questionnaire (e.g. manufacturer needs categories+MOQ+lead-time+packaging formats; print provider needs supported formats+materials; logistics needs regions+modes) | partial — iLaunchify has `ServiceProfileForm.tsx` with hardcoded fields per type (`MANUFACTURING`/`COPACKING`/`LABEL_PRINTING`); capability stored as JSON; missing 2 of the 5 FOD partner types |
| MOQ + lead-time fields | iLaunchify's form mirrors what FOD captured (`moqMin`/`moqMax`/`leadTimeStockDays`/`leadTimeCustomDays`) | per-type capability | present — `apps/partner/src/app/(onboarding)/onboarding/service/ServiceProfileForm.tsx:28-32` |
| Categories served | iLaunchify free-text + FOD selected from `businessCategory` enum | per-service | partial — iLaunchify keeps as JSON array, no validation/picker against the catalog |
| Container formats / fill types capability lists | `FOD-reference/frontend/src/lib/partner/roleRequirementsSchema.ts` | Structured picker for jar/bottle/pouch + dry/liquid/gel etc | partial — iLaunchify has stub fields (`containerFormats`/`fillTypes` passthrough from `initial`) but no picker UI |
| Certifications free-text | both | comma-separated string | present (iLaunchify saves to `capabilities.certifications`) |
| Certifications structured (cGMP, SQF, BRC, organic, kosher, halal) at top level | `FOD-reference/migrations/20250830022506_init/migration.sql:73` | `Partner.certifications: TEXT[]` | missing |
| File uploads (cert documents, business license, insurance, facility photos, partner logo, certificate of incorporation, ID document) | `FOD-reference/frontend/src/lib/partner/onboardingTypes.ts:23,27,35,37`, `partnerVerificationSectionFiles.ts` | File handling integrated with verification sections | missing — iLaunchify documents page says "email PDFs to partners@" (V1.5+ TODO) |
| File-stub model + dedupe + verification-section grouping | `FOD-reference/frontend/src/lib/partner/collectPartnerFileStubs.ts`, `partnerVerificationSectionFiles.ts` | Server-side helpers to organize uploaded files by review section | missing |
| Certificate validator (OCR/parse uploaded certs) | `FOD-reference/frontend/src/app/dashboard/partner/(center)/next-gen/CertValidator.tsx` | Validates uploaded certification documents | missing |
| Disclosure level (FULL / CITY_STATE / ANONYMOUS) | n/a in FOD | n/a | present (iLaunchify advance) — `DisclosureLevel` enum at `packages/db/prisma/schema.prisma:71-77` |
| Die-cut template support per print partner | n/a in FOD | n/a | present (iLaunchify advance) — `PartnerServiceDieCut` model at `schema.prisma:852` |
| Edit capabilities in-portal post-activation | `FOD-reference/frontend/src/app/dashboard/vendor/products/[id]/edit/page.tsx` | Vendor can edit ingredients/nutrition/allergens via the product edit form | missing — iLaunchify services page says "Editing your service profile in-portal lands in V1.1. Until then, email partners@" |

---

## 6. Payouts / financial views

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| Payments dashboard page | `FOD-reference/frontend/src/app/dashboard/vendor/payments/page.tsx` | Placeholder page in FOD (cards only, no data) | missing |
| Payment stats endpoint (configurable period) | `FOD-reference/frontend/src/app/api/vendor/payments/stats/route.ts` | GET `?period=month` proxy to backend | missing |
| Payouts list endpoint | `FOD-reference/frontend/src/app/api/vendor/payments/payouts/route.ts` | Lists vendor payouts | missing — iLaunchify queues Transfers but partner has no visibility |
| Refunds list endpoint | `FOD-reference/frontend/src/app/api/vendor/payments/refunds/route.ts` | Lists refunds debited from this vendor | missing |
| Payments breakdown endpoint | `FOD-reference/frontend/src/app/api/vendor/payments/breakdown/route.ts` | Per-order revenue breakdown | missing |
| Payments report endpoint | `FOD-reference/frontend/src/app/api/vendor/payments/report/route.ts` | Downloadable statement | missing |
| Backend payment-management routes | `FOD-reference/backend/payment-management*.js`, `backend/services/payment-processing*` | Stripe integration | partial — iLaunchify has `packages/payments/` with charges/transfers/refunds models + webhook handler |
| Stripe Connect account fields on User | partial in FOD (`profileData` JSON) | n/a | present (iLaunchify advance) — `User.stripeAccountId` + `stripeAccountStatus` |
| Partner clawback model for refunds/disputes | missing | n/a | present (iLaunchify advance) — `PartnerClawback` model at `schema.prisma:497-514` |
| Earnings card on dashboard | not present in FOD dashboard | n/a | missing — iLaunchify dashboard shows orders KPIs but no earnings tile |
| Subscription tier + maxStores/maxPrinters allocator | `FOD-reference/frontend/src/app/dashboard/vendor/subscriptions/StoreAllocator.tsx`, `dashboard/partner/(center)/subscriptions/PrinterScheduler.tsx` | Usage progress bar against subscription tier limits | missing |

---

## 7. Admin → partner management

| Feature | FOD path | Description | iLaunchify |
| --- | --- | --- | --- |
| All Partners overview (4 cards: print providers / packaging suppliers / fulfillment / packaging engineers) | `FOD-reference/frontend/src/app/dashboard/admin/partners/page.tsx` | Static overview screen with role-grouped tiles + "Add New Partner" CTA | partial — `apps/admin/src/app/(dashboard)/partners/page.tsx` groups by status (UNDER_REVIEW / ACTIVE / IN_PROGRESS / INVITED / SUSPENDED / DRAFT) rather than by partner type |
| Vendors CRM table | `FOD-reference/frontend/src/app/dashboard/admin/vendors/page.tsx` | Full CRUD table for vendors with filters, pagination, rating, badges, add/edit/delete dialogs | partial — iLaunchify partner list is read-only with link to detail |
| Vendor detail / edit | `FOD-reference/frontend/src/app/api/admin/vendors/[id]/route.ts` | PATCH/PUT/DELETE | partial — iLaunchify has `apps/admin/src/app/(dashboard)/partners/[partnerId]/page.tsx` (read-only detail + activate/suspend/request-changes actions in `actions.ts` + `PartnerActions.tsx`) |
| Vendors_new (newer admin table iteration) | `FOD-reference/frontend/src/app/dashboard/admin/vendors_new/page.tsx` | WIP redesign | n/a |
| Vendor verification queue | `FOD-reference/frontend/src/app/dashboard/admin/vendor-verification/page.tsx` (uses `lib/vendor-verification-store.ts`) | List of vendors awaiting verification with per-section status (business / facility / documents / publicProfile) + admin mode toggles (manual/automatic) + publicVerified flag + autoBadgeSync flag + notes per section | missing |
| Vendor verification per-vendor detail API | `FOD-reference/frontend/src/app/api/admin/vendor-verification/[vendorId]/route.ts` | GET/PATCH per-section status + writes back to mock user store so partner sees update in real time | missing |
| Vendor verification list API | `FOD-reference/frontend/src/app/api/admin/vendor-verification/route.ts` | Lists all vendor users qualifying for verification + ensures record | missing |
| Section template (business identity / facility & capabilities / compliance documents / public profile badges) | `FOD-reference/frontend/src/lib/vendor-verification-store.ts:47-72` | 4-section verification framework with notes/verifiedAt/verifiedBy fields | missing |
| Status sync between verification record and user partnerApprovalStatus/partnerOnboardingStatus | `FOD-reference/frontend/src/app/api/admin/vendor-verification/[vendorId]/route.ts:38-100` | When admin verifies/rejects, also PATCH the user record so partner-facing nav updates | missing |
| Partner verification UI helpers (status label + MUI color) | `FOD-reference/frontend/src/lib/vendorVerificationUi.ts` | Shared formatting helpers | missing |
| List of users qualifying for manufacturer verification | `FOD-reference/frontend/src/lib/vendorVerificationUsers.ts` (`MANUFACTURER_PARTNER_ROLES`, `userQualifiesForManufacturerVerification`) | Role/onboarding-state filter for who is shown in the verification queue | missing |
| Admin users → vendors filter view | `FOD-reference/frontend/src/app/dashboard/admin/users/vendors/page.tsx` | Filtered users table showing only manufacturer-role accounts with status badges | missing |
| Admin providers tab | `FOD-reference/frontend/src/app/dashboard/admin/providers/page.tsx` | (Mostly empty file in FOD) | n/a |
| Approve / reject partner (with email notification) | `FOD-reference/backend/services/partnerService.js:58-105` | `approvePartner` + `rejectPartner` send templated emails on decision | partial — iLaunchify has `activatePartner` / `suspendPartner` / `requestChanges` server actions; no email side-effects |
| Partner CRUD (list / create / update / delete) | `FOD-reference/backend/services/partnerService.js:4-56` | REST endpoints | partial — iLaunchify has activate/suspend/request-changes; missing create (creation happens only via apply form) and delete |
| Admin reads vendor profile / payments / orders via cross-app routes | `FOD-reference/frontend/src/app/api/providers/route.ts` (PrintProviderResponse models in `services/python/order-management/app.py:335-411`) | Admin can configure print providers (CRUD) and route orders | partial — iLaunchify admin can view partner detail (services + Stripe status) but cannot edit |
| Admin "Add New Partner" CTA | `FOD-reference/frontend/src/app/dashboard/admin/partners/page.tsx:30` | Admin-initiated partner creation flow | missing |
| Admin partner CRM stats (24 active providers etc) | `FOD-reference/frontend/src/app/dashboard/admin/partners/page.tsx:38-50` | Counts per partner type | missing |
| Vendor onboarding mock-store coupling | `FOD-reference/frontend/src/lib/mockApi.ts`, `lib/mock-user-store.ts` | Mock backend that the verification flow PATCHes | missing (iLaunchify uses real DB) |

---

## 8. Inventory: features present in iLaunchify

These FOD features exist in iLaunchify, in some form:

1. Public marketing pages for partners — `apps/partner/src/app/partners/{copackers,manufacturers,print,thanks}/page.tsx`
2. Self-serve partner lead-capture / apply form — `apps/partner/src/app/partners/apply/page.tsx` + `actions.ts` + `LeadForm.tsx` (with Zod validation; creates User + Partner + draft PartnerService idempotently)
3. Magic-link login for partners — `apps/partner/src/app/(auth)/login/page.tsx` + `LoginForm.tsx` + `check-email/page.tsx`
4. Multi-step onboarding wizard (5 steps vs FOD's 7) — `apps/partner/src/app/(onboarding)/onboarding/{page,company,service,documents,stripe,review}/`
5. Company details form — `apps/partner/src/app/(onboarding)/onboarding/company/CompanyForm.tsx` (covers companyName, legalName, websiteUrl, contactPhone, full address)
6. Service profile form (per-type capability JSON for MANUFACTURING/COPACKING/LABEL_PRINTING) — `apps/partner/src/app/(onboarding)/onboarding/service/ServiceProfileForm.tsx`
7. Disclosure level picker (FULL/CITY_STATE/ANONYMOUS) — same file (iLaunchify net-new vs FOD)
8. Submit-for-review action — `apps/partner/src/app/(onboarding)/onboarding/review/SubmitForReviewButton.tsx` + `actions.ts`
9. Stripe Connect onboarding for partners — `apps/partner/src/app/(onboarding)/onboarding/stripe/{page,ConnectButton,actions}.ts` (FOD only had this on the architecture wishlist)
10. Partner dashboard home with pending/in-prod/services-count tiles — `apps/partner/src/app/(dashboard)/dashboard/page.tsx`
11. Partner orders inbox grouped by section (PENDING_ACCEPT → DELIVERED) — `apps/partner/src/app/(dashboard)/orders/page.tsx`
12. Dispatch detail with accept/decline (with reason + notes), mark-producing, mark-ready, ship-with-tracking actions — `apps/partner/src/app/(dashboard)/orders/[dispatchId]/{page,DispatchActions,actions}.tsx` (iLaunchify net-new vs FOD: FOD operated on whole orders, never split into per-partner dispatches)
13. Services list (read-only) — `apps/partner/src/app/(dashboard)/services/page.tsx`
14. Settings (account + Stripe + notification preview) — `apps/partner/src/app/(dashboard)/settings/page.tsx`
15. Admin partner list grouped by status — `apps/admin/src/app/(dashboard)/partners/page.tsx`
16. Admin partner detail view — `apps/admin/src/app/(dashboard)/partners/[partnerId]/page.tsx`
17. Admin partner actions (activate / suspend / request changes) with status guards + activation-cascades-to-services in transaction — `apps/admin/src/app/(dashboard)/partners/[partnerId]/{PartnerActions,actions}.tsx`
18. Stripe webhook handler for partner side — `apps/partner/src/app/api/webhooks/stripe/route.ts`
19. Order routing transfer queueing on shipment (auto-create Transfer in PENDING) — `apps/partner/src/app/(dashboard)/orders/[dispatchId]/actions.ts:163-183`
20. Schema: `PartnerStatus` enum (DRAFT/INVITED/IN_PROGRESS/UNDER_REVIEW/ACTIVE/SUSPENDED) with strict state-machine transitions enforced in admin actions

---

## 9. Inventory: features missing or partial in iLaunchify

### Onboarding flow
1. **Conditional step engine** — FOD adds/removes wizard steps based on registration region + business category + partner type combination. iLaunchify has a flat 5-step flow for everyone.
2. **Region-aware field policy** — EIN required only for US, VAT shown only for EU/UK. Missing.
3. **Partner-type taxonomy** — FOD had 5 partner types (PRINT_PROVIDER, PACKAGING_SUPPLIER, FULFILLMENT, PACKAGING_ENGINEER, LOGISTICS) plus the vendor/manufacturer role. iLaunchify has 3 `ServiceType` values; missing PACKAGING_SUPPLIER, FULFILLMENT, PACKAGING_ENGINEER, LOGISTICS.
4. **Role-questionnaire engine** — DynamicRequirementsStep loaded a per-role JSON schema with contextual supplements. Missing.
5. **KYB beneficial-owner sub-form** — collected before Stripe. iLaunchify defers entirely to Stripe Connect.
6. **Compliance attestations step** — US food traceability ack + EU GDPR ack. Missing.
7. **API / integration mode step** — partner chooses platform vs API integration + selects API scopes. Missing (and `ApiClient`/`ApiKey` schema tables are also missing).
8. **Wizard payload persistence + resume** — saved to localStorage and reloadable. Missing.
9. **File upload UI** — iLaunchify documents page tells partners to email PDFs to a mailbox; no R2 storage or upload widget yet (admitted as V1.5+ in code).
10. **Verification-section file grouping** — files grouped under business/facility/documents/publicProfile for admin review. Missing.
11. **Terms / privacy / DPA acceptance timestamps** captured at review. Missing.
12. **Post-approval plans selection page** — three tiers (basic/standard/premium). Missing.
13. **Welcome page** post-signup. Missing (iLaunchify lands user directly in dashboard).

### Dashboard
14. **Pre-approval restricted shell** — partner sees a minimal sidebar + "review" landing while application is pending/needs_changes/rejected. iLaunchify gates only via partner-status check; no shell switching.
15. **My Application read-only view** — submitted application + per-section verification status + admin notes + "Edit section" deep links back into wizard. Missing.
16. **Rejected-success training page** — education content for rejected partners. Missing.
17. **Partner Center branded header** — custom green-on-cream header for partner shell. Missing.
18. **Analytics page** — FOD stub only; iLaunchify missing entirely.
19. **Compliance Center page** — partner-owned cert management. Missing.
20. **Messaging page** with vendor↔admin chat (FOD had a full inbox UI with folders/composer; the in-shell stub is in Partner Center). Missing.
21. **Notifications preferences** with per-channel and per-event toggles + quiet hours. Missing.
22. **Help / FAQ page**. Missing.
23. **Subscriptions / plan management page**. Missing.
24. **Store-slot allocator** (subscription-tier `maxStores` usage card). Missing.
25. **Printer-slot allocator** (subscription-tier `maxPrinters` usage card). Missing.
26. **Vendor products catalog page** with channel chips (Shopify/Amazon/eBay/WooCommerce/Etsy), per-account column preferences, search, pagination. Missing.
27. **Vendor product builder wizard** (`/dashboard/vendor/products/new`). Missing.
28. **Vendor product edit form** with nutrition + allergens + ingredient categories. Missing.
29. **Vendor recipes library** page. Missing.
30. **Public per-manufacturer page** at `/[manufacturerSlug]` with verified badges driven by admin's `publicVerified` + `autoBadgeSync` flags. Missing.

### Order workflows
31. **Quality-check sub-states** — `QUALITY_CHECK` / `FAILED_QC` / `enter-quality-check` / `complete-quality-check` / `skip-to-fulfillment` actions. Missing.
32. **`IN_TRANSIT` + `mark-in-transit` + `mark-delivered` partner-driven status updates** (iLaunchify has the enum values but no partner-facing actions for them).
33. **Auto-cancel on accept deadline** — `autoCancelAt` field + executor job. Field is partially present (`acceptDeadlineAt` on Dispatch + `TIMED_OUT` enum value) but no executor.
34. **Vendor internal notes** on orders (private, not surfaced to creator). Missing.
35. **Per-state timestamps** (acceptedAt / productionStartedAt / qualityCheckStartedAt / fulfillmentReadyAt / completedAt / cancelledAt / rejectedAt / closedAt). iLaunchify tracks only shippedAt/deliveredAt.
36. **`OrderStatusEvent` audit log** with actor + role + message + private internalPayload. Missing.
37. **Print-jobs queue** specific to print partners. Missing.
38. **Compliance alerts on partner side** (block shipment when an order's recipe has open compliance issues). Missing.
39. **Nutrition alert component** inline on orders. Missing.
40. **Mock orders fallback** for offline dev. Missing.
41. **Shipping integration endpoint** + carrier configuration. Missing.
42. **Provider stats endpoint** feeding live dashboard KPIs. Missing.
43. **Return-requested / refund / exception states** on orders. Missing.

### Capability profile management
44. **In-portal capability editing** post-activation. iLaunchify services page tells partners to email partners@ for edits (admitted as V1.1).
45. **Structured container-format / fill-type pickers** (UI). Stubs exist in iLaunchify but no picker.
46. **Top-level `Partner.certifications[]` field** (vs nested in capabilities JSON). Missing.
47. **File-upload widget for cert documents** (insurance, business license, facility photos, partner logo). Missing.
48. **Certificate validator (OCR)** at `next-gen/CertValidator.tsx`. Missing.

### Payouts / financial
49. **Payments dashboard page**. Missing.
50. **Payment stats endpoint** (`?period=`). Missing.
51. **Payouts list** (partner-visible). Missing.
52. **Refunds list** (partner-visible debits). Missing.
53. **Payments breakdown** per-order. Missing.
54. **Downloadable statement / report**. Missing.
55. **Earnings KPI tile on dashboard**. Missing.
56. **Subscription tier model** + tier-driven allocator UI. Missing.

### Admin views
57. **Vendor Verification queue page** with per-section (business / facility / documents / publicProfile) status pickers + admin notes per section + verifiedAt/verifiedBy stamps + manual/automatic mode toggle + publicVerified flag + autoBadgeSync flag. Missing — this is the single largest gap on the admin side.
58. **Vendor verification list + per-vendor detail API**. Missing.
59. **Status sync from verification → user.partnerApprovalStatus / partnerOnboardingStatus** so partner UI updates in real time. Missing.
60. **Admin partners overview grouped by partner type** (print providers / packaging suppliers / fulfillment / packaging engineers cards). iLaunchify groups by status instead.
61. **Add-New-Partner CTA** (admin-initiated partner creation). Missing.
62. **Full Vendors CRUD table** (filters, search, pagination, rating, badges, add/edit/delete dialogs). iLaunchify list is read-only.
63. **Vendor edit dialog**. Missing.
64. **Admin users → vendors filter view**. Missing.
65. **Email notifications on approve/reject** (FOD's `backend/services/partnerService.js` calls `transporter.sendMail`). Missing.
66. **Print-providers admin CRUD** at `services/python/order-management/app.py:335-411`. Missing.

### Data model
67. **Top-level partner `partnerType` enum** with values DISTRIBUTOR / WHOLESALER / RETAILER / MARKETPLACE / BRAND_AGENCY (separate from PartnerService.type). Missing.
68. **Partner regions[] + industries[] + certifications[] + address JSON** at the Partner level. Missing.
69. **ApiClient + ApiKey models** for partner OAuth. Missing.
70. **Order quality-check / hold / return / failed-QC / failed-production / exception states**. Missing (iLaunchify has subset).
71. **OrderStatusEvent audit model**. Missing.
72. **VerificationSection model** (or persistent representation). FOD kept verification in an in-memory store keyed off mock users, but the section taxonomy + status enum + per-section notes are first-class concepts. Missing entirely.
73. **GlobalPlatformConfig scope `partner_onboarding`** for feature flags. Missing.

---

## Notable patterns

- **In-memory verification store with bidirectional sync** — FOD's `lib/vendor-verification-store.ts` keeps per-vendor verification records in a `globalThis` Map; when an admin updates a section the route handler also PATCHes `/api/auth/users/{id}` to sync `status` + `partnerApprovalStatus` + `partnerOnboardingStatus` so the partner's own UI updates without re-fetching. The verification record's `overallStatus` is computed (`computeOverallStatus`) as a precedence: any rejected → rejected; any needs_changes → needs_changes; all verified → verified; else pending. Re-implementing this with real DB rows would cleanly map to a `PartnerVerificationSection` table + a computed `Partner.overallVerificationStatus`.

- **Conditional onboarding step builder** — `partnerOnboardingFlow.ts` uses small predicate functions (`targetsUnitedStates`, `isFoodRelatedBusiness`, `touchesPhysicalSupplyChain`, `needsUsFoodComplianceSection`, `needsEuComplianceSection`, `needsIntegrationStep`) to compute which steps appear in `buildPartnerOnboardingSteps()`. The same predicates power `getPartnerInfoFieldPolicy()` (EIN/VAT visibility) and `buildRoleRequirementsContext()` (US food + multi-region contextual supplements). The design separates "which steps" from "which fields on a step" cleanly.

- **Restricted-shell pattern** — `partnerNavAccess.ts` introduces `isPartnerSidebarRestricted`, `isPartnerCenterShellRestricted`, `isServiceProviderApproved`, and `partnerMayAccessPartnerOnboarding` helpers. Each is a small pure function over `{role, partnerApprovalStatus, partnerOnboardingStatus, onboardingStep}`. The dashboard layout reads them to decide whether to render the restricted shell, the full shell, or to redirect. iLaunchify has only a single status check on the page; the FOD pattern of "shell mode + per-route guard helpers" is more composable.

- **Per-account table column preferences** — `lib/vendor/vendorOrderTablePreferences.ts` + `vendorProductTablePreferences.ts` persist column visibility under `LOCKED_COLUMN_IDS` (always shown) + `OPTIONAL_COLUMN_IDS` (up to `MAX_OPTIONAL_VISIBLE`). Versioned schema (`VENDOR_ORDER_TABLE_PREFS_VERSION`) so migrations don't blow up the user's local prefs.

- **Verification-section ↔ onboarding-step jump map** — `partnerVerificationSectionNav.ts` lets the "My Application" view deep-link "Edit section" buttons back to the right wizard step. This is the kind of cross-flow plumbing that makes the rejected-partner experience pleasant. iLaunchify's wizard is linear, so this concept doesn't yet apply.

- **FOD vs iLaunchify modeling shift** — FOD modeled `vendor` and `partner` as separate `UserRole`s with separate but parallel dashboards (`/dashboard/vendor/*` for manufacturer/co-packer shape, `/dashboard/partner/(center)/*` for the broader Partner Center). iLaunchify collapses both into one `PARTNER` role with a `PartnerService.type` enum. That collapse loses the partner-type taxonomy (5 → 3) and the dual-shell UX, but is structurally simpler.
