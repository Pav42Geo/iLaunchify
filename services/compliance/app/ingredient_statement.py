"""Ingredient statement renderer with FDA-allowed grouping.

Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5d.

FDA 21 CFR 101.4 permits certain categorical names on the printed
ingredient list ("Spices", "Natural Flavors", "Artificial Flavors", and
"Spices and Spice Extractives"). A ProductTemplate may define one or more
groups that bundle base ingredients under such a category.

Each group:
    {
      "groupName":      "Spices",
      "ingredientIds":  ["...salt...", "...pepper...", "...turmeric..."],
      "displayMode":    "CATEGORY_ONLY" | "CATEGORY_WITH_SUBLIST",
      "sortAs":         "byWeight" | "asWritten"
    }

Rendering rule:
  1. Sum the weights of the grouped ingredients — that sum is the group's
     position weight in the descending-weight ingredient list.
  2. Render the group as a single entry: either "Spices" (CATEGORY_ONLY) or
     "Spices (Salt, Black Pepper, Turmeric)" (CATEGORY_WITH_SUBLIST).
  3. sortAs="asWritten" keeps the group at the slot of its first member.
  4. Ungrouped ingredients are listed as-is by descending weight.

Validation invariant (enforced upstream by the editor): an ingredient can
only belong to one group. The renderer skips duplicate-group memberships
defensively.
"""
from __future__ import annotations

from typing import Any


# FDA-allowed category names — anything outside this set is rejected.
ALLOWED_GROUP_NAMES: set[str] = {
    "Spices",
    "Natural Flavors",
    "Artificial Flavors",
    "Spices and Spice Extractives",
    # Colors group is FDA-permitted in some forms; deferred to V1.1 when
    # we have specific subcategorisation rules to enforce.
}

ALLOWED_DISPLAY_MODES: set[str] = {"CATEGORY_ONLY", "CATEGORY_WITH_SUBLIST"}
ALLOWED_SORT_MODES: set[str] = {"byWeight", "asWritten"}


def render_ingredient_statement(
    recipe_ingredients: list[dict[str, Any]],
    ingredient_groups: list[dict[str, Any]] | None,
) -> str:
    """Produce the printed 'Ingredients:' string for the label.

    Args:
        recipe_ingredients: Each item carries at minimum
            - ingredient_id: str
            - weight_g: float
            - label_declaration_name: str (the printed name, e.g. "Natural Flavor")
            - display_order: int (optional; defaults to incoming order)
        ingredient_groups: Raw JSON from ProductTemplate.ingredientGroups,
            or None.

    Returns:
        A comma-separated, descending-weight statement, e.g.
            "Wheat Flour, Sugar, Spices (Salt, Black Pepper), Salt"
    """
    valid_groups = _validate_groups(ingredient_groups)
    grouped_ids = {
        ing_id
        for g in valid_groups
        for ing_id in g.get("ingredientIds", [])
    }

    # Bucket ingredients per group / loose
    loose: list[dict[str, Any]] = []
    by_group: dict[str, list[dict[str, Any]]] = {g["groupName"]: [] for g in valid_groups}
    for idx, ing in enumerate(recipe_ingredients):
        ing_id = ing.get("ingredient_id") or ing.get("ingredientId")
        # Preserve original display order for asWritten
        ing = {**ing, "_orig_order": ing.get("display_order", idx)}
        if ing_id and ing_id in grouped_ids:
            for g in valid_groups:
                if ing_id in g.get("ingredientIds", []):
                    by_group[g["groupName"]].append(ing)
                    break
        else:
            loose.append(ing)

    # Build the rendered entries with their effective sort weight
    entries: list[tuple[float, int, str]] = []  # (weight desc, original_idx asc, text)

    for g in valid_groups:
        bucket = by_group.get(g["groupName"], [])
        if not bucket:
            continue
        total_weight = sum(float(b.get("weight_g", 0)) for b in bucket)
        sort_as = g.get("sortAs", "byWeight")
        if sort_as == "asWritten":
            # Effective position = first member's original index — encoded as
            # negative weight so the by-weight sort places it correctly
            sort_weight = -float(min(b["_orig_order"] for b in bucket))
            tiebreak = min(b["_orig_order"] for b in bucket)
        else:
            sort_weight = total_weight
            tiebreak = min(b["_orig_order"] for b in bucket)

        if g.get("displayMode") == "CATEGORY_WITH_SUBLIST":
            sub_names = ", ".join(
                str(b.get("label_declaration_name") or b.get("name") or "")
                for b in sorted(bucket, key=lambda x: -float(x.get("weight_g", 0)))
                if (b.get("label_declaration_name") or b.get("name"))
            )
            text = f"{g['groupName']} ({sub_names})" if sub_names else str(g["groupName"])
        else:
            text = str(g["groupName"])

        entries.append((sort_weight, tiebreak, text))

    for ing in loose:
        text = str(ing.get("label_declaration_name") or ing.get("name") or "")
        if not text:
            continue
        entries.append((float(ing.get("weight_g", 0)), ing["_orig_order"], text))

    # Sort: descending by weight, then ascending by original index for ties
    entries.sort(key=lambda t: (-t[0], t[1]))

    return ", ".join(e[2] for e in entries)


def _validate_groups(
    raw_groups: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Filter out malformed entries and dedupe ingredientIds.

    Defensive — the editor enforces this shape but the renderer should not
    crash on bad data persisted by an older client.
    """
    if not raw_groups:
        return []
    seen_ingredient_ids: set[str] = set()
    out: list[dict[str, Any]] = []
    for g in raw_groups:
        if not isinstance(g, dict):
            continue
        name = g.get("groupName")
        if not isinstance(name, str) or name not in ALLOWED_GROUP_NAMES:
            continue
        ids = g.get("ingredientIds")
        if not isinstance(ids, list):
            continue
        clean_ids: list[str] = []
        for ing_id in ids:
            if isinstance(ing_id, str) and ing_id and ing_id not in seen_ingredient_ids:
                seen_ingredient_ids.add(ing_id)
                clean_ids.append(ing_id)
        if not clean_ids:
            continue
        display_mode = g.get("displayMode", "CATEGORY_ONLY")
        if display_mode not in ALLOWED_DISPLAY_MODES:
            display_mode = "CATEGORY_ONLY"
        sort_as = g.get("sortAs", "byWeight")
        if sort_as not in ALLOWED_SORT_MODES:
            sort_as = "byWeight"
        out.append(
            {
                "groupName": name,
                "ingredientIds": clean_ids,
                "displayMode": display_mode,
                "sortAs": sort_as,
            }
        )
    return out
