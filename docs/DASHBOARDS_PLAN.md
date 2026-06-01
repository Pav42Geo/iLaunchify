# Advanced Dashboards Plan — admin / partner / creator

Author: Claude · 2026-06-01 · status: planning

Pavel asked for advanced dashboards across all three apps, inspired by two
reference screenshots — a Panze admin panel (KPI-strip + ticket donut +
recent-publications table) and a Pokecut SaaS dashboard (KPI-strip + 24h
trend line + content moderation queue + system-health panel). His direction:

> "Appropriate Advanced Dashboard can be done for the other Partner and
> Creator Dashboards as well."

This doc covers all three. Read-only — no code shipped. Build order in §7.

What the dashboards are today (audited 2026-06-01):

- **Admin** — already a v1 advanced layout. Lives at
  `apps/admin/src/app/(dashboard)/dashboard/page.tsx` (124 lines). Six KPI
  cards, OrdersByStatusChart, SignupsChart, InboxPreview, ActivityFeed. Data
  loaders in `dashboard-data.ts` (473 lines). Widgets folder at
  `apps/admin/src/app/(dashboard)/dashboard/widgets/`: KpiCard.tsx (145),
  OrdersByStatusChart.tsx (159), SignupsChart.tsx (168), InboxPreview.tsx
  (86), ActivityFeed.tsx (117). These are pure-CSS — no chart lib in repo.
- **Partner** — `apps/partner/src/app/(dashboard)/dashboard/page.tsx` (98
  lines). Stub: 3 KPI cards (Awaiting accept / In production / Active
  services) + an "Order routing" placeholder copy block. No charts, no
  queues, no health panel. Greenfield rebuild.
- **Creator** — `apps/creator/src/app/(dashboard)/dashboard/page.tsx` (92
  lines). Stub: 3 KPI cards (Products / Orders-this-week hard-coded `0` /
  Get-started) + a Brand Assets link card. No timeline, no orders intel,
  no tier-aware widgets. Rebuild required.

All three need to honour the v2 admin surface pattern (see memory
`ilaunchify-admin-surface-pattern.md` §"v2"): cream hero band, KPI strip
under the title, URL-driven filter chips, RowActionsMenu, semantic tones
(pink/emerald/amber/sky/rose). Pavel explicitly stretched this from
"admin lists" to "every feature we ship going forward."

---

## §1 Shared design language across the three dashboards

All three dashboards converge on the same chrome so the platform reads as
one product across the three apps:

1. **Cream hero band** with `groupLabel` / `display-Bricolage title` /
   `Fraunces italic emphasis on the name` / `subtitle`. Pattern locked in
   `apps/admin/src/app/(dashboard)/dashboard/page.tsx:99-122` (the
   `HeroGreeting` function — pink Fraunces "i" decorative letterform stays
   on admin only; partner uses neutral, creator uses pink-tinted gradient).
2. **KPI strip under the hero**, identical structure across the three apps:
   one `<KpiWidget>` per metric, `tone` ∈ {ink, pink, neon, success,
   warning, info, danger}, optional `delta` chip (up/down/flat ±%),
   `href` to drill in. Use the existing
   `apps/admin/.../widgets/KpiCard.tsx` (145 lines) as the seed
   implementation — copy semantics, lift to `packages/ui`. See §6.
3. **12-column grid below the KPI strip** — `grid lg:grid-cols-12`. Widget
   tiles declare their span. Standard tile heights: 1u (KPI = 84-96px),
   2u (chart = 240px), 3u (queue/table = 360-420px). Keep heights snapped
   so rows align across mixed widgets.
