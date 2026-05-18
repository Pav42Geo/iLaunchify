# Observability

**Status:** Draft for Pavel approval.

**The five decisions in this doc:**
1. Logging stack.
2. Metrics + tracing.
3. Error tracking.
4. Uptime monitoring.
5. Business analytics (product metrics, not infra).

Plus: alerting strategy and what we instrument from day 1.

---

## Principle

V1 observability is **cheap and lean** — designed to catch incidents *and* answer "is the platform actually working" with a $0/mo budget at first. The stack scales without rework.

The four questions a V1 observability stack must answer:

1. **Is anything broken right now?** → Uptime + error rate dashboards.
2. **Why did this specific user's request fail?** → Logs + traces tied to a request ID.
3. **Is the platform getting used?** → Product analytics.
4. **Is anything trending the wrong direction?** → Time-series metrics + business KPIs.

Anything beyond those four is V1.5+.

---

## Decision 1 — Logging: **structured JSON logs, app-native hosting first**

### V1: native log destinations + Axiom for aggregation

| Workload | Native log destination | Aggregation |
|---|---|---|
| Next.js apps on Vercel | Vercel Logs (built-in) | **Axiom** via Vercel ↔ Axiom integration |
| Python services on Fly.io | Fly.io Logs (built-in) | **Axiom** via OTEL log exporter |

