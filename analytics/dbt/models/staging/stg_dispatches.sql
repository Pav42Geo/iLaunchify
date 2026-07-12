-- Staging: order dispatches (fulfillment legs). Carries the per-state timestamps
-- + promised dates that power OTIF and cycle-time metrics.
with source as (
    select * from {{ source('raw', 'order_dispatches') }}
)
select
    id                         as dispatch_id,
    "orderId"                  as order_id,
    "partnerServiceId"         as partner_service_id,
    status,
    "createdAt"                as created_at,
    "acceptedAt"               as accepted_at,
    "productionStartedAt"      as production_started_at,
    "qualityCheckFailedAt"     as quality_check_failed_at,
    "readyAt"                  as ready_at,
    "shippedAt"                as shipped_at,
    "deliveredAt"              as delivered_at,
    "promisedShipBy"           as promised_ship_by,
    "promisedDeliverBy"        as promised_deliver_by,
    "rerouteCount"             as reroute_count,
    "costCents"                as cost_cents,
    "meritFeeCents"            as merit_fee_cents
from source
