-- Daily fulfillment metrics. Mirrors loadFulfillment() in insights-data.ts.
-- OTIF = on_time / otif_eligible (dispatches with a promised date); cycle times
-- average only rows where both endpoints exist; reroute/QC are rates over all
-- dispatches created that day.
select
    {{ dbt.date_trunc('day', 'created_at') }}                    as day,
    count(*)                                                      as dispatches,
    sum(otif_eligible)                                           as otif_eligible,
    sum(is_on_time)                                              as on_time,
    sum(is_on_time) * 1.0 / nullif(sum(otif_eligible), 0)       as otif_rate,
    avg(accept_hours)                                            as avg_accept_hours,
    avg(production_days)                                         as avg_production_days,
    sum(was_rerouted) * 1.0 / nullif(count(*), 0)               as reroute_rate,
    sum(qc_failed) * 1.0 / nullif(count(*), 0)                  as qc_fail_rate
from {{ ref('fct_dispatches') }}
group by 1
