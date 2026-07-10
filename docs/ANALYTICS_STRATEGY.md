# iLaunchify — Analytics, Metrics & Insights Strategy

**Status:** DRAFT for Pavel review · 2026-07-09
**Owner:** Pavel
**Companion:** `BUILD_CHECKLIST_ANALYTICS.md` (P0–P3 tracker)

> **One-line thesis:** We already sit on a deep *operational-state* substrate (audit log, notification/email events, ratings/feedback, order + dispatch timestamps, money-in-cents, award/risk/inventory/capacity ledgers) and a competent hand-rolled admin KPI dashboard. What we lack is (a) a **behavioral event layer**, (b) a **warehouse + semantic layer** so numbers are computed once and trusted everywhere, and (c) **alerting** so signals reach us instead of waiting to be looked at. The right answer is **not** "build vs buy" — it is a **thin build on top of bought tools**, because our orchestration graph is the one thing no vendor can see.

---

## 1. Why this matters for *our* business specifically

We are not a storefront and not a matching marketplace — we are an **orchestration platform** (see `ilaunchify-orchestration-thesis`). That changes what "analytics" has to mean:

- The **unit of value is a decomposed order** flowing across a partner workflow graph (manufacturer → printer → co-packer → FC → channel). Our most important metrics are about *how well the graph flows*, not just top-line GMV. No off-the-shelf product-analytics tool models this — it lives in our data.
- The **moat (V2 pooling + buffer inventory)** is only provable with instrumentation: routing efficiency, pool utilization, buffer turns, reroute rate. If we don't measure the moat, we can't tune it or sell it.
- We have **two customers who never meet** (creators pay; partners produce; end buyers are off-platform). We need **two-sided health metrics** (creator retention/LTV *and* partner utilization/merit), plus the liquidity between them.
- Partner **fees are now merit-bound** (Verified 4.5% / Trusted 2.5% / Premier 0%). The Merit Engine already consumes operational signals — analytics and merit share the same raw feed. Getting instrumentation right feeds both.

