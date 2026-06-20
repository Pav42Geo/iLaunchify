# iLaunchify — Launch Readiness Audit

**Date:** 2026-06-01
**Author:** synthesis pass against `CLAUDE.md`, `.claude/memory/INDEX.md`, the auto-memory file, `docs/PLATFORM_SPEC.md`, `docs/MARKETPLACE_DESIGN.md`, `docs/PRODUCTION_ORCHESTRATION.md`, `docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md`, `docs/MANUFACTURER_PRODUCT_BUILDER.md`, `docs/MARKETPLACE_AUDIT_2026-06-01.md`, recent docs (DESIGN_STUDIO_REBUILD, PRINT_FINISHES_PLAN, LANDING_SYSTEM_STUDIO_POP, PAYMENTS, COMPLIANCE, DEPLOYMENT, OBSERVABILITY), the last ~200 commits, the 24-migration history, and the in-tree task list (#1-#587).
**Frame:** decision support for Pavel — fundraise, beta, or finish V1.

---

## 1. Executive summary

iLaunchify is a B2B production marketplace where CPG creators (Tier-1 social influencers + small DTC brand owners) design supplements / functional food + drink / pet products in an in-app Design Studio, place a production order, and have an orchestrated fan-out of manufacturer + printer + co-packer + warehouse partners produce and ship finished inventory — the creator then sells through Shopify / Amazon / TikTok Shop. iLaunchify never touches consumer money; the platform's revenue is creator subscriptions plus a platform fee on each production order plus a marketplace commission against partner payouts.

The build state is far more advanced than typical pre-launch. Across four Next.js 15 apps (`marketing`, `creator`, `partner`, `admin`) and 12 shared packages, the team has shipped a 102-model Prisma schema (24 migrations), a Fabric.js-based Design Studio with R2 uploads + GTIN/barcode + FDA-aware compliance scan (DS-42 through DS-73), a 3-step checkout wizard with multi-partner manifest + adjust-mode (G1-G9 + H1-H5), Stripe Connect + Stripe Billing for creator tiers + production-order subscriptions (V1.5-T1-T6, G6.a-f), partner 5-layer onboarding + 4-section verification queue, a freshly-locked admin v2 surface pattern across every list page, a 4-layer marketplace taxonomy (Slice 1-3 + Niche audit feed), creator brand-asset library (logos + colors + fonts) feeding the canvas, and 8 starter ProductTemplate flows on the partner side. The locked pink / black-pill / neon-green design system is live across all four apps with self-hosted Inter / Bricolage / Fraunces.

What's missing splits into two buckets: a short list of V1-blocking gaps that prevent a first creator from completing a real transaction (a half-dozen pending migrations on Pavel's machine; hardcoded marketplace pricing; no production deployment infrastructure; no Terms-of-Service or compliance disclaimer surfaces; no Sentry; no real partner-cert verification process), and a longer list of operational gaps that don't block a *demo* but do block running a real business (FDA rule pack live-ness, content moderation, support inbox, tax handling, backup strategy). **My recommendation is C — finish V1 first, but a *narrow* V1.** Spend two focused weeks closing the migrations + pricing + legal-surface + Sentry + Stripe-CLI verification gaps; then start a private 5-creator + 3-partner closed beta. Fundraising after a closed beta closes 1 real production order is a categorically stronger pitch than fundraising on architecture; the gap is small enough that grinding it out is faster than negotiating extra dilution to skip it.

---

## 2. What's shipped (the win)

### Marketing site (`apps/marketing`, port 3010)

