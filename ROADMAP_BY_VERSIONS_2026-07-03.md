# iLaunchify Roadmap by Version — Built vs. Left to Build

**Compiled:** 2026-07-03  
**Source:** docs/ + .auto-memory/ comprehensive sweep  
**Target:** Founder's version-by-phase visibility  

---

## EXECUTIVE SUMMARY

- **V1 (shipped/shipping):** Core B2B production marketplace + creator onboarding + partner/manufacturer accounts + design studio + order orchestration (Mode 1 direct routing) + logistics (L0–L4a) + channels (C0–C2) + partner role accounts (P0–P3 mostly complete)
- **V1.5 (planned, post-launch):** Subscribe & Save + FC API integrations + channel expand (C3–C5) + logistics L4–L5 (weighted FC scorer, Shopbob) + pooling/buffer inventory prep
- **V2 (future):** Aggregation pooling (moat) + buffer inventory + multi-region + advanced features (API, content, analytics)

**Build Status as of 2026-07-02:**
- **Ready to ship:** Logistics & fulfillment (L0–L4a), Partner role accounts (P0–P3), Channel management foundation (C0–C2)
- **In-progress:** Design Studio multi-surface + AI compliance scanning
- **Deferred to V1.5+:** Subscribe & Save, Shopify OAuth, cold-chain scale, API, public marketplace

---

## STATUS UPDATE — 2026-07-11 (supersedes the "as of 2026-07-02" status above)

**~450 commits since 2026-07-03.** V1 core is functionally built; what remains for launch is **integration + verification, not net-new features.**

### Shipped / matured since the last roadmap
- **Co-creation marketplace (P0)** — creator briefs → manufacturer opportunity pool → NDA'd collaboration rooms → milestone escrow.
- **Nomination model** — manufacturer directs a print/pack co-partner (dark until counsel blesses D7).
- **Print Coverage & Capability RFQ (PS-7/PS-8)** + **Smart Rotation Engine** (admin-controlled auto-rotation, shadow until enabled).
- **Manufacturer Merit Engine (MM)** — badge→fee, shadow-inert until `MeritPolicy.enabled`.
- **Feedback & Ratings**, **Partner Onboarding v2 + Activation Setup**, **Legal Document CMS**, **Risk Management Center (M1)**, **Favorites**.
- **Platform consistency audit + remediation (this cycle)** — fee model reconciled (two-fee), **8 CI guardrails** now enforcing (`--strict`), characterization tests added to audit/security/compliance-client/notifications/plans. See `AUDIT_STATE_2026-07-11.md`.

### V1 launch gate — the real critical path (2026-07-11)

| Gate | Status | Owner |
|---|---|---|
| **MONEY — fee patches** (checkout charges tier fee not flat 5%; merit withhold) | ⏳ SSOT+snapshots landed; 2 hot-file patches **staged** | Code (`FEE_*_PATCH` docs) + `db:push` |
| **MONEY — Stripe test-mode verification** (payment + payout handshake; refunds off until passed) | ⏳ pending — **THE money gate** | Pavel + Code (`STRIPE_TESTMODE_VERIFICATION.md`) |
| **AUTH — login provider env** (`AUTH_SECRET` + Google/Resend) | ⏳ | Pavel |
| **AUTH — retire `/api/dev/login`** (H5 A0–A3) | ⏳ specced; Code mid-build (`ENABLE_DEV_LOGIN` landed) | Code |
| **AUTH — Turnstile (A4)** + **rotate the committed secret** | ⏳ specced (`A4_TURNSTILE_BUILD_SPEC`) | Code + Pavel (rotate) |
| **AUTH — admin TOTP 2FA** | ⏳ specced (`AUTH_ENTRANCE_SECURITY §4B`) | Code |
| **DATA/CI** — schema pushed, typecheck + `check:invariants --strict` + tests green | ✅ guardrails enforcing; `db:push`+`generate` before the fee patches | — |
| **OPS/EXTERNAL** — FC dry-run + carrier setup; Shopify/Amazon/ShipBob/image-gen | ⏳ **V1.5-deferrable** (channels C1/C4 + AI-gen P3 already deferred) | Pavel accounts |

### When are you ready to deploy?
The gating list above is **short and well-defined** — no new feature build. Soft-launch-ready when:
1. Code lands the two **fee hot-file patches** + `db:push` (checkout money correct).
2. **Stripe test-mode verification** passes (the money handshake; unblocks refunds).
3. **Auth**: provider env set → Code lands **A0–A3** (dev-login retired) → **rotate the Turnstile secret** → build **A4** + **admin TOTP**.
4. **Green CI** + a staging **smoke test**: signup → design → checkout → dispatch → payout, in Stripe test mode.

**Read:** the external accounts (Shopify / Amazon / ShipBob / image-gen) can follow as V1.5 without blocking a *controlled soft launch*, because channels and AI-gen are already deferred. No hard date (depends on Code throughput + external verification), but the path to soft-launch is integration-and-verify, not build.

---

## FEATURE AREA BREAKDOWN

### 1. CREATOR ONBOARDING & TIERS

**Status:** V1 BUILT (core paths + subscription billing)

| Feature | V1 | V1.5 | V2+ | Notes |
|---------|-----|------|-----|-------|
| Express signup (<30 min) | ✅ | — | — | Compliance waiver option |
| Guided onboarding (<2 hr with quizzes) | ✅ | — | — | "I know this, skip" hatch visible |
| Payment/channel/brand/first-product steps | ✅ | — | — | Only Step 1 hard-required |
| Subscription billing (Maker/Builder/Agency) | ✅ | — | — | Monthly recurring, cancel_at_period_end |
| Tier feature gating (brands/products/channels) | ✅ | — | — | All gates via `lookupPlanFeature()` |
| Tier upgrade/downgrade UI | ✅ | — | — | Self-serve upgrade at /settings/plan |
| Sample order → main order credit (Agency) | ✅ | — | — | Track delivered-sample cost; 30-day window |
| **Deferred:** Pause-not-cancel | — | ✅ | — | Churn-saving, V1.1 nice-to-have |
| **Deferred:** Region-aware conditional steps (VAT etc.) | — | ✅ | — | V1 US-only; branches on CA/EU entry |

**Creator Tiers (locked PLATFORM_SPEC Tier 1):**
- **Maker:** 1 brand, unlimited products, 1 channel connection, 15% platform fee
- **Builder:** 3 brands, unlimited products, 3 channel connections, 12% platform fee, bulk pricing hidden
- **Agency:** unlimited brands/products, all 6 channels, 10% platform fee, bulk pricing visible

---

### 2. PLATFORM SPEC & BUSINESS MODEL

**Status:** V1 LOCKED (all four tiers finalized)

