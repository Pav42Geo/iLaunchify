# FOD Recovery Plan

How we get the working FOD operational surface back into iLaunchify, given a "functional parity first, then optimize" approach. This plan covers **Partner-facing surfaces** and the **Admin dashboard**. Creator and storefront work continues on the existing roadmap and is not affected.

The plan is built directly on two structured audits — `docs/audit/FOD_PARTNER_AUDIT.md` and `docs/audit/FOD_ADMIN_AUDIT.md` — which inventory every relevant FOD feature with file paths. Reference those for ground truth. This document is the synthesis: what's already done, what's actually missing, what to skip, and the order to rebuild in.

---

## 1. The honest summary

FOD shipped roughly **115 partner-related features** and **~50 admin pages + ~36 admin API handlers**. iLaunchify has reproduced something like **20–25 of those** in cleaner form, has **partial coverage on another ~15**, and is **missing the bulk** of the operational surface. That sounds bad until you separate signal from noise: of the things FOD shipped, a meaningful fraction was either mock-only UI, speculative experiments (blockchain compliance, ML analytics), or dead links in the sidebar. The audits separate "real and load-bearing" from "mock-only" from "obsolete" — what's outlined below ports only the real, load-bearing pieces.

The most important takeaway: **the gap is concentrated in three areas**. Everything else is tractable once those are in place.

1. **Partner verification + activation** — FOD had a 4-section verification framework (business / facility / documents / public profile) with admin notes, per-section status, and bidirectional sync to the partner's UI. iLaunchify only has activate/suspend/request-changes on the whole partner record. This is the single biggest admin productivity gap.
2. **Partner-facing earnings & payouts** — iLaunchify queues `Transfer` rows when dispatches ship, but partners have no UI to see earnings, payouts, refunds, or statements. FOD had five payments endpoints and a dedicated Payments page. Without this, partners have no idea what they've earned until they check Stripe directly.
3. **Compliance admin console + market/rule-pack management** — iLaunchify has a working compliance *engine* but zero admin surface to view, edit, test, audit, or assign rule packs. FOD had a 6-tab Languages & Markets console plus markets/themes/global-config REST APIs.

Most of the rest is incremental scope: file uploads, conditional onboarding, in-portal profile editing, notification preferences, audit log viewer.

---

## 2. What iLaunchify already has (so we don't re-port it)

These are the FOD-equivalent features that exist in the rebuild today, often in a cleaner form than FOD shipped. They're listed so the recovery work doesn't accidentally duplicate them.

**Partner side**
- Public marketing pages (`apps/partner/src/app/partners/{copackers,manufacturers,print,thanks}`)
- Self-serve lead-capture / apply form with Zod validation, idempotent User + Partner + draft service creation
- Magic-link login
- 5-step onboarding wizard (company → service → documents → stripe → review)
- Company details form (legal name, website, contact, full address)
- Service profile form for MANUFACTURING / COPACKING / LABEL_PRINTING with MOQ, lead time, capabilities as JSON
- Disclosure level picker (FULL / CITY_STATE / ANONYMOUS) — iLaunchify net-new vs FOD
- Stripe Connect onboarding — iLaunchify net-new (FOD only had it on the wishlist)
- Partner dashboard with pending/in-prod/active-service tiles
- Partner orders inbox grouped by status section
- Dispatch detail with accept/decline-with-reason, mark-producing, mark-ready, ship-with-tracking — iLaunchify net-new (FOD operated on whole orders, not per-partner dispatches)
- Services list (read-only)
- Settings page (account + Stripe + notification preview)
- Stripe webhook handler for partner side
- Automatic Transfer queueing on shipment

