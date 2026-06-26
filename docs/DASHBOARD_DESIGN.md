# Dashboard Design — per persona

*Researched + written 2026-06-25. Designs the "home" dashboard for each user type so it leads with what that person needs first, instead of a flat grid of widgets. Grounded in NN/g (F-pattern, progressive disclosure, 5-second rule), IBM Carbon (limit metrics, whitespace), Polaris, and the modern admin-header research (Linear/Vercel/Stripe/Polaris/Carbon).*

---

## The core principle

> Every dashboard answers, in order: **(1) What needs me right now? (2) How are my numbers? (3) What's the trend? (4) What just happened?** — top-left to bottom, most-scanned space first.

Most dashboards fail by being **information-overload** (the #1 dashboard problem in a 75-study review, ~47% of users) — too many equal-weight widgets, no hierarchy. The fix is a **single clear focus per persona** + a capped, ranked set of supporting widgets. A user should grasp the page's purpose in ~5 seconds.

**Universal layout skeleton (all 4 personas):**
1. **Header** — the unified `AdminPageHeader`-style band: eyebrow, title, optional inline count/status, optional primary action.
2. **"Needs you now"** — the single most important block: a prioritized action queue (counts + jump links). This is the dashboard's *job*.
3. **KPI strip** — ≤6 metrics, each with a sparkline + period delta (▲/▼ vs. prior 30d). Top-left = most important.
4. **Trend chart(s)** — 1–2 time-series that answer a question ("are orders growing?"), not decoration.
5. **Recent activity / secondary lists** — deferred, lower contrast.

---

## Persona 1 — Admin (super) · operational command center

**Who:** platform operator. **Job:** keep the marketplace running — triage approvals, disputes, leads, SLA breaches; watch platform health.

| Zone | Content |
|---|---|
| Needs you now | Action queue: product approvals, open disputes, lead inbox, ingredient/cert verification, SLA-breached tickets — each a count + jump link, sorted by urgency. |
| KPIs | GMV (30d, Δ), orders (30d, Δ), new signups (Δ), active partners, active creators, take-rate/fees. |
| Trends | Orders over time (by status, stacked area); signups over time (creator vs partner). |
| Health | Security snapshot, system/job health, moderation queue. |
| Activity | Audit feed (recent privileged actions). |

## Persona 2 — Admin subaccounts (scoped roles) · the SAME page, role-filtered

**Who:** support agents, billing, ops leads (RBAC roles: Agent / Lead / Billing / Super). **Key insight:** they should see the **same dashboard, filtered to their capabilities** — never widgets they can't act on.
- **Support Agent** → support-ticket queue + SLA + their assigned tickets; hide finance, security, moderation.
- **Billing** → finance KPIs (charges, payouts, refunds, fees), payout queue; hide moderation/support.
- **Lead/Ops** → operational queues (orders, disputes, partners); hide finance internals.
- **Super** → everything (Persona 1).

Mechanism: gate each dashboard block behind `requireCapability(...)` so the action queue + KPIs + widgets render only for roles that hold the capability. One dashboard, capability-aware.

## Persona 3 — Partner (manufacturer) · production console

**Who:** factory/printer/co-packer. **Job:** accept work, move it through production, ship, get paid, stay compliant.

| Zone | Content |
|---|---|
| Needs you now | Orders awaiting acceptance (with the accept window ticking), SLA-at-risk dispatches, expiring certs. |
| KPIs | Awaiting acceptance, in production, ready to ship, earned (30d, Δ), live products, certs expiring. |
| Trends | Earnings over time (30/90d); orders accepted vs. produced (throughput). |
| Pipeline | A production funnel: accepted → in production → ready → shipped (counts at each stage). |
| Lists | Recent dispatches; product performance (most-ordered). |

## Persona 4 — Creator (brand owner) · business console

**Who:** influencer/brand building CPG products. **Job:** get products live and selling; know what to do next.

| Zone | Content |
|---|---|
| Needs you now | Resume drafts (continue building), next-step nudges (finish a product, add a brand, launch), action items (approve a sample, low stock). |
| KPIs | Products, in progress, live, in production, spend (30d, Δ), revenue/orders if connected. |
| Trends | Spend over time; orders/sales over time (per channel if connected). |
| Status | Active orders pipeline (in production → shipped); brand/marketplace performance. |
| Lists | Recent orders; top products. |

---

## New / upgraded components to add to the design system

All compatible with the locked tokens (pink #FF2E63, ink, Bricolage/Inter, 8pt grid, rounded-2xl + hairline). Built into `@ilaunchify/ui` so all four apps share them.

1. **`TrendChart`** — a clean time-series (line/area) for 30/90-day trends. Monochrome ink line + one pink accent for the focus series; subtle gridlines; hover tooltip; tabular-nums axis. Replaces/【generalizes the existing ad-hoc admin charts (OrdersByStatusChart, SignupsChart). (Use a tiny chart lib — e.g. Recharts, already used in artifacts — or hand-rolled SVG to stay dependency-light.)
2. **`MetricCard` v2** — KPI card with: label, big tabular-nums value, **sparkline**, and a **period delta** chip (▲ 12% / ▼ 4% vs. prior 30d, green/red). The current `KpiWidget` has a sparkline; add the delta + a consistent layout.
3. **`ActionQueue`** — the "needs you now" panel: a ranked list of `{ icon, label, count, href, urgency }` rows; urgent rows get a pink/danger accent dot; empty state ("All clear ✓"). This is the single most useful per-persona widget and is currently missing as a first-class component (each app hand-rolls queues).
4. **`StatusFunnel`** — a horizontal pipeline (e.g. accepted → production → ready → shipped) with counts + proportional segments; for partner production + creator order pipeline.
5. **`DonutStat`** (optional) — a compact donut for one categorical breakdown (orders by status) when a funnel doesn't fit.

These five turn "a grid of widgets" into a purposeful, ranked dashboard, and they're reusable across all personas.

---

## Build order (proposed)

1. Build the shared components (`MetricCard` v2, `ActionQueue`, `TrendChart`, `StatusFunnel`) in `@ilaunchify/ui`.
2. Rebuild **Admin** dashboard on them (command center + role-aware blocks).
3. Rebuild **Partner** dashboard (production console).
4. Rebuild **Creator** dashboard (business console).
5. Layer in the **subaccount role-filtering** on the admin dashboard.

Each persona is a self-contained slice — buildable and reviewable one at a time.
