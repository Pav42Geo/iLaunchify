# Risk Management Center — Spec (DRAFT for Pavel review, 2026-07-05)

**Status:** Proposal. Nothing here is built. All actions admin-gated per the LogisticsSetting pattern.
**Owner:** Pavel · Drafted by Cowork
**Prior art in repo:** partner scorecard, partner-ops cron, SLA watchtower, PartnerStrike/Clawback, fc-scorer, OrderSettings weights — this spec unifies them, it does not replace them.

---

## 1. Purpose & philosophy

One engine that continuously answers three questions for every order, partner, and money flow:

1. **What could go wrong?** (detect — signals)
2. **How likely / how bad?** (score — deterministic first, ML later)
3. **What do we do about it?** (act — an escalation ladder, every rung admin-gated)

Design principles (all inherited from locked decisions):

- **Hard gates vs. soft scores.** Same rule as temp-class/hazmat in logistics: compliance, fraud-block, and cert-expiry risks are HARD gates (order cannot proceed), never weights. Performance and capacity risks are SOFT scores that inform warnings, routing weights, and admin review. Never blur the two.
- **Deterministic before ML.** V1 risk scores are explainable formulas over signals we already store. Every score snapshot persists its inputs (reproducibility — same principle as fee snapshots).
- **Admin informed, not blocking — until proven.** New detectors start in MONITOR mode (log only), get promoted to WARN, then GATE/ACT, per-detector, via RiskSetting. Same rollout discipline as ingredient governance.
- **Respect owner-pinned routing.** The manufacturing leg is pinned to `ProductTemplate.manufacturerServiceId` (LOCKED). The risk engine may not silently re-route manufacturing. It prevents the bad match *before* the order exists, or mediates a re-route *with creator consent / admin action*. Commodity legs (FC, carrier) may auto re-route — they already do.
- **Risk rating ≠ partner tier.** VERIFIED/TRUSTED/PREMIER stay behavior-free. Internal risk ratings never surface as tier benefits.

---

## 2. Risk taxonomy — grounded in today's build

Each risk lists: signals we ALREADY store → computed metric → actions on the ladder.

### R1 · Partner capacity risk (Pavel's scenario)

Declared capacity ≠ real capacity. Partner says 50,000/mo, delivers 35,000/mo.

- **Have today:** `PartnerOperationalCapability.monthlyCapacityUnits` (declared), `PartnerService.weeklyPalletCapacity`, `PartnerBlackoutDate`, full dispatch timeline (`acceptedAt…deliveredAt`), `ProductionLot` units produced.
- **Gap:** no *demonstrated* capacity and no *committed backlog* — we don't know how much of the month a partner has already promised.
- **Metric:**
  - `demonstratedMonthlyCapacity` = P75 of units actually completed per rolling 30-day window over last 90–180 days (falls back to declared × confidence factor when history is thin).
  - `committedUnits(month)` = Σ open dispatch units due that month (new **PartnerCapacityLedger**).
  - **CapacityRiskPct(order)** = `orderUnits / max(1, effectiveCapacity − committedUnits)` where `effectiveCapacity = min(declared, demonstrated)`. Blackout days pro-rate the month.
- **Actions:** <60% → green; 60–85% → WARN badge on checkout ETA + risk inbox row; 85–100% → GATE: propose split across months / extended ETA the creator must accept; >100% → HARD block with mediation flow (§5).

### R2 · Order & dispatch risk

Will this specific order fail one of its FSM steps?

- **Have today:** `acceptDeadlineAt`, `slaAtRiskNotifiedAt`, decline reason, `proposedDeadlineAt` (delay workflow), QC-failed timestamps, `rerouteCount` vs `OrderSettings.maxReroutes`.
- **Metric:** per-dispatch **DelayRiskScore** = weighted sum of: accept-window consumption, partner's historical accept rate, historical on-time rate for this format, changeover load (flavor count × `changeoverDays`), blackout adjacency, current CapacityRiskPct.
- **Actions:** WARN creator ("ETA at risk") before breach, not after; auto-escalate to risk inbox at threshold; feed R3.

### R3 · Routing risk

The route itself is fragile.

- **Have today:** reroute counter + cap, `PartnerMatchScore` (capability/proximity/cert), `FcAwardLog.scoreJson`, fc-scorer rotation band.
- **Metric:** **RouteFragility** = candidate-pool depth per leg (how many eligible partners/FCs remain if the current one fails), reroute budget consumed, single-point-of-failure flag when pool = 1.
- **Actions:** pool = 1 on a commodity leg → risk inbox + partner-recruitment signal for that region/format; reroutes ≥ max−1 → escalate to admin before auto-cancel fires.

### R4 · Lead-time / SLA risk

