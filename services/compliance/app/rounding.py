"""Appendix H rounding engine.

Implements 21 CFR 101.9(c)(1)-(8) rounding rules verbatim from the
rule pack JSON. Pure functions — no I/O, no state.

Reference: docs/compliance-references/FDA-Food-Labeling-Guide.pdf Appendix H.
Encoded in: services/compliance/app/rule_packs/us-fda-food-2026.01.json
"""
from __future__ import annotations

import math
from typing import Any

# Sentinel return type — either a numeric display amount or a textual one
# (e.g. "less than 1 g"). The renderer handles both.
DisplayValue = float | str


def round_nutrient(
    nutrient_id: str,
    amount: float,
    rounding_rules: list[dict[str, Any]],
    *,
    halfway_rule: str = "round_up",
) -> DisplayValue:
    """Apply the FDA rounding rule for a single nutrient.

    Returns either a float (for normal display) or a string (for special-case
    text expressions like "less than 1 g"). The frontend renders both forms.
    """
    rule_block = _find_rule(nutrient_id, rounding_rules)
    if rule_block is None:
        # Unknown nutrient → return as-is rounded to one decimal
        return round(amount, 1)

    for rule in rule_block.get("rules", []):
        if _matches(rule.get("if", ""), amount):
            if "expressAs" in rule:
                # Text expressions like "0", "less than 5 mg" — return verbatim
                return rule["expressAs"]
            if "increment" in rule:
                inc = float(rule["increment"])
                return _round_to_increment(amount, inc, halfway_rule)

    # No rule matched — return as-is
    return round(amount, 1)


def round_percent_dv(
    amount_per_serving: float,
    daily_value: float,
    rule_pack: dict[str, Any],
) -> int | None:
    """Compute %DV and round per the vitamins-and-minerals rounding rule.

    Returns None for nutrients with no DV.
    """
    if daily_value <= 0 or amount_per_serving <= 0:
        return None

    raw_pct = (amount_per_serving / daily_value) * 100

    # Use the vitaminsAndMinerals rule from the rule pack (it's the same for
    # all %DV computations on vitamins/minerals; macronutrients have their
    # own %DV rules per nutrient).
    rules = rule_pack.get("roundingRules", [])
    block = _find_rule("vitaminsAndMinerals", rules)
    if block is None:
        return round(raw_pct)

    for rule in block.get("rules", []):
        if _matches(rule.get("if", ""), raw_pct):
            if "expressAs" in rule and rule["expressAs"] == "0":
                return 0
            if "expressAs" in rule and rule["expressAs"] == "*":
                return None  # asterisk — "less than 2% DV"
            if "increment" in rule:
                inc = float(rule["increment"])
                return int(_round_to_increment(raw_pct, inc, "round_up"))

    return round(raw_pct)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _find_rule(nutrient_id: str, rounding_rules: list[dict[str, Any]]) -> dict[str, Any] | None:
    for r in rounding_rules:
        if r.get("nutrient") == nutrient_id:
            return r
    return None


def _matches(condition: str, amount: float) -> bool:
    """Evaluate a rule condition like '<0.5', '<=50', '2-5', '>140'."""
    c = condition.strip()
    if c.startswith("<="):
        return amount <= float(c[2:])
    if c.startswith(">="):
        return amount >= float(c[2:])
    if c.startswith("<"):
        return amount < float(c[1:])
    if c.startswith(">"):
        return amount > float(c[1:])
    if "-" in c:
        # Range: e.g. "2-5" — inclusive on both ends per FDA convention
        lo, hi = c.split("-", 1)
        return float(lo) <= amount <= float(hi)
    # Equality fallback
    return math.isclose(amount, float(c))


def _round_to_increment(amount: float, increment: float, halfway_rule: str) -> float:
    """Round to the nearest multiple of `increment`.

    halfway_rule = 'round_up' matches the FDA convention: values exactly
    halfway between two multiples round up (e.g. 2.5 → 3).
    """
    if increment <= 0:
        return amount
    multiple = amount / increment
    if halfway_rule == "round_up":
        # math.floor on (multiple + 0.5) gives round-half-up
        rounded = math.floor(multiple + 0.5)
    else:
        rounded = round(multiple)  # banker's rounding
    return rounded * increment