- Landing home (`/`), Studio-Pop branded (DS-35) + LandingHeader (DS-36-37) + shared LandingFooter (DS-39)
- `/pricing` public — Maker / Builder / Agency cards (DS-24, DS-25)
- `/how-it-works` (DS-26), `/contact-sales` (DS-27), `/start` conversion landing (DS-21)
- `/business` partner landing — alternating light/dark sections (#294-296), BusinessHeader, /business/login + /business/apply
- `/marketplace` — Prisma-backed with sample-data fallback, URL filters + sort (DS-40 A-D), header search (DS-41), hamburger mega menu category nav (R3.17)
- `/marketplace/[category]/[subcategory]/[slug]` — 3-column hero, DetailGallery + ProductDetailConfigurator + CustomizeRail, CertStrip, 5-tab detail (Description / Recipe & Nutrition / Ingredients / Compliance / Packing), related rail (DS-20, R3.1-R3.10)
- `/launch/[niche]` — 8 locked niche landings (DS-17, R3.6-7)
- Auth-aware header across all marketing surfaces (DS-22, R1, R2)

### Creator app (`apps/creator`, port 3000)

- Auth: role-separated signup at `/signup/creator`, magic-link + Google OAuth + dev-login fallback (DS-29-34, #155-157)
- Dashboard + LaunchChecklist drawer with 5 steps (#162-163, #193-202)
- Brand quickstart at `/brands/new` (#199, Phase B.2) + brand asset library at `/brands/[brandId]/assets` (Phase B.1) feeding the canvas
- `/products` list — wide-card per product, tabs + Resume Checkout chip (R6.1, R11)
- `/products/[productId]/customize` — slot replacements, optional ingredients, live nutrition recalc with `IngredientPicker` (W2-IP1-6) wired to USDA + Library + Partner-private sources
- Design Studio under `(studio)` route group — Fabric.js stage with text / images / brand logos / barcode / QR / Nutrition Facts auto-detect, R2 uploads, font drawer with Bunny dynamic loader, ObjectActions + ContextMenu, real Fabric zoom, GroupUngroup, Maker upgrade gate on Export, scanLabelCompliance with FDA min-font enforcement + auto-detected section badge (DS-42 through DS-73)
- Checkout wizard at `/checkout` (route group, no sidebar) — 3 steps: Review Design / Production / Checkout, Stripe-style top bar, sticky ActionsCard, Adjust mode on existing orders (G1-G9, H3.1, R8, R12)
- `/orders` Amazon-style timeline (R10) + `/orders/[orderId]` detail with sticky right rail (R13.a)
- `/settings/plan` — Maker / Builder / Agency cards + self-serve upgrade to Stripe Customer Portal (V1.5-T1-T6)
- `/account/subscriptions` — list and cancel ProductionSubscription rows (G6.f)
- `/notifications` + `/settings/notifications` bell + quiet hours (B1)

### Partner app (`apps/partner`, port 3002)

- Role-separated `/signup/partner` + Phase 1 + Phase 2 5-section onboarding accordion (#155-158, #174-176)
- 10-state partner FSM (DRAFT → INVITED → IN_PROGRESS → UNDER_REVIEW → ACTIVE etc.) with activation + welcome modal on first ACTIVE (#188-192)
- Restricted shell pre-approval; full sidebar on ACTIVE
- `/partner/packaging` — list / new / edit, surfaces, die-line upload, status FSM (W1, #203-206)
- `/partner/certifications` — list + R2 cert PDF upload (W1, #207-211)
- `/partner/products` — list + 4-step stepper + autosave editor shell + submit-for-review (W2, #212-216)
- Editor cards: Basics, Ingredients (slot + replacement + lock), Allergens (auto-derive + override), Variants, Packaging links, Certificates picker, Media hero, CustomMeta, NotesThread, NichesAndTagsCard with `suggestNiches()` (W2-W3, Slice 3B)
- `/partner/orders` dispatch inbox + dispatch detail with full FSM (accept / decline / mark-producing / QC / ship / mark-delivered), per-state timestamps, manifest card (#56, #108, B6, G8.d, H2)
- `/partner/payments` — earnings KPIs + payouts + clawbacks (A2)
- `/partner/services` — in-portal capability editing for ACTIVE partners (A5)

### Admin app (`apps/admin`, port 3003)

- Sidebar v3 locked tree (Pavel re-locked 2026-05-31; `.claude/memory/ilaunchify-admin-sidebar-v3-locked.md`)
- `/admin` Dashboard — 5-row Mission Control, ActivityFeed, dashboard widgets in `packages/ui` (#566-567, 2c1e73a, 288a18a)
- Every list page on the locked v2 surface pattern (cream `#F3EFE8` hero + KPI strip + URL chip filters + sortable `<table>` + RowActionsMenu): `/leads`, `/partners`, `/creators`, `/orders`, `/products`, `/audit`, `/tiers`, `/markets`, `/regions`, `/certificate-types`, `/ingredients`, `/niches/audit`, `/packaging` (#569-577, #585-586, 10a35f7)
- Detail pages: `/leads/[id]`, `/partners/[id]` with verification + activation panel, `/orders/[id]`, `/creators/[id]`, `/products/[id]` review queue with decision FSM + checklist + notes thread, partner promotion criteria progress card (R16.c)
- Inline tier + fee override editor (R15.d, R15.d-fix)
- Plans & Fees editor — inline edit PlanFeature + FeeRule rows (R15.e)
- Bulk promote/demote on creators + partners (R16.b)

### Database, auth, payments, audit

- Prisma + CockroachDB Serverless. 102 models, 99 enums, 24 migrations. Schema at `packages/db/prisma/schema.prisma` (3716 lines)
- `packages/auth` — Auth.js v5, magic link + Google + dev-login, `getCreatorTier`, `hasFeature`, `setCreatorTierWithAudit`
- `packages/audit` — central writer, AuditLog viewer + entity-typed actions
- `packages/payments` — `createTierCheckoutSession`, `cancelTierSubscription`, `createProductionSubscription`, Stripe Connect Express for partners, webhook handler covering tier lifecycle + invoice.payment_succeeded → spawn next-cycle Order
- `packages/notifications` — dispatcher + Resend, NotificationPreference + quiet hours
- `packages/storage` — R2-backed
- `packages/plans` — `lookupFeeRate`, `lookupPlanFeature` (R15.b)
- `packages/orders` — `createDispatches` routing + `generateOrderManifest` (G8)
- `packages/marketplace` — `suggestNiches`, `recordNicheAssignment` deterministic rule engine + audit (Slice 3A)
- `packages/compliance-client` — Python WeasyPrint label renderer + rule pack engine, FDA Food + Supplement guides codified (#36-45, COMPLIANCE.md)

### Marketplace pipeline

- 4-layer locked taxonomy wired end-to-end: 8 Creator Niches (many-to-many; capped seed at `seed-niches.ts`), 13 Product Categories (exactly-one; `seed-categories-locked.ts`), Manufacturing Formats (partner filter), 30 Lifestyle Tags in 3 groups
- Deterministic niche auto-suggest in `packages/marketplace/suggestNiches.ts` → partner accepts/edits in NichesAndTagsCard → admin overrides on review → every change writes `NicheAssignmentAudit`
- 24 migrations including 2026-06-01 marketplace taxonomy layer 4 + rules + labelingType + volume tiers + co-packer FK

---

## 3. V1-blocking gaps

> **Status update — 2026-06-20 (verified against current code).** Several items below
> have since shipped; the original text is kept for history. Now RESOLVED:
> - **#2 marketplace `creatorPrice`** — `apps/marketing/src/lib/pricing.ts::getPricingTierRows()`
>   reads real `ProductTemplatePricingTier` volume bands from the DB; the synthetic
>   `buildSamplePricingRows()` is now only the fixture-only-demo fallback. A real creator
>   sees a real price.
> - **#7 hardcoded fee constants** — fee sites read `OrderSettings`/`resolveOrderSettings`
>   (`productionFeeBps`, `computeApplicationFee`); the remaining `PLATFORM_FEE_BPS` is a
>   `?? fallback` only, and the `0.15` literals are fixture add-on deltas, not live fees.
> - **#9 order cancellation paths** — creator self-cancel (gated at partner acceptance),
>   admin review/force-cancel, and a creator post-delivery dispute flow all shipped; refund
>   math + a gated executor are built (see `docs/REFUND_EXECUTION.md`).
> - **Vercel cron** — `auto-cancel-dispatches` is now registered (was never scheduled).
> - **Legal surfaces** — ToS/Privacy/Creator+Partner Agreement drafts render at `/terms`
>   etc.; cancellation/refund/dispute redlines added for counsel.
>
> Still genuinely open (mostly Pavel-machine / ops, not code): **#1 pending migrations**
> (now also includes this session's PartnerStrike / OrderDispute / 3 NotificationEvents /
> acceptReminderSentAt — see `docs/SESSION_HANDOFF_2026-06-20.md`), **#3 Stripe webhook
> CLI test**, **#4 production deployment**, and enabling `STRIPE_REFUNDS_ENABLED` after a
> test-mode pass.

Each line: **what's missing · which surface · why it blocks V1.**

1. **9+ pending Prisma migrations on Pavel's local machine.** Tasks #168-173, #471, #536, #542, #552-553, #578, #584. Schema is written and committed; Pavel hasn't run `prisma migrate dev` for: G6.a/b ProductionSubscription, G8 OrderItem.designVersionId, H1 multi-partner approval (already marked done #478 but listed pending too — [VERIFY]), R14.b CreatorProfile.subscriptionTier, R15.a/b PartnerTier + SubscriptionPlan, product-plan additions 2026-06-01 (labelingType + ProductTemplatePricingTier + Niche + coPackerServiceId), Slice 1 marketplace taxonomy. **Until these run + `prisma generate` + Next is restarted, every feature touching those columns will SQL-error in dev. Order #1 priority for Pavel personally.**

2. **Marketplace `creatorPrice` formula is hardcoded.** `packages/ui/src/components/pricing-tier-data.ts::buildSamplePricingRows()` synthesizes the entire pricing ladder from `basePrice`. `apps/marketing/src/components/ProductDetailConfigurator.tsx` (L65) wires it. No DB read of `ProductTemplatePricingTier`. Schema landed 2026-06-01 in migration `20260601062600_add_labeling_volumetiers_niche_copacker_2026_06_01` but no server helper reads it. Per `ilaunchify-marketplace-decisions-2026-06-01.md` the locked formula is `manufacturer per-tier + platformFee(creatorTier) + shipping + accessories`. **A real creator cannot buy at a real price. Blocks the first transaction.**

3. **Stripe webhook end-to-end test never run.** Task #18 in PLATFORM_SPEC §Tier 4 V1 build list is unchecked. Webhooks are wired (`apps/creator/src/app/api/webhooks/stripe`, V1.5-T4, G6.d) but no Stripe CLI replay has been recorded against test mode. Definition-of-Done item #5 in PLATFORM_SPEC §soft-launch criteria. **Until this is run, "Stripe Connect works" is a code-shaped assumption.**

4. **No production deployment.** `docs/DEPLOYMENT.md` exists but [VERIFY] whether any of the four apps are actually deployed at production URLs. CockroachDB is Serverless (managed) but app hosting, custom domain (ilaunchify.com), DNS, Resend SPF/DKIM warmup — all [VERIFY]. PLATFORM_SPEC §"Open items" item #3 flags email sender domain reputation as an open issue.

5. **No error monitoring.** PLATFORM_SPEC §Tier 4 V1 item #19 = Sentry + uptime checks. Not done. No way to learn when the first real partner hits a server crash.

6. **No Terms of Service, Privacy Policy, Creator Agreement, Partner Agreement, or compliance-disclaimer surfaces.** Grep of `apps/marketing/src/app` shows no `/terms`, `/privacy`, `/cookie-policy`, `/dmca`. The compliance liability text in PLATFORM_SPEC §Phase 1 ("Creator assumes all responsibility…") has no live page to link to. **Pavel cannot accept a real first creator's money without a ToS link in the checkout footer.**

7. **Subscription & Fee Manager admin module is partially shipped, not validated.** `/admin/tiers` shell + plan editor + per-account override exists (R15.c-e). PLATFORM_SPEC calls this the *most important admin feature*. Whether the seed (R15.b) actually populates the production-order fee rules + whether `lookupFeeRate()` is called from every fee site (not just creator app) is [VERIFY] — original Tier-4 list explicitly required "All hardcoded fee constants replaced with DB lookups". A grep for `PLATFORM_FEE_BPS` or `15` * 100 in `apps/*/src/lib/*action*.ts` would confirm.

8. **Quality dispute system not built.** PLATFORM_SPEC §Tier 3 B.1 + §Tier 4 V1 item #11. `OrderDispute` + `PartnerStrike` models, creator filing UI, admin `/admin/disputes`, partner response UI. Status: spec only. Admin needs this on day 1 of any real production order delivering. Without it, the first creator complaint becomes Pavel's manual Slack message + a database edit.

9. **Order cancellation paths not all built.** PLATFORM_SPEC §Tier 3 B.4 + §Tier 4 V1 item #14. Creator pre-acceptance cancel + partner-requested cancel + admin force-cancel UI. Auto-cancel cron exists (B7) for partner timeout, but the creator and partner self-serve cancel paths are [VERIFY] — almost certainly absent.

10. **Tier-promotion cron not built.** PLATFORM_SPEC §Tier 3 B.2 + §Tier 4 V1 item #12-13. Verified → Trusted auto-flip and Trusted → Premier candidate queue. Without this, the partner tier (currently info-only chip per `ilaunchify-marketplace-decisions-2026-06-01.md`) stays decorative. **Defensible to defer to V1.1** — but explicit deferral, not silent.

11. **Differentiated creator onboarding wizard (Experienced / Beginner branch) not built.** PLATFORM_SPEC §Tier 4 V1 items #6-7. The current LaunchChecklist drawer is single-path. Each path needs ~3 days. The interactive compliance quizzes for the guided path haven't been written. **Soft-defer to V1.1 with an Express-only flow at launch is reasonable** — but flag explicitly.

12. **Sample-order mechanics not built.** PLATFORM_SPEC §Tier 4 V1 items #8-10. `Order.orderKind: STANDARD | SAMPLE` enum, First Sample Discount auto-apply (3 products × 3 units cap), Agency sample-to-main credit. Sample-orders seed exists (#511) but it's demo data, not a live mechanic. The activation moment in PLATFORM_SPEC §Tier 2 is **first paid sample** — this gap is squarely on the activation path.

13. **Transactional email templates not authored.** PLATFORM_SPEC §Tier 4 V1 item #15. 10-12 Resend HTML templates (order placed / shipped / delivered / dispute / tier promoted / payment failed / first-sample-discount-unlocked). Without these, every state transition produces an in-app notification only; the creator's inbox stays silent.

14. **Manufacturer product approval loop is built but unproven.** Slice 3A/B/C just shipped (#580-585) including `/admin/niches/audit` and admin product review. [VERIFY] that the loop closes end-to-end: partner submits → admin reviews → manufacturer accepts niche override → product publishes to marketplace and is purchasable. The schema is there; whether a real partner can drive a real ProductTemplate to PUBLISHED state without a manual SQL UPDATE is the test.

---

## 4. Gaps nobody noticed

### Legal & policy

- No ToS / Creator Agreement / Partner Agreement / Privacy Policy / Cookie consent / DMCA / GDPR-CCPA notice anywhere in `apps/marketing/src/app/`. Need at minimum: `/terms`, `/privacy`, `/legal/creator-agreement`, `/legal/partner-agreement` + checkout-flow checkboxes referencing them. The Compliance Acknowledgement on `ExportModal` (DS-69b) is the only existing legal text and it only covers label compliance.
- **FDA exposure model is undefined in writing**. iLaunchify ships finished CPG goods — if a creator's product injures a consumer downstream, where does the platform stand? Per `ilaunchify-operational-philosophy-v1.md` Pavel committed to specialized counsel for liability language; that engagement is [VERIFY] open or closed.
- Bioengineered disclosure mechanism is half-built (compliance service computes it #144, marketplace detail page does not surface it per MARKETPLACE_AUDIT §3 item 11).
- No marketplace-vendor labeling policy: who's the "manufacturer of record" on a label when iLaunchify orchestrates between 3 partners? PLATFORM_SPEC doesn't answer this and FDA inspectors would.

### Infrastructure & ops

- Production hosting [VERIFY] — `docs/DEPLOYMENT.md` exists but no commit hash suggests it was executed against Vercel/Fly/etc.
- CockroachDB Serverless tier is the dev database; production cluster sizing + region + backup configuration [VERIFY].
- R2 production bucket [VERIFY] (dev bucket exists per `packages/storage`).
- Resend production sender domain + SPF/DKIM warmup is an explicit open item in PLATFORM_SPEC §"Open items".
- Vercel Cron: `apps/admin/vercel.json` now registers `cert-expiry` (daily), `auto-cancel-dispatches` (hourly — was missing, fixed 2026-06-20), and `accept-reminders` (hourly). RESOLVED the prior "no cron fires on production" gap for auto-cancel. For V1.5 cron count Pavel flagged moving to a Fly scheduled worker; cadence can be tightened (e.g. */15) within Vercel plan limits if dispatch-timeout latency matters.
- No CDN / image-optimization decisions surfaced. `next/image` will be the default but cert thumbnails / die-line PDFs go through R2 directly.

### Support & customer success

- No support inbox. No `/help`, `/support`, support ticket model. (Task list shows `docs/SUPPORT_TICKETING_PLAN.md` exists and migration `20260601090000_add_ticketing_system_2026_06_01` landed — [VERIFY] whether the UI surfaces around it have shipped or it's schema-only.)
- No on-call rotation document. For a marketplace where a partner's missed dispatch is a creator's churned launch, this matters by week 2.
- No help docs / knowledge base. `apps/admin/src/app/help-support/page.tsx` is a stub per commit 07a64f9c.
- No first-creator white-glove onboarding script captured anywhere. PLATFORM_SPEC §risks mitigation says "dedicated Pavel-or-Simona onboarding call for first 5 partners" — that's the plan but not codified.

### Content moderation

- Creators can submit anything in the Design Studio canvas. Banned-words helper exists for brand voice (Studio #245) but there's no banned-imagery / banned-claims check.
- Partner-private ingredients are SELF_ATTESTED by default per `ilaunchify-ingredient-governance.md` — admin promotion queue exists (#140), but the >5% weight red flag enforcement is admin-side surfacing only, not a hard block. Acceptable per memory ("Admin is informed, not blocking") but worth flagging the policy is informational.
- No banned-creator / banned-partner / banned-product-category list. If a creator tries to make a CBD product (federally fuzzy), nothing stops them.
- Cert verification in `/admin/certificate-types` is admin attestation — no document-actually-verified gate. PLATFORM_SPEC §Phase 4 of partner journey says admin reviews docs; **how docs are actually verified (read the PDF? call the issuing body? accept at face value?) is undefined.** This is the gap most likely to cause embarrassment.

### Observability

- AuditLog rows are richer than most platforms ship at launch — that's the win.
- **Missing**: business metrics dashboard. GMV, time-to-first-paid-sample, checkout drop-off funnel, partner accept-rate, time-to-verification. PLATFORM_SPEC §"Activation success criteria" defines TTFPS / D7 retention / sample→main conversion / Builder upgrade rate — none have a live readout. Recharts is pending install (#579).
- Sentry: not installed.
- Health check: `/healthz` exists in creator app — [VERIFY] in marketing/partner/admin.

### Pricing live-ness

- **Marketplace `creatorPrice` is synthetic** (covered in §3 #2 above). When this is fixed, the second-order question is whether `lookupFeeRate(creatorTier)` is called in the right place — `apps/marketing/src/lib/templates.ts` is the SSR fetch surface and would need a server-side helper.

### Trust / verification

- Certificate-instance verification flow exists (admin clicks Verified on `/admin/certificate-types` + per-cert review on partner detail page) — but the substance of "what did the admin do to verify this is a real cGMP certificate" is policy, not code.
- Partner Stripe Connect onboarding is wired (#54) — but partner-bank-account-real-and-not-a-money-laundering-front is Stripe's KYB responsibility, not iLaunchify's. Still: a written policy on what happens if KYB fails mid-flow would help.

### Compliance live-ness

- `packages/compliance-client` runs FDA rule packs (Food Labeling Guide + Supplement Labeling Guide codified). [VERIFY] last review date of the rule pack. FDA updates labeling guidance episodically (2016 Nutrition Facts redesign was the big one); whoever owns this rule pack needs a calendar reminder.
- Bioengineered disclosure rules apply since 2022 — codified per #144. Allergen Big-9 (added sesame 2023) — [VERIFY] codified.

### Tax & accounting

- Stripe Tax: not mentioned anywhere in PLATFORM_SPEC or PAYMENTS.md. US sales tax on B2B production orders is mostly resale-exempt with proper certs, but iLaunchify-as-merchant-of-record will still need a position on collection.
- 1099-K / 1099-NEC for partners: Stripe Connect Express handles this for partners through Stripe — [VERIFY] enabled in Stripe dashboard.
- No EU VAT — explicitly out of scope per `ilaunchify-markets-and-regions.md` (US-only V1, Canada V1.1, EU V2).

### Disaster recovery

- CockroachDB Serverless has built-in 3-region replication. Backup configuration [VERIFY].
- No documented RPO/RTO. No documented "who can recover production". For a 1-2 person team this is acceptable; for a fundraise pitch deck it's an obvious investor question.

---

## 5. V1.5 / V2 deferred (intentional cuts)

Named deferrals — the discipline is real:

- **Creator team model** — V1.5+, financial-authority gate (`ilaunchify-creator-team-model-v1.5.md`). V1 wraps ownership checks in a helper; teammates not surfaced.
- **Subscribe & Save reorder schedule** — V1.5+ per PLATFORM_SPEC §B.5. Schema flag exists, no UI.
- **Capacity calendar (partner self-reports monthly capacity)** — V1.1+.
- **Conditional onboarding step engine (EIN vs VAT)** — V1.1+; US-only at V1.
- **Partner-to-creator messaging** — V1.1+; email sufficient at V1.
- **Admin product moderation bulk ops** — V1.1+ once channel push exists.
- **Tier 2 channels (Amazon / Etsy / WooCommerce)** — V1.1+; channel scaffolding exists (#111) but only Shopify will be wired.
- **AI features per tier** (AI label design improvements + formulation suggestions) — V1.1+.
- **Public per-creator profile pages** — V1.1+.
- **Affiliate / referral program** — explicitly dropped 2026-05-19 (Pavel).
- **White-label landing pages for creators / public API / mobile apps / iLaunchify-owned 3PL** — explicitly out of scope.
- **Multi-jurisdiction (EU/UK/CA expansion)** — V2; schema-ready per `ilaunchify-markets-and-regions.md`.
- **Beauty / skincare / pet (deep) / baby food** — Pet inlined in V1 per 2026-06-01 decisions; rest are V2.
- **Production Protection insurance product (2% premium)** — V2.
- **AI Template Agent (Trend Researcher + Generator + Auto-Tagger)** — V2 forward-pointer (#149).
- **USDA FDC full import pipeline** — pending (#137); V1 ships with the Curated Library + Partner-private + USDA search-wider stub (#142 pending).
- **Multi-die-cut surfaces** — V2 plan + V1 placeholder per DS-67c.
- **Pause-not-cancel subscriptions** — V1.1+.
- **Sample-side creator-to-creator referral** — V1.1+.
- **Marketplace transparency report public page** — V1.1+ (needs ≥1 quarter of data).
- **Storefront / consumer surfaces** — permanently deferred per `ilaunchify-storefront-deferred.md` (Pavel 2026-05-25).

---

## 6. Prioritized punch list

1. **Run all pending migrations + `prisma generate` + restart Next** · S · unblocks every feature touching new columns; Pavel's machine only. Tasks #168-173, #471, #536, #542, #552-553, #578, #584.
2. **Wire `ProductTemplatePricingTier` into PricingTierModal + configurator** · M · `MARKETPLACE_AUDIT_2026-06-01.md §3.1`. Replace `buildSamplePricingRows()` with a server-loaded `getPricingTierRows(templateId, packagingSystemId, sizeKey)`. Highest-impact polish win + unblocks real-money checkout.
3. **Author Terms / Privacy / Creator-Agreement / Partner-Agreement + cookie banner + checkout-footer link** · M · legal hygiene. Get a lawyer to redline; ship the four files at `/legal/*`.
4. **Stripe webhook end-to-end test via Stripe CLI in test mode** · S · payment_intent.succeeded → Order PAID → createDispatches → invoice.payment_succeeded for ProductionSubscription → next-cycle Order spawn. Record video for audit trail. PLATFORM_SPEC §Tier 4 item #18 + DoD criterion #5.
5. **Sentry + basic uptime checks across four apps** · S · PLATFORM_SPEC §Tier 4 item #19.
6. **Quality dispute system (`OrderDispute` + `PartnerStrike` + `/admin/disputes` + filing + partner response UI)** · L · PLATFORM_SPEC §B.1 + Tier 4 #11. Admin needs this the first time a partner ships wrong-spec.
7. **Order cancellation paths (`CancellationRequest` model + creator pre-accept button + partner-request UI + admin queue)** · M · PLATFORM_SPEC §B.4 + Tier 4 #14.
8. **Sample-order mechanic (`Order.orderKind: SAMPLE` + First Sample Discount auto-apply + Agency sample-to-main credit)** · M · PLATFORM_SPEC §Tier 4 #8-10. Activation moment per PLATFORM_SPEC §Tier 2.
9. **Production deployment of all 4 apps + custom domain + Resend SPF/DKIM** · M · without this there is no "real first creator" to test with.
10. **10-12 Resend HTML transactional templates** · M · PLATFORM_SPEC §Tier 4 #15.
11. **Marketplace detail page: Big-9 Contains line + ingredient source badges + bioengineered disclosure + co-packer attribution + cert-stack from `ProductCertificate` join + logged-out gating on price/MOQ** · M · `MARKETPLACE_AUDIT_2026-06-01.md §3.4-3.11`. Bundles the "feels regulated" polish.
12. **Manufacturer product approval loop smoke test end-to-end** · S · drive one real ProductTemplate from DRAFT → PUBLISHED with a real partner and confirm the marketplace page surfaces it correctly.
13. **Tier-promotion cron (Verified → Trusted auto-flip) + tier-down cron** · M · PLATFORM_SPEC §Tier 4 #12-13. Explicit defer to V1.1 is OK; if deferring, add a memory file.
14. **Differentiated onboarding wizard (Express vs Guided) + interactive compliance quizzes** · M · PLATFORM_SPEC §Tier 4 #6-7. Explicit defer to V1.1 acceptable; ship the Express checkbox at minimum.
15. **First-5 partner + first-5 creator white-glove playbook + support inbox + on-call doc** · S · pre-beta operations hygiene.

---

## 7. Recommendation

**C — finish V1 first, but a narrow V1, then closed beta, then fundraise.**

The architecture is locked, the surfaces are mostly built, the design system is polished, and the schema scale (102 models, 24 migrations) is impressive — but a fundraise pitched today is "we built a marketplace; we have not yet sold anything." A beta pitched today loses real creators on day one because the marketplace shows synthetic prices, there is no Terms of Service, Stripe webhooks were never tested with the CLI, and nothing is in production. The gap to closing those is shorter (~2 working weeks for items #1-5, #9 in the punch list, plus a focused legal day) than the time it would take to negotiate the dilution that would compensate for skipping a beta.

Two weeks of disciplined gap-closing (migrations + pricing + legal + Stripe CLI + Sentry + deployment), one week of white-glove onboarding 3-5 partners + 5-10 creators, four weeks of running the closed beta and ironing out edge cases — and the fundraise becomes "we orchestrated $N in production GMV across N partners with a 98% on-time rate and these are the first three case studies." That's a categorically different conversation.

The trade-offs are real. **Option A (fundraise now)** could work — the platform is genuinely sophisticated, Pavel's domain expertise reads in the spec docs, and there's a clean orchestration thesis to pitch — but it'd be a smaller round at a lower valuation, and the lack of a single real transaction is the question every diligence call will rest on. **Option B (beta first without closing the gaps)** risks a churned beta cohort because the operational holes (no ToS, synthetic prices, no Sentry, no email templates, no production deploy) will produce a bad first impression that's hard to recover from with a 50-creator audience. Option C is slower by 6-8 weeks but produces the cleanest narrative.

If the runway clock is forcing a fundraise faster than that, escalate the punch list items #1-5 + #9 to a 7-day sprint, skip items #6-8 (lean on manual workflow for disputes / cancellations / sample mechanics during a 5-creator beta), and pitch on the closed beta in flight — but do not skip the legal surfaces or the Stripe CLI test under any timeline.
