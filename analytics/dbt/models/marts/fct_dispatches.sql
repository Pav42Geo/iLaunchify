-- Fact: one row per dispatch with fulfillment flags + cycle times precomputed.
-- On-time is judged against the promised ship date (P0 D3); rows without a promised
-- date are excluded from OTIF (otif_eligible = 0). datediff/date macros are the dbt
-- cross-database forms → portable across BigQuery/Snowflake.
select
    dispatch_id,
    order_id,
    partner_service_id,
    status,
    created_at,
    accepted_at,
    production_started_at,
    ready_at,
    delivered_at,
    promised_ship_by,
    reroute_count,
    cost_cents,
    merit_fee_cents,

    -- OTIF eligibility + outcome
    case when promised_ship_by is not null and ready_at is not null then 1 else 0 end as otif_eligible,
    case
        when promised_ship_by is not null and ready_at is not null and ready_at <= promised_ship_by then 1
        when promised_ship_by is not null and ready_at is not null then 0
    end as is_on_time,

    -- Cycle times (null when the endpoints aren't both set)
    case when accepted_at is not null
         then {{ dbt.datediff('created_at', 'accepted_at', 'hour') }} end as accept_hours,
    case when production_started_at is not null and ready_at is not null
         then {{ dbt.datediff('production_started_at', 'ready_at', 'day') }} end as production_days,

    case when reroute_count > 0 then 1 else 0 end               as was_rerouted,
    case when quality_check_failed_at is not null then 1 else 0 end as qc_failed
from {{ ref('stg_dispatches') }}
