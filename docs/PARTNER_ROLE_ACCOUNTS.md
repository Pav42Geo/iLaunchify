# PARTNER ROLE ACCOUNTS — Fulfillment Center, Co-packer, Print Provider

**Status: LOCKED 2026-07-02 — Pavel approved all recommendations D0–D6.** D0 FC rename (enum stays) · D1 team in P3 · D2 lot+expiry hard gate day one · D3 proofs off-by-default, auto-on first order per creator×printer · D4 RAMP N=3 · D5 SMS deferred V1.5 · D6 FC-first, co-pack/print skins in P2.
Created 2026-07-02 (Cowork). Companions: `PARTNER_ONBOARDING.md`, `LOGISTICS_AND_FULFILLMENT.md`, `MULTI_PARTNER_APPROVAL_WORKFLOW.md`, `PLATFORM_SPEC.md`, `PRINT_PRODUCTION_WORKFLOW.md`.

Goal: bring the three under-built partner roles to full working accounts — each with its own workspace, onboarding track, settings, team, and notifications — as **one homogeneous mechanism**: one portal chassis, four role skins.

---

## 0. Naming `[P-DECIDE D0]`

Rename the external/UI name **Warehouse → Fulfillment Center** ("FC"). More professional, matches industry language (3PL/FC), and matches our own docs (FC network, fc-scorer, FcAwardLog).

- UI copy, marketing pages (`/partners/fulfillment`), emails: "Fulfillment Center".
- **Enum `ServiceType.WAREHOUSE` stays** — no migration, no churn in fc-selector/shipping code. Label map only (`SERVICE_TYPE_LABEL`).
- `OrderShipToType.WAREHOUSE_PARTNER` also stays as-is internally.

---

## 1. Audit — what exists today (2026-07-02)

### 1.1 Built and generic (all four roles get it free)

| Surface | Notes |
|---|---|
| Onboarding 4-section accordion + 5-layer FSM | Service-type picker creates one `PartnerService` per type; per-type capabilities forms exist (incl. WAREHOUSE storage class/hazmat/capacity, LABEL_PRINTING die-cut + output spec) |
| 10-state Partner FSM + admin verification (5 sections) | `apps/admin/.../partner-fsm.ts`; ACTIVE gated on all 5 sections VERIFIED |
| Dashboard, /orders dispatch inbox, dispatch detail | Shaped for manufacturing (copy + statuses) |
| Certifications (claim/upload/review) | Generic; expiry surfaces in "needs attention" but no notification engine |
| Payments (Stripe Connect, transfers, 1099 via Stripe) | Partner payout-history UI partial |
| Settings: billing, notifications (5 events, email/in-app, quiet hours), tax docs | Event list is manufacturer-centric |
| Support ticketing, in-app notification feed | Generic |
| Admin: /partners, /leads, detail w/ FSM actions, services toggle, tiers, strikes, audit timeline, finance payouts/clawbacks | v2 pattern, capability-gated (`partners:approve` etc.) |
| Logistics substrate | `packages/shipping` (classifier, rate shop, EasyPost, dispatch doc gates, receiving checklists, cold-pack + storage math); StorageAgreement / StorageReleaseOrder / ShipmentLeg / FcAwardLog / ChannelInboundPlan models; admin Logistics surfaces — all admin-gated OFF |

### 1.2 Built but manufacturer-only

`/products` builder, `/packaging` (+die-lines/offerings), `/accessories`, `/settings/product-defaults`, dashboard copy ("Manufacturing · Home", "Producing/Ready to ship"), `/settings/storage` (MFG/COPACK storage *offering*, not FC config).

### 1.3 Partial

- **FC:** `/inbound` shows expected ShipmentLegs but has **no receive-confirmation form**, no discrepancy capture, no putaway/lot capture. No inventory view, no release-order (pick/pack/ship) queue, no billing ledger.
- **Printer:** `/print-spec` output-spec editor exists; dispatch detail reuses PRODUCT layout — no print-job view, no proof loop, no reprint/defect workflow.
- **Co-packer:** capabilities + storage offering exist; dispatch detail reuses PRODUCT layout — no work-order view, no lot/COA capture, no quality hold, no yield.

### 1.4 Missing entirely (all roles)

Team/multi-seat (schema reserved, spec in PRINT_PRODUCTION_WORKFLOW §2), holidays/blackout dates + capacity calendar, rate cards beyond capabilities JSON, document-expiry engine, SLA monitoring/escalation, role-specific KPIs, partner payout-history page, webhook channel, admin alerting.

---

## 2. Architecture principle — one chassis, four skins

