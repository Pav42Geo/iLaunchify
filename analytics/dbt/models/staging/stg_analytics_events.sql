-- Staging: behavioral/state events (P0 substrate; also the PostHog mirror).
-- Names come from the curated registry in packages/analytics/src/events.ts.
with source as (
    select * from {{ source('raw', 'analytics_events') }}
)
select
    id                as event_id,
    name              as event_name,
    source            as event_source,   -- SERVER | CLIENT
    "actorId"         as actor_id,
    role,
    "tenantId"        as tenant_id,
    "orderId"         as order_id,
    "sessionId"       as session_id,
    "occurredAt"      as occurred_at
from source
