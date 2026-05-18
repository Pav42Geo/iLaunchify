"""Integration tests for the rule evaluator — pure (no DB)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.compliance import evaluate_compliance
from app.schemas import NutrientProfile


@pytest.fixture(scope="module")
def food_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-food-2026.01.json"
    return json.loads(path.read_text())


@pytest.fixture(scope="module")
def supp_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-supplements-2026.01.json"
    return json.loads(path.read_text())


def test_clean_recipe_passes(food_pack):
    """No allergens, no claims, normal nutrition → PASSED."""
    profile = NutrientProfile(calories=120, totalFat=3, protein=20)
    violations, warnings, _, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            {"weight_g": 30, "nutrition_per_100g": {"calories": 400}, "allergens": []}
        ],
        serving_size_desc="30 g",
        servings_per_container=20,
        product_category="FOOD",
    )
    assert violations == []
    assert warnings == []


def test_allergen_disclosure_generated(food_pack):
    """Recipe with milk + soy ingredients → Contains: milk, soybeans."""
    profile = NutrientProfile(calories=100)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            {"weight_g": 50, "nutrition_per_100g": {}, "allergens": ["milk"]},
            {"weight_g": 50, "nutrition_per_100g": {}, "allergens": ["soybeans"]},
        ],
        serving_size_desc="30 g",
        servings_per_container=20,
        product_category="FOOD",
    )
    contains = [d for d in disclosures if d.id == "contains_allergen_statement"]
    assert len(contains) == 1
    assert "milk" in contains[0].text
    assert "soybeans" in contains[0].text


def test_iron_warning_triggers_at_30mg(supp_pack):
    """Supplement with ≥ 30 mg iron per serving must include iron warning."""
    profile = NutrientProfile(iron=35)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=supp_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="1 capsule",
        servings_per_container=60,
        product_category="SUPPLEMENT",
    )
    iron_warning = [d for d in disclosures if "overdose" in d.text.lower()]
    assert len(iron_warning) == 1


def test_iron_warning_does_not_trigger_below_30mg(supp_pack):
    profile = NutrientProfile(iron=18)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=supp_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="1 capsule",
        servings_per_container=60,
        product_category="SUPPLEMENT",
    )
    iron_warning = [d for d in disclosures if "overdose" in d.text.lower()]
    assert iron_warning == []


def test_drug_claim_blocks(food_pack):
    profile = NutrientProfile(calories=100)
    violations, _, _, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="30 g",
        servings_per_container=20,
        product_category="FOOD",
        claim_texts=["This product cures diabetes and prevents cancer."],
    )
    assert len(violations) >= 1
    assert any("drug_claim" in v.rule_id for v in violations)
    assert all(v.severity == "BLOCKING" for v in violations)


def test_legitimate_health_message_passes(food_pack):
    profile = NutrientProfile(calories=100)
    violations, _, _, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="30 g",
        servings_per_container=20,
        product_category="FOOD",
        claim_texts=["A good source of calcium for healthy bones."],
    )
    assert violations == []


def test_panel_data_includes_mandatory_nutrients(food_pack):
    profile = NutrientProfile(calories=200, totalFat=5, protein=8, sodium=150)
    _, _, _, panel = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[],
        serving_size_desc="30 g",
        servings_per_container=20,
        product_category="FOOD",
    )
    nutrient_ids = {row.id for row in panel.rows}
    assert "calories" in nutrient_ids
    assert "totalFat" in nutrient_ids
    assert "protein" in nutrient_ids
    assert "sodium" in nutrient_ids
    assert "vitaminD" in nutrient_ids
    assert "calcium" in nutrient_ids
    assert "iron" in nutrient_ids
    assert "potassium" in nutrient_ids
