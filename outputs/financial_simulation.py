"""
iLaunchify financial simulation — V1.5 locked model
Run for 100 / 1,000 / 10,000 / 30,000 creators (with proportional partner counts)

Assumptions are all explicit at the top. Tune and re-run as Pavel decides.
"""

import json
from dataclasses import dataclass, field
from typing import Dict, List

# ─────────────────────────────────────────────────────────────────────
# ASSUMPTIONS (all tuneable)
# ─────────────────────────────────────────────────────────────────────

# Creator subscription mix (% of total registered creators)
CREATOR_TIER_MIX = {
    "maker":   0.70,    # free tier — typical SaaS freemium 65-75%
    "builder": 0.25,    # $49/mo
    "agency":  0.05,    # $199/mo
}

# Creator activation rate (% of registered who are ACTIVE — at least 1 order/mo)
CREATOR_ACTIVATION = {
    "maker":   0.30,   # 30% of Makers are actually using the platform
    "builder": 0.70,   # paying creators are more committed
    "agency":  0.90,   # heavily committed
}

# Average ON-DEMAND orders per active creator per month
ORDERS_PER_ACTIVE_CREATOR_PER_MONTH = {
    "maker":   5,      # market testing, low volume
    "builder": 80,     # real businesses with traction
    "agency":  400,    # multi-brand operators
}

# Bulk vs on-demand mix (% of TOTAL units that go through each mode)
BULK_MIX_BY_TIER = {
    "maker":   0.05,   # mostly on-demand at low MOQ
    "builder": 0.30,   # mix
    "agency":  0.60,   # mature brands lean bulk
}

# Average bulk order size (units per bulk run)
AVG_BULK_RUN_SIZE = {
    "maker":   200,
    "builder": 800,
    "agency":  3000,
}

# Bulk runs per active creator per month
BULK_RUNS_PER_MONTH = {
    "maker":   0.1,    # 1 every 10 months
    "builder": 0.5,    # 1 every 2 months
    "agency":  2.0,    # 2 per month
}

# Subscription prices
SUBSCRIPTION_PRICE_MONTHLY = {
    "maker":   0,
    "builder": 49,
    "agency":  199,
}

# Locked velocity-tier creator-side fee % (5 tiers × 3 subscription tiers)
VELOCITY_FEE_PCT = {
    "maker":   {1: 15.0, 2: 13.0, 3: 11.0, 4: 9.0, 5: 7.0},
    "builder": {1: 10.0, 2: 8.5,  3: 7.0,  4: 6.0, 5: 5.0},
    "agency":  {1: 7.0,  2: 6.0,  3: 5.0,  4: 4.0, 5: 3.0},
}

# Distribution of active creators across velocity tiers per subscription tier
# (Maker creators rarely hit Tier 3+; Agency more evenly distributed)
VELOCITY_DISTRIBUTION = {
    "maker":   {1: 0.90, 2: 0.08, 3: 0.02, 4: 0.00, 5: 0.00},
    "builder": {1: 0.55, 2: 0.25, 3: 0.12, 4: 0.06, 5: 0.02},
    "agency":  {1: 0.30, 2: 0.30, 3: 0.20, 4: 0.12, 5: 0.08},
}

# On-demand AOV (locked at $30 retail per on-demand-pricing-economics.md)
ON_DEMAND_RETAIL_PRICE = 30.00
ON_DEMAND_PARTNER_WHOLESALE = 8.00
ON_DEMAND_SHIPPING = 4.50

# Bulk per-unit cost assumptions (lower partner wholesale at volume)
BULK_PARTNER_WHOLESALE_PER_UNIT = 4.50  # discounted from on-demand $8

# Partner-side platform fee % of partner wholesale (locked V1.5 model — flat per partner tier)
PARTNER_FEE_PCT = {
    "verified": 5.0,
    "trusted":  3.5,
    "premier":  2.0,
}

# Partner subscription tier mix
PARTNER_TIER_MIX = {
    "verified": 0.70,
    "trusted":  0.25,
    "premier":  0.05,
}