**Survival metrics first.** Industry consensus for early marketplaces: three metrics govern health — **liquidity** (active demand ÷ active supply), **repeat rate** (90-day), and **take rate** — and everything else is secondary until those are stable. Net revenue and contribution margin matter more than GMV. We build to surface those three first, then layer depth. ([Phoenix Strategy Group](https://www.phoenixstrategy.group/blog/10-marketplace-kpis-for-vc-backed-companies), [Bowery Capital](https://bowerycap.com/blog/insights/measuring-b2b-marketplace-key-metrics-for-success), [Kissmetrics](https://www.kissmetrics.io/blog/marketplace-analytics))

---

## 2. Where we are today (honest audit)

| Layer | What exists | Gap |
|---|---|---|
| **Audit / state log** | `packages/audit` — `AuditLog` (actor, entity, action, from/to, payload, indexed for entity/actor/time). ~700 call sites, de-facto event spine. | Not enforced (no Prisma middleware); fire-and-forget, non-transactional; `entityType`/`action` are free-form strings. Strong-but-incomplete. |
| **Event / notification stream** | `packages/notifications` — `NotificationEvent` (~60 events), structured payloads, `payload-required.ts`, `Notification` + `EmailDelivery` (deliverability, read state). | It's a *notification* stream (shaped for rendering + delivery), not an aggregation-ready analytics bus. Some events defined with no verified emit site. |
| **Feedback & ratings** | `FeedbackResponse` (thumbs), `PartnerRating` (Bayesian), `ProductReview` (verified), `ReviewAspectNote`, `PrintAwardLog`, `RotationPolicy`. | Solid. Under-exposed in aggregate views. |
| **Merit inputs** | `packages/orders/merit-signals.ts` — craft rating, accept-rate, defect-rate, orders/units completed, months-active, recency. | **`onTimeRate` and `gmvCents` are null in V1** (no promised-date field; GMV "wire later"). These are exactly the analytics-critical fields. |
| **Orders / dispatch / shipping** | `Order` FSM + money-in-cents; `OrderDispatch` with **per-state timestamps** (accept→production→QC→ready→shipped→inTransit→delivered), `rerouteCount`, ETA; `FcAwardLog`/`PrintAwardLog` decision snapshots; `ShipmentLeg`, `InboundReceipt`, ledgers. | The SLA/funnel goldmine exists as **raw per-row state** — no rollup/aggregation table. Every metric is recomputed live against the primary DB. |
| **Money / GMV backbone** | `Order.*Cents` + `paidAt`; `Charge.{amountCents, applicationFeeCents, riskScore}`; `Transfer`, `Refund`, `Dispute`, `PartnerClawback`; fee config models. | Present and clean. Not yet assembled into margin/take-rate/cohort views. |
| **Admin dashboard** | Real hand-built dashboard (`apps/admin/.../dashboard/dashboard-data.ts` + widgets): Orders·7d, Revenue·30d, signups timeseries, orders-by-status, inbox queues, "System Health". Plus KPI strips on finance/merit/logistics/risk/routing-rotation. | Bespoke SVG widgets, **no charting lib**, **every query hits the primary DB on page load**. "System Health" is partly synthetic (compliance hard-coded amber; cron/webhook health inferred from audit prefixes — no `CronRun`/`WebhookEvent` store). Support analytics caps at "most recent 1,000 tickets" (scaling smell). |
| **Behavioral / product-usage** | **Nothing.** No page views, funnel steps, feature-usage, or session events. Latent "quality signal for analytics" fields on the checkout draft feed nowhere. | This is the single biggest gap. We cannot answer "where do creators drop off in the Design Studio?" today. |
| **Third-party observability** | **Sentry only** — `@sentry/nextjs`, DSN-guarded (off unless `SENTRY_DSN` set), **server-runtime + error-capture only**. No Datadog, no APM, no RUM, no product-analytics SDK, no warehouse. | Client/edge Sentry wiring, performance/RUM, and product analytics all absent. |

**Net:** rich operational truth, competent admin surface, **zero behavioral layer, no event store, no warehouse, no alerting.**

---

## 3. The four measurement layers (metrics taxonomy)

You told me all four matter. Here's the canonical metric set per layer, mapped to *where the data already lives* so we instrument deliberately, not exhaustively.

### Layer A — Marketplace & business health (the "are we a real marketplace" layer)

The three survival metrics + the two-sided health set:

- **Liquidity** — active creators with ≥1 order ÷ active partner-services accepting work; **tender/fill rate** = dispatches accepted within window ÷ dispatches offered; **time-to-first-production** (order paid → first leg accepted). *Source:* `Order`, `OrderDispatch.acceptedAt/acceptDeadlineAt/declinedAt`.
- **Take rate & net revenue** — `Σ Charge.applicationFeeCents ÷ Σ Order.totalCents`, split by partner tier (merit fee) and creator tier. Net take rate after refunds/clawbacks. *Source:* `Charge`, `Transfer`, `Refund`, `PartnerClawback`. B2B marketplaces run 1–5% commodity / 10–25% net — track ours against that band. ([execviva](https://execviva.com/executive-hub/b2b-marketplace-kpis))
- **GMV & AOV** — `Σ Order.totalCents` by period; AOV = GMV ÷ orders. GMV is the VC scale metric but **subordinate to contribution margin** (see Layer D).
- **Repeat & retention** — 90-day creator repeat-order rate; creator cohort retention (M1/M3/M6); partner re-award rate.
- **Funnel** — signup → first product created → first design published → checkout → paid → delivered. *This funnel spans behavioral (Layer B) + transactional (here)* — the join is why we need the warehouse.
- **Supply health** — active partners, partners by tier, new-partner ramp, capacity utilization (`PartnerCapacityLedger`: completed ÷ committed units), coverage gaps (categories/formats with thin supply).

### Layer B — Product usage & behavioral (the missing layer)

This requires **net-new instrumentation** — a client + server event SDK. Priority events (start small, ~20–30 well-named events, not everything):

- **Activation funnel:** `signup_completed`, `onboarding_step_completed{step}`, `product_created`, `studio_opened`, `design_saved`, `design_published`, `checkout_started`, `order_paid`. (Ties directly to the creator 5-step onboarding + "<15 min to first customize" goal.)
- **Design Studio engagement:** `studio_session_started`, `template_applied`, `flavor_added`, `ai_generation_requested`, `ai_concept_accepted`, `packaging_3d_previewed`, `mockup_published`. (Studio is our core value + heaviest surface.)
- **Partner side:** `partner_onboarding_step`, `product_editor_opened`, `dispatch_accepted/declined`, `proof_uploaded`. (Feeds activation-setup + merit.)
- **Feature adoption & drop-off:** first-use and repeat-use of each major feature; step-level drop-off with reasons where captured (the latent checkout "quality signal" fields finally get a home).

**Design principle:** one canonical event schema (name, `userId`, `role`, `tenantId`, `timestamp`, typed `properties`), emitted **both** client-side (via SDK) and server-side (for money/state events that must not be lost to ad-blockers). Server events are the source of truth for anything financial.

### Layer C — Ops / reliability / SLA (the "is the machine running" layer)

Two sub-layers — **infra reliability** (bought) and **fulfillment SLA** (our data):

- **Fulfillment SLA** (our differentiator): **On-Time-in-Full (OTIF)**, order-processing SLA (paid → dispatched within window), on-time-delivery rate (delivered within promised transit), per-hop cycle times (accept/production/QC/ship latencies from `OrderDispatch` timestamps), **reroute rate**, QC-fail rate, defect/reprint rate, inbound discrepancy rate. Marketplace benchmark: 95% on-time across order-to-dispatch + transit, 48–72h SLA windows. ([forthmatch](https://www.forthmatch.io/blog/meet-marketplace-fulfillment-sla-requirements/), [NextBillion](https://nextbillion.ai/blog/on-time-delivery-metrics)) **Prerequisite: add a promised-date/`promisedShipBy` field** — without it `onTimeRate` stays null (same blocker the Merit Engine has).
- **Partner performance** — the same SLA feed *is* the Merit input feed. Analytics and merit read one substrate; we should not compute these twice.
- **Infra reliability** — error rate, p95/p99 latency, uptime, failed webhooks, cron success, queue depth. Today: partly synthetic in "System Health." Fix by (1) turning Sentry fully on and (2) adding real `CronRun`/`WebhookEvent` backing (or emitting to Datadog/Sentry cron monitors).
- **Channel sync health** — `ChannelSyncEvent` already logs every adapter interaction (PUSH/PULL/WEBHOOK × OK/ERROR/RETRY). Surface it: sync error rate per channel, retry storms.

### Layer D — Financial / unit economics (the "are we actually making money" layer)

- **Per-order contribution margin** — revenue (fee capture) − platform-borne costs (payment fees, storage accrual, support load). `OrderDispatch.costCents` = partner cost basis; `Charge.applicationFeeCents` = our cut.
- **Fee capture by tier** — realized take vs. configured (`MeritPolicy` fee bps, `ManufacturerFeeGrant`) — catches fee leakage.
- **Refund / dispute / clawback rates** — `Refund`, `Dispute`, `PartnerClawback`; `Charge.riskScore`/`riskLevel` (Stripe Radar) as a fraud signal.
- **LTV:CAC** — creator LTV (cumulative net revenue per cohort) ÷ CAC (needs marketing spend joined in — a reverse-ETL / warehouse job). The healthy-marketplace profitability signal. ([Bowery Capital](https://bowerycap.com/blog/insights/measuring-b2b-marketplace-key-metrics-for-success))
- **Stripe reconciliation** — payouts vs. transfers vs. ledger; `ProcessedWebhookEvent` for idempotency/forensics.

### Layer E — The orchestration moat (our unique layer, build-only)

No vendor can produce these; they're the reason to own a native analytics module:

- **Routing efficiency** — % orders routed without manual intervention; award-share distribution (`FcAwardLog`/`PrintAwardLog` decision snapshots); rotation-band adherence.
- **Pooling & buffer (V2)** — pool utilization, buffer inventory turns, demand-consolidation ratio, cost saved via pooling vs. direct routing.
- **Workflow-graph flow** — cycle time per graph shape, bottleneck hop, WIP by stage, exception density (`RiskEvent`, `PartnerStrike`).

---

## 4. Build vs buy — the recommended mix

**Verdict: thin build on bought foundations.** Buy the commodity layers (behavioral capture, warehouse, BI, error/APM); build the two things that are genuinely ours (native admin operational surface + orchestration/moat metrics). Rationale by layer:

| Capability | Decision | Tool (recommendation) | Why |
|---|---|---|---|
| **Behavioral event capture** | **Buy** | **PostHog** (start cloud free tier; self-host later if volume/cost warrants) | Bundles product analytics + session replay + feature flags + A/B + surveys in one, cheapest at our scale, open-source escape hatch. We already burn engineers on core product — don't build funnels. ([PostHog](https://posthog.com/blog/best-product-analytics-tools-for-startups), [Foundra](https://www.foundra.ai/tools-directory/analytics-for-startups)) |
| **Error monitoring / APM / RUM** | **Buy (finish)** | **Sentry** (already scaffolded) — turn on fully: client + edge + performance/RUM + cron monitors | Scaffold exists; just needs DSN + client wiring. Cheapest path to real reliability signal. Consider Datadog later only if infra complexity demands full APM/log aggregation. |
| **Warehouse** | **Buy** | **BigQuery** or **Snowflake** (you already have both connectors available) | Single trusted store to join behavioral + transactional + cost data. Default startup pick. ([Domo](https://www.domo.com/glossary/modern-data-stack), [Valiotti](https://valiotti.com/modern-data-stack-2026/)) |
| **Ingestion (DB → warehouse)** | **Buy** | **Fivetran or Airbyte** (Cockroach/Postgres → warehouse); PostHog + Stripe native connectors | Don't hand-roll pipelines. |
| **Transformation / semantic layer** | **Build-in-tool** | **dbt** — the metric definitions (GMV, take rate, OTIF, cohorts) live here as version-controlled SQL | This is where "compute once, trust everywhere" happens. A metric defined in dbt is the *same number* on the exec dashboard and in the admin app. |
| **BI / exploration** | **Buy** | **Metabase** (fastest-to-value, open-source, ~1hr to stand up) | For ad-hoc exec/analyst exploration. Covers 80% of dashboards a growth-stage co needs. ([Modern Data Stack](https://medium.com/@reliabledataengineering/the-modern-data-stack-in-2025-what-actually-won-708c59176b32)) |
| **Native admin analytics surface** | **BUILD** | Our `apps/admin` v2 surface (existing pattern) reading from warehouse rollups (via reverse-ETL) or cached aggregates | Ops needs live operational metrics *inside the console next to the actions* — merit, routing, SLA, exceptions. This is where we act, not just observe. |
| **Orchestration / moat metrics** | **BUILD** | Native, on our schema (`FcAwardLog`, ledgers, dispatch timestamps) → dbt models | No vendor sees the graph. This is the proprietary layer. |
| **Reverse ETL (warehouse → app/tools)** | **Buy (later)** | **Hightouch or Census** | Push warehouse-computed cohorts/LTV back into admin + lifecycle tooling. P2+. |

**Why not pure-build:** rebuilding funnels, retention, session replay, and a warehouse is months of eng we can't spare, and vendors do it better/cheaper at our stage. **Why not pure-buy:** no vendor can model the orchestration graph, merit is fee-binding (must be auditable + owned), and ops needs metrics *in the console beside the button*. The seam is clean: **buy sees users and dollars; build sees the graph.**

---

## 5. Target architecture

```
                        ┌─────────────────────────────────────────────┐
  CLIENT (4 Next apps)  │  PostHog SDK  ──►  behavioral events         │
  SERVER actions        │  server event emitter ──► PostHog + event tbl│
  Sentry (client+server)│  errors / perf / RUM / cron monitors         │
                        └───────────────┬─────────────────────────────┘
                                        │
  PRIMARY DB (CockroachDB)              │        ┌───────────────┐
  AuditLog, Order, OrderDispatch, ──────┼───────►│  Fivetran/    │
  Charge/Transfer, ledgers, ratings     │        │  Airbyte      │
  Stripe (native connector) ────────────┼───────►│  ingestion    │
  PostHog (native export) ──────────────┘        └──────┬────────┘
                                                        ▼
                                               ┌──────────────────┐
                                               │  WAREHOUSE        │
                                               │  BigQuery/Snowflake│
                                               └───────┬──────────┘
                                                       ▼
                                               ┌──────────────────┐
                                               │  dbt (semantic)   │  ← single source
                                               │  GMV, take rate,  │    of metric truth
                                               │  OTIF, cohorts,   │
                                               │  moat metrics     │
                                               └───┬───────────┬───┘
                                                   ▼           ▼
                                        ┌────────────┐   ┌──────────────────┐
                                        │ Metabase   │   │ reverse-ETL →     │
                                        │ (exec/     │   │ apps/admin native │
                                        │  analyst)  │   │ operational surface│
                                        └────────────┘   └──────────────────┘
```

**Two consumption paths on purpose:** Metabase for exploration/exec; the native admin surface for operational metrics that sit beside the action (merit standing, routing award-share, SLA-at-risk queue). Both read dbt-defined metrics so the numbers reconcile.

**No-regret substrate to land now** (aligns with `ilaunchify-earn-the-right-to-multi-tenant`): a canonical **event schema** + a server-side **event emitter** + a raw **event table** (append-only, `tenantId` stamped). Even before the warehouse exists, this makes every later step additive.

---

## 6. Monitoring — reading the signals correctly

Collecting data ≠ monitoring. Rules so signals reach us and we read them right:

1. **Alerting, not staring.** Every survival + SLA metric gets a threshold and a route (Slack/email/PagerDuty-style). Examples: OTIF < 95%, tender-acceptance < target, take-rate drop > X bps WoW, refund-rate spike, channel-sync error storm, cron miss, error-rate spike. Alerts fire on *deltas and breaches*, not absolute noise.
2. **Guard against vanity metrics.** GMV up but contribution margin down is a warning, not a win. Always pair a scale metric with its quality/margin counterpart on the same view.
3. **Cohorts over aggregates.** Retention/repeat/LTV read by signup cohort, not blended — blended rates hide churn behind new-signup growth.
4. **Segment two-sidedly.** Split creator metrics by tier and partner metrics by tier/role; a healthy blended average can mask a dying segment.
5. **Root-cause by hop.** SLA breaches route to the responsible hop (pickup/production/QC/transit) — the dispatch timestamps already make this possible; surface it so a recurring delay pinpoints the partner/leg, not just "orders are late." ([NextBillion](https://nextbillion.ai/blog/on-time-delivery-metrics))
6. **Statistical honesty.** Use significance testing on A/B and week-over-week deltas before acting; small-N marketplace weeks are noisy.
7. **Data trust.** dbt tests (not-null, uniqueness, referential) on core models; a freshness check on ingestion; reconcile warehouse GMV vs. Stripe payouts monthly. A metric no one trusts is worse than no metric.
8. **Don't recompute on the primary DB forever.** The current dashboard's live `count/groupBy` on every page load won't scale (support analytics already caps at 1,000 rows). Move heavy aggregates to warehouse rollups or a nightly materialized cache.

---

## 7. Recommended module shape

Rather than one monolithic "Analytics module," build a small **native "Insights" surface in `apps/admin`** (following the locked v2 admin pattern — hero band / KPI strip / chips / table / RowActionsMenu) that renders **warehouse/dbt-computed metrics**, organized as tabs mapping to the four layers:

- **Insights → Marketplace** (liquidity, take rate, GMV/AOV, funnel, retention)
- **Insights → Fulfillment** (OTIF, cycle-time-by-hop, reroute/QC/defect, channel sync)
- **Insights → Financial** (margin, fee capture by tier, refund/dispute/clawback, LTV:CAC)
- **Insights → Orchestration** (routing efficiency, award-share, pooling/buffer — V2)

Exec/analyst deep-dives happen in **Metabase**; product/growth funnels + session replay in **PostHog**; reliability in **Sentry** (later Datadog). The admin Insights surface is the operational "act-on-it" layer, not a rebuild of BI.

---

## 8. Decisions to lock (need your call)

- **D1 — Behavioral vendor:** PostHog (recommended) vs Amplitude vs Mixpanel. *Rec: PostHog* (cost + bundle + open-source escape hatch).
- **D2 — Warehouse:** BigQuery vs Snowflake vs Databricks. *Rec: BigQuery* to start unless you already lean Snowflake (you have connectors for both/all).
- **D3 — Add `promisedShipBy` / promised-date field** to `OrderDispatch` (unblocks `onTimeRate` for both analytics **and** Merit). *Rec: yes, P0 — additive migration.* This is the single highest-leverage schema change.
- **D4 — Wire `gmvCents` into merit-signals** now that GMV backbone is clean. *Rec: yes, P1.*
- **D5 — Native "Insights" admin surface** vs. rely on Metabase only. *Rec: build the thin native surface for operational metrics; Metabase for exploration.*
- **D6 — Reliability tool:** finish Sentry now; defer Datadog until infra complexity demands it. *Rec: yes.*
- **D7 — Event schema ownership:** land the canonical event schema + server emitter as a `packages/analytics` package (single writer, tenant-stamped) before any SDK work. *Rec: yes, P0.*

---

## 9. What NOT to do (anti-goals)

- **Don't** instrument everything on day one — 20–30 well-named events beat 300 noisy ones. Naming is a taxonomy decision, treat it like the marketplace taxonomy (curated, not sprawling).
- **Don't** build funnels/retention/session-replay in-house — buy it.
- **Don't** let the admin dashboard keep computing heavy aggregates live against CockroachDB — it already shows the strain.
- **Don't** double-compute merit signals and analytics signals — one substrate, two consumers.
- **Don't** ship GMV without margin beside it.
- **Don't** treat the notification stream as the analytics event bus — different shape, different guarantees.

---

## Sources

- [Phoenix Strategy Group — 10 Marketplace KPIs for VC-Backed Companies](https://www.phoenixstrategy.group/blog/10-marketplace-kpis-for-vc-backed-companies)
- [Bowery Capital — Measuring B2B Marketplace Key Metrics](https://bowerycap.com/blog/insights/measuring-b2b-marketplace-key-metrics-for-success)
- [execviva — B2B Marketplace KPIs](https://execviva.com/executive-hub/b2b-marketplace-kpis)
- [Kissmetrics — Marketplace Analytics: Supply, Demand, Liquidity](https://www.kissmetrics.io/blog/marketplace-analytics)
- [PostHog — Best product analytics tools for startups](https://posthog.com/blog/best-product-analytics-tools-for-startups)
- [Foundra — Best analytics tools for startups (PostHog vs Mixpanel vs Amplitude)](https://www.foundra.ai/tools-directory/analytics-for-startups)
- [Amplitude — 10 Best Product Analytics Tools](https://amplitude.com/compare/best-product-analytics-tools)
- [Modern Data Stack in 2025: What Actually Won](https://medium.com/@reliabledataengineering/the-modern-data-stack-in-2025-what-actually-won-708c59176b32)
- [Valiotti — Modern Data Stack 2026](https://valiotti.com/modern-data-stack-2026/)
- [Domo — What is a Modern Data Stack](https://www.domo.com/glossary/modern-data-stack)
- [forthmatch — Meet Marketplace Fulfillment SLA Requirements](https://www.forthmatch.io/blog/meet-marketplace-fulfillment-sla-requirements/)
- [NextBillion.ai — On-Time Delivery Metrics](https://nextbillion.ai/blog/on-time-delivery-metrics)
