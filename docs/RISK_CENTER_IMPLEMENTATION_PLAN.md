# Risk Management Center — Implementation Plan (DRAFT 2026-07-05)

Companion to `docs/RISK_MANAGEMENT_CENTER.md` (taxonomy + scoring model). This doc: **how to build it**, grounded in production systems that demonstrably work — Amazon Account Health, Stripe Radar, Alibaba Verified Supplier/Trade Assurance, Airbnb reservation risk scoring, and the standard fintech risk-engine architecture (decision engine + feature store + shadow mode + case management).

---

## 1. What the real systems teach us (and what we copy)

### Amazon Account Health Rating → our Partner Reliability Score
The proven model for scoring supply-side actors at scale:
- **One number (0–1,000) with colored bands**: ≥200 Healthy · 100–199 At Risk · ≤99 Deactivation-eligible. Sellers always see their score AND the exact breakdown — transparency drives self-correction, which is Amazon's real enforcement mechanism (most sellers fix issues before Amazon acts).
- **Hard metric ceilings independent of the score**: ODR (defects/orders) <1%, Late Shipment Rate <4%, pre-fulfillment cancel rate <2.5%, measured over rolling 180/30-day windows.
- **Consequences are graduated, not binary**: reduced visibility → listing suspension → account deactivation, with an improvement-plan path back.

**Copy:** PRS 0–100 with 3 bands + component breakdown visible to the partner; separate hard ceilings (our ODR-equivalent = dispute+QC-fail+discrepancy rate; our LSR = late-ship vs `currentEtaAt`); graduated consequences via the MONITOR→WARN→GATE→ACT ladder; "improvement plan" = verification re-review flow we already have.
**Don't copy:** auto-deactivation. We're high-touch B2B with pinned manufacturers — suspension is always an admin decision through the partner FSM.

### Stripe Radar → our fraud layer
- ML network score per transaction + **merchant-defined rules on top** (velocity: count/amount per card/IP/account per time window; allow/block/review/3DS actions).
- Adaptive rules beat static ones (Stripe reports +1.3pp auth success at flat fraud rate).

