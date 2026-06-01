"""Tests for the bioengineered disclosure renderer.

Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5e + 7 CFR Part 66.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.bioengineered import (
    build_bioengineered_disclosure,
    collect_bioengineered_statuses,
)
from app.compliance import evaluate_compliance
from app.schemas import NutrientProfile


@pytest.fixture(scope="module")
def food_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-food-2026.01.json"
    return json.loads(path.read_text())


def test_no_be_ingredients_no_disclosure():
    ingredients = [
        {"ingredient_id": "a", "bioengineered_status": "NONE"},
        {"ingredient_id": "b", "bioengineered_status": "NOT_APPLICABLE"},
        {"ingredient_id": "c"},  # missing status entirely
    ]
    assert collect_bioengineered_statuses(ingredients) == {}
    assert build_bioengineered_disclosure(ingredients) is None


def test_bioengineered_ingredient_triggers_contains_phrasing():
    ingredients = [{"ingredient_id": "x", "bioengineered_status": "BIOENGINEERED"}]
    d = build_bioengineered_disclosure(ingredients)
    assert d is not None
    assert "bioengineered food ingredient" in d.text.lower()
    assert d.required is True


def test_derived_only_uses_derived_phrasing():
    ingredients = [
        {"ingredient_id": "x", "bioengineered_status": "DERIVED_FROM_BIOENGINEERED"},
    ]
    d = build_bioengineered_disclosure(ingredients)
    assert d is not None
    assert "derived from a bioengineered source" in d.text.lower()


def test_mixed_bioengineered_and_derived_uses_bioengineered_phrasing():
    """When both BE and DERIVED are present, BE wins (stronger statement)."""
    ingredients = [
        {"ingredient_id": "x", "bioengineered_status": "BIOENGINEERED"},
        {"ingredient_id": "y", "bioengineered_status": "DERIVED_FROM_BIOENGINEERED"},
    ]
    d = build_bioengineered_disclosure(ingredients)
    assert d is not None
    assert "bioengineered food ingredient" in d.text.lower()


def test_evaluate_compliance_appends_be_disclosure(food_pack):
    """End-to-end: BE-flagged ingredient must add disclosure to the result."""
    profile = NutrientProfile(calories=100)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            {
                "ingredient_id": "soy-1",
                "weight_g": 10,
                "nutrition_per_100g": {},
                "allergens": [],
                "label_declaration_name": "Soybean Oil",
                "bioengineered_status": "BIOENGINEERED",
            }
        ],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
    )
    be_disclosures = [d for d in disclosures if d.id.startswith("bioengineered")]
    assert len(be_disclosures) == 1
    assert "bioengineered" in be_disclosures[0].text.lower()


def test_evaluate_compliance_no_be_disclosure_for_clean_recipe(food_pack):
    profile = NutrientProfile(calories=100)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            {
                "ingredient_id": "a",
                "weight_g": 50,
                "nutrition_per_100g": {},
                "allergens": [],
                "label_declaration_name": "Wheat Flour",
                "bioengineered_status": "NONE",
            }
        ],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
    )
    be_disclosures = [d for d in disclosures if d.id.startswith("bioengineered")]
    assert be_disclosures == []
