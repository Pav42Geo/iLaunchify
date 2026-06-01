"""Tests for manual nutrient overrides — per §4a.5c of MANUFACTURER_PRODUCT_BUILDER.

Covers:
  - no overrides → profile passes through unchanged
  - basic override application
  - audit record shape
  - missing reason → override rejected (silently skipped)
  - unknown nutrient → override rejected
  - non-numeric value → override rejected
  - merge_overrides: preset wins on conflict with template
  - end-to-end via evaluate_compliance: override drives panel value
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.compliance import evaluate_compliance
from app.overrides import apply_nutrient_overrides, merge_overrides
from app.schemas import NutrientProfile


@pytest.fixture(scope="module")
def food_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-food-2026.01.json"
    return json.loads(path.read_text())


def test_no_overrides_passes_through():
    profile = NutrientProfile(calories=120, protein=20)
    new_profile, applied = apply_nutrient_overrides(profile, None)
    assert new_profile.calories == 120
    assert new_profile.protein == 20
    assert applied == []


def test_basic_override_applied():
    profile = NutrientProfile(calories=120, protein=20)
    new_profile, applied = apply_nutrient_overrides(
        profile,
        [{"nutrient": "calories", "value": 145, "reason": "moisture loss in baking"}],
    )
    assert new_profile.calories == 145
    # untouched
    assert new_profile.protein == 20
    assert len(applied) == 1
    assert applied[0]["nutrient"] == "calories"
    assert applied[0]["originalValue"] == 120
    assert applied[0]["overrideValue"] == 145
    assert applied[0]["reason"] == "moisture loss in baking"


def test_override_requires_reason():
    profile = NutrientProfile(calories=120)
    _, applied = apply_nutrient_overrides(
        profile,
        [{"nutrient": "calories", "value": 145, "reason": ""}],
    )
    assert applied == []


def test_override_rejects_unknown_nutrient():
    profile = NutrientProfile(calories=120)
    _, applied = apply_nutrient_overrides(
        profile,
        [{"nutrient": "WHATEVER_NEW_NUTRIENT", "value": 1, "reason": "test"}],
    )
    assert applied == []


def test_override_rejects_non_numeric_value():
    profile = NutrientProfile(calories=120)
    new_profile, applied = apply_nutrient_overrides(
        profile,
        [{"nutrient": "calories", "value": "not a number", "reason": "test"}],
    )
    assert new_profile.calories == 120
    assert applied == []


def test_merge_overrides_preset_wins():
    template_overrides = [
        {"nutrient": "calories", "value": 100, "reason": "template"},
        {"nutrient": "protein", "value": 20, "reason": "template"},
    ]
    preset_overrides = [
        {"nutrient": "calories", "value": 150, "reason": "preset"},
    ]
    merged = merge_overrides(template_overrides, preset_overrides)
    by_nutrient = {m["nutrient"]: m for m in merged}
    assert by_nutrient["calories"]["value"] == 150
    assert by_nutrient["calories"]["reason"] == "preset"
    # template-only field still present
    assert by_nutrient["protein"]["value"] == 20


def test_evaluate_compliance_applies_override_to_panel(food_pack):
    """End-to-end: an override on calories must show up in the panel rows."""
    profile = NutrientProfile(calories=200, protein=10)
    _, _, _, panel = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
        nutrient_overrides=[
            {"nutrient": "calories", "value": 250, "reason": "baking moisture loss"},
        ],
    )
    cal_row = next(r for r in panel.rows if r.id == "calories")
    # Calories use rounding: 250 → rounds to 250 (the >50 rule rounds to nearest 10).
    assert cal_row.amount in (250, 250.0)


def test_evaluate_compliance_passes_through_when_no_overrides(food_pack):
    profile = NutrientProfile(calories=120, protein=20, sodium=150)
    _, _, _, panel = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
    )
    cal_row = next(r for r in panel.rows if r.id == "calories")
    # 120 → rounds to 120 (10s increment)
    assert cal_row.amount in (120, 120.0)
