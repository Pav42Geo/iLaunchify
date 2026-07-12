-- Creator cohort retention (event-based). Cohort = signup month; a creator is
-- "retained" in month N if they have an order_paid event that month. This is the
-- warehouse-only metric the native surface can't cheaply compute (needs the join).
-- Uses the event store so it works without the brand→creator join.
with signups as (
    select
        actor_id                                              as user_id,
        min({{ dbt.date_trunc('month', 'occurred_at') }})    as cohort_month
    from {{ ref('stg_analytics_events') }}
    where event_name = 'signup_completed' and actor_id is not null
    group by 1
),
activity as (
    select distinct
        actor_id                                     as user_id,
        {{ dbt.date_trunc('month', 'occurred_at') }} as activity_month
    from {{ ref('stg_analytics_events') }}
    where event_name = 'order_paid' and actor_id is not null
)
select
    s.cohort_month,
    {{ dbt.datediff('s.cohort_month', 'a.activity_month', 'month') }} as months_since_signup,
    count(distinct s.user_id)                                          as retained_users
from signups s
left join activity a on s.user_id = a.user_id
group by 1, 2
order by 1, 2