Everything below reuses the existing chassis (auth, Partner FSM, dispatch FSM, notifications dispatcher, audit, Stripe, admin v2 pattern). Role differences are **data + one detail-page skin + one dashboard queue config** — never a parallel app.

**Role-skin registry** (new, `apps/partner/src/lib/role-skins.ts`):

```
ServiceType → {
  navItems[]            // sidebar inserts (Inbound, Inventory, Proofs…)
  dashboardQueues[]     // "needs my action now" queue definitions
  dispatchDetail        // which detail skin renders an OrderDispatch/ShipmentLeg
  kpis[]                // 5-card strip per role
  onboardingCapabilityForm
  settingsSections[]
}
```

Rules (from best-practice research, consistent with orchestration thesis):

1. **Task-queue-first dashboard** — landing answers "what needs my action now"; exceptions above KPIs.
2. **Exception-driven** — happy path is zero-click; the portal exists to resolve discrepancies, failed gates, holds, at-risk SLAs.
3. **Platform mediates everything** — claims, proofs, discrepancies flow through iLaunchify; creator↔partner never negotiate directly (Printify/ShipBob pattern; matches hidden-orchestration thesis).
4. **Hard gates where data is immutable later** — lot/expiry at receiving, artwork gate before print queue, proof approval before production. No backfill.
5. **Audit everything, partner-visible** — extend `packages/audit` timelines into partner detail pages, not just admin.
6. **Multi-service partners** — a partner with MANUFACTURING + WAREHOUSE gets the union of skins; nav groups by service. Dashboard copy derives from services, never hardcoded "Manufacturing · Home".

---

## 3. Per-role workspace specs

### 3.1 Fulfillment Center (ServiceType WAREHOUSE)

The FC is the operational heart of V1.5 logistics (L1–L9 locked). Their portal = inbound → inventory → outbound + billing.

**Nav:** Dashboard · Inbound · Inventory · Outbound · Orders(history) · Certifications · Payments · Settings · Help

**Dashboard queues (in priority order):** receiving discrepancies open · arrivals expected today/this week · release orders awaiting pick · lots expiring ≤30d (FEFO) · capacity vs weeklyPalletCapacity.
**KPIs:** dock-to-stock hours · on-time ship % · open discrepancies · pallets on hand vs capacity · storage revenue (30d).

**A. Inbound (upgrade existing `/inbound`):**
- Expected arrivals from `ShipmentLeg` with manifest (SKU, qty, pallets, temp class, coolant), driven by existing `receivingChecklist` in `packages/shipping`.
- **Receive-confirmation form (P0 gap):** per-line received qty; condition OK/damaged; **lot + expiry capture mandatory for lot-tracked (food/supplement) SKUs — hard gate, immutable after confirm** (ShipBob pattern: no post-receipt backfill).
- Discrepancy record (over/short/damaged) with photos → status `OPEN → UNDER_REVIEW → RESOLVED`; inventory auto-held until resolved; notifies admin + creator (platform-mediated).
- Receiving SLA: received within N business days of delivery scan (default 5, admin-tunable in LogisticsSetting).

**B. Inventory:**
- Partner-side view of `StorageAgreement` rows at their facility: SKU/lot/expiry, units + pallets remaining, on-hand/reserved/available, mode (ON_DEMAND vs STOCK_RELEASE), storage accrual to date (reuses storage-accrual math).
- FEFO expiring-soon list. Adjustments only via discrepancy/disposition flow (audited), never free-edit.

**C. Outbound:**
- `StorageReleaseOrder` queue: REQUESTED → PICKING → SHIPPED (existing enum) with pack confirmation, label fetch via EasyPost rail, tracking auto-attached. Bulk actions (accept picks, print labels).
- Ship SLA per release order; at-risk flag before breach.
- Scanner-friendly: barcode input auto-focus on pick/pack screens (responsive, no native app in V1).