**Copy:** ingest `charge.outcome.risk_score` + `risk_level` on every Charge (we're on Stripe — this is nearly free); add 3–5 marketplace velocity rules Radar can't know (new creator + first order > $X units, N orders/24h from one account, shipping-address anomalies). Route `elevated` to review before ROUTING starts, `highest` to block. **Buy the ML, build only the marketplace-specific rules.**

### Alibaba Verified Supplier + Trade Assurance → our onboarding + escrow posture
- Verification of production capability is done by **independent third parties, 100+ checkpoints**, not self-attestation — because capacity misrepresentation is the #1 B2B supplier fraud.
- Trade Assurance = platform holds the money and guarantees "ships on time + matches spec" — the platform absorbs coordination risk to create trust.

**Copy:** we already have 5-layer partner verification + doc expiry sweeps — add a **declared-capacity evidence checkpoint** (machine list, shift plan, or third-party audit for high-declared-capacity partners) at verification, and re-verify when demonstrated-vs-declared gap >40% for 2+ months. Our Stripe charge-then-transfer flow IS the Trade Assurance escrow shape — the Risk Center just adds the "don't release payout while clawback exposure > payout" rule.

### Airbnb → score the TRANSACTION, not just the actor
Airbnb scores **each reservation** for risk pre-confirmation. Same shape as our per-order CapacityRiskPct + DelayRiskScore: actor score (PRS) × transaction context (qty vs headroom, changeover load, blackouts, first-time pairing).

### Fintech risk-engine architecture → our system shape
The standard proven stack (Oscilar, Decisimo, industry blueprints):
1. **Feature store** — precomputed signals (`acceptRate90d`, `otif90d`, `committedUnitsThisMonth`) consistent between real-time decisions and offline analysis.
2. **Decision engine** — evaluates an event against versioned rules → APPROVE / REVIEW / REJECT (+ reasons).
3. **Case management** — every REVIEW becomes a case in one inbox with resolution workflow.
4. **Shadow mode + gradual rollout** — new rules log-only alongside live rules; promote after measured false-positive rate; instant rollback.

**Copy at our scale (no Kafka, no microservices):** feature store = `PartnerRiskFeature` table recomputed by the existing partner-ops nightly cron + a few real-time reads; decision engine = a pure TypeScript package `packages/risk` (same DI/pure pattern as packages/shipping — network-free tests); case management = RiskEvent inbox; shadow mode = the MONITOR rung of our ladder, false-positive counters on the Detectors admin page.

---

## 2. System architecture

```
                    ┌──────────────────────────────────────────┐
                    │  packages/risk  (pure TS, DI'd, no Prisma)│
                    │                                          │
 events ──────────▶ │  evaluate(event, features, ruleset)      │──▶ Decision {action, score,
 (checkout,         │   • detectors = versioned pure functions │      reasons[], ruleVersion}
  dispatch FSM,     │   • thresholds injected from RiskSetting │
  stripe webhook,   └──────────────────────────────────────────┘
  nightly cron)                        ▲
                                       │ features
                    ┌──────────────────┴───────────────────────┐
                    │ Feature store:                           │
                    │  • PartnerRiskFeature (nightly, cron)    │
                    │  • PartnerCapacityLedger (FSM-written)   │
                    │  • real-time: Radar score, order context │
                    └──────────────────────────────────────────┘
 Decisions land as: RiskEvent rows (case inbox) · AuditLog · gates in existing
 flows (checkout, dispatch accept, payout release) · notifications (existing dispatcher)
```

Integration points are all EXISTING seams — no new infrastructure:
- **Checkout** server action → `evaluate('ORDER_PLACED', …)` before payment intent (R1 capacity, R7 fraud).
- **Dispatch FSM helpers** → emit events on accept/decline/delay/QC-fail (R2, R4). FSM helpers already centralize transitions; one call-site each.
- **Stripe webhooks** (`packages/payments`) → charge outcome, dispute created, transfer failed (R6, R7).
- **partner-ops nightly cron** (`apps/admin/src/lib/partner-ops-worker.ts`) → recompute features + PRS, run batch detectors (doc expiry, capacity-gap, concentration). Extends the sweep pattern that already exists.
- **Payout scheduler** → `evaluate('PAYOUT_RELEASE', …)` (clawback exposure rule).

---

## 3. Data model (additive, CockroachDB-safe)

```prisma
model RiskSetting {            // LogisticsSetting pattern — one row per detector
  id            String   @id @default(uuid())
  detectorKey   String   @unique          // e.g. "CAPACITY_OVERCOMMIT"
  mode          RiskMode @default(MONITOR) // MONITOR | WARN | GATE | ACT
  thresholdsJson Json                     // versioned thresholds
  notes         String?
  updatedAt     DateTime @updatedAt
}

model RiskEvent {              // case management — append-only + resolution
  id            String   @id @default(uuid())
  detectorKey   String
  severity      RiskSeverity              // INFO | WARN | HIGH | CRITICAL
  entityType    String                    // reuse audit entity types
  entityId      String
  decision      String                    // MONITOR_LOGGED | WARNED | GATED | ACTED
  scoreSnapshotJson Json                  // inputs + formula/rule version (reproducibility)
  status        RiskEventStatus @default(OPEN) // OPEN | ACK | RESOLVED | MUTED | FALSE_POSITIVE
  resolvedById  String?
  resolvedAt    DateTime?
  createdAt     DateTime @default(now())
  @@index([status, severity, createdAt])
  @@index([entityType, entityId])
}

model PartnerCapacityLedger {  // written by dispatch FSM transitions
  id                String @id @default(uuid())
  partnerServiceId  String
  month             String                // "2026-07"
  declaredUnits     Int
  demonstratedUnits Int?                  // nightly P75 rolling calc
  committedUnits    Int    @default(0)    // accept adds; deliver/cancel releases
  completedUnits    Int    @default(0)
  @@unique([partnerServiceId, month])
}

model PartnerRiskFeature {     // feature store — nightly snapshot
  id               String @id @default(uuid())
  partnerServiceId String
  computedAt       DateTime @default(now())
  featuresJson     Json     // { otif90d, acceptRate90d, ltVarianceP90, odrEquiv90d,
                            //   discrepancyRate, yieldAvg, capacityGapPct, activeStrikes,
                            //   clawbackExposureCents, prs, prsComponents }
  @@index([partnerServiceId, computedAt])
}
```

`FALSE_POSITIVE` as a first-class resolution status is what powers rule calibration (the shadow-mode discipline). All mutations via FSM/service helpers + AuditLog. `prisma-migrator` subagent owns the slice; remember the 3-layer stale-client incantation after `db:push`.

---

## 4. Detector catalog v1 — with industry-benchmark thresholds

| # | Detector key | Fires on | Default thresholds (RiskSetting-tunable) | Benchmark source | Launch mode |
|---|---|---|---|---|---|
| 1 | CAPACITY_OVERCOMMIT | checkout | WARN >60% · GATE >85% · block >100% of headroom | Pavel scenario; vendor-assessment capacity criteria | MONITOR |
| 2 | ODR_EQUIV_CEILING | nightly | (disputes+QC fails+damaged discrepancies)/delivered >1% (90d) | Amazon ODR <1% | MONITOR |
| 3 | LATE_SHIP_RATE | nightly | shipped after `currentEtaAt` >4% (30d) | Amazon LSR <4% | MONITOR |
| 4 | OTIF_FLOOR | nightly | OTIF <95% (90d) → WARN; <90% → HIGH | industry OTIF standard | MONITOR |
| 5 | ACCEPT_TIMEOUT_AT_RISK | hourly (exists) | >50% window (existing cron, migrate thresholds to RiskSetting) | already built | WARN |
| 6 | CAPACITY_HONESTY_GAP | nightly | demonstrated < 60% of declared for 2 consecutive months → re-verify | Alibaba third-party verification rationale | MONITOR |
| 7 | RADAR_ELEVATED | Stripe webhook | risk_level `elevated` + (first order OR > admin-set qty) → REVIEW; `highest` → block | Stripe Radar | WARN |
| 8 | ORDER_VELOCITY | checkout | ≥3 orders/24h new account, or > $X first order | Radar rules 101 velocity pattern | MONITOR |
| 9 | CHARGEBACK_RATE | nightly | creator >0.75% (90d, count) → review | card-network ~0.9% programs, margin below | MONITOR |
| 10 | CLAWBACK_EXPOSURE | payout release | Σ remainingCents > next payout → hold for admin approval | Trade Assurance escrow posture | GATE (after Stripe go-live) |
| 11 | CERT_EXPIRY_VOLUME | nightly (exists) | existing 60/30/7d sweep + weight by open dispatch units behind the cert | already built | WARN |
| 12 | ROUTE_FRAGILITY | routing | eligible pool =1 on commodity leg; rerouteCount = max−1 | fc-scorer data | MONITOR |
| 13 | STORAGE_DWELL | nightly (exists) | 60%/80% of maxDwellDays; expiry-dated lots stricter | existing release-SLA sweep | WARN |
| 14 | CONCENTRATION | weekly | partner >35% of platform monthly units → dashboard flag | single-source risk practice | MONITOR |

Rule of thumb baked in: detectors 2, 3, 7 (highest), 10, 11 guard money/legal/customer-promise → they escalate to GATE/ACT after burn-in. Everything else stays advisory until false-positive data says otherwise.

---

## 5. Milestones

### M0 — Foundation (schema + engine skeleton) · ~1 week of Code-agent work
- `packages/risk` scaffold: `evaluate()`, detector interface, threshold injection, pure tests in run-vitest-suites.mjs (same pattern as packages/shipping).
- Schema slice §3 via prisma-migrator. Seed RiskSetting rows for the 14 detectors, all MONITOR.
- **Exit test:** a fake CAPACITY_OVERCOMMIT event produces a RiskEvent row with a reproducible score snapshot.

### M1 — Capacity truth (Pavel's scenario, end-to-end) · the flagship slice
- PartnerCapacityLedger writes from dispatch FSM (accept/deliver/cancel call-sites).
- Nightly demonstrated-capacity calc into PartnerRiskFeature.
- Checkout hook: CAPACITY_OVERCOMMIT in MONITOR → observe 2–4 weeks of real distribution → promote to WARN (badge + honest ETA) → GATE (split / extended-ETA / admin-mediated migration options).
- **Exit test:** the 50k-order-into-35k-partner case produces the three-option gate, and the ledger reserves the split correctly.

### M2 — Risk Inbox + detector migration (unify what exists)
- `/admin/risk` via `v2-admin-surface-builder`: Inbox (KPIs: open events, orders at risk, $ at risk, avg PRS, gates this week) + Detectors settings tab.
- Migrate partner-ops cron sweeps + SLA watchtower queries to emit RiskEvents (single inbox; /logistics/sla keeps working, backed by the same rows).
- FALSE_POSITIVE resolution + per-detector FP counters (the calibration loop).

### M3 — PRS + partner transparency
- Nightly PRS into PartnerRiskFeature; Amazon-style banded display (Healthy ≥75 · At Risk 50–74 · Critical <50) with full component breakdown **in the partner app** — self-correction is the mechanism, per Amazon.
- Extend admin PartnerScorecard with PRS trend sparkline (extend, don't duplicate).
- Optional (RiskSetting-gated, capped ±10): PRS as a weight on COMMODITY legs only. Never touches the pinned manufacturer.

### M4 — Money & fraud
- Radar ingestion (webhook fields → Charge), RADAR_ELEVATED + ORDER_VELOCITY + CHARGEBACK_RATE detectors.
- CLAWBACK_EXPOSURE payout gate — **blocked on** Stripe test-mode verification (payments-readiness memory) and admin RBAC refund-approve fence (P1).

### M5 — Calibrate & promote
- 30–60 days of MONITOR data → threshold tuning on the Detectors page → promote detectors up the ladder one at a time, FP-rate-justified, audit-logged. This phase is deliberately boring; it's what makes M1–M4 trustworthy.

Deferred: ML delay prediction (needs M0–M5 labeled outcomes), collusion detection (matters at V2 pooling), SP-API-dependent risks (blocked on external accounts).

---

## 6. Ownership & guardrails

- **Zones:** schema + packages/risk + cron = safe for either agent (new files); checkout hook touches creator checkout — coordinate with Code per two-agent rules; /admin/risk = new surface, Cowork-safe.
- **Non-negotiables carried from locked decisions:** no auto re-route of the pinned manufacturing leg · risk ratings never bind to VERIFIED/TRUSTED/PREMIER · hard gates (compliance/fraud-block) never expressed as weights · every decision snapshot reproducible · everything admin-gated from day one.

## 7. Success metrics (how we know it works)

- % of late deliveries that had a WARN ≥5 days before breach (target >80% by M5).
- Capacity-gate acceptance: share of gated creators choosing split/extended-ETA vs. abandoning (honesty shouldn't kill conversion — watch it).
- Detector precision: FP rate <20% before any GATE promotion.
- Declared-vs-demonstrated gap trend across partner base (should shrink — the Amazon self-correction effect).
- Chargeback + clawback write-offs as % of GMV, quarter over quarter.
