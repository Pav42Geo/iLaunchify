"""Manual nutrient overrides — per ProductTemplate / FlavorPreset.

Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5c.

Each override is `{nutrient, value, reason}`. The compliance service applies
overrides to the calculated NutrientProfile AFTER summing-from-ingredients
and BEFORE rounding/rendering. The original raw value is preserved alongside
the override on the audit row so an admin can see the delta.
"""
from __future__ import annotations

from typing import Any

from app.schemas import NutrientProfile

# Allow-list — every nutrient name the editor exposes. Keep in sync with
# apps/partner/.../BasicsCard NutrientOverridesPanel select options.
ALLOWED_NUTRIENTS: set[str] = {
    "calories",
    "totalFat",
    "saturatedFat",
    "transFat",
    "cholesterol",
    "sodium",
    "totalCarbohydrate",
    "dietaryFiber",
    "totalSugars",
    "addedSugars",
    "protein",
    "vitaminD",
    "calcium",
    "iron",
    "potassium",
    "vitaminA",
    "vitaminC",
    "vitaminE",
}


def _snake_case(camel: str) -> str:
    out: list[str] = []
    for ch in camel:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)


def apply_nutrient_overrides(
    profile: NutrientProfile,
    overrides: list[dict[str, Any]] | None,
) -> tuple[NutrientProfile, list[dict[str, Any]]]:
    """Apply manual overrides to a NutrientProfile.

    Args:
        profile: Calculated per-serving profile (already scaled to one serving).
        overrides: List of `{nutrient, value, reason}` dicts from
            ProductTemplate.nutrientOverrides or FlavorPreset.nutrientOverrides.
            Preset overrides should be merged in by the caller before passing
            (preset wins on conflict).

    Returns:
        (new_profile, applied_audit)

        applied_audit is a list of `{nutrient, originalValue, overrideValue, reason}`
        records — one per accepted override. The caller writes this to the
        ComplianceCheck audit row.

    Skips overrides with unknown / blank nutrient names or non-numeric values
    rather than raising — the editor enforces shape, but defense in depth.
    """
    if not overrides:
        return profile, []

    profile_dict = profile.model_dump(by_alias=True)
    applied: list[dict[str, Any]] = []

    for raw in overrides:
        if not isinstance(raw, dict):
            continue
        nutrient = raw.get("nutrient")
        if not isinstance(nutrient, str):
            continue
        if nutrient not in ALLOWED_NUTRIENTS:
            continue
        value = raw.get("value")
        try:
            value_f = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        reason = raw.get("reason") or ""
        if not isinstance(reason, str) or not reason.strip():
            # spec: override always requires a typed reason
            continue

        original = profile_dict.get(nutrient)
        profile_dict[nutrient] = value_f
        applied.append(
            {
                "nutrient": nutrient,
                "originalValue": float(original) if original is not None else 0.0,
                "overrideValue": value_f,
                "reason": reason.strip(),
            }
        )

    return NutrientProfile.model_validate(profile_dict), applied


def merge_overrides(
    template_overrides: list[dict[str, Any]] | None,
    preset_overrides: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Merge template + preset override lists. Preset wins on duplicate nutrient.

    Per §4a.5c: 'preset overrides win on conflict with ProductTemplate.nutrientOverrides'.
    """
    merged: dict[str, dict[str, Any]] = {}
    for src in (template_overrides or []):
        if isinstance(src, dict) and isinstance(src.get("nutrient"), str):
            merged[src["nutrient"]] = src
    for src in (preset_overrides or []):
        if isinstance(src, dict) and isinstance(src.get("nutrient"), str):
            merged[src["nutrient"]] = src
    return list(merged.values())