# Partner-to-creator ratio (1 partner serves ~40 creators on average)
CREATORS_PER_PARTNER = 40

# Per-transaction costs (subtract from gross revenue)
STRIPE_PCT_PER_TRANSACTION = 0.0025  # 0.25%
STRIPE_FLAT_PER_TRANSACTION = 0.25   # $0.25

# AI Recipe Parser cost (Anthropic API) — Builder+ feature, charged at $0 to creator
AI_PARSER_ANTHROPIC_COST_PER_PARSE = 0.30   # avg per parse including caching
AI_PARSES_PER_BUILDER_PER_MONTH = 50         # heavy users in their cap of 1000
AI_PARSES_PER_AGENCY_PER_MONTH = 200         # heavy users in their cap of 5000

# Asset library API costs (Shutterstock for Builder/Agency)
SHUTTERSTOCK_MONTHLY_BUDGET = 300            # flat enterprise contract

# Platform fixed operating costs by scale (very rough — engineering + infra + tools)
def fixed_opex(creator_count: int) -> float:
    if creator_count <= 100:
        return 25_000   # bootstrap: 1-2 eng + infra + tools
    if creator_count <= 1000:
        return 75_000   # small team + scaled infra
    if creator_count <= 10_000:
        return 250_000  # ~8 person team + customer success + ops
    return 600_000      # ~25 person team

# ─────────────────────────────────────────────────────────────────────
# CORE MATH
# ─────────────────────────────────────────────────────────────────────

def effective_creator_fee_pct(sub_tier: str) -> float:
    """Volume-weighted effective platform fee % for a subscription tier."""
    total = 0
    for v_tier, share in VELOCITY_DISTRIBUTION[sub_tier].items():
        total += VELOCITY_FEE_PCT[sub_tier][v_tier] * share
    return total

def effective_partner_fee_pct() -> float:
    """Weighted average partner-side fee % across partner tier mix."""
    return sum(
        PARTNER_FEE_PCT[tier] * share
        for tier, share in PARTNER_TIER_MIX.items()
    )

@dataclass
class ScaleResult:
    creator_count: int
    partner_count: int

    # Active creator counts by sub tier
    active_makers: int = 0
    active_builders: int = 0
    active_agencies: int = 0

    # Monthly metrics
    subscription_revenue_monthly: float = 0
    on_demand_units_monthly: int = 0
    on_demand_gross_revenue_monthly: float = 0   # what flows through us (retail × units)
    on_demand_platform_fee_creator_side: float = 0
    on_demand_platform_fee_partner_side: float = 0
    bulk_units_monthly: int = 0
    bulk_gross_revenue_monthly: float = 0
    bulk_platform_fee_creator_side: float = 0
    bulk_platform_fee_partner_side: float = 0

    # Costs
    stripe_costs_monthly: float = 0
    ai_parser_costs_monthly: float = 0
    asset_library_costs_monthly: float = 0
    fixed_opex_monthly: float = 0

    # Aggregates
    total_platform_take_monthly: float = 0
    total_variable_costs_monthly: float = 0
    net_revenue_monthly: float = 0   # take minus variable costs
    operating_profit_monthly: float = 0  # net minus fixed opex
    annualized_revenue: float = 0
    annualized_profit: float = 0