**Admin side**
- Server-side `requireRole('ADMIN')` enforcement (cleaner than FOD's client-only hook with hardcoded demo password)
- Leads inbox with qualify/disqualify + magic-link invite
- Partners list grouped by status (DRAFT / INVITED / IN_PROGRESS / UNDER_REVIEW / ACTIVE / SUSPENDED)
- Partner detail with company / services / die-cut support / Stripe Connect view
- Partner state-machine actions (Activate / Request changes / Suspend / Reactivate) with transitions enforced in transaction
- Orders list (real Prisma) with "Needs attention" bucket for ON_HOLD / DISPUTED / ROUTING
- Order detail (items / charge / dispatches / transfers / internal notes — read-only)

**Don't re-port** any of the above; the recovery plan extends them where partial.

---

## 3. What we explicitly skip from FOD

These features exist in the FOD codebase but **do not get ported**. Reasons vary: speculative, obsolete, mock-only, or replaced by a better iLaunchify pattern.

- **Phase 6 Blockchain compliance** — speculative, no clear value
- **Enterprise / Production migration / Final Production cluster** — artifacts of FOD's dual-write migration; iLaunchify doesn't have that legacy
- **ML Analytics** — no ML in iLaunchify yet
- **AI Design Studio (compliance subroute)** — speculative
- **Compliance test runner page** — replaceable with API-level tests
- **Templates page** — FOD disabled it ("MUI v7 compatibility")
- **SystemTestRunner** — browser-based smoke tests; CI handles this better
- **USDA monitoring dashboards** — port only when iLaunchify wires actual USDA sync
- **Fraud review stub** — never built in FOD either
- **Demo admin login fallback** — replaced by Auth.js magic-link
- **Backend `admin-routes.js` triplet** (`admin-routes.js`, `admin-routes-prisma.js`, `admin-routes-old.js`) — iLaunchify has no separate Express backend
- **Mock-only FOD pages** that look real but render hard-coded arrays: Returns & Refunds dialog, Fulfillment status board, Label moderation queue, Marketing subpages, most `settings/*` subpages, all `partners/<type>` and `users/<role>` subroutes, Barcodes/QR codes overview, Creators single-row table, Providers single Printify row
- **FOD's `users/page.tsx` mega-page** — it's a single 1000+ line file doing 8 jobs. Recover the *real* functionality from it (Activity Log viewer, invite, RBAC if needed) decomposed into proper routes; don't port the page itself
- **Vendor and Supplier directories as separate CRUD tables** — iLaunchify's single `Partner` model with discriminating `PartnerService.type` is the cleaner pattern. Recover the *functionality* (search, edit, filter) into the existing partners view rather than splitting back into two tables
- **Hardcoded "Recent Activity" cards** on FOD's admin dashboard home — port from real `AuditLog` instead
- **FOD's RBAC scaffolding** (`permissions Json?` field never used, client-state-only permission sets) — iLaunchify's single ADMIN role is enough for V1; revisit when actually needed

---

## 4. What needs to come back, in priority order

Three phases. Each phase has a clear thesis and a tight scope. After Phase A you can run a closed beta; after Phase B you have operational efficiency for scaling onboarding; after Phase C you have the polish to remove "feels half-built" rough edges.

### Phase A — Unblock launch (≈2–3 weeks)

**Thesis:** Without these, you cannot run a real partner through onboarding and out the other side cleanly, and you cannot scale partner verification past a handful without burning out.

| # | Feature | Effort | Why now |
| --- | --- | --- | --- |
| A1 | **Vendor Verification queue** with 4-section model (business / facility / documents / publicProfile), per-section status + admin notes + verifiedAt/verifiedBy stamps, bidirectional sync to partner UI | L | Single biggest admin gap. Today, partner status transitions are coarse (activate/suspend/request-changes on the whole record); FOD let admins approve section-by-section with notes. This is the productivity multiplier for onboarding 10+ partners. |
| A2 | **Partner Payments page** — earnings KPI tile + payouts list + refunds list + per-order breakdown | M | Partners blind to their own earnings is a launch-blocker for trust. Data already exists (`Charge`, `Transfer`, `Refund`, `PartnerClawback` models); needs UI + 4 endpoints. |
| A3 | **File upload widget** on documents step (R2 storage + file-stub model + section grouping) | M | Currently the documents step tells partners "email PDFs to partners@" — does not scale. R2 is already in the architecture; needs the wiring + DB model. |
| A4 | **My Application page** (read-only of submitted application + per-section verification status + admin notes + "Edit section" deep links) | S | Once a partner submits, they have no visibility into where their review stands. Pairs with A1 (the queue produces the data this page reads). |
| A5 | **In-portal capability editing** post-activation | S | The form already exists for onboarding. Today the services page tells partners "email partners@ for edits." Just ungate the form for ACTIVE partners and persist via the same server action. |
| A6 | **AuditLog viewer (admin)** | S | Schema model + one list page. Critical for accountability once admins start making activation/suspension decisions, and trivial to wire because everything else writes to it already. |
| A7 | **Restricted shell pattern for pre-approval partners** | S | While IN_PROGRESS or UNDER_REVIEW, show a minimal partner shell pointing to My Application + Help. FOD's `partnerNavAccess.ts` is a clean reference; iLaunchify currently throws partners into the full dashboard regardless of status. |

**End-of-phase test:** A real partner can apply → upload docs → an admin can verify section-by-section with notes → the partner sees status update in their My Application page → partner is activated → partner sees earnings tile → partner edits their own MOQ.

### Phase B — Operational efficiency (≈3–4 weeks)

**Thesis:** Phase A made the platform usable. Phase B makes it survivable at 10× the partner count and 100× the order volume.

| # | Feature | Effort | Why now |
| --- | --- | --- | --- |
| B1 | **Notification system** — model + per-channel preferences (email + in-app) + quiet hours + admin notification center | L | Today partners only know they have new orders if they check the dashboard. Critical at scale. |
| B2 | **Conditional onboarding step engine** — region-aware (EIN for US, VAT for EU/UK) + role-aware (FULFILLMENT skips production fields) + market-compliance step for US food | M | Removes friction for partners and unblocks expanding beyond US food category. The pattern in `partnerOnboardingFlow.ts` is small predicate functions; clean to re-implement. |
| B3 | **Admin product moderation** — list + approve/reject actions on creator-published products, with bulk status, revert, and inventory adjust | M | Once creators start publishing to storefronts, admins need an override path for compliance escalations and recalls. |
| B4 | **Partner CRM upgrades** — search + filter by type + pagination on admin Partners list; group by partner type as an optional view (alongside the existing status grouping) | S | List today is paginated only by what fits on screen. At 50+ partners, becomes unusable. |
| B5 | **Invite-by-role (admin)** — generic "invite a creator" or "invite a partner" magic-link flow, separate from lead-qualification | S | Today admin can only invite a partner *after* they apply. Need to seed partnerships proactively (sales-led onboarding). |
| B6 | **Quality-check + IN_TRANSIT sub-states** on dispatch FSM + per-state timestamps + `OrderStatusEvent` audit log | M | FOD had 18 order states; iLaunchify has 8. Q-check and in-transit are needed for partners doing batch production. The audit log gives admins a forensic view. |
| B7 | **Auto-cancel executor** for dispatches past `acceptDeadlineAt` | S | The field already exists (`TIMED_OUT` enum is wired); needs a cron/scheduled function to actually flip stale dispatches. |
| B8 | **Partner Messaging (admin ↔ partner)** | M | Today the only async comms is email outside the platform. Light-weight inbox UI (folders + composer) is enough for V1. |

**End-of-phase test:** Onboard a UK partner who automatically sees VAT instead of EIN, gets an email when a new dispatch arrives, accepts within the auto-cancel window, marks production complete → quality check → ready → shipped → in-transit → delivered with each transition recorded in OrderStatusEvent. Admin sees the audit trail and can search partner CRM for "UK + LABEL_PRINTING."

### Phase C — Polish + multi-market readiness (≈3–4 weeks)

**Thesis:** This phase closes the operational console gaps that aren't blockers but make iLaunchify feel like a real product, and prepares the platform for the EU/EFSA market that the FOD docs flagged for V2.

| # | Feature | Effort | Why now |
| --- | --- | --- | --- |
| C1 | **Languages & Markets / Compliance admin console** — 6 tabs (Markets / RulePacks / Translations / TemplateSpecs / Assignments / Settings) | XL | Today compliance rule packs are JSON files on disk. To onboard a new market or update a rule, devs edit JSON and redeploy. The console makes this an ops function. Big effort but unblocks every non-US market expansion. |
| C2 | **Vendor products catalog page** (partner-facing list of their own published products with channel chips, search, pagination, per-account column prefs) | M | Today partners can see orders but not their own product inventory. Needed once partners list multiple SKUs. |
| C3 | **Theme system** (admin theme registry + storefront theme editor) | M | Currently each storefront pulls brand colors from `Brand` metadata; FOD had a full visual theme editor with gallery and activate flow. Nice-to-have until creators want richer customization. |
| C4 | **Public per-manufacturer page** at `/[manufacturerSlug]` with verified-badge logic | S | Marketing surface for partners. Drives organic discoverability and signals trust. |
| C5 | **Analytics tiles** for admin dashboard (GMV, partner activation rate, compliance pass rate) — derive from existing data, no separate metrics service | M | Today admin home is empty + fake activity feed. Real numbers > fake numbers. |
| C6 | **Partner subscription tiers + slot allocator** (basic / standard / premium) | M | Monetization hook. Worth slotting in here so the data model is correct from launch; UI can ship later. |
| C7 | **Plans selection page** post-approval | S | UI for C6. |
| C8 | **Rejected-success training screen** for declined partners + welcome page post-signup | S | Small UX touches that make rejection feel less brutal and approval feel more celebratory. |

**End-of-phase test:** Add a new EU market via admin console, assign a new rule pack, publish a product, see it on the public manufacturer page with a verified badge, view GMV by market on the admin dashboard.

---

## 5. What this means for the master roadmap

The original 12-week plan landed you at "closed beta" by Week 12. With this recovery work folded in, you're looking at roughly **6–10 additional weeks** before V1 launch is real, depending on how much of Phase B and C you defer.

| Roadmap slot | Original plan | Adjusted plan |
| --- | --- | --- |
| Weeks 1–10 | Foundation through Storefront | Done ✅ |
| Catalog refactor (interstitial) | n/a | Done ✅ |
| **Weeks 11–13** | Hardening (E2E + OTel + deploy pipelines) | **Phase A — Unblock launch** (verification queue + payments + uploads + my application + audit log) |
| **Weeks 14–17** | Closed beta | **Phase B — Operational efficiency** (notifications + conditional onboarding + product moderation + Q-check states + messaging) |
| **Weeks 18–21** | – | **Phase C — Polish** (compliance console + theme system + analytics + subscription tiers) |
| **Weeks 22–23** | – | **Original Week 11 Hardening** (E2E tests + OTel + Vercel/Fly deploys + load test) |
| **Week 24** | – | **Closed beta** with real users |

Two ways to compress that:
- **Skip Phase C for V1**, ship at Week 17 with operational efficiency but rougher polish. Subscription tiers, theme system, and analytics become V1.1.
- **Skip Phase B partial** — keep B1 (notifications), B3 (product moderation), and B6 (Q-check states), defer B2/B4/B5/B7/B8 to V1.1. Compresses to Week 14.

Recommendation: do **Phase A in full**, then make the Phase B/C call once you've watched a real onboarding happen end-to-end in Phase A. The bottlenecks you see there will tell you which Phase B items are urgent vs cosmetic.

---

## 6. Schema deltas this implies

Worth surfacing so we don't accumulate migration debt. The phases above need these Prisma model additions, in roughly this order:

**Phase A**
- `PartnerVerificationSection` (partnerId, sectionType enum [BUSINESS / FACILITY / DOCUMENTS / PUBLIC_PROFILE], status enum [PENDING / VERIFIED / NEEDS_CHANGES / REJECTED], adminNotes, verifiedAt, verifiedById) — replaces FOD's in-memory store with real rows
- `PartnerFile` (partnerId, sectionType, kind enum [CERTIFICATE / BUSINESS_LICENSE / INSURANCE / FACILITY_PHOTO / LOGO / KYB_ID / CERT_OF_INCORP], r2Key, originalFilename, sizeBytes, uploadedAt) — for the file upload widget
- `AuditLog` (actorId, actorRole, entityType, entityId, action, payload Json, at) — for the audit log viewer

**Phase B**
- `NotificationPreference` (userId, channel enum [EMAIL / IN_APP], eventType, enabled, quietHoursStart, quietHoursEnd)
- `Notification` (userId, kind, title, body, link, readAt, createdAt)
- `OrderStatusEvent` (orderId, dispatchId?, actorId, actorRole, fromStatus, toStatus, message, internalPayload Json, at)
- `Order.autoCancelAt`, per-state timestamps on `OrderDispatch` (acceptedAt, productionStartedAt, qualityCheckStartedAt, fulfillmentReadyAt, deliveredAt)
- Extend `DispatchStatus` enum with QUALITY_CHECK + IN_TRANSIT + FAILED_QC

**Phase C**
- `Market` (code, name, currency, locale[], rulePackId)
- `RulePack` (code, version, marketCode, jsonSchema, publishedAt) — promote rule packs from disk JSON to DB rows
- `Theme` (code, name, json, active, ownerType, ownerId)
- `GlobalPlatformConfig` (scope, type, code, valueJson)
- `Subscription` (userId, tier enum, maxStores, maxPrinters, billingCycleEnd, stripeSubscriptionId)
- `PartnerType` enum (DISTRIBUTOR / WHOLESALER / RETAILER / MARKETPLACE / BRAND_AGENCY) on Partner — separate from PartnerService.type

All additions are forward-only expand migrations. No deletions, no breaking changes.

---

## 7. Open questions to resolve before Phase A starts

A few decisions that change how Phase A is built. Worth deciding now rather than mid-flight.

1. **Verification taxonomy** — keep FOD's 4 sections (business / facility / documents / publicProfile), or rework? Recommendation: keep, since partners have models in their heads already.
2. **File storage** — Cloudflare R2 is in the architecture docs but not wired. Confirm we're sticking with R2 (vs S3, Vercel Blob, Supabase Storage).
3. **Audit log granularity** — log every state transition on Order/Dispatch/Partner/Service, or just transitions actors triggered? Recommendation: every transition, with `actorRole = 'SYSTEM'` for automated ones — debugging is much easier.
4. **My Application "Edit section" deep-links** — should they open the wizard read-only with a single editable section, or fully reopen the wizard? Recommendation: latter, with the wizard remembering completed steps via a server-side `OnboardingProgress` field rather than localStorage.
5. **Partner type expansion (V1 or V1.1?)** — FOD had 5 partner types (print provider, packaging supplier, fulfillment, packaging engineer, logistics); iLaunchify has 3 (manufacturing, copacking, label printing). Do we add the missing two now or defer? Recommendation: defer to V1.1 — adds wizard complexity and Phase A is full enough.

---

## 8. Related audit references

- Full partner feature inventory with file paths: `docs/audit/FOD_PARTNER_AUDIT.md`
- Full admin surface inventory with file paths: `docs/audit/FOD_ADMIN_AUDIT.md`
- Original 12-week roadmap (pre-recovery): `docs/ROADMAP.md`
- Architecture overview: `ARCHITECTURE.md`
- Compliance system design: `docs/COMPLIANCE.md`
- Payments architecture: `docs/PAYMENTS.md`
- User roles + onboarding model: `docs/USER_ROLES.md`, `docs/ONBOARDING.md`
- Storefront model: `docs/STOREFRONT.md`
