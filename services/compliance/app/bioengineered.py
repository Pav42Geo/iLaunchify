"""Bioengineered ingredient disclosure renderer.

Per USDA's National Bioengineered Food Disclosure Standard (2022),
codified at 7 CFR Part 66. When a resolved recipe contains an ingredient
flagged BIOENGINEERED or DERIVED_FROM_BIOENGINEERED, the compliance
service emits a Disclosure that the renderer places on the label.

Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5e.

V1 emits the text-form disclosure only. The standard also permits a BE
symbol (image), a QR code, or a phone-text option — those are deferred
to V1.1 with the AI label assist work.
"""
from __future__ import annotations

from typing import Any

from app.schemas import Disclosure


# 7 CFR 66.106 disclosure phrasings
# - § 66.106(a)(1) — "Bioengineered food" for foods that are themselves BE
# - § 66.106(a)(2) — "Contains a bioengineered food ingredient" for foods
#   that contain a BE ingredient
# - § 66.106(b)(1) — "Derived from bioengineering" for refined products
# - § 66.106(b)(2) — "Ingredient(s) derived from a bioengineered source"
#
# V1 picks the simplest correct phrasing: if any ingredient is BIOENGINEERED
# use the "contains a bioengineered food ingredient" wording; if only DERIVED,
# use the "ingredient(s) derived from a bioengineered source" wording.

_TEXT_BIOENGINEERED = "Contains a bioengineered food ingredient"
_TEXT_DERIVED = "Ingredient(s) derived from a bioengineered source"


def collect_bioengineered_statuses(
    recipe_ingredients: list[dict[str, Any]],
) -> dict[str, int]:
    """Tally BE statuses across the resolved ingredient list.

    Returns a dict like {"BIOENGINEERED": 2, "DERIVED_FROM_BIOENGINEERED": 1}.
    Ingredients with NONE / NOT_APPLICABLE / missing status do not appear.
    """
    counts: dict[str, int] = {}
    for ing in recipe_ingredients:
        status = ing.get("bioengineered_status") or ing.get("bioengineeredStatus")
        if isinstance(status, str) and status in (
            "BIOENGINEERED",
            "DERIVED_FROM_BIOENGINEERED",
        ):
            counts[status] = counts.get(status, 0) + 1
    return counts


def build_bioengineered_disclosure(
    recipe_ingredients: list[dict[str, Any]],
) -> Disclosure | None:
    """Build the federal BE disclosure if any ingredient triggers it.

    Returns None when no ingredient is bioengineered — most recipes.
    """
    statuses = collect_bioengineered_statuses(recipe_ingredients)
    if not statuses:
        return None

    # BIOENGINEERED wording wins if any whole-BE ingredient is present;
    # otherwise the DERIVED wording covers refined ingredients.
    if "BIOENGINEERED" in statuses:
        text = _TEXT_BIOENGINEERED
        rule_id = "bioengineered_disclosure"
    else:
        text = _TEXT_DERIVED
        rule_id = "bioengineered_derived_disclosure"

    return Disclosure(
        id=rule_id,
        text=text,
        placement="INFORMATION_PANEL",  # 7 CFR 66.100 — on the IP near ingredients
        required=True,
    )