def simulate(creator_count: int) -> ScaleResult:
    r = ScaleResult(
        creator_count=creator_count,
        partner_count=max(1, round(creator_count / CREATORS_PER_PARTNER)),
    )

    # Per-tier active creator counts
    registered = {tier: round(creator_count * mix) for tier, mix in CREATOR_TIER_MIX.items()}
    active = {tier: round(registered[tier] * CREATOR_ACTIVATION[tier]) for tier in registered}

    r.active_makers = active["maker"]
    r.active_builders = active["builder"]
    r.active_agencies = active["agency"]

    # Subscription revenue (paid tiers only — count registered, not just active,
    # because subscribers are paying whether they actively order or not)
    r.subscription_revenue_monthly = (
        registered["builder"] * SUBSCRIPTION_PRICE_MONTHLY["builder"]
        + registered["agency"] * SUBSCRIPTION_PRICE_MONTHLY["agency"]
    )

    # On-demand and bulk orders per tier
    for tier in ("maker", "builder", "agency"):
        active_count = active[tier]
        orders_per = ORDERS_PER_ACTIVE_CREATOR_PER_MONTH[tier]
        bulk_runs = BULK_RUNS_PER_MONTH[tier]
        bulk_size = AVG_BULK_RUN_SIZE[tier]
        bulk_share = BULK_MIX_BY_TIER[tier]

        # On-demand orders × creators
        # (orders_per is total units; multiply by (1-bulk_share) of TOTAL volume)
        total_unit_demand = active_count * orders_per
        # bulk_share tells us what fraction of TOTAL volume is bulk
        # The on-demand units per active creator
        on_demand_units = total_unit_demand * (1 - bulk_share)
        # Bulk units come from separate bulk runs
        bulk_units = active_count * bulk_runs * bulk_size

        # On-demand revenue/fees
        gross_od = on_demand_units * ON_DEMAND_RETAIL_PRICE
        eff_creator_fee = effective_creator_fee_pct(tier) / 100
        eff_partner_fee = effective_partner_fee_pct() / 100

        creator_fee_od = gross_od * eff_creator_fee
        partner_fee_od = on_demand_units * ON_DEMAND_PARTNER_WHOLESALE * eff_partner_fee

        # Bulk revenue/fees
        # Bulk creator pays (partner cost + platform fee + shipping). We take % of partner cost as platform fee.
        bulk_gross_partner_cost = bulk_units * BULK_PARTNER_WHOLESALE_PER_UNIT
        creator_fee_bulk = bulk_gross_partner_cost * eff_creator_fee
        partner_fee_bulk = bulk_gross_partner_cost * eff_partner_fee

        r.on_demand_units_monthly += round(on_demand_units)
        r.on_demand_gross_revenue_monthly += gross_od
        r.on_demand_platform_fee_creator_side += creator_fee_od
        r.on_demand_platform_fee_partner_side += partner_fee_od
        r.bulk_units_monthly += round(bulk_units)
        r.bulk_gross_revenue_monthly += bulk_gross_partner_cost
        r.bulk_platform_fee_creator_side += creator_fee_bulk
        r.bulk_platform_fee_partner_side += partner_fee_bulk

    # Stripe costs — on every order transaction
    total_transactions = r.on_demand_units_monthly + (r.bulk_units_monthly // 500)  # bulk batched
    avg_tx_value = (
        (r.on_demand_gross_revenue_monthly + r.bulk_gross_revenue_monthly)
        / max(1, total_transactions)
    )
    r.stripe_costs_monthly = (
        (r.on_demand_gross_revenue_monthly + r.bulk_gross_revenue_monthly) * STRIPE_PCT_PER_TRANSACTION
        + total_transactions * STRIPE_FLAT_PER_TRANSACTION
    )

    # AI parser cost (Builder + Agency)
    r.ai_parser_costs_monthly = (
        round(creator_count * CREATOR_TIER_MIX["builder"] * CREATOR_ACTIVATION["builder"])
            * AI_PARSES_PER_BUILDER_PER_MONTH * AI_PARSER_ANTHROPIC_COST_PER_PARSE
        + round(creator_count * CREATOR_TIER_MIX["agency"] * CREATOR_ACTIVATION["agency"])
            * AI_PARSES_PER_AGENCY_PER_MONTH * AI_PARSER_ANTHROPIC_COST_PER_PARSE
    )

    # Asset library (Shutterstock contract — flat)
    r.asset_library_costs_monthly = SHUTTERSTOCK_MONTHLY_BUDGET

    # Fixed opex
    r.fixed_opex_monthly = fixed_opex(creator_count) / 12

    # Totals
    r.total_platform_take_monthly = (
        r.subscription_revenue_monthly
        + r.on_demand_platform_fee_creator_side
        + r.on_demand_platform_fee_partner_side
        + r.bulk_platform_fee_creator_side
        + r.bulk_platform_fee_partner_side
    )
    r.total_variable_costs_monthly = (
        r.stripe_costs_monthly
        + r.ai_parser_costs_monthly
        + r.asset_library_costs_monthly
    )
    r.net_revenue_monthly = r.total_platform_take_monthly - r.total_variable_costs_monthly
    r.operating_profit_monthly = r.net_revenue_monthly - r.fixed_opex_monthly
    r.annualized_revenue = r.total_platform_take_monthly * 12
    r.annualized_profit = r.operating_profit_monthly * 12

    return r


# ─────────────────────────────────────────────────────────────────────
# RUN + OUTPUT
# ─────────────────────────────────────────────────────────────────────

scales = [100, 1_000, 10_000, 30_000]
results = [simulate(n) for n in scales]

# Print summary to console
print("\n" + "═" * 100)
print("iLaunchify financial simulation — V1.5 locked model")
print("═" * 100)
print(f"Effective creator-side fees (volume-weighted across velocity tiers):")
print(f"  Maker:   {effective_creator_fee_pct('maker'):.2f}%")
print(f"  Builder: {effective_creator_fee_pct('builder'):.2f}%")
print(f"  Agency:  {effective_creator_fee_pct('agency'):.2f}%")
print(f"Effective partner-side fee (mix-weighted): {effective_partner_fee_pct():.2f}%")
print()

for r in results:
    print(f"\n── {r.creator_count:,} CREATORS / {r.partner_count} PARTNERS ──")
    print(f"  Active: Makers {r.active_makers:,} · Builders {r.active_builders:,} · Agencies {r.active_agencies:,}")
    print(f"  Monthly subscription rev:        ${r.subscription_revenue_monthly:>12,.0f}")
    print(f"  Monthly on-demand units:          {r.on_demand_units_monthly:>12,}")
    print(f"  Monthly on-demand gross:         ${r.on_demand_gross_revenue_monthly:>12,.0f}")
    print(f"  Creator-side on-demand fee:      ${r.on_demand_platform_fee_creator_side:>12,.0f}")
    print(f"  Partner-side on-demand fee:      ${r.on_demand_platform_fee_partner_side:>12,.0f}")
    print(f"  Monthly bulk units:               {r.bulk_units_monthly:>12,}")
    print(f"  Monthly bulk gross:              ${r.bulk_gross_revenue_monthly:>12,.0f}")
    print(f"  Creator-side bulk fee:           ${r.bulk_platform_fee_creator_side:>12,.0f}")
    print(f"  Partner-side bulk fee:           ${r.bulk_platform_fee_partner_side:>12,.0f}")
    print(f"  ─────────────────────────────────────────")
    print(f"  Total platform take (monthly):   ${r.total_platform_take_monthly:>12,.0f}")
    print(f"  Stripe variable costs:           ${r.stripe_costs_monthly:>12,.0f}")
    print(f"  AI parser costs (Anthropic):     ${r.ai_parser_costs_monthly:>12,.0f}")
    print(f"  Asset library (Shutterstock):    ${r.asset_library_costs_monthly:>12,.0f}")
    print(f"  Fixed opex (engineering+infra):  ${r.fixed_opex_monthly:>12,.0f}")
    print(f"  ─────────────────────────────────────────")
    print(f"  Net platform revenue (monthly):  ${r.net_revenue_monthly:>12,.0f}")
    print(f"  Operating profit (monthly):      ${r.operating_profit_monthly:>12,.0f}")
    print(f"  Annualized revenue (ARR-ish):    ${r.annualized_revenue:>12,.0f}")
    print(f"  Annualized operating profit:     ${r.annualized_profit:>12,.0f}")

# Save JSON for downstream
out = {
    "effective_fees": {
        "maker": effective_creator_fee_pct("maker"),
        "builder": effective_creator_fee_pct("builder"),
        "agency": effective_creator_fee_pct("agency"),
        "partner_avg": effective_partner_fee_pct(),
    },
    "results": [r.__dict__ for r in results],
}
with open("./financial_simulation_results.json", "w") as f:
    json.dump(out, f, indent=2)

print("\nWrote: financial_simulation_results.json")
