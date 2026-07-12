-- Staging: charges. application_fee_cents = the platform's take (fee capture).
with source as (
    select * from {{ source('raw', 'charges') }}
)
select
    id                       as charge_id,
    "orderId"                as order_id,
    "amountCents"            as amount_cents,
    "applicationFeeCents"    as application_fee_cents,
    status,
    "createdAt"              as created_at
from source
