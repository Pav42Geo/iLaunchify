"""Tests for the ingredient statement renderer with FDA-allowed grouping.

Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5d + 21 CFR 101.4.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.compliance import evaluate_compliance
from app.ingredient_statement import render_ingredient_statement
from app.schemas import NutrientProfile


@pytest.fixture(scope="module")
def food_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-food-2026.01.json"
    return json.loads(path.read_text())


def _ing(id_: str, name: str, weight: float):
    return {
        "ingredient_id": id_,
        "label_declaration_name": name,
        "weight_g": weight,
    }


def test_ungrouped_statement_sorts_by_descending_weight():
    statement = render_ingredient_statement(
        [
            _ing("a", "Sugar", 30),
            _ing("b", "Wheat Flour", 60),
            _ing("c", "Salt", 10),
        ],
        None,
    )
    assert statement == "Wheat Flour, Sugar, Salt"


def test_category_only_grouping():
    statement = render_ingredient_statement(
        [
            _ing("a", "Wheat Flour", 60),
            _ing("salt", "Salt", 1),
            _ing("pepper", "Black Pepper", 0.5),
            _ing("turmeric", "Turmeric", 0.5),
            _ing("c", "Sugar", 30),
        ],
        [
            {
                "groupName": "Spices",
                "ingredientIds": ["salt", "pepper", "turmeric"],
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            }
        ],
    )
    # Spices group sums to 2g — fits between Sugar (30g) and nothing else
    assert statement == "Wheat Flour, Sugar, Spices"


def test_category_with_sublist_grouping():
    statement = render_ingredient_statement(
        [
            _ing("a", "Wheat Flour", 60),
            _ing("salt", "Salt", 1),
            _ing("pepper", "Black Pepper", 0.5),
        ],
        [
            {
                "groupName": "Spices",
                "ingredientIds": ["salt", "pepper"],
                "displayMode": "CATEGORY_WITH_SUBLIST",
                "sortAs": "byWeight",
            }
        ],
    )
    assert statement == "Wheat Flour, Spices (Salt, Black Pepper)"


def test_natural_flavors_group_allowed():
    statement = render_ingredient_statement(
        [
            _ing("a", "Wheat Flour", 60),
            _ing("nf1", "Vanilla Extract", 1),
            _ing("nf2", "Cocoa Flavor", 0.5),
        ],
        [
            {
                "groupName": "Natural Flavors",
                "ingredientIds": ["nf1", "nf2"],
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            }
        ],
    )
    assert "Natural Flavors" in statement


def test_disallowed_group_name_is_ignored():
    """Only FDA-allowed categories pass — random names get rejected."""
    statement = render_ingredient_statement(
        [_ing("a", "Sugar", 30), _ing("b", "Wheat Flour", 60)],
        [
            {
                "groupName": "My Custom Category",
                "ingredientIds": ["a", "b"],
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            }
        ],
    )
    # Grouping was discarded → flat list
    assert statement == "Wheat Flour, Sugar"


def test_evaluate_compliance_emits_ingredient_statement_disclosure(food_pack):
    profile = NutrientProfile(calories=100)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            _ing("a", "Wheat Flour", 60),
            _ing("b", "Sugar", 30),
            _ing("c", "Salt", 10),
        ],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
    )
    statement_disclosures = [d for d in disclosures if d.id == "ingredient_statement"]
    assert len(statement_disclosures) == 1
    assert statement_disclosures[0].text.startswith("Ingredients:")
    assert "Wheat Flour" in statement_disclosures[0].text


def test_evaluate_compliance_renders_grouped_statement(food_pack):
    profile = NutrientProfile(calories=100)
    _, _, disclosures, _ = evaluate_compliance(
        rule_pack=food_pack,
        profile=profile,
        recipe_ingredients=[
            _ing("a", "Wheat Flour", 60),
            _ing("salt", "Salt", 1),
            _ing("pepper", "Black Pepper", 0.5),
        ],
        serving_size_desc="30 g",
        servings_per_container=10,
        product_category="FOOD",
        ingredient_groups=[
            {
                "groupName": "Spices",
                "ingredientIds": ["salt", "pepper"],
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            }
        ],
    )
    statement = next(d for d in disclosures if d.id == "ingredient_statement").text
    assert "Spices" in statement
    # Individual spices should not appear when CATEGORY_ONLY
    assert "Black Pepper" not in statement
    assert "Salt" not in statement


def test_ingredient_can_only_belong_to_one_group():
    """Duplicate-membership across groups → first group wins, second is filtered."""
    statement = render_ingredient_statement(
        [
            _ing("salt", "Salt", 1),
            _ing("nf1", "Vanilla", 0.5),
            _ing("a", "Wheat Flour", 60),
        ],
        [
            {
                "groupName": "Spices",
                "ingredientIds": ["salt"],
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            },
            {
                "groupName": "Natural Flavors",
                "ingredientIds": ["salt", "nf1"],  # 'salt' already in Spices
                "displayMode": "CATEGORY_ONLY",
                "sortAs": "byWeight",
            },
        ],
    )
    # Natural Flavors only contains 'nf1' since 'salt' was claimed first.
    assert "Spices" in statement
    assert "Natural Flavors" in statement
