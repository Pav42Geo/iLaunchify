"""Nutrient calculation engine.

Takes a recipe (ingredients + weights + serving size) and returns the raw
per-serving NutrientProfile. Rounding lives in rounding.py — this is just
linear algebra on per-100g nutrient values.

Ported from FOD-reference/services/calculation/calc_service.py with the
hardcoded compliance check removed (that's compliance.py now).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.schemas import NutrientProfile


def calculate_nutrition(
    recipe_serving_size_g: float,
    recipe_ingredients: list[dict[str, Any]],
) -> NutrientProfile:
    """Sum per-100g nutrient values across all ingredients, scaled to the serving.

    Args:
        recipe_serving_size_g: How many grams in one serving of the final product.
        recipe_ingredients: Each item has:
            - weight_g: float (grams of this ingredient in the full recipe)
            - nutrition_per_100g: dict[str, float]

    Returns:
        NutrientProfile with per-serving raw values (no FDA rounding yet).
    """
    total_recipe_weight_g = sum(float(i["weight_g"]) for i in recipe_ingredients)

    if total_recipe_weight_g <= 0 or recipe_serving_size_g <= 0:
        return NutrientProfile()

    # Compute totals for the FULL recipe first
    totals: dict[str, float] = {}
    for ing in recipe_ingredients:
        weight_g = float(ing["weight_g"])
        per_100g = ing.get("nutrition_per_100g") or {}
        fraction = weight_g / 100.0  # weight ÷ 100 since nutrition is per-100g

        for nutrient_key, value in per_100g.items():
            if value is None:
                continue
            totals[nutrient_key] = totals.get(nutrient_key, 0.0) + float(value) * fraction

    # Scale to per-serving
    serving_fraction = recipe_serving_size_g / total_recipe_weight_g
    per_serving = {k: v * serving_fraction for k, v in totals.items()}

    return NutrientProfile(
        calories=per_serving.get("calories", 0.0),
        totalFat=per_serving.get("totalFat", 0.0),
        saturatedFat=per_serving.get("saturatedFat", 0.0),
        transFat=per_serving.get("transFat", 0.0),
        cholesterol=per_serving.get("cholesterol", 0.0),
        sodium=per_serving.get("sodium", 0.0),
        totalCarbohydrate=per_serving.get("totalCarbohydrate", 0.0),
        dietaryFiber=per_serving.get("dietaryFiber", 0.0),
        totalSugars=per_serving.get("totalSugars", 0.0),
        addedSugars=per_serving.get("addedSugars", 0.0),
        protein=per_serving.get("protein", 0.0),
        vitaminD=per_serving.get("vitaminD", 0.0),
        calcium=per_serving.get("calcium", 0.0),
        iron=per_serving.get("iron", 0.0),
        potassium=per_serving.get("potassium", 0.0),
        vitaminA=per_serving.get("vitaminA", 0.0),
        vitaminC=per_serving.get("vitaminC", 0.0),
        vitaminE=per_serving.get("vitaminE", 0.0),
    )


def collect_allergens(recipe_ingredients: list[dict[str, Any]]) -> list[str]:
    """Aggregate the unique allergen list from the recipe's ingredients.

    Each ingredient row carries `allergens: list[str]` from the Ingredient table.
    """
    out: set[str] = set()
    for ing in recipe_ingredients:
        for a in ing.get("allergens") or []:
            out.add(a)
    return sorted(out)
