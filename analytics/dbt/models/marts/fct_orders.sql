-- Fact: one row per order with its platform fee joined in.
-- Fee = sum of application_fee_cents across the order's charges (the platform take).
with orders as (
    select * from {{ ref('stg_orders') }}
),
charge_rollup as (
    select
        order_id,
        sum(application_fee_cents) as fee_cents,
        sum(amount_cents)          as charged_cents
    from {{ ref('stg_charges') }}
    group by 1
)
select
    o.order_id,
    o.brand_id,
    o.status,
    o.subtotal_cents,
    o.total_cents,
    coalesce(c.fee_cents, 0)     as fee_cents,
    coalesce(c.charged_cents, 0) as charged_cents,
    o.paid_at,
    o.delivered_at,
    o.created_at,
    case when o.paid_at is not null then 1 else 0 end as is_paid
from orders o
left join charge_rollup c on o.order_id = c.order_id
