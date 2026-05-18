"""Tests for nutrient calculation engine — pure math, no DB."""
from __future__ import annotations

from app.calculation import calculate_nutrition, collect_allergens


def test_single_ingredient_full_serving():
    """100g of an ingredient with 50 cal/100g, sized to 100g per serving → 50 cal."""
    profile = calculate_nutrition(
        recipe_serving_size_g=100,
        recipe_ingredients=[
            {
                "weight_g": 100,
                "nutrition_per_100g": {"calories": 50, "protein": 10},
            }
        ],
    )
    assert profile.calories == 50
    assert profile.protein == 10


def test_two_ingredient_scaling():
    """Recipe: 70g oats (389 cal/100g) + 30g almonds (579 cal/100g) → 100g total.
    Serving size = 30g → 30% of recipe.
    Expected calories: (70*3.89 + 30*5.79) * 0.30 = (272.3 + 173.7) * 0.30 ≈ 133.8
    """
    profile = calculate_nutrition(
        recipe_serving_size_g=30,
        recipe_ingredients=[
            {"weight_g": 70, "nutrition_per_100g": {"calories": 389}},
            {"weight_g": 30, "nutrition_per_100g": {"calories": 579}},
        ],
    )
    assert profile.calories == abs(profile.calories)
    assert 133 < profile.calories < 135


def test_zero_weight_returns_empty_profile():
    profile = calculate_nutrition(
        recipe_serving_size_g=10,
        recipe_ingredients=[{"weight_g": 0, "nutrition_per_100g": {"calories": 100}}],
    )
    assert profile.calories == 0


def test_collect_allergens_dedupes_and_sorts():
    allergens = collect_allergens(
        [
            {"allergens": ["milk", "soy"]},
            {"allergens": ["milk", "wheat"]},
            {"allergens": []},
        ]
    )
    assert allergens == ["milk", "soy", "wheat"]


def test_collect_allergens_handles_missing_field():
    allergens = collect_allergens([{}, {"allergens": ["sesame"]}])
    assert allergens == ["sesame"]