**D. Billing ledger (differentiator — opaque billing is the #1 3PL complaint):**
- Line-item ledger: receiving fee, storage accrual (per PALLET_MONTH/CUFT_MONTH snapshot in `feeSnapshotJson`), pick/pack fees, VAS — visible continuously, not month-end. Feeds Transfers.

**E. FC settings:** facility profile (address/geo, storage classes, hazmat, certs, weeklyPalletCapacity), `receivingSpecJson` editor (appointment rules, pallet spec, label placement), blackout dates, rate card (storage/pick/pack — currently PartnerService fields; formal RateCard V1.5).

### 3.2 Co-packer (ServiceType COPACKING)

**Nav:** Dashboard · Work Orders · Orders(history) · Certifications · Payments · Settings · Help

**Dashboard queues:** WOs awaiting acceptance (deadline countdown) · component shortages flagged · QC holds open · WOs due this week.
**KPIs:** on-time completion % · yield (actual/expected) · open holds · WOs in progress · earned 30d.

**A. Work-order detail (skin over `OrderDispatch type=COPACKING`):**
- Fill/assembly spec: recipe + packaging snapshot **frozen at acceptance** (legal reproducibility — locked operating principle), run size, due date.
- Component-readiness panel: what iLaunchify routes in (from print leg / creator-supplied) vs co-packer-supplied, with inbound tracking of upstream legs in the workflow graph.
- Milestones pushed to creator (translated, orchestration-hidden): materials staged → in production → QC → released → shipped.

**B. Lot traceability + COA (P0 for food credibility):**
- Per WO: output lot number(s), ingredient-lot mapping (which input lots went in), COA/batch-record upload attached to lot. New models: `ProductionLot`, `LotDocument` (additive).
- One-click trace report (recall-ready) — admin + creator visible.

**C. Quality hold:** first-class state on WO/lot — blocks downstream shipping legs in the workflow graph until disposition (RELEASE / REWORK / REJECT), evidence attached, all audited.

**D. Yield reporting:** expected vs actual per WO + scrap reason; feeds partner scorecard.

**E. Settings:** line capabilities, allergen/changeover declarations, weekly capacity + blackout dates, storage offering (existing `/settings/storage`).

### 3.3 Print Provider (ServiceType LABEL_PRINTING)

**Nav:** Dashboard · Print Jobs · Proofs · Orders(history) · Certifications · Payments · Settings · Help

**Dashboard queues:** jobs awaiting acceptance · proofs awaiting creator approval (waiting on others) · artwork flags open · jobs due this week.
**KPIs:** on-time % · reprint/defect rate · jobs in queue · avg turnaround · earned 30d.

**A. Print-job detail (skin over `OrderDispatch type=LABEL`):**
- Job = normalized die-line SVG print master + substrate/finish/quantity + partner's own `printOutputSpec` echoed as the contract.
- **Artwork gate:** platform owns preflight (Studio produces the print master — die-line normalization spec); the printer's gate is *accept / flag received file* with reason codes (wrong dieline version, unprintable spec, missing bleed). Flag = exception → platform mediates, never printer↔creator.
- Statuses: RECEIVED → PREFLIGHT_OK/FLAGGED → QUEUED → PRINTING → FINISHING → QC → SHIPPED (maps onto dispatch FSM; sub-states additive on dispatch record).

**B. Proof loop `[P-DECIDE D3]`:** optional per job (creator- or admin-triggered): printer uploads versioned proof → creator approves/rejects with annotation in creator app → approval locked before production. V1 can ship with proofs OFF by default, ON for first order per creator×printer pair.

**C. Reprint/defect workflow:** claim (photos) → platform adjudicates → reprint dispatch (no new charge) or refund; defect rate feeds partner score + routing weight for commodity print legs (manufacturing legs stay owner-pinned — do not touch findRouting).

**D. Capacity pause:** printer can pause intake (vacation/overload) → commodity print legs reroute to alternates within cost-delta cap (Printify pattern; cap admin-tunable in OrderSettings).

**E. Settings:** `/print-spec` (exists), die-cut support, substrates/finishes, capacity + blackout dates.

### 3.4 Manufacturer (parity additions, not rebuild)

Already the most complete. Add for homogeneity: role-skin dashboard queues (accept deadline, QC due, expiring certs), lot/COA capture on production dispatches (same `ProductionLot` models as co-packer), HOLD_AT_MANUFACTURER inventory view (StorageAgreements at own facility — storage math exists), sample-order queue as typed lane (sample policy locked), blackout dates.

---

## 4. Onboarding — shared FSM, role-specific tracks

The 5-layer model + 10-state FSM stay exactly as locked (approval ≠ activation). What changes: **Layer 2 capability forms and Layer 3 document checklists become role-tracked**, plus two additions.

### 4.1 Role-specific document checklists (Layer 1/3)

Every document = `{type, file, issuedAt, expiresAt, status}` → feeds the Expiry Engine (§6.4). Gate = *capability suspension*, not account suspension (a lapsed food cert de-lists food eligibility, doesn't kill the account).

| Document | MFG | Co-pack | Print | FC |
|---|---|---|---|---|
| KYB / business verification, W-9, Stripe Connect | ● | ● | ● | ● |
| Certificate of Insurance (COI) w/ limits + expiry | ● | ● | ● | ● |
| FDA facility registration # | ● | ● | — | ○ food |
| GFSI cert (SQF/BRC/FSSC) or GMP audit report | ● | ● | — | ○ food |
| HACCP / allergen program / recall SOP | ● | ● | — | ○ food |
| Organic/Kosher/Halal (if claimed) | ○ | ○ | — | — |
| Food-grade facility attestation | — | — | ○ | ● food |
| Hazmat handling cert (if hazmatAccepted) | — | — | — | ○ |

(● required · ○ conditional. All map to existing CertificateType/PartnerFile + new expiry fields.)

### 4.2 Role capability forms (Layer 2 — mostly exist)

- **FC:** exists (storage classes, hazmat, capacity, geo) + add `receivingSpecJson` guided editor + parcel/LTL abilities.
- **Co-packer:** fill/assembly formats, line specs, allergen segregation, MOQ/lead time + weekly capacity.
- **Printer:** exists (die-cut, output spec) + substrates/finishes + turnaround commitment.

### 4.3 Two additions to the flow

1. **Sandbox dispatch before full activation (Layer 5 upgrade) `[P-DECIDE D4]`:** after ACTIVE, first N live dispatches are flagged `RAMP` — manual admin confirm on completion before unrestricted routing (mirrors the locked channel manual-confirm-first-10 pattern). N default: 3.
2. **Time-to-first-order metric:** stamp `activatedAt` → `firstDispatchCompletedAt`; admin KPI on /partners. Onboarding is the churn point — measure it.

---

## 5. Team & user roles (multi-seat)

V1 partners are single-user. Implement the **locked team model** (PRINT_PRODUCTION_WORKFLOW §2.1–2.7, memory `ilaunchify-partner-team-model`): `PartnerMembership` (org-wide) + `PartnerServiceMembership` (service-scoped), equal memberships, no seniority.

- **Org roles:** OWNER (billing, contract, Stripe, team mgmt — exactly one required) · ADMIN (everything but Stripe/contract) · MEMBER (operational only).
- **Service scoping:** a member can be scoped to WAREHOUSE service only (FC ops associate never sees print jobs).
- **UI:** `/settings/team` — invite by email, role picker, service scope, deactivate. Admin sees memberships on partner detail.
- **Why now (not V1.5):** notification role-routing (§6.2) and FC ops reality (dock staff ≠ owner) both depend on it. This is the single biggest unlock for "professional" partner accounts.
- Ownership checks go through centralized guards in `packages/auth` (security architecture — tenant isolation is threat #1). Every partner query keyed by membership, not `User.partner` 1:1.

---

## 6. Notifications & alerting

### 6.1 Severity tiers (every event maps to exactly one)

| Tier | Meaning | Delivery |
|---|---|---|
| **P0 Critical** | Money/safety/legal, hard SLA breach | Realtime all channels, **ignores quiet hours**, escalates if unacked |
| **P1 Action needed** | Blocks an order | Realtime email + in-app (+ webhook); escalate to OWNER if unacked N hrs |
| **P2 Attention** | This week | In-app + **daily digest** email |
| **P3 Informational** | FYI | In-app + optional weekly digest |

### 6.2 Event catalog additions (NotificationEvent enum, additive)

- **FC:** `INBOUND_ARRIVING` (P2) · `INBOUND_DELIVERED_UNCONFIRMED` (P1, receiving SLA) · `RECEIVING_DISCREPANCY_OPENED/RESOLVED` (P1/P3) · `RELEASE_ORDER_REQUESTED` (P1) · `RELEASE_SHIP_SLA_AT_RISK` (P1) · `LOT_EXPIRING_SOON` (P2) · `STORAGE_CAPACITY_WARNING` (P2)
- **Co-pack:** `WORK_ORDER_RECEIVED` (P1) · `COMPONENT_SHORTAGE` (P1) · `QUALITY_HOLD_OPENED` (P0) · `QUALITY_HOLD_RESOLVED` (P3) · `COA_MISSING_AT_COMPLETE` (P1)
- **Print:** `PRINT_JOB_RECEIVED` (P1) · `ARTWORK_FLAGGED` (P1) · `PROOF_AWAITING_YOU` (P1, creator side) · `PROOF_APPROVED/REJECTED` (P1) · `DEFECT_CLAIM_FILED` (P1) · `REPRINT_DISPATCHED` (P2)
- **All roles:** `DOC_EXPIRING_60/30/7` (P2/P2/P1) · `DOC_EXPIRED_CAPABILITY_SUSPENDED` (P0) · `DISPATCH_SLA_AT_RISK` (P1, at ~50% of accept window) · `DISPATCH_SLA_BREACHED` (P0, admin too) · `PAYOUT_SENT` (P3) · `WEEKLY_DIGEST` (P3)

### 6.3 Routing + preferences

- **Role-based routing:** OWNER gets commercial/compliance (payouts, contract, doc expiry, P0); service-scoped MEMBERs get their service's operational queue. Depends on §5.
- Preference matrix = event × channel per user (existing `NotificationPreference` extends); defaults per severity; quiet hours honored for P1–P3, never P0.
- **Channels:** EMAIL + IN_APP (exist) → add DIGEST (cron) now; WEBHOOK (Layer-5 integration partners) V1.5; SMS for P0 only V1.5 `[P-DECIDE D5]`.
- Escalation ladder example (accept window 24h): 12h unacked → remind assignees · 20h → OWNER · 24h → breach: admin alert + auto-reroute per existing timeout logic.
- Every notification deep-links to the exact queue item.

### 6.4 Net-new engines (the two pieces of real infrastructure)

1. **Expiry Engine** — nightly cron over all expiring rows (CertificateInstance, PartnerFile/COI, contracts): emits `DOC_EXPIRING_*`, auto-suspends the affected *capability* on lapse, admin dashboard of upcoming expiries. Generic — creators/channels reuse later.
2. **SLA Escalation Engine** — generalizes `runStaleOrderAutoCancel` into a rule table `{watchedEntity, slaField, warnAt%, escalateTo[], breachAction}` covering dispatch accept, receiving confirm, release-order ship, proof approval, support (SLA logic exists in ticketing — unify).

---

## 7. Admin management additions

Existing chassis (FSM, verification, services toggle, tiers, strikes, finance, logistics) stays. Add, all in v2 surface pattern:

1. **Role-aware partner review:** verification checklist shows the role-specific doc track (§4.1); reviewer sees which docs gate which capability.
2. **Compliance dashboard** `/admin/compliance/expiries`: all partner docs by expiry bucket (expired / ≤7 / ≤30 / ≤60), capability-suspension log. (Capability: `compliance:admin`.)
3. **SLA monitor** `/admin/operations/sla`: at-risk + breached across dispatch accept, receiving, release-ship, proofs; links to reroute actions.
4. **Discrepancy/claims inbox** — shipped at `/admin/logistics/receiving-exceptions` (fits the locked Logistics sidebar group; defect claims + quality holds join it in P2): receiving discrepancies — the platform-mediation workbench. This is where "hide the orchestration" gets operationalized.
5. **Ramp queue:** partners in RAMP with per-dispatch confirm (§4.3).
6. **Partner scorecards:** on-time %, defect/reprint rate, discrepancy rate, yield — read-only V1, feeds tier auto-promotion V1.1 and commodity-leg routing weights V2. (Never bind tier names to behavior — placeholder rule stands.)
7. **New capabilities:** `operations:read/write` for SLA + exceptions surfaces; wire into role presets.

---

## 8. Schema deltas (all additive — prisma-migrator rules apply)

- `PartnerMembership`, `PartnerServiceMembership` (per locked team-model shape)
- `ProductionLot`, `LotDocument` (lot ↔ dispatch ↔ ingredient-lot mapping, COA files)
- `ReceivingDiscrepancy` (shipmentLegId, lines JSON, photos, status FSM)
- `QualityHold` (lotId/dispatchId, reason, disposition, evidence)
- `ProofRound` (dispatchId, version, fileId, status, annotation)
- `DefectClaim` (dispatchId, photos, adjudication, resolution)
- `PartnerBlackoutDate` (partnerServiceId, range, reason)
- Expiry fields where missing: `PartnerFile.expiresAt`, `PartnerFile.docType`
- `SlaRule` + `SlaWatch` (escalation engine) · `NotificationEvent` additions (§6.2)
- Dispatch sub-status for print/copack stages (additive enum or `stageJson`)

No drops, no renames. CockroachDB rules: bare `String`, uuid ids, AuditLog on every mutation, FSM helpers not inline updates.

---

## 9. Implementation plan (phases; each independently shippable)

**Phase P0 — Chassis + FC receiving (the go-live blocker)**
1. Role-skin registry + role-aware nav/dashboard/copy (kills "Manufacturing · Home" hardcode)
2. FC: receive-confirmation form w/ lot+expiry hard gate; discrepancy record + admin exceptions inbox (minimal)
3. Expiry Engine v1 (certs + COI; T-60/30/7 + capability suspension)
4. Notification events: FC set + DOC_EXPIRING_* + DISPATCH_SLA_AT_RISK; daily-digest channel
5. Role-specific onboarding doc checklists (Layer 1/3 forms + admin review view)

**Phase P1 — FC complete**
6. Inventory view (StorageAgreement partner-side, FEFO list)
7. Outbound release-order queue (pick/pack/ship + labels + bulk actions)
8. FC billing ledger v1 · FC settings (receivingSpec editor, blackout dates)
9. SLA Escalation Engine v1 (accept + receiving + release-ship)

**Phase P2 — Co-packer + Printer skins**
10. Work-order detail skin (spec snapshot, component readiness, milestones)
11. ProductionLot + COA capture + quality hold (co-pack AND manufacturer parity)
12. Print-job detail skin + artwork gate + statuses
13. Proof loop (creator-side approval UI) + defect claim/reprint workflow
14. Capacity pause + blackout dates (all roles)

**Phase P3 — Team + admin depth**
15. PartnerMembership/ServiceMembership + /settings/team + invites
16. Role-routed notifications + escalation ladders (full §6)
17. Admin SLA monitor + compliance dashboard + scorecards + ramp queue
18. Partner payout-history page + Stripe Express deep-link

**Phase P4 — V1.5+ (deferred, schema-ready)**
Webhook channel + integration registry per partner · SMS P0 · formal RateCard model · dock-appointment scheduling · tier auto-promotion · native scanner app · print geographic routing (V2 pooling material).

Suggested build split per two-agent rules: Cowork owns partner-app skins + admin surfaces; Code owns schema migrations + engines (`packages/*`) — hand off via this doc, commit per change.

**Build log:**
- 2026-07-02 (Cowork) — P0 items 1–2 + partial 4 shipped: role-skin registry (`apps/partner/src/lib/role-skins.ts`) wired into sidebar/layout/dashboard/notification-settings; FC rename in UI; schema deltas (InboundReceipt + lines, ReceivingDiscrepancy, PartnerFile.issuedAt/expiresAt, 6 NotificationEvents) + templates; receive-confirm upgraded with D2 lot+expiry hard gate (client + server), first-class receipt + discrepancy rows, RECEIVING_DISCREPANCY_OPENED admin fan-out. **Requires `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` before typecheck/dev.** Next: admin exceptions inbox, Expiry Engine cron, INBOUND_DELIVERED_UNCONFIRMED + DISPATCH_SLA_AT_RISK emitters, onboarding doc tracks.
- 2026-07-02 (Cowork, slice 2) — P0 items 3–4 complete: `/api/cron/partner-ops` (vercel.json, daily 9:00) running Expiry Engine v1 (PartnerFile 60/30/7 + DOC_EXPIRED w/ idempotent flags; certs stay in cert-expiry C4; hard capability suspension lands with doc tracks) + DISPATCH_SLA_AT_RISK (~50% window, `slaAtRiskNotifiedAt` dedupe) + INBOUND_DELIVERED_UNCONFIRMED (leg DELIVERED w/o receipt, `inboundUnconfirmedNotifiedAt` dedupe); admin exceptions inbox at `/logistics/receiving-exceptions` (list + adjudication detail, OPEN→UNDER_REVIEW→RESOLVED w/ required resolution note → FC notified; `orders:read`/`orders:write` gated); audit entity types InboundReceipt + ReceivingDiscrepancy. Remaining P0: role-specific onboarding doc tracks (item 5).
- 2026-07-02 (Cowork, slice 3) — **P0 COMPLETE.** Doc tracks shipped: shared §4.1 matrix in `packages/db/src/partner-doc-tracks.ts` (`docTrackFor(serviceTypes)`, REQUIRED/CONDITIONAL/OPTIONAL + `expiring` flag); partner `/onboarding/documents` renders the role-specific checklist (FC/printer/producing tracks) with mandatory expiry-date capture on expiring docs (feeds partner-ops cron); admin verification DOCUMENTS section shows the track-vs-uploads checklist (`DocTrackChecklist`) with missing/expired flags. Hard capability suspension on doc lapse remains P1 (needs docType→capability map).
- 2026-07-02 (Cowork, slice 4 — P1 items 6+7): partner `/inventory` (StorageAgreements at own facility incl. HOLD_AT_MANUFACTURER parity, units/pallets remaining, PALLET_MONTH accrual estimate via computeStorageAccrual — display-only, CUFT shows "—" until ledger P1.8; FEFO ≤90d panel from InboundReceiptLine lots) + partner `/outbound` (StorageReleaseOrder queue REQUESTED→PICKING→SHIPPED→DELIVERED, oldest-first, tracking capture at ship). Release FSM actions in `orders/[dispatchId]/releases-actions.ts` now shared by both surfaces (revalidateReleaseSurfaces). Nav via role-skins (WAREHOUSE partners); dashboard gains "Pick stock releases" queue item. Remaining P1: billing ledger (P1.8), FC settings (receivingSpec editor + blackout dates), SLA Escalation Engine generalization (P1.9); creator-side release-request UI for FC-held agreements if not already wired.
- 2026-07-02 (Cowork, slice 5): creator release-request UNBLOCKED for FC-held stock (storage-release-actions + StoredStockPanel gate now accept WAREHOUSE_PARTNER — was HOLD_AT_MANUFACTURER-only, the FC outbound queue had no trigger); partner `/billing` ledger (per-agreement grace/months/storage/pick-pack/platform-fee/net from frozen snapshots, display-only, charges stay gated); `/settings/fulfillment` (receivingSpecJson structured editor + blackout windows ≤60d); **new model `PartnerBlackoutDate`** (+ PartnerService.blackoutDates) — needs another `pnpm db:push && pnpm db:generate`. Blackout enforcement in fc-scorer/routing is a follow-up (currently declarative only). Remaining P1: SLA Escalation Engine generalization, doc-lapse capability-suspension map, FEFO enforcement on release pick.
- 2026-07-02 (Cowork, slice 6 — **P1 COMPLETE**): blackout enforcement live (FcCandidate.blackedOut hard filter in fc-selector, hydrated at both checkout call sites — covers V1 nearest + V1.5 scorer via shared rank); FEFO pick hints on /outbound rows (oldest-expiring received lot per order); partner-ops sweep extended — release-ship SLA (warn partner @2d via new RELEASE_SHIP_SLA_AT_RISK event, escalate admins @4d, stamps slaNotifiedAt/slaEscalatedAt), receiving 2nd stage (admins @+3d, inboundUnconfirmedEscalatedAt), and **doc-lapse capability suspension**: lapsed REQUIRED track doc with no surviving valid file in the same (sectionType,kind) pool auto-pauses the ACTIVE services it backs (SERVICE_PAUSED_DOC_LAPSE audit; reinstate stays manual admin). Schema: StorageReleaseOrder.slaNotifiedAt/slaEscalatedAt, OrderDispatch.inboundUnconfirmedEscalatedAt, NotificationEvent RELEASE_SHIP_SLA_AT_RISK — **db:push + generate needed**. Full SlaRule table generalization deferred to P3 (constants suffice for 3 rules). Next: P2 co-packer + printer skins, or the FC end-to-end dry run.
- 2026-07-02 (Cowork, slice 7 — dry-run prep): **CRITICAL SEAM FIXED** — StorageAgreement was only created at checkout for HOLD_AT_MANUFACTURER; FC-held (WAREHOUSE_PARTNER) orders never got one, so receive→inventory→release→billing was dead on arrival. Now `confirmInboundReceipt` opens the agreement at physical receipt (STOCK_RELEASE, unitsRemaining = received qty, palletsRemaining from leg, fee snapshot from FC rates + warehouseReferralFeeBps, `STORAGE_AGREEMENT_OPENED_AT_RECEIPT` audit). Known caveat: snapshot at receipt not checkout (FC could reprice in transit). Dry-run harness shipped: `seed:fc-dryrun` (packages/db, dedicated FC partner + SHIPPED dispatch w/ DELIVERED leg) + **docs/FC_DRY_RUN.md** 10-step checklist (role skin → lot gate → seam → release → FEFO → ledger → exception → cron idempotency → audit). Pavel runs it locally.
- 2026-07-02 (Cowork, slice 8 — P2 items 10+12): dispatch detail role-skinned — eyebrow/title/stage labels per DispatchType (LABEL → "Print production · Print job", Printing / Finishing & QC; COPACKING → "Co-packing · Work order", Filling & assembly); **PrintJobCard** (output-spec contract echo from PartnerPrintOutputSpec + artwork gate: accepting = print master confirmed printable, flagging = existing Phase-H change-request flow with named reason codes — no new FSM, platform-mediated); **WorkOrderCard** (component readiness: sibling legs of the order's workflow graph with arrived/in-transit/upstream states — orchestration visible as inputs, not partners). Lot/COA at ship already covered by ShipRequirementsCard (COA + lotNumbers) — co-packer parity free. Remaining P2: proof loop (D3 — creator-side approval UI), defect claim/reprint workflow, ProductionLot ingredient-lot mapping + QualityHold models, capacity pause for print legs.
- 2026-07-02 (Cowork, slice 9 — **P2 COMPLETE**): **Proof loop live end-to-end (D3)** — ProofRound model (versioned, immutable, one decision per round); printer ProofPanel (upload, PDF/PNG/JPEG/WebP, ship-doc storage pattern); creator ProofApprovalPanel on order detail (+ `/api/proof-file/[roundId]` signed-URL route, ticket-attachment pattern); **markReady server-gated** on latest APPROVED round when required (first order per creator×printer, computed — no flag); 3 new NotificationEvents (CREATOR_PROOF_AWAITING / PROOF_APPROVED / PROOF_REJECTED) + templates. **ProductionLot capture** — model + ProductionLotsCard on PRODUCT/COPACKING dispatches (output lot, expiry, yield vs expected + scrap reason, ingredient-lot rows; immutable; lotNumber-indexed for recall trace; COA ship-doc references the same lot numbers). **Blackouts generalized** to every service type (printer vacation pause, co-packer maintenance) — /settings/fulfillment lists all services, receiving spec stays WAREHOUSE-only; routing enforcement for print legs stays blocked on the findRouting lock (ilaunchify-routing-owner-pinned). Defect/reprint: V1 = existing OrderDispute flow (creator files, partner responds, admin resolves); dedicated reprint-dispatch action deferred to P3 w/ Code (order machinery). QualityHold model deferred to P3 (pre-ship QC covered by dispatch FSM; post-ship = dispute). **Schema: ProofRound, ProductionLot, 3 enum values — db:push + generate needed.**
- 2026-07-02 (Cowork, slice 10 — P0 remnants closed): **RAMP queue (D4)** at admin `/partners/ramp` (Inbox → "Partner ramp", `partners:approve`): first-3 DELIVERED dispatches per partner computed from history, per-dispatch confirm (`rampConfirmedAt/ById` on OrderDispatch, `PARTNER_RAMP_CONFIRMED` audit); V1 = review ritual, hard routing block joins findRouting work. **Daily digest channel**: `DispatchInput.digest` (EMAIL row written, send deferred) + `runNotificationDigest()` in @ilaunchify/notifications + `/api/cron/notification-digest` (13:00 UTC) — one summary email/user, idempotent via emailSentAt; wired for DOC_EXPIRING_SOON 60/30d (7d stays realtime). **Time-to-first-order** on partner detail quick stats (PARTNER_ACTIVATE audit → first DELIVERED). Also: CREATOR_STOCK_ALERT template key (C6.3 handoff) + CREATOR_ORDER_DISPUTE_RESOLVED `outcome:'reprint'` copy for Code's reprint action. Schema: 2 ramp columns — **db:push + generate needed**.

---

## 10. "What needs to Go Live" — checklist

Minimum for onboarding real FC / co-packer / print partners and routing live orders through them:

**Blocking (must ship = P0+P1, plus items 10–12):**
- [ ] D0–D6 decisions locked by Pavel (§11)
- [ ] Role-skin registry; no manufacturer-hardcoded copy anywhere in partner app
- [ ] FC receive-confirm + lot/expiry hard gate + discrepancy flow
- [ ] FC inventory + release-order queue + labels (EasyPost gate ON for FC lanes)
- [ ] Role-specific onboarding doc tracks + admin review
- [ ] Expiry Engine live (certs, COI) w/ capability suspension
- [ ] Notification events P0/P1 set + digest + quiet hours verified
- [ ] Admin exceptions inbox (discrepancies at minimum)
- [ ] SLA at-risk warnings on dispatch accept + receiving
- [ ] LogisticsSetting gates reviewed: which lanes ON at launch (storage classes, destination types); temp/hazmat hard filters verified with a cold-chain test order
- [ ] End-to-end dry run per role: seed partner → onboard → verify → activate → RAMP dispatch → complete → payout transfer visible
- [ ] Security pass: every new partner surface behind membership-scoped ownership guards; typecheck + lint + vitest suites green; AuditLog rows on every new mutation

**Strongly recommended before scale (P2–P3):**
- [ ] Co-packer WO skin + lot/COA + quality hold (food credibility)
- [ ] Print job skin + artwork gate + defect workflow
- [ ] Multi-seat team + role-routed notifications
- [ ] Admin SLA monitor + compliance expiry dashboard
- [ ] Partner payout-history page

**Explicitly not blocking:** proofs-by-default, webhooks/SMS, rate-card model, scanner app, tier auto-promotion, dock appointments.

---

## 11. Decisions needed from Pavel

| # | Decision | Recommendation |
|---|---|---|
| D0 | Rename Warehouse → "Fulfillment Center" (UI only, enum stays) | Yes |
| D1 | Multi-seat team in P3 vs deferred to V1.5 | P3 — notification routing + FC ops depend on it |
| D2 | Lot+expiry capture: hard-require for all food/supplement SKUs at FC receiving from day one | Yes — immutable later, can't backfill |
| D3 | Proof loop default: OFF, auto-ON for first order per creator×printer pair | As stated |
| D4 | RAMP: manual admin confirm on first N=3 dispatches per new partner | Yes |
| D5 | SMS channel for P0 | Defer V1.5 |
| D6 | Co-packer/printer detail skins before or after first FC partners go live | After (P2) — FC is the logistics-critical path |