Promised dates vs. reality, across the whole graph.

- **Have today:** every promised timestamp (`acceptDeadlineAt`, `proposedDeadlineAt`, `currentEtaAt`) vs. every actual (`shippedAt`, `deliveredAt`); partner-ops cron already flags DISPATCH_SLA_AT_RISK, INBOUND_DELIVERED_UNCONFIRMED, RELEASE_SHIP_SLA.
- **Metric:** partner **OTIF** (on-time-in-full) per rolling 90 days — industry standard, target ≥95%. Lead-time *variance* (P90 − promised) matters more than the mean: a partner who quotes 10 days and takes 9–11 is low-risk; one who quotes 10 and takes 7–21 is high-risk even with the same average.
- **Actions:** OTIF and variance feed the Partner Reliability Score (§3); cron thresholds move from hardcoded to RiskSetting.

### R5 · Fulfillment / logistics risk

Physical movement fails: damage, shortage, cold-chain breach, carrier delay.

- **Have today:** `ReceivingDiscrepancy` (short/over/damaged, first-class inbox), `InboundReceipt` reconciliation, dispatch-doc gate (`canShip`), cold-pack math, carrier eligibility matrix, seasonal ship windows.
- **Metric:** discrepancy rate per partner (scorecard already flags >5%), damage rate per lane/carrier, % shipments missing docs at first ship attempt.
- **Actions:** repeated lane damage → deprioritize carrier in rate-shop (weight, not filter); doc-gate failures → partner coaching flag; cold-chain products get a stricter WARN threshold.

### R6 · Financial risk

Money leaks: refunds, chargebacks, clawback exposure, payout failures.

- **Have today:** `Dispute` FSM (needs-response → won/lost), `Refund` with reason codes, `PartnerClawback` with `remainingCents`, `Transfer.failureReason`, netted payouts.
- **Metric:** creator **chargeback rate** (rolling 90d, count and $-weighted); partner **clawback exposure** = Σ remainingCents vs. next scheduled payout (can we actually recover?); refund-reason mix (DEFECTIVE + COMPLIANCE_FAILURE reasons are partner-quality signals, route them to R9).
- **Actions:** chargeback rate >1% → creator review; clawback exposure > next payout → hold payout escalation (admin approval, ties into RBAC refund-approve fence); repeated Transfer failures → partner Stripe-account health flag.

### R7 · Fraud risk

Four distinct actors, four detectors:

1. **Creator payment fraud** — stolen cards on big orders. **Buy, don't build:** Stripe Radar risk score per charge (we're already on Stripe). High Radar score + first order + large qty = manual review before routing. Velocity rules: N orders / new account / short window.
2. **Partner misrepresentation** — fake capacity, fake certs, capability inflation to win routing. Detector: declared-vs-demonstrated gap >40% sustained 2+ months → verification re-review; cert docs are already 5-layer-verified with expiry sweeps — keep as HARD gate.
3. **Account takeover / insider** — anomalous admin or partner actions. We already write AuditLog on every mutation; detector = velocity/anomaly queries over AuditLog (e.g., mass payout-detail changes). Ties into Admin RBAC P1 fence.
4. **Collusion / self-dealing** — creator and partner same beneficial owner inflating volume for platform-credit abuse (matters when sample credits + buffer inventory arrive in V2). Log-only detector in V1: shared addresses/bank fingerprints.

### R8 · Compliance / regulatory risk

The one that can hurt the most. Labels are legal artifacts (LOCKED: build-to-spec).

- **Have today:** FDA rule packs + label validator, cert expiry sweeps (60/30/7d), banned-ingredient list + >5% flags, SELF_ATTESTED ingredient promotion queue, market model (US-only active).
- **Metric:** % products shipped with validator warnings overridden; partner cert coverage vs. product domain requirements; expiring-cert count weighted by open dispatch volume behind them.
- **Actions:** ALL HARD GATES. A cert expiring mid-production → escalate at production start, not at ship. Recall readiness: lot tracking already exists (`InboundReceiptLine`, FC lot gate) — the Risk Center adds the "which creators/channels received lot X" query as a one-click report.

### R9 · Quality / performance risk

- **Have today:** scorecard metrics — acceptRatePct, qcFailures, discrepancies, reprints, avgYieldPct (<95% flagged), `OrderDispute` categories, `PartnerStrike`.
- **Metric:** these roll up into the Partner Reliability Score (§3). Trend, not snapshot: a 3-month declining yield is a louder signal than one bad month.
- **Actions:** strike accumulation thresholds (RiskSetting) → routing-weight penalty on commodity legs → verification re-review → suspension proposal (admin decides; FSM helper, never inline update).

### R10 · Concentration risk

