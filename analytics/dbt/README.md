# iLaunchify — dbt semantic layer (warehouse-ready starter)

**Status:** DRAFT · 2026-07-09 · **inert until the warehouse (D2) + ingestion land**
**Parent:** `docs/ANALYTICS_STRATEGY.md` (§5 architecture, §4 build-vs-buy)

> This is the "compute once, trust everywhere" layer. Every metric the native admin
> Insights surface computes live today (`apps/admin/.../insights/insights-data.ts`)
> is (re)defined here as version-controlled SQL. When the warehouse exists, the
> Insights loaders repoint at these marts (via reverse-ETL / a cache) and the exec
> BI tool (Metabase) reads the same models — so a number is defined in exactly one
> place and reconciles across surfaces.

## What this is / isn't

- **Is:** the metric definitions (GMV, net take rate, AOV, OTIF, cycle times,
  activation funnel, cohort retention) as dbt models + tests, ready to `dbt build`
  the moment a warehouse + ingestion are wired.
- **Isn't:** live yet. There is no warehouse connection. Nothing here runs in CI or
  affects the app. It's the P1/P2 "semantic layer" slot from the strategy, staged
  ahead of the D2 warehouse decision (BigQuery vs Snowflake).

## Activation checklist (when D2 is picked)

1. Choose warehouse (D2) → set `profiles.yml` target (BigQuery or Snowflake).
2. Wire ingestion (Fivetran/Airbyte): CockroachDB → `raw` schema; Stripe → `raw`;
   PostHog export → `raw` (the `analytics_events` mirror or PostHog's own export).
3. Fill the real source table/column names in `models/staging/_sources.yml`
   (placeholders below assume a 1:1 Prisma-table → raw-table load).
4. `dbt deps && dbt build` → marts populate; point Metabase + the Insights cache at
   `marts.*`.

## Metric ↔ native-loader parity (keep these in lockstep)

| dbt model | Mirrors in `insights-data.ts` |
|---|---|
| `metrics_marketplace_daily` (gmv, net_take_rate, aov, paid_orders) | `loadMarketplace()` |
| `metrics_fulfillment` (otif, avg_accept_hours, avg_production_days, reroute/qc rates) | `loadFulfillment()` |
| `activation_funnel` | `loadActivationFunnel()` |
| `fct_orders` / `fct_dispatches` | the underlying `prisma.order` / `prisma.orderDispatch` queries |
| `creator_cohort_retention` | (not yet native — warehouse-only, needs the join) |

If you change a metric definition, change it in BOTH places until the native loaders
are fully repointed at these marts, then delete the native compute.

## Dialect note

SQL here targets **BigQuery / Snowflake**. Date-diff helpers differ by warehouse —
they're isolated in `macros/` (or noted inline) so switching adapters is a one-file
change. `date_trunc` and standard aggregates are portable as written.

## Layout

```
dbt/
  dbt_project.yml
  models/
    staging/     _sources.yml, stg_orders, stg_charges, stg_dispatches, stg_analytics_events
    marts/       fct_orders, fct_dispatches, metrics_marketplace_daily,
                 metrics_fulfillment, activation_funnel, creator_cohort_retention, _schema.yml
```
