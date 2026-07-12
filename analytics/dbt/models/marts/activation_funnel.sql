-- Activation funnel over the trailing window. Mirrors loadActivationFunnel().
-- Ordered signup → paid; `users` (distinct actors) is the real funnel, `events`
-- is volume. Step order is encoded so BI renders the funnel top-to-bottom.
with events as (
    select *
    from {{ ref('stg_analytics_events') }}
    where occurred_at >= {{ dbt.dateadd('day', '-1 * ' ~ var('trailing_days'), dbt.current_timestamp()) }}
),
steps as (
    select 1 as step_order, 'signup_completed'  as event_name, 'Signed up'        as label union all
    select 2, 'product_created',   'Product created'  union all
    select 3, 'design_published',  'Design published' union all
    select 4, 'checkout_started',  'Checkout started' union all
    select 5, 'order_paid',        'Order paid'
),
counts as (
    select
        event_name,
        count(*)                    as events,
        count(distinct actor_id)    as users
    from events
    group by 1
)
select
    s.step_order,
    s.label,
    s.event_name,
    coalesce(c.events, 0) as events,
    coalesce(c.users, 0)  as users
from steps s
left join counts c on s.event_name = c.event_name
order by s.step_order
