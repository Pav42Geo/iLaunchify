-- Daily marketplace metrics. Mirrors loadMarketplace() in insights-data.ts, but at
-- daily grain so BI can chart trends (the native loader gives a single 30d snapshot).
-- GMV = paid order value; net take rate = fee / GMV; AOV = GMV / paid orders.
with paid as (
    select * from {{ ref('fct_orders') }} where paid_at is not null
)
select
    {{ dbt.date_trunc('day', 'paid_at') }}                        as day,
    count(*)                                                       as paid_orders,
    sum(total_cents)                                              as gmv_cents,
    sum(fee_cents)                                                as fee_cents,
    -- portable division (avoid BQ-only safe_divide): *1.0 + nullif guard
    sum(fee_cents) * 1.0 / nullif(sum(total_cents), 0)           as net_take_rate,
    sum(total_cents) * 1.0 / nullif(count(*), 0)                 as aov_cents
from paid
group by 1