Too many eggs in one partner/FC/region.

- **Metric:** % of monthly platform units flowing through each partner; % of a *creator's* volume on one partner (they're pinned, so this is a recruitment signal, not a routing one); FC regional coverage depth.
- **Actions:** dashboard only in V1 — informs partner recruitment. This is also the business case for V2 pooling/buffer inventory (the moat reduces exactly this risk).

### R11 · Platform / integration risk

- EasyPost, Stripe, Resend, Mux outages: the integrations registry already shows configured/missing — add a health-check ping + degraded-mode flags (e.g., EasyPost down → quote retries + admin banner, don't fail checkout).
- Data risk: tenant isolation is threat #1 (LOCKED security architecture) — cross-tenant access attempts detected in ownership guards should emit RiskEvents, not just 403s.

### R12 · Inventory / storage risk

- **Have today:** StorageAgreement dwell (`maxDwellDays`), storage-accrual math, `unitsRemaining`, release SLA sweeps.
- **Metric:** dwell vs. max, accrued storage fees vs. product value (abandonment predictor), shelf-life/lot expiry vs. remaining units (food!).
- **Actions:** aging-inventory WARN to creator at 60/80% dwell; expiry-risk HARD escalation for dated lots.

### R13 · Creator-side risk (brief)

Nonpayment (auto-cancel exists), serial disputers (R6), IP infringement in uploaded designs (log-only V1; takedown workflow later), channel-connection failures blocking CHANNEL_INBOUND (gate exists — surface it).

---

## 3. Partner Reliability Score (PRS)

One 0–100 number per PartnerService, recomputed nightly by the partner-ops cron, snapshotted with inputs.

| Component | Weight (RiskSetting, default) | Source |
|---|---|---|
| OTIF (rolling 90d) | 30% | dispatch timestamps |
| Accept rate | 15% | scorecard |
| Quality (yield, QC, reprints, disputes) | 20% | scorecard + R9 |
| Discrepancy/damage rate | 10% | ReceivingDiscrepancy |
| Capacity honesty (declared vs demonstrated gap) | 10% | R1 |
| Lead-time variance | 10% | R4 |
| Strikes / clawbacks (active) | 5% penalty pool | PartnerStrike, PartnerClawback |

Rules: components renormalize when data is missing (same pattern as PartnerMatchScore); new partners get a neutral 70 with a "thin history" badge — never punish absence of data; PRS is **internal + partner-visible with breakdown** (partners can see why and improve — this is the "make people happy" lever), never creator-visible as a number (creators see effects: ETAs, badges).

PRS consumes: commodity-leg routing weight (small, capped — e.g., ±10 points of score), risk-inbox prioritization, verification re-review triggers. PRS does NOT: override hard gates, unpin manufacturing, or bind to VERIFIED/TRUSTED/PREMIER.

---

## 4. Pavel's scenario, walked through honestly

> Partner declares 50k/mo, really does 35k. Creator orders 50k this month.

Because manufacturing is **owner-pinned**, "silently re-route to a 100k/mo partner" is not allowed by our own locked routing model — the creator built their product ON that manufacturer's template (recipe, die-line, pricing). The right UX is to catch the mismatch **earlier and transparently**:

1. **At product selection (marketplace):** template cards can show a capacity-fit signal when the creator's intended volume is known ("typically fulfills up to ~35k/mo").
2. **At checkout (the main gate):** engine computes CapacityRiskPct = 50,000 / (35,000 − committed). Say committed = 10k → 200% → HARD.
   Creator sees three honest options, partner sees the same case:
   - **Split:** 25k now + 25k next month (ledger reserves both).
   - **Extended ETA:** partner proposes a realistic date via the existing delay-workflow fields; creator accepts a ~6-week ETA instead of a fake 4-week one.
   - **Admin-mediated re-route:** ops offers migration to a higher-capacity manufacturer — a real project (new template/pricing/proof), tracked as a risk-inbox case, only with creator consent.
3. **Feedback loop:** the 15k gap raises the partner's capacity-honesty gap → declared capacity auto-adjusts downward for future checks (partner notified, can contest with evidence) → next creator sees the truth up front.

Nobody gets a silent surprise at week 5. That is the promise: **the platform never knowingly sells a date it can't deliver.**

For **commodity legs** (FC selection, carriers), auto re-route on risk IS allowed and mostly exists (fc-scorer + rerouteCount) — the engine just makes it predictive (re-rank before failure) instead of reactive (after decline).

---

## 5. The escalation ladder (per detector, admin-gated)

```
MONITOR  → detector runs, writes RiskEvent, no one notified (burn-in / calibration)
WARN     → notify affected party + risk inbox row (advisory)
GATE     → block progression until human choice (split / accept ETA / admin override)
ACT      → automatic mitigation (re-rank commodity leg, hold payout, pause listing)
```

Every detector has `{enabled, mode, thresholds}` in **RiskSetting** (LogisticsSetting pattern: build-ready, admin-gated). Every rung writes AuditLog. ACT is reachable only after a detector has demonstrated acceptable false-positive rate in WARN — measured, not vibes.

---

## 6. Data model (additive only)

- **RiskSetting** — per-detector row: `detectorKey`, `mode (MONITOR|WARN|GATE|ACT)`, `thresholdsJson`, `notes`. Singleton-per-key, mirrors LogisticsSetting.
- **RiskEvent** — append-only: `detectorKey`, `severity`, `entityType/entityId` (reuse audit entity types), `scoreSnapshotJson` (inputs + formula version), `status (OPEN|ACK|RESOLVED|MUTED)`, `resolvedById`. Powers the inbox.
- **PartnerCapacityLedger** — `partnerServiceId`, `month`, `committedUnits`, `completedUnits`, `declaredUnits`, `demonstratedUnits`. Written by dispatch FSM transitions (accept adds, deliver/cancel releases).
- **PartnerReliabilitySnapshot** — nightly PRS + component breakdown, ring-buffered.

No DROPs, uuid ids, no `@db.Text`, every mutation through FSM helpers + AuditLog. `prisma-migrator` subagent for the schema slice.

---

## 7. Admin surface — `/admin/risk`

Standard admin v2 chrome (hero band `--bg-hero`, 5-KPI strip, URL filter chips, plain sortable table, RowActionsMenu, 50/page — `v2-admin-surface-builder`):

- **Risk Inbox** (landing): open RiskEvents. KPIs: open events, orders at risk, $ at risk, avg PRS, hard-gate blocks this week. Chips: detector, severity, entity type, status. Rows deep-link to the existing order/partner detail pages — never inline-mutate.
- **Partner Risk** tab: PRS-ranked partner list with component columns + trend sparkline; deep-links to the existing PartnerScorecard (extend it, don't duplicate).
- **Detectors** tab: RiskSetting manager — mode per detector, thresholds, false-positive counters. This is the Gates page equivalent.
- Existing **/logistics/sla** watchtower stays; its queries become detectors that also emit RiskEvents (single inbox, no second dashboard war).

---

## 8. Build phases

- **RM0 — Capacity truth (highest ROI, fully deterministic).** PartnerCapacityLedger + checkout CapacityRiskPct check (MONITOR first) + split/extended-ETA UX. Solves Pavel's scenario end-to-end.
- **RM1 — Unify what exists.** RiskEvent + Risk Inbox; convert partner-ops cron sweeps + SLA watchtower into detectors; RiskSetting with the 4-mode ladder; move hardcoded cron thresholds into settings.
- **RM2 — PRS.** Nightly score + snapshots + partner-visible breakdown + capped commodity-leg routing-weight hook (behind RiskSetting).
- **RM3 — Money & fraud.** Stripe Radar score ingestion + velocity rules, chargeback-rate detector, clawback-exposure payout-hold (needs RBAC refund fence), AuditLog anomaly queries.
- **RM4 — Predictive.** Delay prediction from in-flight signals; only after RM0–RM3 give us labeled outcomes to validate against. ML earns its way in; formulas first.

Blocked/adjacent: payout-hold waits on Stripe go-live verification; collusion detection matters at V2 pooling; SP-API-related risks blocked on external accounts.

---

## 9. Industry grounding (research notes)

- **OTIF ≥95%** is the standard supplier-reliability KPI; automated scorecard platforms (LeanLinking et al.) report ~34% fewer disruptions vs. subjective review. Our scorecard already computes the ingredients — we're formalizing, not inventing.
- **Stripe Radar** pattern for fraud: network-level ML score + merchant-defined velocity rules on top. We inherit the score for free on every Charge; our own layer is the marketplace-specific rules (new-account velocity, partner misrepresentation) Radar can't see.
- **Kodiak Hub / vendor-assessment** frameworks confirm the dimension set: delivery (OTIF, lead-time accuracy, capacity), quality (PPM/defects), compliance, financial health, concentration/single-source risk — mapped 1:1 to R1–R10.

---

## 10. Open questions for Pavel

1. Partner-visible PRS: full breakdown, or badge-only ("Good standing / At risk")?
2. Capacity mediation UX: is admin-mediated manufacturer migration (§4 option 3) V1, or split/ETA only?
3. Should declared capacity auto-adjust from demonstrated (with partner contest flow), or admin-adjust only?
4. $-at-risk KPI definition: order revenue, or platform fee at risk?
