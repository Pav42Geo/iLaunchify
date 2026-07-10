# iLaunchify — Analytics Build Checklist (P0–P3)

**Status:** DRAFT · 2026-07-09 · living tracker
**Spec:** `ANALYTICS_STRATEGY.md` (read first — decisions D1–D7 gate this)
**Convention:** check items as built. Schema changes use `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart (see CLAUDE.md stale-client gotcha). Every new mutating action writes an `AuditLog` row.

> **Sequencing logic:** P0 lands the no-regret substrate (event schema, server emitter, the `promisedShipBy` field) so everything after is additive. P1 stands up the pipes (behavioral SDK + warehouse + dbt). P2 delivers the surfaces + alerting. P3 is the moat + advanced work. Don't start a phase before its predecessor's blockers clear.

---

## P0 — No-regret substrate (build now, small, additive)

**Goal:** capture-ready foundations that make every later phase additive. No vendor commitment required to start.

- [ ] **D3 — Add promised-date fields** (highest leverage). Additive migration: `OrderDispatch.promisedShipBy DateTime?` and `promisedDeliverBy DateTime?` (+ set at routing/accept time). Unblocks `onTimeRate` for **both** analytics and Merit Engine. *(prisma-migrator subagent)*
- [ ] **D7 — `packages/analytics` package** — canonical event schema + single server-side emitter:
  - [ ] `AnalyticsEvent` type: `{ name, actorId, role, tenantId, orderId?, timestamp, properties: Json }`.
  - [ ] `emitEvent(event)` — writes to a raw append-only `AnalyticsEvent` table (tenant-stamped) AND forwards to the behavioral vendor (no-op until D1 chosen). Fire-and-forget, never throws (mirror `packages/audit` semantics).
  - [ ] Curated event-name registry (`as const`, ~20–30 names) — treat like marketplace taxonomy; PR review to add.
- [ ] **Server-side money/state events** wired through the emitter (these must survive ad-blockers): `order_paid`, `order_delivered`, `dispatch_accepted`, `dispatch_declined`, `refund_issued`. Source of truth for financial funnels.
- [ ] **Real reliability backing store** — add `CronRun` and `WebhookEvent` models (or emit to Sentry cron monitors) so "System Health" stops being synthetic. *(fixes the hard-coded amber / audit-prefix inference)*
- [ ] **Retire the latent stubs** — route the checkout "quality signal for analytics" fields + `recipeEntryMode` into `emitEvent` instead of dead-ending on the draft.

**P0 exit:** an event flows from a server action → `AnalyticsEvent` table; `promisedShipBy` is populated on new dispatches; cron/webhook runs are recorded.

---

## P1 — Pipes: behavioral capture + warehouse + semantic layer

**Goal:** the modern-data-stack backbone. Gated on D1 + D2.

- [ ] **D1 — Behavioral SDK** (rec: PostHog). Install client SDK in all 4 Next apps; init behind an env flag (mirror Sentry DSN-guard pattern).
  - [ ] Wire the **activation funnel** events (client): `signup_completed`, `onboarding_step_completed{step}`, `product_created`, `studio_opened`, `design_saved`, `design_published`, `checkout_started`. Join to server `order_paid`.
  - [ ] Wire **Design Studio** engagement events: `template_applied`, `flavor_added`, `ai_generation_requested`, `ai_concept_accepted`, `packaging_3d_previewed`, `mockup_published`.
  - [ ] Wire **partner-side** events: `partner_onboarding_step`, `product_editor_opened`, `proof_uploaded`.
  - [ ] Identify calls stamp `role` + `tenantId` for two-sided segmentation.
- [ ] **D6 — Finish Sentry** — add `SENTRY_DSN`; enable client + edge runtime; turn on performance/RUM sampling; add cron monitors. Reliability signal goes real.
- [ ] **D2 — Warehouse** (rec: BigQuery). Provision; set up service creds.
- [ ] **Ingestion** — Fivetran/Airbyte connectors: CockroachDB (or Postgres logical) → warehouse; Stripe → warehouse; PostHog export → warehouse.
- [ ] **dbt project** — seed the semantic layer with core marts:
  - [ ] `fct_orders`, `fct_dispatches` (with per-hop cycle times), `fct_charges` (fee capture).
  - [ ] Metric models: **GMV, net take rate, AOV, OTIF, tender-acceptance, reroute rate**.
  - [ ] Cohort models: creator signup cohorts, 90-day repeat rate, retention M1/M3/M6.
  - [ ] dbt tests (not-null/unique/relationships) + source freshness on all core models.

**P1 exit:** behavioral events land in PostHog + warehouse; dbt computes GMV/take-rate/OTIF once; Sentry captures client + server + perf.

---

## P2 — Surfaces + alerting (make signals reach us)

**Goal:** humans see and get alerted, numbers reconcile everywhere. Gated on D5.

- [ ] **Metabase** — deploy (self-host or cloud); connect warehouse; build starter dashboards per layer (Marketplace / Fulfillment / Financial). Analyst + exec exploration home.
- [ ] **D5 — Native "Insights" admin surface** (`apps/admin`, locked v2 pattern: hero band / KPI strip / chips / sortable table / RowActionsMenu). Reads dbt-computed metrics (via reverse-ETL cache or scheduled warehouse pull — **not** live primary-DB aggregation):
  - [ ] **Insights → Marketplace** tab (liquidity, take rate, GMV/AOV, activation funnel, retention).
  - [ ] **Insights → Fulfillment** tab (OTIF, cycle-time-by-hop, reroute/QC/defect, `ChannelSyncEvent` error rate).
  - [ ] **Insights → Financial** tab (per-order margin, fee capture by tier, refund/dispute/clawback, LTV:CAC).
  - [ ] Add a real charting lib (Recharts/Chart.js) — retire bespoke SVG widgets where a chart lib is clearly better.
- [ ] **Migrate the existing live dashboard aggregates** off primary-DB `count/groupBy` onto warehouse rollups / nightly cache (fixes the "most recent 1,000 tickets" cap + page-load DB load).
- [ ] **Alerting** — thresholds + routes for survival + SLA + financial breaches:
  - [ ] OTIF < 95%; order-processing SLA breach; on-time-delivery < target.
  - [ ] Tender-acceptance < target; take-rate WoW drop > X bps; refund/dispute-rate spike.
  - [ ] Channel-sync error storm; cron miss; error-rate spike (Sentry).
  - [ ] Route to Slack/email; each alert names the responsible hop/segment where possible.
- [ ] **D4 — Wire `gmvCents`** into `packages/orders/merit-signals.ts` (GMV backbone is clean; merit gets its missing input).
- [ ] **`onTimeRate`** into merit-signals now that `promisedShipBy` exists (P0).

**P2 exit:** every survival + SLA metric has a dashboard tile *and* an alert; the admin console shows operational metrics beside the action; dashboards no longer strain the primary DB; merit consumes GMV + on-time.

---

## P3 — Moat metrics + advanced (the proprietary layer)

**Goal:** measure and tune the orchestration moat; close the loop.

- [ ] **Insights → Orchestration** tab (build-only, our schema):
  - [ ] Routing efficiency (% auto-routed, manual-intervention rate).
  - [ ] Award-share distribution + rotation-band adherence (`FcAwardLog` / `PrintAwardLog` decision snapshots).
  - [ ] Workflow-graph flow: cycle time per graph shape, bottleneck hop, WIP by stage, exception density (`RiskEvent` / `PartnerStrike`).
- [ ] **V2 pooling + buffer metrics** (when V2 ships): pool utilization, buffer inventory turns, demand-consolidation ratio, **cost saved via pooling vs. direct routing** (the moat's dollar proof).
- [ ] **Reverse-ETL activation** (Hightouch/Census) — push warehouse cohorts/LTV/risk scores back into admin + lifecycle/notification tooling.
- [ ] **LTV:CAC end-to-end** — join marketing spend (needs a spend source connector) to creator-cohort net revenue.
- [ ] **A/B experimentation** — use PostHog feature flags + experiments on activation/checkout; significance-tested before rollout.
- [ ] **Session replay** review loop for Studio drop-off (PostHog replay on the heaviest surface).
- [ ] **Anomaly/forecast** — demand forecasting for buffer sizing; anomaly alerts on core metrics (beyond static thresholds).

**P3 exit:** the moat is measured in dollars; growth runs experiments; warehouse insights flow back into the product.

---

## Cross-cutting guardrails (every phase)

- [ ] **Tenant-stamp everything** — `tenantId` on every event + warehouse row (no-regret for multi-tenant, per `ilaunchify-earn-the-right-to-multi-tenant`).
- [ ] **One substrate, two consumers** — analytics + merit read the same operational signals; never double-compute.
- [ ] **Curated event taxonomy** — adding an event name is a reviewed PR, not a free-for-all.
- [ ] **Margin beside scale** — no GMV tile without a margin/quality tile next to it.
- [ ] **Cohort + two-sided segmentation** — never ship a blended-only retention/health number.
- [ ] **Data trust** — dbt tests green + monthly warehouse-vs-Stripe GMV reconciliation before a metric is "official."
- [ ] **Two-agent hygiene** — new files here are collision-safe; when touching hot zones (Studio, partner builder) follow single-writer + commit-immediately rules (CLAUDE.md).

---

## Blocker map (what gates what)

| Phase item | Blocked by |
|---|---|
| P1 behavioral funnels | D1 vendor choice + P0 event schema |
| P1 warehouse marts | D2 warehouse choice + ingestion |
| P2 Insights surface | D5 decision + P1 dbt marts |
| P2 `onTimeRate` merit | P0 `promisedShipBy` field |
| P2 dashboard migration | P1 warehouse rollups |
| P3 pooling metrics | V2 pooling ships |
| P3 LTV:CAC | marketing-spend connector |