4. **One shared chart library**. **The repo has NO chart lib** (`grep
   recharts` across all package.jsons returns nothing — the existing
   OrdersByStatusChart at `widgets/OrdersByStatusChart.tsx:1-9` calls
   itself out: "SVG-free implementation (pure CSS flex bars) so the
   admin app doesn't need recharts as a dep").
   - **Recommendation:** add `recharts` to `packages/ui` as a peer dep and
     wrap as `<ChartArea>`, `<ChartBar>`, `<ChartDonut>`, `<ChartLine>`,
     `<ChartSparkline>` primitives with our theme tokens baked in. Reason:
     pure-CSS bars are fine for status distributions but Pokecut's 24h
     trend line + System Health sparkline + Panze's donut all want real
     SVG. Doing the lift once gives us a single export per chart kind
     across admin/partner/creator.
   - **Alternative (lighter):** add `visx`/`d3-scale` and hand-roll the
     half-dozen chart shapes inside packages/ui. Smaller bundle, more
     code to own. Pavel decision (see §8 Q1).
5. **All three honour role + tier.** Partner tier
   (`Verified | Trusted | Premier`) gates four widgets (volume tier
   ladder, dedicated AM card, marketplace-featured stat, advanced
   intake forecast). Creator tier (`Maker | Builder | Agency`) gates
   three widgets (multi-brand health, bulk pricing visibility on order
   stats, Agency forecast). Use the existing `hasFeature()` helper that
   shipped in R16.a (#543), NOT raw tier checks.
6. **Real-time-ish refresh.** All page.tsx files stay `export const
   dynamic = 'force-dynamic'` (matches admin today). For the few widgets
   that benefit from sub-minute freshness ("Active sessions now",
   moderation queue count) use `revalidate = 60` on a Route Handler
   plus a thin polling client. SSE deferred to V1.5.

---

## §2 Admin Dashboard — `/admin/dashboard` advanced spec

Page route: `apps/admin/src/app/(dashboard)/dashboard/page.tsx`. Today's
file is 124 lines and renders 2 rows (KPI + L/R columns). The advanced
spec is **5 rows on a 12-col grid**.

Inspired by Panze (KPI rows + donut + recent table) and Pokecut (system
health panel + moderation queue with one-click actions).

### Row 1 — Reach KPIs (6 cards, lg:grid-cols-6)

Today's KPI strip is the right shape (see `dashboard-data.ts:56-167`
`loadKpiCards()`) — keep but rewire to the broader-signal set Pavel calls
out:

| # | Label | Value | Source | Click target |
|---|---|---|---|---|
| 1 | Total creators | `prisma.creatorProfile.count()` | All-time | `/creators` |
| 2 | Total partners | `prisma.partner.count({ where: { status: { in: ['ACTIVE','INTEGRATION_ENHANCED'] } } })` | Active-only | `/partners` |
| 3 | Live products | `prisma.productTemplate.count({ where: { status: 'PUBLISHED' } })` | (already in today's loader, line 97) | `/products` |
| 4 | Orders today | `prisma.order.count({ where: { createdAt: { gte: startOfToday } } })` | New | `/orders` |
| 5 | Revenue · 30d | `prisma.order.aggregate({ _sum: totalCents })` | Already in today's loader, line 80 | `/orders` |
| 6 | Active sessions now | `prisma.session.count({ where: { expires: { gt: new Date() } } })` | New — polls every 60s | n/a |

Each card carries the `delta` chip already implemented (line 36). Tones:
pink / ink / ink / pink / success / neon. Wired through KpiCard.tsx
which already supports all six tones.

### Row 2 — Operations health (3 widget tiles, lg:grid-cols-3)

- **Inbox queue widget** (`<QueueWidget>`, tone=pink) — counts of pending
  leads / partner verifications / cert reviews / ingredient queue /
  product approvals. Sourced from the same queries that power
  `InboxPreview` today (`dashboard-data.ts:284-373` `loadInboxPreview()`).
  Each row links into its admin index. Pink-tinted header band. Footer:
  "Open inbox →" → `/inbox` (build target — currently rows scattered).
- **Tickets By Category widget** (`<ChartWidget>` donut, tone=amber) —
  Panze-inspired donut over the **new `Ticket` model**, per
  `docs/SUPPORT_TICKETING_PLAN.md` (referenced by Pavel — not audited
  here; flag in §8 if the model doesn't exist yet). Donut buckets:
  Billing / Production / Compliance / Account / Other. Tone amber.
- **Orders by status donut** (`<ChartWidget>` donut, tone=emerald) —
  replaces today's horizontal bar chart with a donut sized to fit the
  3-col row. Source = `loadOrdersByStatus()` in `dashboard-data.ts:179`
  (already groups orders by 13 status values with tones). Keep the
  funnel-order map (`dashboard-data.ts:186-200`).

### Row 3 — System health (3 widget tiles, Pokecut-inspired)

- **Compliance service status** (`<StatusWidget>`) — green pill if
  Python service `compliance-service` is reachable. Avg render time
  (last 100 calls). Current rule-pack version. Sparkline of last 24h
  request volume. Source = compliance-service `/healthz` + a new
  `ComplianceServiceCallLog` aggregation (table already exists per
  task #41; verify via grep).
- **Stripe webhook health** (`<StatusWidget>`) — last successful webhook
  event timestamp. Error rate over last 24h. Sparkline of received
  events / hour. Source = `StripeWebhookEvent` table (G6.d wired this,
  task #550 — verify name) or fall back to `AuditLog` where
  `action LIKE 'stripe.webhook.%'`.
- **Job queue / cron status** (`<StatusWidget>`) — last successful run
  of: `auto-cancel-dispatches` (task #101), audit log retention, and
  subscription invoice spawn cron (task #550). Red bar if any stale
  > 6h. Source = a new `CronRun` table (proposal in §5) OR shim by
  inspecting last AuditLog of each `system.cron.*` action.

### Row 4 — Moderation queue (Pokecut-inspired, span 12)

Top 5 items needing admin attention, one-click Approve/Review/Triage:

| Source | Trigger | Action button |
|---|---|---|
| Leads stuck > 5d | `Partner.status IN ('DRAFT','INVITED','LEAD') AND createdAt < now-5d` | Triage → `/leads/[id]` |
| Products PENDING_REVIEW > 5d | `ProductTemplate.status='PENDING_REVIEW' AND updatedAt < now-5d` | Review → `/products/[id]` |
| Partner verifications stuck > 5d | `Partner.status IN ('IDENTITY_PENDING_REVIEW','OPS_PENDING_REVIEW','UNDER_REVIEW') AND updatedAt < now-5d` | Review → `/partners/[id]` |
| Dispatches past acceptDeadline | `OrderDispatch.status='PENDING_ACCEPT' AND acceptDeadlineAt < now` | Auto-cancel ack → `/orders/[id]` |
| Self-attested ingredients > 7d | `Ingredient.source='PARTNER_PRIVATE' AND verificationStatus='SELF_ATTESTED' AND createdAt < now-7d` | Promote / reject → `/ingredients` |

Cream sub-header. Each row uses the same status pill tone as the
v2 pattern (rose for urgent). Action button is a black pill (locked DS).

### Row 5 — Recent activity table (Panze-inspired, span 12)

Recent 10 `AuditLog` entries — reuses the chrome already used in
`/admin/audit`. Source = `loadRecentActivity()` already in
`dashboard-data.ts:390-430` (returns `ActivityRow[]` with deep-link
hrefs). Add a small "View all audit log →" footer link.

---

## §3 Partner Dashboard — `/partner/dashboard` advanced spec

Page route: `apps/partner/src/app/(dashboard)/dashboard/page.tsx`.
Today's file is 98 lines, a stub with 3 cards and a "Real orders begin
routing in Week 8" placeholder. **Full greenfield rebuild.**

The partner orientation is the inverse of admin per
`ilaunchify-orchestration-thesis.md`: partners need *maximum operational
clarity* — their slice of the production graph, and only their slice.
This shapes every widget below.

### Row 1 — Earnings KPIs (5 cards, lg:grid-cols-5)

| # | Label | Source |
|---|---|---|
| 1 | Revenue · 30d | `OrderDispatch.amountToPartnerCents` SUM where `status='SHIPPED' AND shippedAt >= now-30d` |
| 2 | Pending payout | Stripe Connect: balance.available + balance.pending for the connected account |
| 3 | Open dispatches | `OrderDispatch.count` where `status IN ('PENDING_ACCEPT','ACCEPTED','PRODUCING','READY','SHIPPED','IN_TRANSIT')` |
| 4 | On-time delivery % | `count(dispatches where deliveredAt <= committedShipBy) / count(dispatches where status='DELIVERED')` last 90d |
| 5 | Avg lead time | `avg(deliveredAt - acceptedAt)` last 90d, in days |

Tones: success / ink / pink / emerald (or rose if < 90%) / info.

### Row 2 — Production widgets (3 tiles, lg:grid-cols-12 → 4/4/4)

- **Dispatches by status donut** (`<ChartWidget>`) — groupBy
  `OrderDispatch.status` for the partner. Same status tone palette as
  admin's OrdersByStatus.
- **Order intake bar chart** (`<ChartWidget>`) — weekly dispatch count
  last 12 weeks. Bar chart, pink. Useful for partner capacity
  conversations.
- **Top SKU table** (`<ListWidget>`) — top 5 `ProductTemplate.name`
  by dispatch count this period. Row href: `/partner/products/[id]`.

### Row 3 — Compliance & verification (3 tiles, tier-gated)

- **Cert expiry alerts** (`<ListWidget>`) — cards for any `Certificate`
  expiring < 60d. Each row: cert type / issuer / expiry / "Renew" CTA
  linking `/partner/certifications`. Rose tone when < 30d.
- **Open product review items** (`<KpiWidget>`) — count of partner's
  `ProductTemplate` where status IN ('PENDING_REVIEW','UNDER_REVIEW',
  'CHANGES_REQUESTED'). Click → `/partner/products?status=in_review`.
- **Stripe Connect status** (`<StatusWidget>`) — KYB complete / payouts
  enabled / debit available. Three green/red dots. Source = Stripe
  Connect Account object (cached on `Partner.stripeAccountId`). When
  any red, show "Finish onboarding" CTA → `/partner/payments`.

**Tier gates:** the "Order intake forecast" upsell tile (V1.5)
appears only for Trusted+; the Premier-badge marketing stat appears
only for Premier. Use the platform pattern from R16.a (`hasFeature()`
in `@ilaunchify/auth`).

### Row 4 — Recent activity (span 12)

Partner-scoped `AuditLog` feed — same chrome as admin Row 5. Filter
`auditLog.where = { OR: [{ entityType: 'Partner', entityId: partnerId },
{ entityType: 'OrderDispatch', entityId: { in: dispatchIds } }] }`.
Plus a "Tickets you opened" sub-row pulling from the new Ticket model
(same SUPPORT_TICKETING_PLAN reference flagged in §2).

---

## §4 Creator Dashboard — `/creator/dashboard` advanced spec

Page route: `apps/creator/src/app/(dashboard)/dashboard/page.tsx`.
Today's file is 92 lines: 3 cards + a Brand Assets card. **Rebuild.**

Creators get the inverse-inverse: they need joyful clarity about what's
in production, and zero exposure to the orchestration graph.

### Row 1 — Production KPIs (5 cards)

| # | Label | Source |
|---|---|---|
| 1 | Live products | `Brand.products.count where status='PUBLISHED'` (today's stub uses this, line 19) |
| 2 | Orders in flight | `Order.count where creatorUserId=user.id AND status NOT IN ('DELIVERED','COMPLETED','CANCELLED','REFUNDED')` |
| 3 | Spent · 30d | `Order.aggregate _sum totalCents where paidAt >= now-30d` |
| 4 | Subscription savings open | `ProductionSubscription` annualized savings vs one-time pricing for active subs |
| 5 | Next ship-by | `min(OrderDispatch.committedShipBy)` across open orders — formatted "in 3 days" |

Tones: pink / pink / success / info / neon-on-dark or warning if today.

### Row 2 — Production lifecycle widgets

- **Order timeline** (full-width 12-col, `<ListWidget>` variant) —
  Amazon-style horizontal timeline cards for orders currently in
  production. **Reuse the existing wide-card pattern from
  `apps/creator/src/app/(dashboard)/orders/`** (R10, task #510).
  Each card: brand mark / SKU / quantity / status pill / "X% complete"
  bar / next milestone. Click → `/orders/[id]`. Show top 3 open
  orders here; "See all (N) →" footer link.
- **Design Studio activity** (4-col `<ListWidget>`) — recent
  `DesignVersion` saves (last 5). Each: product thumbnail / template
  name / "saved 2h ago" / "Open in Studio" CTA → Studio link.
- **Tier benefits widget** (4-col `<StatusWidget>`) — what each upgrade
  would unlock for current usage. Reuse data from `/settings/plan`
  (V1.5 ship, task #561). Hides for Agency tier (already top).
  Renders as faint upgrade CTA for everyone else — Pavel decision in §8.

### Row 3 — Brand & growth (3 tiles, tier-gated)

- **Brand health card** — links to `/creator/brand/[brandId]/identity`.
  But note `ilaunchify-brand-assets-not-design-system` memory: Studio
  identity surface was *scope-corrected*. Reframe as "Brand assets
  ready: 3 logos / 2 swatches / 1 font pair · 90% complete" — pulled
  from the simpler `Brand.assets` model (B.1 ship). Click → assets page.
- **Featured-in-marketplace status** — Premier-only widget. "Featured
  this week: Strawberry Whey Protein 500g · 47 views" or empty state
  with apply CTA. Reuse data layer from marketplace `featured`
  collection (DS-40).
- **Subscribe-and-save runway** — next invoice date + savings vs.
  one-time across active `ProductionSubscription` rows (G6.f, task
  #555). Empty state when none → "Set up a recurring production order →".

### Row 4 — Recent activity (span 12)

Creator-scoped `AuditLog` feed — last 12. Filter `entityType IN
('Order','OrderDispatch','DesignVersion','Brand','CreatorProfile')
AND entityId IN (...the creator's ids)`. Tier-upgrade events too —
they're audit-logged via `setCreatorTierWithAudit` (V1.5-T2, task
#558).

---

## §5 Schema + Data sources

Every widget's data source, cache strategy, and gaps.

### Reuse — no new schema needed

| Widget | Query | Cache |
|---|---|---|
| Admin KPI strip | Existing `loadKpiCards()` (`dashboard-data.ts:56`) | `force-dynamic` |
| Admin OrdersByStatus | Existing `loadOrdersByStatus()` (line 179) | `force-dynamic` |
| Admin Signups timeseries | Existing `loadSignupsTimeseries()` (line 235) | `force-dynamic` |
| Admin Inbox queue | Existing `loadInboxPreview()` (line 284) | `force-dynamic` |
| Admin Activity feed | Existing `loadRecentActivity()` (line 390) | `force-dynamic` |
| Partner Dispatches by status | `prisma.orderDispatch.groupBy({ by:['status'], where:{ partnerServiceId: { in: services } } })` | `force-dynamic` |
| Partner Order intake | 12-week histogram on `OrderDispatch.acceptedAt` | `revalidate = 300` (5 min) |
| Partner Top SKU | `orderDispatch.groupBy({ by:['orderItemId'], _count:_all })` + product join | `revalidate = 300` |
| Partner Cert expiry | `prisma.certificate.findMany({ where:{ partnerId, expiresAt: { lt: now+60d } } })` | `force-dynamic` |
| Partner Stripe Connect | Stripe Accounts API + cache on `Partner` row | `revalidate = 60` |
| Creator Live products | `prisma.productTemplate.count({ where:{ brandId, status:'PUBLISHED' } })` | `force-dynamic` |
| Creator Orders in flight | `prisma.order.count` with status NOT IN final states | `force-dynamic` |
| Creator Subscription savings | Sum across `ProductionSubscription` G6.a fields | `force-dynamic` |
| Creator Order timeline | `prisma.order.findMany` reuse `/orders` query | `force-dynamic` |
| Creator Tier benefits | `lookupPlanFeature()` from `@ilaunchify/plans` (R15.b) | static |

### New aggregations needed

| Widget | What's missing | Proposed source |
|---|---|---|
| Admin Active sessions now | `Session.count` works but locked-down by NextAuth — verify table is exposed. If not, expose a counter endpoint. | `Session.count({ where: { expires: { gt: now } } })` polled @ 60s |
| Admin Compliance service status | No `ComplianceServiceCallLog` table yet (verify) | Add minimal `ComplianceServiceCall` row OR scrape `compliance-service /healthz` |
| Admin Stripe webhook health | `StripeWebhookEvent` may not exist | Either add a `WebhookEvent` table (idempotency key + receivedAt + status) or read `AuditLog` for `action LIKE 'stripe.webhook.%'` |
| Admin Cron health | No `CronRun` model | Add `CronRun { jobName, startedAt, finishedAt, status, payload }` — same model serves auto-cancel + retention + invoice spawn |
| Admin Moderation queue | All sources exist | Aggregate query across leads + products + partners + dispatches + ingredients with `now - threshold` filter |
| Partner On-time delivery % + avg lead time | `OrderDispatch.committedShipBy` exists? **Verify in schema.** If not, derive from `Order.requestedShipBy` | If derived: a small denormalized cache field `Partner.onTimeRatio90d` updated by a daily cron |
| Creator Subscription savings | `ProductionSubscription` has `monthlyAmountCents` but does it carry `oneTimeReferencePriceCents` for the delta? **Verify G6.a schema.** | If missing: read latest one-time order price for the same product as the comparable |

**Caching philosophy:** the admin dashboard re-renders on every visit
(`force-dynamic` already set, line 28). Partner + creator dashboards
likely visited multiple times per day — keep `force-dynamic` for
correctness, lean on Promise.all and avoid N+1. Pokecut's "today" stats
can be 60s stale; revalidate where it matters and saves DB hits.

---

## §6 Widget primitive — `@ilaunchify/ui` extension

Today's widget components live INSIDE the admin app
(`apps/admin/.../dashboard/widgets/`). To use them across three apps,
**lift to `packages/ui` under `src/components/dashboard/`**. Treat
this as the same kind of move the AppHeader did in R1 (#491).

### `<Widget>` shell

```tsx
<Widget
  title="Orders by status"
  subtitle="Last 30 days"
  tone="pink" | "ink" | "success" | "warning" | "info" | "danger" | "neon"
  icon={<ShoppingBag />}
  footerLink={{ href: '/orders', label: 'View all orders' }}
  loading={isLoading}
  error={error}
>
  <WidgetHeader />  // automatic if title/subtitle set
  <WidgetBody>{children}</WidgetBody>
  <WidgetFooter /> // automatic if footerLink set
</Widget>
```

- Cream header band on every widget, hairline `border-ink-200`, body
  on white, optional cream footer band with the link styled as a
  small pink-700 chevron link.
- `tone` drives a 6px accent stripe along the left edge OR a tinted
  icon ball in the top-left (Pavel preference, see §8 Q4).
- Loading state: skeleton inside body. Error state: rose icon + retry
  button (passes a `retry` callback up).
- 12-col grid friendly: `<Widget span={4}>` translates to
  `lg:col-span-4`.

### Variants

| Variant | Shape | Notes |
|---|---|---|
| `<KpiWidget>` | Number + delta chip + sparkline + footer link | Wraps today's KpiCard.tsx semantics |
| `<ChartWidget>` | Title bar + chart canvas + legend | Hosts `<ChartArea>` / `<ChartBar>` / `<ChartDonut>` / `<ChartLine>` |
| `<ListWidget>` | Title bar + top-N rows + footer "see all" | Today's InboxPreview is the seed |
| `<QueueWidget>` | Title bar + N rows each with a primary action button | Pokecut moderation queue pattern |
| `<StatusWidget>` | Title bar + 1-N indicators (green/red dot + label + value) + optional sparkline | Pokecut system-health pattern |
| `<TimelineWidget>` | Title bar + wide horizontal timeline cards | Creator orders timeline — reuse existing wide-card from `apps/creator/.../orders/` |

All variants are server-component-friendly (data passes in as a prop).
Charts themselves are `'use client'`.

### Chart primitives

Adding to `packages/ui/src/components/charts/`:
- `<ChartSparkline points={[]} tone="success" />` — 24×64 svg
- `<ChartArea series={[]} xKey yKey tone />`
- `<ChartBar series={[]} stacked? />`
- `<ChartDonut segments={[]} centerLabel />`
- `<ChartLine series={[]} />`

Either thin recharts wrappers (recommended) or hand-rolled SVG (smaller
bundle). See §1 (4).

---

## §7 Build order

5-step rollout, each step is independently shippable so Pavel can
intercept between any two.

### Step 1 — `<Widget>` primitive in `packages/ui` (M)

- Lift KpiCard semantics from `apps/admin/.../widgets/KpiCard.tsx` to
  `packages/ui/src/components/dashboard/`.
- Build the 6 variants + the chart primitives (§6).
- Add a single Storybook-style page in `apps/admin` to validate visual
  parity with today's KpiCard / OrdersByStatusChart / SignupsChart.
- DO NOT delete the existing admin widget files yet — Step 2 cuts over
  in one commit.

### Step 2 — Admin Dashboard advanced rebuild (L)

- Extend `dashboard-data.ts` with the new loaders (moderation queue,
  system health, cron run status).
- Add the new models — `CronRun` (decision pending), or
  `ComplianceServiceCall` (decision pending) — see §8.
- Rewrite `apps/admin/.../dashboard/page.tsx` to the 5-row layout.
- Delete the 5 widget files in `apps/admin/.../dashboard/widgets/`
  (now replaced by `@ilaunchify/ui`).

### Step 3 — Partner Dashboard greenfield (L)

- Add `apps/partner/src/app/(dashboard)/dashboard/dashboard-data.ts`
  mirroring the admin pattern.
- Compose the 4-row layout in `page.tsx`.
- Gate Row 3 widgets via `hasFeature()` from `@ilaunchify/auth`
  (already proven in R16.a for creator).
- Keep the `ActiveWelcomeModal` mount (line 5 in today's page.tsx).

### Step 4 — Creator Dashboard advanced rebuild (M)

- Add `apps/creator/.../dashboard/dashboard-data.ts`.
- Compose the 4-row layout.
- Reuse the wide-card from `apps/creator/.../orders/` for Row 2 timeline
  (R10, task #510).
- Wire tier gates via `hasFeature()` (R16.a).

### Step 5 — Cross-cut real-time updates (M)

- Polling client (`useEffect` + `setInterval` 60s) for: admin Active
  sessions / admin Moderation queue count / partner Open dispatches.
- Light Route Handler endpoints under `/api/dashboard/poll/{name}`
  returning just-the-numbers JSON.
- SSE deferred to V1.5 — polling is enough for 3 metrics.

---

## §8 Open questions

1. **Chart library — recharts or hand-roll?** Recommendation: recharts
   wrapped in `packages/ui`. ~95KB gzipped — acceptable. Alternative:
   visx + d3-scale + hand-roll the 5 chart shapes. ~30KB but ~600
   extra lines of code we own. Which?
2. **Pokecut-style System Health "GPU Load" — do we ship it?** Only
   relevant if we run AI inference on our own infra. Compliance
   service is managed; design Studio is client-side fabric.js. **Skip
   in V1** — the analogue is "Compliance service avg render time" +
   "Stripe webhook health" + "Cron status". Confirm?
3. **Should partner dashboard widgets be reorderable per-partner?**
   Pokecut implies drag-to-reorder. iLaunchify v1 = no. V1.5+ a
   `PartnerDashboardLayout` row stores per-user ordering. Confirm
   deferral?
4. **Should creator dashboard hide tier-gated widgets entirely or
   render with a faint upgrade CTA?** Pavel pattern from /settings/plan
   suggests render-with-CTA — but on a dashboard that risks looking
   crowded with locked tiles. Recommendation: hide for Maker (3 cards
   in Row 3 → 1 card "Upgrade for analytics"), render disabled
   skeleton for Builder (shows what Agency unlocks), no overlay for
   Agency. Confirm?
5. **`CronRun` model vs scraping `AuditLog`?** Cleaner data: dedicated
   model + a tiny `recordCronRun(name, status, ms)` helper. Cheaper:
   query `AuditLog where action LIKE 'system.cron.%'`. The dedicated
   model also unblocks ops surface in V1.5 (per-cron run history).
   Recommendation: dedicated model. Confirm?
6. **Where does the `Ticket` model live?** Pavel referenced
   `SUPPORT_TICKETING_PLAN.md` (the doc) but I didn't audit whether
   the model exists. If it doesn't, the "Tickets By Category" widget
   in Row 2 admin and the "Tickets you opened" sub-row on partner
   are blocked until that model ships. Flag as a dependency.

---

## Appendix A — File path index (for the builder)

| Path | Purpose | Status |
|---|---|---|
| `apps/admin/src/app/(dashboard)/dashboard/page.tsx` | Admin dashboard route | Exists (124L) — rewrite in Step 2 |
| `apps/admin/src/app/(dashboard)/dashboard/dashboard-data.ts` | Admin loaders | Exists (473L) — extend in Step 2 |
| `apps/admin/src/app/(dashboard)/dashboard/widgets/*.tsx` | Admin widgets | Exists — delete in Step 2 after lift |
| `apps/partner/src/app/(dashboard)/dashboard/page.tsx` | Partner dashboard | Exists (98L stub) — rewrite in Step 3 |
| `apps/partner/src/app/(dashboard)/dashboard/dashboard-data.ts` | Partner loaders | NEW in Step 3 |
| `apps/creator/src/app/(dashboard)/dashboard/page.tsx` | Creator dashboard | Exists (92L stub) — rewrite in Step 4 |
| `apps/creator/src/app/(dashboard)/dashboard/dashboard-data.ts` | Creator loaders | NEW in Step 4 |
| `packages/ui/src/components/dashboard/Widget.tsx` | Widget shell | NEW in Step 1 |
| `packages/ui/src/components/dashboard/{Kpi,Chart,List,Queue,Status,Timeline}Widget.tsx` | Variants | NEW in Step 1 |
| `packages/ui/src/components/charts/{Sparkline,Area,Bar,Donut,Line}.tsx` | Chart primitives | NEW in Step 1 |
| `packages/db/prisma/schema.prisma` | Add `CronRun` (Q5) + possibly `ComplianceServiceCall` | Migration in Step 2 |

## Appendix B — Memory cross-refs

- `ilaunchify-admin-surface-pattern` — v2 chrome rules; this plan
  honours them on every dashboard row.
- `ilaunchify-design-system-v1` — pink/black/neon tokens and the
  cream-header pattern; all widgets inherit.
- `ilaunchify-business-model` — partner dashboard scope is bounded
  by the production graph; consumer-side data is OUT.
- `ilaunchify-orchestration-thesis` — partner sees their slice,
  admin sees the graph, creator sees joyful summary. Three lenses.
- `ilaunchify-subscription-tiers` + `ilaunchify-tier-model-update-2026-05-28`
  — Maker / Builder / Agency tier gates for creator widgets;
  Verified / Trusted / Premier for partner widgets.

End.
