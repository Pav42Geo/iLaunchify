-- Staging: orders. Light renames/casts over raw.orders. Money stays in cents.
with source as (
    select * from {{ source('raw', 'orders') }}
)
select
    id                         as order_id,
    "brandId"                  as brand_id,
    status,
    "subtotalCents"            as subtotal_cents,
    "shippingCents"            as shipping_cents,
    "taxCents"                 as tax_cents,
    "totalCents"               as total_cents,
    "paidAt"                   as paid_at,
    "deliveredAt"              as delivered_at,
    "createdAt"                as created_at
from source