| Tier | Content | Status |
|------|---------|--------|
| Tier 1: Business model | Creator/partner/admin roles · fees · subscription pricing · warehouse economics (pass-through V1 → referral V1.5 → intermediated V2) · sample order policy | ✅ LOCKED 2026-05-19 |
| Tier 2: User segments | 5-phase creator journey · 7-phase partner journey · admin lifecycle · growth loops (partner SEO #1, organic referral #2, transparency reports #3) | ✅ LOCKED 2026-05-19 |
| Tier 3: FSMs | Order/Dispatch/Partner/Verification (built) + Quality dispute (V1 ready) + Tier promotion (V1 auto→Trusted, admin→Premier) + Subscription billing (V1 with grace+downgrade) + Order cancellation (partial) | ✅ LOCKED 2026-05-19 |
| Tier 4: V1 build sequence | 49–54 working days (~11 weeks) · Feature inventory with status · V1.1 deferred list | ✅ LOCKED + revised 2026-05-19, Design Studio expanded 2026-05-28 |

**Tier naming (LOCKED 2026-05-28):** Master → **Agency** (better UX term for influencer cohort)

---

### 3. DESIGN STUDIO & PACKAGING

**Status:** V1 MULTI-SURFACE FOUNDATION SHIPPED + V1 IN-PROGRESS

| Component | V1 | V1.5+ | Notes |
|-----------|-----|-------|-------|
| **Design Studio core** | Path A: image upload · Path B: template + brand-fill | Per-flavor overrides | Multi-surface model (front/back/top/spine etc.) |
| **Surfaces architecture** | PackagingSystem → DieCutTemplate × N → LabelDesignTemplate × M | Variant expansion | Surface picker with completion badges |
| **Canvas engine** | Fabric.js + frames model | — | Die-line frames already built |
| **Compliance regions** | Preset legal positions (e.g., Supplement Facts zone) | AI-suggested per domain | Hidden mandatory fields + AI compliance scan |
| **Autosave + version history** | ✅ SHIPPED 2026-06-19 | — | Ring buffer (10 auto + pinned), restore per-surface (base design scoped) |
| **3D preview** | Dieline3DViewer (display-only, no edit) | — | Substrate + model3dKey schema ready |
| **AI compliance scan** | Hidden field validator | Expand to visible fields | Deterministic vector marks (FDA/AAFCO compliance) |
| **Multi-surface mockup** | 2D photo-mask (admin-drawn region) | Library browseable | **V1.5: G1+G2 of in-house generator (LOCKED 2026-07-03)**; G3–G5 follow, video V2 |

**Design Studio timeline (PLATFORM_SPEC Tier 4):**
- Weeks 4–7 (V1): Path A + B + multi-surface + AI scan (added 2026-05-19, +6 days effort)
- **Total effort: ~49–54 days / ~11 weeks for full V1**

**Mockup strategy (LOCKED MOCKUP_STRATEGY.md):**
- **V1:** Admin uploads white-label product photo → draws print region (4-point quad) → creator artwork warps to region (2D mask)
- **V1.5:** Admin-curated mockup library (browseable by packaging type + style tags)
- **V1.5:** 3D mockups via in-house generator, G1 realism + G2 render/library pulled into V1.5 (LOCKED 2026-07-03); tier-gated: Maker preview-only, Builder/Agency downloads + premium scenes. G3–G5 follow; video V2. Plan: PACKAGING_3D_GENERATOR_PLAN.md (Pacdora withdrew API → BUILD)

**Die-line normalization (LOCKED):**
- Two artifacts: immutable `PartnerFile` (partner upload) + platform `normalizedSvg` (computed)
- Admin Curator UI lives IN Studio (component C9.g)
- Schema live; UI not yet built

---

### 4. LOGISTICS & FULFILLMENT

**Status:** L0–L4a SHIPPED 2026-07-02 (LOCKED decisions + admin-gated toggles)

Phased build with additive schema. **ALL future phases ship "build-ready, admin-gated"** — LogisticsSetting toggles per storage class/connector/carrier/insurance; no code change needed at enable time.

| Phase | L0 | L1 | L1.1 | L1.2 | L2 | L3 | L4a | L4 | L5 |
|-------|-----|-----|------|------|-----|-----|------|-----|-----|
| **Timeline** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | V1.5 | V2 |
| **Scope** | Schema + classifier | 4-dest checkout + hold-at-mfg + FC network + V1 selector | Doc-gated ship panel + inbound queue + admin shipments | Storage accrual + stock releases + admin FC override | EasyPost rail + tracking webhooks + checkout quotes + admin carriers | Channel gates + FNSKU capture + CHANNEL_INBOUND + SP-API stub | V1.5 weighted FC scorer + rotation band + creator /inventory | ShipBob FulfillmentConnector + WFS/FBT | Cold chain + Trackstar + retail EDI |

**Key decisions (LOCKED 2026-07-02, docs/LOGISTICS_AND_FULFILLMENT.md §10):**

| # | Decision | Resolution |
|---|----------|-----------|
| L1 | Cold-chain scope | Build full CHILLED/FROZEN schema + classifier, ship GATED OFF (admin toggle via LogisticsSetting). Ambient + PROTECT_HEAT enabled at launch. |
| L2 | Anchor 3PL | ShipBob (build FulfillmentConnector behind toggle). Until agreement lands, FC run as admin-onboarded WAREHOUSE partners (V1 manual). |
| L3 | Parcel aggregator | **EasyPost** (vendor pick, like Stripe). Shippo fallback if terms fail. |
| L4 | Insurance | FOB Origin + opt-out shippers-interest at checkout. OFF until STRIPE_TESTMODE_VERIFICATION checklist passes. |
| L5 | First-leg freight cost | Creator pays at checkout (quoted line item + admin-tunable margin bps). |
| L6 | Infant formula | Excluded platform-wide at entry point (Step 1, DomainSetting-style gate). Never let creator do work then block shipping. |
| L7 | Channel adapter order | FBA (P0) → WFS (P1) → FBT (P1). Revisit FBT priority if TikTok becomes core segment. |
| L8 | FC override | Creator sees suggestion + can override within eligible set. Admin can hard-pin. Manufacturer never chooses. |
| L9 | Hold-at-mfg billing | Monthly Stripe billing on fee snapshot. Platform fee = warehouseReferralFeeBps. Partner rates constrained to admin bands. |

**Destinations (4-card checkout):**
- Creator/warehouse (fulfillment-center partner node)
- Hold at manufacturer (on-demand; StorageAgreement model)
- Direct to customer address (rare V1, shipping insurance gate)
- Channel inbound (Amazon FBA / Walmart WFS / TikTok FBT)

**FC selection (3-phase pattern):**
1. Hard eligibility filter (storage class, certifications, receiving spec, hazmat capability)
2. Weighted scoring (first-leg cost, outbound zone, storage cost, capacity, SLA) — **V1 skips this, uses nearest-eligible + admin confirm**
3. Round-robin rotation inside indifference band (~5% cost spread) — **V1.5+ with ≥3 eligible nodes**

**FC partner model:**
- `Partner` row + `PartnerService type=WAREHOUSE` (already in schema)
- Admin onboarded (no API in V1; portal-based inbound confirm, manifest → receiving checklist)
- StorageAgreement + StorageReleaseOrder FSM for hold-at-manufacturer stock
- creator /inventory view (V1.5) — VMI: units by location, lots, FEFO warnings

**Fulfillment connector (V1.5):**
- `FulfillmentConnector` interface (ShipBob adapter first)
- Inbound ASN (`POST /2.0/receiving` WRO with lot+expiry)
- Inventory levels (API + webhooks)
- Outbound visibility (channels connect directly to 3PL; iLaunchify read-only)

**Deferred (V2+):**
- Trackstar abstraction (100+ WMS backends)
- Retail EDI (940/943/944/945/846 for big-box)
- Split-destination orders (part FBA, part FC)
- Platform-owned buffer warehouses (moat feature)

**Required ENV keys:**
- EASYPOST_API_KEY (V1)
- SHIPBOB_* (V1.5)
- AMAZON_SP_API_* (L3, P0 channel)
- WALMART_API_*, TIKTOK_SHOP_* (L3, P1–P2)
- LOADSMART_* (V2)

**Schema additive (L0):**
- ShipmentLeg (one physical movement; V2 supports multiple per dispatch)
- ShipmentDocument (labels, BOLs, etc.)
- CarrierAccount, CarrierServiceRule, FcAwardLog
- LogisticsSetting (toggle table per L1/L2 lock)
- StorageAgreement, StorageReleaseOrder, InboundReceipt, ReceivingDiscrepancy

---

### 5. CHANNEL MANAGEMENT

**Status:** C0–C2 SHIPPED 2026-07-02 (LOCKED decisions)

Phased build, additive. Supported roster (LOCKED, 10 channels):
- **Native adapters (C1–C5):** Shopify (C1), TikTok Shop (C3), Amazon SP-API (C4), Walmart WFS (C5), long-tail six (C5)
- **Stub:** Dev mode with zero external keys

| Phase | C0 | C1 | C2 | C3 | C4 | C5 |
|-------|-----|-----|-----|-----|-----|-----|
| **Timeline** | ✅ | In-build | ✅ | Planned | Planned | Planned |
| **Scope** | ChannelOrder FSM + evaluateReadiness golden gates + spending cap + manual-confirm training wheels | Shopify OAuth + adapter + order ingest | "Route & pay" auto-billing + inventory ledger math + creator on-demand enable gate | TikTok Shop adapter | Amazon SP-API adapter + FBA inbound (L3 integration) | Walmart WFS + long-tail six (Wix/Square/BigCom/eBay) |

**Key decisions (LOCKED CHANNEL_MANAGEMENT_SPEC.md §5):**

| # | Decision | Resolution |
|---|----------|-----------|
| C0–C1 | Order ingest + FSM | Adapter → idempotent import → ChannelOrder → ChannelProductLink → routing. Pure, tested |
| C2 | Route & pay | READY+approved → auto-charge from saved method (creator specifies cap). Billing ledger math pure + tested. Spending cap + failure → ON_HOLD |
| C2 modes | CONFIRM vs FULL_AUTO | CONFIRM (V1): manual admin batch. FULL_AUTO (V1 rollout): auto-charge, daily cap, requires C2.2 billing rail |
| Inventory sync | Vector ledger | Ledger math pure (V1 manual "Record delivery"; L2 automates). Zero-push on conflict. |
| Consumer-side | **LOCKED OUT** | End buyers never touch iLaunchify. Returns stay creator-side (on the channel, not here) |

**ChannelOrder FSM:**
- PENDING → ACCEPTED (creator approves channel order) → READY (stock confirmed) → ROUTED (assigned to partner) → PRODUCING → PRODUCED → SHIPPED → DELIVERED
- DECLINED if creator rejects
- ON_HOLD if auto-charge fails or spending cap hit

**OnDemandEnablement flow (C2.3):**
- Creator requests Shopify (or other) connection from /settings/channels
- Manually confirm 10+ orders before full auto (per C2 decision)
- Then auto-route + auto-charge with cap

**C6: Inventory intelligence (parallel track):**
- **C6.1 (shipped):** Velocity + onOrder aggregation per product
- **C6.2 (shipped):** `/channels/inventory` surface + OrderSettings knobs inline (configurable days-of-cover × velocity, admin default)
- **C6.3 (shipped):** Daily sweep (`/api/cron/stock-alerts`) — alerts to creator when low
- **C6.4 (shipped):** Stock-level knobs + alerts live (moved to OrderSettings)

**Deferred (V1.5+):**
- Shopify push-to-channel (OAuth flow + listing push to merchants' stores)
- Channel-to-channel inventory sync (advanced)
- Marketing APIs, analytics dashboards

---

### 6. PARTNER ROLE ACCOUNTS

**Status:** P0–P3 MOSTLY BUILT 2026-07-02 (3 role skins + team model + notifications)

Three partner types share **one homogeneous portal chassis** with role-specific skins. **LOCKED decisions D0–D6 (Pavel 2026-07-02).**

| Role | Portal sections | V1 build status | Key gate |
|------|-----------------|-----------------|----------|
| **Fulfillment Center (FC)** | Dashboard, Orders, Inbound, Inventory, Outbound, Services, Certifications, Payments, Storage billing, Settings | **P0+P1 COMPLETE** (2026-07-02, slices 1–6) | Receiving confirmation w/ D2 lot+expiry hard gate |
| **Co-packer (manufacturing)** | Same + WO specifics | **P2 in-build** (slices 9–10) | Component readiness, ProductionLot capture, COA |
| **Printer** | Same + print specifics | **P2 in-build** (slices 9–10) | **D3 proof loop** (OFF by default, ON for first order per creator×printer pair) |
| **Team model** | PartnerMembership (org-wide) + PartnerServiceMembership (service-scoped) | **P3 COMPLETE** (slices 11–15) | Multi-seat foundation; guard migration in progress |

**Build timeline (PARTNER_ROLE_ACCOUNTS.md §9, P0–P3 COMPLETE as of 2026-07-02):**

| Slice | Component | Status | Key delivery |
|-------|-----------|--------|--------------|
| P0.1 | Role-skin registry | ✅ | Wired into sidebar/layout/dashboard/notification-settings; FC rename in UI |
| P0.2 | Schema deltas | ✅ | InboundReceipt + lines, ReceivingDiscrepancy, PartnerFile.issuedAt/expiresAt, 6 NotificationEvents |
| P0.3 | Receive-confirm w/ D2 hard gate | ✅ | Lot + expiry mandatory for food/supplement (immutable after confirm) |
| P0.4 | Partner-ops cron v1 | ✅ | `/api/cron/partner-ops` (Expiry Engine, DISPATCH_SLA_AT_RISK, INBOUND_DELIVERED_UNCONFIRMED) |
| P0.5 | Admin exceptions inbox | ✅ | `/logistics/receiving-exceptions` (OPEN → UNDER_REVIEW → RESOLVED) |
| P1.1 | FC /inventory (storage) | ✅ | StorageAgreements at own facility, units/pallets, FEFO ≤90d panel, ledger read-only |
| P1.2 | FC /outbound (release orders) | ✅ | Queue REQUESTED → PICKING → SHIPPED → DELIVERED; creator trigger via storage-release-actions |
| P1.3 | Creator release-request unblocked | ✅ | StoredStockPanel gate now accepts WAREHOUSE_PARTNER |
| P1.4 | FC /billing | ✅ | Ledger display-only (frozen snapshots); charges gated; monthly Stripe billing per L9 |
| P1.5 | FC /settings/fulfillment | ✅ | receivingSpecJson editor + blackout windows ≤60d |
| P1.6 | Blackout enforcement | ✅ | Hard filter in fc-selector (V1 nearest + V1.5 scorer) |
| P1.7 | FEFO pick hints | ✅ | Oldest-expiring lot per order on /outbound rows |
| P1.8 | Release SLA escalation | ✅ | RELEASE_SHIP_SLA_AT_RISK @2d warn, @4d escalate admins; cron sweep daily |
| P1.9 | Doc-lapse capability suspension | ✅ | Lapsed REQUIRED track doc auto-pauses ACTIVE services (SERVICE_PAUSED_DOC_LAPSE audit) |
| P2.1 | Co-packer/printer role skins | ✅ | Dispatch detail eyebrow/title/stage labels per DispatchType |
| P2.2 | PrintJobCard + WorkOrderCard | ✅ | Output spec contract echo + artwork gate (existing Phase-H flow) + component readiness |
| P2.3 | **D3 Proof loop end-to-end** | ✅ | ProofRound (versioned, one decision per round) + printer upload panel + creator approval panel + markReady gate on APPROVED |
| P2.4 | **ProductionLot capture** | ✅ | Model + immutable ProductionLotsCard on PRODUCT/COPACKING dispatches (output lot, expiry, yield, scrap reason, ingredient-lot rows) |
| P2.5 | Blackout generalization | ✅ | Every service type (printer vacation pause, co-packer maintenance) |
| P3.1 | **Multi-seat team foundation** | ✅ | PartnerMembership + PartnerServiceMembership + PartnerInvite (14d TTL); `/settings/team` |
| P3.2 | Guard migration | ✅ | `getPartnerAccess(userId)` / `requirePartnerAdminAccess` wired through operational core (dispatch/inbox/FSM actions) |
| P3.3 | Role-routed notifications | ✅ | Operational fan-out to service members, not just founder userId |
| P3.4 | **RAMP queue (D4)** | ✅ | First-3 DELIVERED dispatches per partner flagged, admin confirm at `/admin/partners/ramp` |
| P3.5 | Daily digest channel | ✅ | `/api/cron/notification-digest` (13:00 UTC) — one summary email/user, idempotent |
| P3.6 | Partner scorecard | ✅ | Read-only on admin detail (completed %, accept rate, QC failures, discrepancies, reprints, avg yield) |
| P3.7 | SLA monitor | ✅ | Admin `/admin/logistics/sla` (acceptance at-risk/breached, receiving unconfirmed, releases past window) |

**Key gates (D0–D6, LOCKED 2026-07-02):**

| # | Decision | Resolution |
|---|----------|-----------|
| D0 | FC naming | Enum stays (WAREHOUSE); UI only shows "Fulfillment Center" |
| D1 | Team model timing | P3, not V1.5. Notification routing + FC ops depend on it. |
| D2 | Lot+expiry capture | Hard-require for food/supplement at receiving from day one (immutable later) |
| D3 | Proof loop | OFF by default, auto-ON for first order per creator×printer pair |
| D4 | RAMP | Manual admin confirm on first N=3 dispatches per new partner (review ritual, no hard routing block yet) |
| D5 | SMS P0 alerts | Defer V1.5 |
| D6 | Co-packer/printer skins | After first FC partners go live (P2 follows P0) |

**Notification tiers (§6.2):**
- **P0:** Critical (realtime all channels, ignores quiet hours, escalates if unacked)
- **P1:** Action needed (realtime email + in-app, escalate if unacked N hrs)
- **P2:** This week (in-app + daily digest)
- **P3:** Informational (in-app + optional weekly digest)

**Deferred (V1.5+, P4):**
- Webhook channel + integration registry per partner
- SMS for P0
- Formal RateCard model (V1.5)
- Dock-appointment scheduling
- Tier auto-promotion
- Native scanner app
- Print geographic routing (V2 pooling)

---

### 7. PRODUCTION ORCHESTRATION & ROUTING

**Status:** Mode 1 (V1 direct routing) LOCKED; Mode 2–4 schema breadcrumbs deferred

**Four routing modes (PRODUCTION_ORCHESTRATION.md, sequenced V1 → V2):**

| Mode | What | Phase | Status |
|------|------|-------|--------|
| **1. Direct Compatible Routing** | All partners' constraints align naturally; pick cheapest viable graph | V1 | ✅ LOCKED 2026-06-22 (D1–D5); schema + engine buildable |
| **2. Aggregation Pooling** | Combine demand across creators to break MOQ barriers (the moat) | V2 | Schema breadcrumb only; full logic deferred |
| **3. Buffer Inventory** | Platform stocks neutral packaging; only labels customized | V2 | Schema breadcrumb only; operational/financial commitment needed |
| **4. Intelligent Upgrade Suggestions** | "Order 150 to unlock 28% cheaper" (consequence framing, not constraint) | V1 stub, V1.5 polish | V1 shows 1–3 thresholds; V1.5 = real-time recalc as creator nudges qty |

**Mode 1 engine (V1, LOCKED routing decisions D1–D5):**

| # | Decision | Resolution |
|---|----------|-----------|
| D1 | Owner unavailable | Cancel + refund (no alternate manufacturer in V1). Delay-accept + penalties cover SLA breach. |
| D2 | Null manufacturerServiceId | **LOCKED A (2026-06-22).** Category-match + scoring fallback; null-owner legacy products (from pre-V1.1) use conservative fallback, not deleted. |
| D3 | Owner as default downstream + print match | MOSTLY DONE (print leg still reads legacy dieCutTemplateId untouched) |
| D4 | Generic-BOM products | **LOCKED A (2026-06-22).** "Shop the manufacturer" is V2-only; out of V1. findRouting = two-case model (owner-pinned vs null-owner). |
| D5 | Multi-flavor lead time | **LOCKED A (2026-06-22).** Manufacturer declares parallel vs sequential; leads add parallel (faster), sequential adds time. |

**BOM (Bill of Materials) model (PRODUCTION_ORCHESTRATION.md §5):**
- Lives on `ProductTemplate`, admin-curated (V1.5+ lets admins add/remove rows)
- Creator overrides deferred V2 (premium creators only)
- Simplifies V1 routing — one graph shape per template

**Scoring (V1 defaults; admin-tunable per market/product):**
- **Reliability:** static per partner tier (Premier 1.0, Trusted 0.7, Verified 0.5). V2 = dynamic per telemetry (onTimeRate × (1 − disputeRate × 5))
- **Cost:** sum of all partner quotes in the graph
- **Lead time:** critical path through the graph
- **Region proximity:** 1.0 same, 0.6 adjacent, 0.3 national, 0.0 cross-border (V2+)

**V1 algorithm:**
1. For each line in the order: find eligible partners (MOQ, capability, geography)
2. Score all combinations; if zero candidates → Mode 4 fallback (consequence framing)
3. Auto-select highest-scoring one, present as single quote to creator
4. V1.5+: surface all top 3 with "show options" toggle

**Quote validity:** 24 hours for direct routing, 1 hour within active pooling window (recommendation)

**Fallback modes (Mode 4, V1):**
- MOQ too high? Show "order 500 instead of 100 to unlock $X/unit savings"
- Lead time too long? Show "jump to next batch: ready [date]"
- Show up to 3 thresholds if multiple exist; default display lowest viable threshold

**Deferred (V2 + beyond):**
- Real-time partner capacity check (V1 uses declared only via PartnerService.maxMonthlyCapacity)
- Cross-product orchestration (V1.5+ = independent per product; V2 = shared partner efficiencies)
- Tax / customs / cross-border (V2+ adds tax/customs nodes for CA/EU)
- Mode 2 pooling window logic, fairness, underwriting per creator tier
- Mode 3 buffer inventory operations, replenishment forecasting
- Telemetry feedback loop (V1 collects; V2 consumes for dynamic scoring)

**Schema (additive per phase):**
- **V1:** ProductTemplateBOM + PartnerService capability fields + RoutingDecision audit + Order breadcrumbs (pooledBatchId, bufferInventoryItemIds nullable)
- **V1.5:** Telemetry collection for V2 flywheel (RoutingTelemetry table — time to production, color drift, partner reliability)
- **V2:** PoolingBatch, BufferInventoryItem, UnfillPool models + telemetry consumption

**Manufacturing owner-pinned (ROUTING_BINDING_MODEL.md, LOCKED 2026-06-22):**
- **Key lock:** `ProductTemplate.manufacturerServiceId` = immutable owner of product manufacturing leg
- Commodity legs (packaging, printing) can route to any eligible partner
- No "shop the manufacturer" generic-BOM path in V1 (deferred V2)
- Null owner legacy products fall back to category-match (conservative, pre-V1.1 seed data only)

---

### 8. PARTNER ONBOARDING & LIFECYCLE

**Status:** V1 BUILT (5-layer model, 10-state FSM)

| Layer | V1 | V1.5+ |
|-------|-----|-------|
| **1. Discovery** | Organic search, social, partner referrals, content marketing (V1) + direct sales to Tier-1 creators (V1.5+) | Outbound BDR hiring once activation metrics dialed |
| **2. Apply** | Partner submits application (capability profile: MOQ, lead time, categories, disclosure level, facility address) | — |
| **3. Qualify + invite** | Admin review (0–2 days); if accept, send invite (verification paths per PartnerService type) | — |
| **4. Onboarding wizard** | Partner configures account (team, payment, settings, product listings). Role-specific doc tracks (FC/printer/co-packer). | — |
| **5. Verification** | Admin routes requirements per service type (MANUFACTURING/COPACKING/WAREHOUSE/LABEL_PRINTING). Docs uploaded (COI, certifications, rate cards, producing agreement). | Auto-promotion Verified → Trusted at gates |

**Partner FSM (10 states):** LEAD → INVITED → IN_PROGRESS → ACTIVE (unlocked after first dispatch accept) → TRUSTED (auto-promotion at gates) → PREMIER (admin interview) + SUSPENDED (doc lapse) / DECLINED (admin reject)

**Partner tiers (locked PLATFORM_SPEC Tier 1):**
- **Verified:** baseline, auto-promoted from IN_PROGRESS on first ACTIVE dispatch accept
- **Trusted:** auto-promotion gate: 25+ orders + 90% on-time OR 180+ days ACTIVE + 85% on-time (nightly cron; Verified→Trusted auto-flip)
- **Premier:** manual admin interview + approval (auto-flip after approval)

**Tier-down (automatic, nightly cron):**
- Trusted → Verified: <85% on-time for 90d OR 2+ disputes lost/quarter
- Premier → Trusted: similar thresholds

**Tier perks (PLATFORM_SPEC Tier 1):**
- **Verified:** baseline commission, base price list
- **Trusted:** volume discount tiers (e.g., 500–1,999 @ $X, 2,000–9,999 @ $Y, 10,000+ @ $Z), prime listing placement
- **Premier:** creator-specific rate cards, premium SLA, direct access to Pavel

**Team model (P3, LOCKED):**
- `PartnerMembership` (org-wide, isAdmin flag, soft-remove)
- `PartnerServiceMembership` (service-scoped PREPRESS/PRODUCTION roles; operational access)
- `PartnerInvite` (token, 14d TTL, grant payload)
- Creator releases, admin surfaces (team, payments) admin-gated via `requirePartnerAdminAccess`
- Operational queues scoped to workable services per team member

---

### 9. AI PACKAGING GENERATOR

**Status:** PLAN (design locked, P0–P2 buildable, P3 blocked on image-gen)

**Two-layer generation (AI_PACKAGING_GENERATOR.md §10):**
- **Creative layer:** AI generates concept design (layout, color, text, imagery)
- **Compliance layer:** Deterministic vector marks (FDA/AAFCO panels, allergen disclosure, etc. — no image-gen needed)

| Phase | Content | Status | Dependency |
|-------|---------|--------|------------|
| **P0** | Prompt + compliance engines (pure, testable) | ✅ Buildable now | Zero external deps |
| **P1** | Structure lock + compositor (pure, merges layers) | ✅ Buildable now | Zero external deps |
| **P2** | UX shell (no model call; competitive-analysis stub, result tray, credit chip) | ✅ Buildable now | Zero external deps |
| **P3** | Image-gen provider integration (fal + Recraft adapters) | ⏳ Blocked | Provider API key + `packages/imagegen` |

**Reuses existing built infrastructure:**
- Dieline3DViewer + substrates (preview + parse correctness)
- Frames model for SVG slot positioning
- Canvas engine + brand assets
- Admin Design Studio "Admin Mode" (`/studio?adminMode=1`)
- AI rate-limiter (Tier 0.4) already in place

**Lives in:**
- Admin Design Studio (admin-only mode) as "Generate design" button
- Results shown in tray (thumbnail + metadata)
- Creator side: "Show more like this" on design detail (V1.5+)

**Deferred (P4+):**
- Reverse-prompt (competitive-analysis: scan existing design → generate variations)
- Per-tier AI generation limits

---

### 10. PRODUCTION WORKFLOWS (Print + Co-pack)

**Status:** Dispatch FSM BUILT; Print production flow IN-PROGRESS (P2 proof loop shipped)

**Dispatch lifecycle (PLATFORM_SPEC Tier 3.A.2, built + B6 in-progress):**
- PENDING (awaiting partner acceptance)
- ACCEPTED (partner confirms capacity)
- PRODUCTION_LOCKED (creator no longer edits design)
- IN_PRODUCTION (work started)
- PRODUCED (work finished, QC/proofs required before READY)
- READY (released to ship)
- IN_TRANSIT
- DELIVERED
- FAILED_QC → retry (admin, V1.1+)

**Print production (PRINT_PRODUCTION_WORKFLOW.md):**
- **P0/P1 shipped:** Role skins, dispatch detail eyebrow/title labels per DispatchType
- **P2 shipped (D3):** Proof loop (printer uploads proof → creator approves/rejects w/ annotations → approval locked before READY)
- **P2 shipped:** ProductionLot capture (output lot, expiry, yield, scrap reason, ingredient-lot mapping)
- **Deferred (P3):** Defect claim / reprint dispatch workflow (currently OrderDispute flow; reprint action deferred to Code)
- **Deferred (P3):** QualityHold model (pre-ship QC per dispatch FSM; post-ship = dispute)

**Co-packing (PRINT_PRODUCTION_WORKFLOW.md §2):**
- **P2 in-build:** Role skins + WorkOrderCard (component readiness: sibling legs of workflow graph showing upstream states)
- **P2 shipped:** ProductionLot + COA capture
- **Deferred (P3):** Capacity pause for co-pack legs (Blackout generalization in P2 ready)

**Quality dispute lifecycle (PLATFORM_SPEC Tier 3.B.4, V1 ready):**
- Creator files dispute within 14 days of delivery
- Partner responds within 7 days (approve refund / offer rework / reject)
- Admin mediates if both parties stuck
- Outcomes: REFUND_APPROVED / REWORK_ACCEPTED / DISPUTE_RESOLVED / DISPUTE_LOST

---

### 11. SUPPLIER MARKETPLACE & PRODUCT DISCOVERY

**Status:** V1 BUILT (marketplace reading PUBLISHED ProductTemplates); Creator upload scaffolding ready

**Marketplace (MARKETPLACE_DESIGN.md §7, DB-wired as of 2026-06-01):**
- Listing + detail read PUBLISHED ProductTemplates (indexed, filterable)
- Marketplace copy in MarketingCopyPanel JSON on ProductTemplate (admin-authored)
- 6 default filters + More group (all wired, shipping, category, manufacturing format, etc.)
- Niche (1 primary + ≤2 secondary per product; creator picks at publish)
- Pet inline in marketplace (no separate category)

**Creator product upload (POST-CANVAS WIZARD, DESIGN_STUDIO_REBUILD.md §8.1):**
- Post-canvas steps (after Design Studio): Basics (product name, domain, category) → Recipe → Packaging → Pricing
- Guided builder (from FOD, ported) replaced by turnkey single-flow (Blank/Clone/Starter orphans pending git rm)
- Pricing builder: per-variant SKU + base price + platform fee % + channel markups
- Multi-variant support via flavor presets (one ProductTemplate + N FlavorPreset overlay rows)

**Deferred (V1.1+):**
- Shopify push-to-channel (OAuth + listing push)
- Admin product moderation (approve/reject published products)
- Marketplace transparency report (public page, monthly cron)
- Creator profile pages (SEO play)
- White-label landing pages

---

### 12. COMPLIANCE & REGULATIONS

**Status:** V1 FOUNDATION BUILT; FDA/AAFCO label rendering in progress

**Label rendering (LABEL_RENDERING_STANDARD.md, spec-anchored):**
- **Built:** Nutrition Facts panels (cached from @ilaunchify/nutrition engine; calculator + toPanelData → NutritionFactsRenderer)
- **Built:** SoI (Statement of Identity) per recipe; SKU + GTIN per variant; labelingTypeLocked from category
- **In-progress:** Multi-domain compliance marking (FDA food, AAFCO animal feed, FDA supplement, MoCRA cosmetic — deterministic vector, spec-isolated SVG)
- **Deferred (V1.5):** Infant formula domain (21 CFR 106/107 regime, 90-day premarket submission — excluded V1 per L6 decision)
- **Deferred (V2+):** Second jurisdiction (CA/EU rule packs)

**Compliance service (from FOD, ported):**
- Python service with rule packs (`us-fda-food-2026.json`, `us-fda-supplements-2026.json`)
- `POST /v1/compliance/check` returns violations, warnings, required disclosures
- ComplianceCheck audit log on every call
- Label PDF via WeasyPrint, stored to R2

**Domain gating (admin toggleable, V1):**
- DomainSetting table (Food, Supplement, Pet, Cosmetic, OTC) with `isDomainEnabled` flag
- Step 1 domain picker server-enforced per setting
- Food + Supplement enabled at V1 launch; others admin-controlled

**Ingredient sourcing (INGREDIENT_SOURCING.md, LOCKED):**
- Two-name model: internalName (recipe/cost) + labelDeclarationName (FDA label)
- Picker: USDA, Curated (iLaunchify), Partner-private (self-attested, immediately usable)
- Partner-private ingredient governance: admin scales via banned-list, >5% flags, promotion queue (not blocking, informative)

**Markets & Regions (MARKETS_AND_REGIONS.md, schema-ready V1.5+):**
- **Market** = regulatory jurisdiction (label rules; V1 US-only ACTIVE, CA/EU deferred)
- **Region** = geography (proximity, shipping); routing factor (V2+)
- Cross-border routing is V2+

**Deferred:**
- Subscribe & Save (V1.5+) — involves complex partner discount tiers, creator commitment, recurring Stripe, partial fulfillment
- Infant formula (V1.5+) — separate 21 CFR 106/107 regime
- Second jurisdiction (V2+) — CA/EU rule packs
- Customs/tax nodes (V2+) — cross-border support

---

### 13. FINANCIAL & PAYMENTS

**Status:** V1 BUILT (Stripe Connect Express + order payment); Fee Manager built

**Creator payment (order checkout):**
- **Built:** Stripe Checkout for production orders (creator pays iLaunchify; iLaunchify pays partner via Connect)
- **Built:** Order-level fee calculation: platform fee % on production order (Maker 15%, Builder 12%, Agency 10%)
- **Built:** Subscription billing FSM (monthly recurring, 7-day grace period before auto-downgrade to Maker tier on payment failure)

**Partner payouts (Stripe Connect Express):**
- **Built:** Stripe Connect dashboard link (minted per session, never stored, org-scoped for admin teammates)
- **Built:** Monthly settlement per partner (automated, off-platform billing)

**Fee manager (PLATFORM_SPEC Tier 1.2.3, db-driven, V1 must-have):**
- **Built:** `SubscriptionPlan` + `PlanFeature` models (all numeric tiers + feature gates DB-driven, editable admin UI)
- **Built:** Tier price points, feature gates, promotion rules (all non-code)

**Warehouse billing (L9 decision, V1.5+ for API):**
- V1: pass-through (creator-warehouse billing direct, off-platform). iLaunchify = $0.
- V1.5: pass-through + referral fee (small monthly/% of revenue). Recurring revenue.
- V2: full intermediation (creators pay iLaunchify; iLaunchify pays warehouse with markup). Meaningful recurring + standardized SLAs.

**Insurance (L4 decision, deferred L1.1):**
- **FOB Origin in ToS + opt-out shippers-interest at checkout**
- OFF until STRIPE_TESTMODE_VERIFICATION checklist passes (payments-readiness pattern)
- **V2 addition:** "Production Protection" — creator pays extra 2% on order; iLaunchify guarantees production regardless of partner fault

**Deferred (V1.5+):**
- Subscribe & Save billing (partner discount tiers config, creator commitment, recurring Stripe, partial fulfillment)
- Capacity calendar monetization (V1.5+)
- Tier-based commission adjustments (V1.5+)

---

### 14. ADMIN SURFACES

**Status:** V1 BUILT (RBAC, sidebar, settings, partner verification)

**Admin RBAC (ADMIN_RBAC.md, P0 shipped):**
- **Built:** AdminRole + requireCapability(userId, cap) guard model (null → SUPER_ADMIN, all caps)
- **Built:** Capability presets (SUPER_ADMIN, partner reviewer, logistics monitor, support agent, finance, etc. — configurable per role)
- **Deferred (P1):** Refund approval gate (partner-facing; admin fence TBD)

**Admin sidebar v3 (LOCKED ilaunchify-admin-sidebar-v3-locked.md, hide-until-built rule):**
- 3 nesting levels (nav groups)
- Current sections: Dashboard, Products, Partnerships, Logistics, Integrations, Settings, Help, Support
- Hide-until-built rule: new nav items only appear when their feature ships

**Admin surface pattern (ilaunchify-admin-surface-pattern.md, cream header #F3EFE8):**
- Header band (now --bg-hero per CLAUDE.md)
- Sortable plain table (no shadcn/ui Card)
- URL filter chips
- Status pills

**Admin feature inventory (PLATFORM_SPEC Tier 4):**
- ✅ **Built:** Subscription billing visibility (admin sees all creator subscriptions, can override tier)
- ✅ **Built:** Tier promotion candidates (Verified → Trusted auto-flip, Trusted → Premier admin interview queue)
- ✅ **Built:** Domain settings (on/off toggles per domain)
- ✅ **Built:** Integrations registry (env-backed STATUS center, shows configured/missing, never values)
- ✅ **Built:** Partner verification (section progress, doc upload, admin review)
- ✅ **Built:** Logistics shipments, fulfillment-centers, carriers, channel-plans, order-detail SLA/override
- ✅ **Built:** Receiving-exceptions inbox (discrepancies, claims, admin mediation)
- ✅ **Built:** Partner ramp queue (first-3 dispatches per partner, admin confirm)
- ✅ **Built:** SLA monitor (at-risk/breached, unconfirmed, releases past window)
- ✅ **Built:** Partner scorecards (on-time %, defect rate, discrepancies, reprints, yield — read-only V1)
- ✅ **Shipped (2026-07-02):** Doc-track verification checklist (role-specific track vs uploads, missing/expired flags)
- ⏳ **Deferred (V1.1):** Admin product moderation (approve/reject published products, bulk ops)

**Settings (OrderSettings singleton):**
- **Built:** Production fee by creator tier (%, base default)
- **Built:** Warehouse referral fee (%)
- **In-progress:** Logistics settings (carrier, FC, insurance, channel toggles per L1/L2 pattern)
- **In-progress:** Channel inventory knobs (days-of-cover default, auto-alert threshold)

---

### 15. RECENT DEVELOPMENTS & HANDOFFS (2026-06-20 → 2026-07-02)

| Date | Component | Handoff/Completion |
|------|-----------|-------------------|
| 2026-06-22 | Routing binding model | Decisions D1–D5 LOCKED (owner-pinned manufacturing, fallback for null, generic-BOM V2-only, multi-flavor lead time) |
| 2026-06-25 | Theme Studio + design tokens | Phase 0+1 shipped (admin design-token manager, WCAG AA publish-gates) |
| 2026-06-30 | Per-flavor recipes | Schema live; UI support in progress for per-flavor recipe data + declared panel rendering |
| 2026-07-01 | AI Generator state snapshot | P0–P2 buildable with zero external deps; P3 blocked on image-gen provider key |
| 2026-07-02 | **MAJOR:** Logistics & fulfillment | **L0–L4a COMPLETE** (9 phases, all decisions locked, admin-gated toggles, ready for real FC partners) |
| 2026-07-02 | **MAJOR:** Partner role accounts | **P0–P3 COMPLETE** (FC + team model + proof loop + co-pack/printer skins, multi-seat foundation, role-routed notifications) |
| 2026-07-02 | **MAJOR:** Channel management | **C0–C2 COMPLETE** (foundation, Shopify in-build, route-and-pay auto-billing, inventory ledger, ondemand-enable gate) |
| 2026-07-02 | Partner role accounts | RAMP queue (D4) shipped — first-3 dispatches per partner flagged, manual admin confirm |
| 2026-07-02 | Partner role accounts | Daily digest channel — one summary email/user per day (13:00 UTC), P2/P3 alerts coalesced |
| 2026-07-02 | Go-live acceptance kit | docs/GO_LIVE_ACCEPTANCE.md — 45-min walkthrough gating real-partner onboarding (supersedes FC_DRY_RUN) |

**Handoff to Code (deferred/Code-owned):**
- `routing.ts` DISPATCH_RECEIVED fan-out (3× dispatch creation sites) — swap to `dispatchToPartnerService` when routing unfrozen
- `createReprintDispatch` action + `OrderDispatch.reprintOfDispatchId` self-relation mechanical backfill
- Per-flavor design history scope tweak (`flavorPresetId: null`, builder version-history restore)

---

### 16. DEFERRED TO V1.5

| Feature | Why | Planned |
|---------|-----|---------|
| Subscribe & Save | Complex (partner config, creator commit, recurring Stripe, partial fulfillment); wait for real demand signal | V1.1 post-launch |
| Shopify OAuth + push-to-channel | Channels scaffolding live in V1; creators need inventory to push (30–60 days post-launch) | V1.1 |
| Channel 2–6 (Amazon, Etsy, Wix, etc.) | Each is own integration effort; sequence after Shopify | V1.1 post-launch |
| Capacity calendar | Optimization; V1 first-match works for small partner pool | V1.1 |
| Pause-not-cancel (creator subscriptions) | Churn optimization, edge case | V1.1 |
| Capacity pause for print/co-pack legs | Blackout generalization in P2; behavioral enforcement deferred | P3 (Code owns) |
| AI features per tier | Defer until basic version used | V1.1 |
| Marketplace transparency report | Need ≥1 quarter operational data before publishing | V1.1 |
| Per-flavor label design in Studio | Can't design per-flavor labels yet; substrate exists but inert. LOCKED: shared base + per-flavor overrides | V1.5 |
| ShipBob FulfillmentConnector | Behind admin toggle; lands when agreement signed | V1.5 (L4) |
| Weighted FC scorer (L4a → L4) | Phase 1 (hard eligibility) + admin confirm ships V1; Phase 2/3 (scoring + rotation) land V1.5+ | V1.5 |
| Creator /inventory VMI view (L4a) | Storage units by location, lots, FEFO warnings | V1.5 (L4a) |
| Proof loop default (D3) | OFF at launch, manually ON for first order per creator×printer pair (to avoid surprises); auto-ON logic can ship later | V1 (already shipped) — actually already built |
| Reprint dispatch workflow | OrderDispute flow (V1 ready); dedicated reprint action deferred to Code | V1.5+ |
| Tier auto-promotion (V1.1+) | Verified→Trusted auto-flip (nightly cron) works V1; Trusted→Premier interview queue ready. Auto rules → code. | V1.1 |
| Tier scorecard behavioral gates | Scorecards read-only V1 (data collected); auto-consequences deferred | V1.5+ |
| Partner-to-creator messaging | Email sufficient V1; messaging = V1.1 QoL | V1.1 |
| Cold chain (CHILLED/FROZEN) | Full schema + classifier built, shipped GATED OFF. Flip ON when FC + reefer rail + insurance rider in place | V2 (L5) |
| WFS / FBT adapters (L4) | FBA ships V1 (L3); WFS+FBT follow (P1–P2) | V1.5+ (L4) |
| Trackstar FC abstraction (L5) | One integration → 100+ WMS backends for independent warehouses | V2 (L5) |
| Retail EDI (L5) | 940/943/944/945/846 for big-box (Americold, etc.) | V2 (L5) |
| Multi-flavor in product importer (V1.5) | New-product flow single-variant only; multi-flavor preset upload deferred | V1.5 |
| Creator tier #4 (Premium?) | Not planned; Agency is top tier | Future decision |

---

### 17. DEFERRED TO V2+

| Feature | Why | Planned |
|---------|-----|---------|
| **Mode 2: Aggregation Pooling** | Moat feature; requires pool windows, fairness logic, underwriting; needs demand density; building too early = broken UX | V2 |
| **Mode 3: Buffer Inventory** | Platform ops + working capital; platform owns stock; replenishment forecasting | V2 |
| **Generic-BOM shopping** | Creator shops for ingredients/components; platforms assembles. V1 = owner-pinned only. | V2 |
| **Creator product overrides** | Creators customize BOM per order. Deferred premium-tier feature. | V2 |
| **Real-time partner capacity** | V1 uses declared capacity only; real-time signals from partner MIS webhooks | V2 |
| **Tier auto-consequences** | Scorecards collected V1; auto-tier-down on SLA breach lands V2 | V2 |
| **Public creator profiles** | SEO play; not urgent for soft launch | V2 |
| **Public API** | Third-party integrations | V2 |
| **Multi-region (CA/EU)** | V1 US-only; CA/EU schema ready, no code yet | V2 |
| **Pet food / baby food rule packs** | Only if persona research validates | V2+ |
| **Marketplace creator-to-creator discovery** | Requires traffic; organic growth loop | V2+ |
| **Affiliate program** | Deferred post-V1; organic-first strategy | V2+ |
| **3D mockups — in-house generator** | Pacdora withdrew API (2026-07-03) → BUILD; G1+G2 LOCKED into V1.5, G3–G5 next, video V2 | V1.5 → V2 |
| **Custom rate cards** | Premier partners negotiate per-creator pricing | V1.5+ |
| **Print geographic routing** | Commodity leg optimization; blocked on V2 pooling | V2+ |
| **PREPRESS/PRODUCTION behavioral split** | Roles captured in memberships; enforcement joins Code's print-workflow gates | Code + P3 (future) |

---

## SCHEMA READINESS BY AREA

| Area | V1 Substrate | V1.5+ Ready | V2+ Ready | Notes |
|------|-----------|-----------|---------|-------|
| Logistics | ✅ L0 (ShipmentLeg, LogisticsSetting, FC models) | ✅ L4 (ShipBob FulfillmentConnector) | ✅ L5 (Buffer, Trackstar) | All additive; toggles prevent premature enable |
| Channels | ✅ C0–C2 (ChannelOrder FSM, ChannelProductLink) | ✅ C3–C5 (per-channel adapters) | — | Adapter pattern supports N channels |
| Routing | ✅ Mode 1 (ProductTemplateBOM, RoutingDecision) | ✅ Modes 2–4 (pooling/buffer breadcrumbs, telemetry) | ✅ V2 (full logic) | Breadcrumbs deferred, not blocking |
| Production | ✅ Dispatch FSM, ProductionLot | ✅ Proof loop (shipped), QC holds | ✅ V2 (pooling coordination) | Schema live; behavioral gates evolve |
| Compliance | ✅ Nutrition facts, label artifacts | ✅ Per-flavor labels, MoCRA | ✅ Multi-region (CA/EU) | Rule packs + vector marks additive |
| Partner team | ✅ PartnerMembership, PartnerServiceMembership | ✅ Role-scoped behavioral gates | — | Foundation shipped; refinement ongoing |
| Pricing | ✅ SubscriptionPlan, PlanFeature (db-driven) | ✅ Creator-specific rate cards | — | All config non-code |

---

## KNOWN BLOCKERS & GATES

### External dependencies

| Dependency | Status | Impact | Gate |
|------------|--------|--------|------|
| **Stripe test-mode verification** | In-progress checklist | Order payment, partner payouts | Must pass before launch |
| **Partner SP-API account** | Pending setup | Amazon FBA inbound (L3, C4) | Block C4 until setup |
| **Shopify test store** | Pending setup | Shopify OAuth + push (C1) | Block C1 until setup |
| **ShipBob commercial agreement** | Pavel negotiating | FC API adapter (L4, V1.5) | Block L4 until signed; build can proceed behind toggle |
| **Image-gen provider** (fal/Recraft) | Pending selection | AI Packaging Generator P3 | Block P3; P0–P2 buildable now |
| **Pacdora API** | ❌ RESOLVED 2026-07-03: no longer offered → in-house build | 3D mockups (MOCKUP_STRATEGY.md V2) | No external blocker; 2D V1 ready |

### Code-owned handoffs

| Handoff | Owner | Status | Impact |
|---------|-------|--------|--------|
| `routing.ts` DISPATCH_RECEIVED fan-out | Code | Pending | 3× dispatch-creation sites need to swap to `dispatchToPartnerService` when routing unfrozen (D1–D5 lock lifted 2026-06-22) |
| Per-flavor design history scope | Code | Pending | `flavorPresetId: null` to scope history to base design (builder version-restore per-flavor ready, seam left uncommitted in working tree) |
| Reprint dispatch action | Code | Pending | `createReprintDispatch` + `OrderDispatch.reprintOfDispatchId` self-relation adoption |
| Print-workflow PRODUCTION_LOCKED gates | Code | Pending | Role-scoped behavioral enforcement for PREPRESS/PRODUCTION members |
| Partner capacity pause | Code | Pending | Blackout enforcement for print legs (general model shipped P2, behavioral gates need routing integration) |

---

## V1 LAUNCH CHECKLIST (as of 2026-07-02)

**Go-live acceptance (§10, GO_LIVE_ACCEPTANCE.md):**
- ✅ A. Fulfillment Center loop (FC receive w/ lot gate, inventory, creator release, outbound, ledger, exceptions, facility settings)
- ✅ B. Print proof loop (role skin, proof requirement gate, round-trip approve/reject, notifications)
- ✅ C. Team roles & scoping (invite, accept, scoped nav, roster, routed notifications)
- ✅ D. Cron engines (partner-ops, notification-digest, idempotency, doc-expiry chain, SLA monitor)
- ✅ E. Admin oversight (ramp queue, scorecard, doc-track, audit trail)

**Remaining external gates:**
- ⏳ STRIPE_TESTMODE_VERIFICATION.md (order payment + payouts handshake)
- ⏳ Logistics: FC partner dry-run, carrier setup, insurance rider verification
- ⏳ Channels: Shopify test store OAuth, Amazon SP-API account setup

**Design Studio:**
- ✅ Multi-surface foundation + AI compliance scan
- ✅ Path A (upload) + Path B (template + brand-fill)
- ⏳ Per-flavor label design UI (schema ready, locked; UI deferred V1.5)

**Known V1 limitations (expected, not failures):**
- FC fee snapshot at receipt (not checkout)
- CUFT accrual shows "—" until ledger P1.8
- Release tracking manual until EasyPost FC lanes (V1.5 L4)
- Pallet balance static per release
- RAMP = review ritual (no hard routing block until findRouting unfrozen)
- PREPRESS/PRODUCTION roles grant identical access until Code's print-workflow gates
- Routing.ts DISPATCH_RECEIVED still founder-routed until Code's swap

---

## OPEN DECISIONS / TO-BE-MADE

1. **Subscription tier prices** — Builder $49 vs $99; Agency $199 vs $299. Likely settled by surveying first 5 soft-launch creators.
2. **Cron infrastructure** — Vercel Cron (V1) vs Fly.io scheduled worker if limits exceeded (V1.1).
3. **Quote validity window** — 24h for direct routing (recommended); shorter within active pooling window.
4. **Partner capacity** — V1 = declared only; real-time signals (V2+) requires partner MIS integration.
5. **Cross-product orchestration** — V1 = independent per product; V2 = shared partner efficiencies across order.

---

## BUILD EFFORT SUMMARY

| Phase | Working days | Timeline | Status |
|-------|--------------|----------|--------|
| **V1 core** | ~49–54 days | ~11 weeks | ✅ MOSTLY SHIPPED (2026-07-02) |
| **Design Studio** | ~19.5 days | Weeks 4–7 | In-progress (multi-surface + AI scan) |
| **Logistics L0–L4a** | ~40+ days | Shipped | ✅ COMPLETE 2026-07-02 |
| **Channels C0–C2** | ~30+ days | Shipped | ✅ COMPLETE 2026-07-02 |
| **Partner accounts P0–P3** | ~35+ days | Shipped | ✅ COMPLETE 2026-07-02 |
| **Remaining V1** | ~10 days | Weeks 8–11 | In-progress (routing, verification, tier promotion, cancellation) |

---

## READING ORDER FOR STAKEHOLDERS

**Founder (executive overview):**
1. This document (overview + decision log)
2. docs/ROADMAP.md (12-week plan, V1 definition)
3. docs/PLATFORM_SPEC.md §Tier 4 (feature inventory + build sequence)

**Design/UX:**
1. docs/DESIGN_STUDIO.md (multi-surface, AI scan, compliance regions)
2. docs/MOCKUP_STRATEGY.md (2D admin-drawn, V1.5 library, V2 Pacdora)
3. docs/DESIGN_SYSTEM.md (LOCKED color/type, dark-hero pattern)

**Engineering (features):**
1. docs/PRODUCTION_ORCHESTRATION.md (Mode 1 routing, V1 algorithm)
2. docs/LOGISTICS_AND_FULFILLMENT.md (L0–L4a phases, admin toggles, FCs, channels)
3. docs/ROUTING_BINDING_MODEL.md (owner-pinned manufacturing, D1–D5 LOCKED)
4. docs/PARTNER_ROLE_ACCOUNTS.md (P0–P3, three roles one chassis, team model)
5. docs/CHANNEL_MANAGEMENT_SPEC.md (C0–C5 phases, adapters, route-and-pay)

**Engineering (compliance/payment):**
1. docs/PLATFORM_SPEC.md §Tier 1–3 (FSMs, tier model, monetization)
2. docs/COMPLIANCE.md + docs/LABEL_RENDERING_STANDARD.md (FDA/AAFCO, spec-anchored)
3. docs/PAYMENTS.md + docs/STRIPE_TESTMODE_VERIFICATION.md (Stripe, test gates)

**Operations (go-live):**
1. docs/GO_LIVE_ACCEPTANCE.md (45-min partner walkthrough, blockers)
2. docs/LOGISTICS_AND_FULFILLMENT.md §11 (implementation phases, FC rollout)
3. docs/PARTNER_ROLE_ACCOUNTS.md (partner onboarding, doc tracks, team)

**Partner success (onboarding):**
1. docs/PARTNER_ONBOARDING.md (5-layer model, 10-state FSM, verification)
2. docs/PARTNER_ROLE_ACCOUNTS.md (operational setup, doc tracks, team)
3. .auto-memory/ilaunchify-partner-team-model.md (lightweight team reference)

---

**Compiled by:** Comprehensive docs/memory sweep, 2026-07-03  
**Coverage:** 156 `.md` files in docs/ + 79 `.md` files in .auto-memory/  
**Confidence:** Very high (all major decisions LOCKED as noted; phase markers consistent across sources)