**Axiom** (https://axiom.co) was chosen because:
- 500 GB/mo ingest on free tier — enough for V1.
- SQL-ish query language (APL) — fast for ad-hoc analysis.
- Native Vercel integration — set-and-forget.
- Same backend can hold metrics + traces later, so we don't have to migrate.

Alternative considered: **Grafana Loki + Grafana Cloud**. Excellent product, but Axiom's Vercel integration is smoother and the free tier is more generous for our pattern.

### What we log

Every log line is structured JSON with these fields baked in:

```json
{
  "timestamp": "2026-05-18T12:34:56.789Z",
  "level": "info" | "warn" | "error" | "fatal",
  "service": "creator" | "storefront" | "provider" | "admin" | "compliance" | "exports",
  "env": "dev" | "staging" | "prod",
  "release": "<git_sha>",
  "requestId": "req_abc123",
  "userId": "user_xxx",      // if authenticated
  "brandId": "brand_xxx",    // if relevant
  "orderId": "order_xxx",    // if relevant
  "msg": "human-readable summary",
  "...": "any additional context"
}
```

Library:
- TypeScript apps: **pino** (fastest structured logger for Node).
- Python services: **structlog** (already in `pyproject.toml`).

### Log levels

- **fatal** — process is dying. Page someone.
- **error** — operation failed; user-facing impact. Sentry handles these (next section).
- **warn** — operation succeeded but with concerning signal (e.g., compliance check found violations).
- **info** — normal request flow milestones (one per HTTP request, payments milestones).
- **debug** — verbose; off in prod.

### What we **don't** log

PII rules:
- Never log raw credit card numbers, CVCs, SSNs, EINs (none of these touch our servers anyway — Stripe handles all of it).
- Never log auth tokens, session cookies, or API keys.
- Hash email addresses before logging (`sha256(email)[:8]`) if we need to correlate without storing PII.
- Recipe contents are fine to log; recipe + creator together is fine.

### Log retention

| Env | Retention |
|---|---|
| Dev | 7 days |
| Preview | 7 days |
| Staging | 30 days |
| Prod | 90 days |

Axiom's free tier handles 500 GB; we'll be well under that at V1.

---

## Decision 2 — Metrics + tracing: **OpenTelemetry → Axiom**

### V1: OTel SDK in every app + service, single backend

All services emit OpenTelemetry data (logs, metrics, traces) to Axiom. One pipeline, one query interface.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Creator   │    │  Storefront │    │   Provider  │    │    Admin    │
│  (Next.js)  │    │  (Next.js)  │    │  (Next.js)  │    │  (Next.js)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │ OTel SDK         │                  │                  │
       │ (logs+metrics+traces)               │                  │
       └──────────────────┼──────────────────┼──────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   OTel HTTP   │
                  │   Collector   │
                  │   (optional;  │
                  │   skip in V1) │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │     AXIOM     │
                  │  logs+metrics │
                  │    +traces    │
                  └───────────────┘

  ┌─────────────┐    ┌─────────────┐
  │ Compliance  │    │   Exports   │
  │  (Python)   │    │  (Python)   │
  └──────┬──────┘    └──────┬──────┘
         │ OTel Python      │
         └──────────────────┘
              (same Axiom endpoint)
```

V1 skips the OTel Collector — apps push directly to Axiom. Add a collector when we have 10+ services and want central rate-limiting / filtering.

### What we instrument (V1)

#### Metrics — RED + USE

The two standard frameworks:

- **RED** (per-route, request-driven): Rate, Errors, Duration.
- **USE** (per-resource): Utilization, Saturation, Errors.

V1 instruments RED on every HTTP route automatically (via OTel middleware) plus these explicit business metrics:

```
# Counters (monotonic up)
orders_created_total{brand_id, source}
orders_paid_total{brand_id}
orders_refunded_total{brand_id, reason}
charges_succeeded_total
charges_failed_total{stripe_decline_code}
transfers_executed_total{destination_type}
compliance_checks_total{rule_pack, passed}
exports_generated_total{format, success}
exports_failures_total{stage}                  # which pipeline stage failed
signups_total{role}                            # creator | manufacturer | print_provider
partner_invites_sent_total
partner_activations_total

# Histograms (latency distribution)
http_request_duration_seconds{route, status, method}
compliance_check_duration_seconds{rule_pack}
export_pipeline_duration_seconds{format}
db_query_duration_seconds{operation}
stripe_api_call_duration_seconds{endpoint}

# Gauges (point-in-time)
active_carts{brand_id}
pending_transfers
unfulfilled_orders_count{age_bucket}
inventory_remaining{product_id}
```

These are the metrics that answer "is the business healthy" alongside "are the servers healthy."

#### Tracing — request lifecycle

OTel auto-traces:
- Inbound HTTP requests (one trace per request).
- Prisma queries (DB span).
- Outbound HTTP (Stripe, Resend, compliance service, etc.).
- BullMQ job lifecycle (queue → execute → done).

Manual trace spans we add:

```ts
// Example in apps/storefront/api/checkout/route.ts
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('storefront-checkout')

export async function POST(req) {
  return tracer.startActiveSpan('checkout.create', async (span) => {
    span.setAttribute('brandId', brand.id)
    span.setAttribute('cartItemCount', cart.items.length)

    // ... checkout logic ...

    span.setAttribute('orderId', order.id)
    span.end()
    return Response.json({ ... })
  })
}
```

Tracing pays off in three scenarios:
1. **"Why is this checkout slow?"** → see the chain: cart fetch → inventory check → Stripe API → DB write → revalidation.
2. **"Where did the compliance check time out?"** → trace shows: rule pack load → recipe fetch → calc → eval → DB write.
3. **"What happened to this specific transfer?"** → trace ID gets attached to every log line; one search gives full lifecycle.

#### Traces cost a lot at scale — sampling

V1 traces every request (low traffic, free tier covers it). V1.5+ samples down to 10–20% based on volume, with always-trace-errors logic.

---

## Decision 3 — Error tracking: **Sentry**

### V1: Sentry for both TypeScript and Python

| Project | Sentry SDK |
|---|---|
| `apps/creator`, `apps/storefront`, `apps/provider`, `apps/admin` | `@sentry/nextjs` |
| `services/compliance`, `services/exports` | `sentry-sdk[fastapi]` |

Free tier: 5K errors/mo + 10K performance units. More than enough for V1.

### What Sentry captures

Out of the box:
- All unhandled exceptions (full stack trace + source maps).
- Breadcrumbs (recent log lines + user actions).
- Performance: slow transactions auto-surfaced.
- User context: when a user is logged in, errors are tagged with their `userId` (NOT email).
- Release tracking: errors attributed to a git SHA so we can see when a regression appeared.

### What we add explicitly

```ts
import * as Sentry from '@sentry/nextjs'

// In an order route after a payment failure
Sentry.captureException(error, {
  tags: { domain: 'payments', stripe_decline: error.decline_code },
  extra: { orderId, amountCents, brandId },
  user: { id: userId },                  // NOT email
})
```

Tagging by `domain` (`payments`, `compliance`, `exports`, `auth`, `canvas`) lets us slice Sentry dashboards by area of the system.

### Alerting from Sentry

V1 alerts:
- **New issue in prod** → Slack + email (immediately).
- **Issue spike** (>10x baseline in 5 min) → Slack + email.
- **Regression alert** (issue resolved, reappeared) → Slack + email.

V1.5+ adds PagerDuty for paid on-call rotation. V1 = just email.

### What goes to Sentry vs. to Axiom logs

| Type | Destination |
|---|---|
| Unhandled exception | Sentry |
| `log.error()` calls | Both (Sentry via integration, Axiom as logs) |
| Validation failures (4xx with structured detail) | Axiom only — user error, not platform error |
| Slow transactions | Sentry (performance) + Axiom (latency metrics) |
| Compliance check violations | Axiom (not errors — expected business signal) |

The principle: **Sentry is for things that should never happen and need a human to look at**. Axiom is for everything observable.

---

## Decision 4 — Uptime monitoring: **BetterStack**

### V1: BetterStack (Better Uptime)

Free tier: 10 monitors, 3-min check intervals. Sufficient for V1.

Monitors:
- `app.ilaunchify.com/healthz`
- `shop.ilaunchify.com/healthz`
- `partners.ilaunchify.com/healthz`
- `admin.ilaunchify.com/healthz`
- `cmpl.ilaunchify.com/healthz` (compliance service)
- `exp.ilaunchify.com/healthz` (exports service)
- DB ping endpoint (`app.ilaunchify.com/healthz/db` — does a SELECT 1)
- Stripe webhook receipt endpoint (`api.ilaunchify.com/webhooks/stripe`)

Each `/healthz` endpoint:
- Returns 200 if process is alive.
- `/healthz/db` returns 200 only if DB is reachable.
- `/healthz/ready` returns 200 only if all dependencies are reachable (DB + Redis + compliance service).

Alerting:
- Down for > 2 consecutive checks → email + SMS to Pavel.
- Recovery → notification.
- Public status page (V1.5+: `status.ilaunchify.com`).

### Synthetic checks (V1.5+)

V1.5+ adds end-to-end synthetic checks:
- A test creator account places a test order every hour.
- Compliance check is exercised every hour against a known recipe.
- Export pipeline produces a test PDF every hour.

These catch issues that healthcheck endpoints miss (auth flow regressions, payment flow regressions, etc.).

---

## Decision 5 — Business analytics: **PostHog**

### V1: PostHog (self-hosted is also an option, but cloud free tier is easier)

Free tier: 1M events/mo. Covers V1 easily.

Why PostHog over Mixpanel / Amplitude / GA4:
- **Open-source + self-hostable** if needed later.
- Free tier is generous.
- Has feature flags + experiments built in — saves another tool subscription.
- Privacy-friendly (cookie-less option, EU hosting available).

### What we track

Three categories of events:

#### Creator journey
```
creator_signed_up              { source, audience_size_band }
creator_brand_created          { brand_id }
creator_product_started        { product_id, category }
creator_recipe_completed       { product_id, ingredient_count }
creator_compliance_check_run   { product_id, passed, violation_count }
creator_label_exported         { product_id, format }
creator_product_published      { product_id }
creator_first_order_received   { brand_id, days_since_signup }
```

#### Consumer journey (storefront)
```
storefront_visited             { brand_id, source }
storefront_product_viewed      { brand_id, product_id }
storefront_added_to_cart       { brand_id, product_id }
storefront_checkout_started    { brand_id, cart_value_cents }
storefront_checkout_completed  { brand_id, order_id, value_cents }
storefront_checkout_abandoned  { brand_id, stage }
```

#### Partner journey
```
partner_lead_submitted         { service_type }
partner_invitation_accepted    { partner_id }
partner_onboarding_completed   { partner_id, days_to_complete }
partner_order_received         { partner_id, service_type }
partner_order_accepted         { partner_id, hours_to_accept }
partner_order_declined         { partner_id, reason }
partner_order_shipped          { partner_id, days_to_ship }
```

### Funnels worth tracking from day 1

1. **Creator activation:** signup → brand created → first product → compliance check pass → label exported → published → first order. (Conversion at each step.)
2. **Storefront conversion:** visited → product viewed → cart → checkout → completed.
3. **Partner activation:** lead → invitation accepted → onboarding completed → first order.

### PostHog vs. SQL

PostHog answers product questions ("what % of creators publish in their first week?"). SQL on Cockroach answers operational questions ("what's the average days-to-ship per manufacturer?"). Use the right tool for each.

V1.5+: set up Metabase or Apache Superset against a read replica for SQL dashboards.

---

## Alerting strategy

### V1 alert channels

- **Email** to Pavel for everything.
- **Slack** for high-priority (errors, downtime).
- **SMS** for hard outages (BetterStack).

### Alert hygiene

The trap: too many alerts → alert blindness → real incidents missed. V1 alerts are tuned conservatively:

| Alert | Channel | Threshold |
|---|---|---|
| Any production exception (Sentry) | Slack | Immediate, deduped per issue |
| Production exception spike | Slack + email | >10x baseline in 5 min |
| Uptime monitor down | Email + SMS | > 2 consecutive failed checks |
| DB unreachable (healthz/db) | Email + SMS | > 1 failure |
| Stripe webhook not processed in 5 min | Email | After 5-min delay |
| Compliance check failure rate > 50% in 5 min | Slack | Rate threshold |
| Export pipeline failure rate > 20% in 5 min | Slack | Rate threshold |
| Transfer execution stuck > 1 hour | Email | Per stuck transfer |

V1.5+ adds:
- PagerDuty rotation
- Phone-call escalation
- Severity classification (SEV1/2/3)
- Auto-incident creation in incident.io

---

## V1 instrumentation — minimum viable

For Week 1 alongside the schema port, set up:

- [ ] Sentry project + DSN in env vars
- [ ] Axiom account + Vercel integration + Fly.io log forwarding
- [ ] OTel SDK initialization in each Next.js app
- [ ] OTel SDK initialization in each Python service
- [ ] BetterStack account + 8 healthchecks defined
- [ ] PostHog project + initialization in apps
- [ ] `/healthz` and `/healthz/db` endpoints in each app
- [ ] Structured logger setup (pino in TS, structlog in Python)
- [ ] Alert rules configured

Estimated: 1–2 days of focused work, ideally done in Week 1 so every subsequent week of development is observable.

---

## What V1.5+ adds

- OTel Collector (centralized export, filtering, sampling).
- Synthetic E2E checks (test order every hour).
- Status page (`status.ilaunchify.com`).
- Distributed tracing dashboards (Tempo / Grafana Tempo) if Axiom's tracing isn't enough.
- Custom Grafana dashboards on top of Cockroach (read-replica).
- PagerDuty + on-call rotation.
- SLO definitions + error budgets.
- Anomaly detection on cost (Vercel, Fly.io, Cockroach bills).
- Real User Monitoring (Vercel Analytics is the easy answer here).

---

## Open questions

1. **Sentry vs. Highlight / Bugsnag?** Recommendation: Sentry. Most mature ecosystem, best Next.js + Python support.

2. **Axiom vs. Grafana Cloud Loki/Tempo/Mimir?** Recommendation: Axiom for V1 because Vercel integration is seamless. Migrate to Grafana Cloud if Axiom's pricing changes or we outgrow the free tier.

3. **PostHog cloud or self-hosted?** Recommendation: cloud for V1. Self-host if data residency becomes a concern (e.g., EU rollout).

4. **Vercel Analytics in addition to PostHog?** Recommendation: yes, it's free up to 25K events/mo and gives Web Vitals (LCP, INP, CLS) that PostHog doesn't.

5. **Should the storefront export anonymous traffic events to PostHog?** Recommendation: yes, but cookie-less and respect Do Not Track. Storefront SEO/conversion depends on understanding consumer behavior.

6. **Cost monitoring (anomaly alerts on bills)?** Recommendation: V1.5+. Manual monthly review in V1. Once monthly bill is > $1K, automate.
