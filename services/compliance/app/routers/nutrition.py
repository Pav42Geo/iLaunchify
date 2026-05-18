"""POST /v1/nutrition/calculate — compute raw nutrient profile for a recipe.

Lightweight alternative to /v1/compliance/check that doesn't run rule
evaluation. Useful for the recipe builder's live preview when only the
calculation result matters.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.calculation import calculate_nutrition
from app.db import get_prisma
from app.schemas import NutritionRequest, NutrientProfile

router = APIRouter()


@router.post("/v1/nutrition/calculate", response_model=NutrientProfile)
async def calculate(body: NutritionRequest) -> NutrientProfile:
    prisma = await get_prisma()
    recipe = await prisma.recipe.find_unique(
        where={"id": body.recipe_id},
        include={"ingredients": {"include": {"ingredient": True}}},
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ingredient_rows = [
        {
            "weight_g": float(ri.weightG),
            "nutrition_per_100g": ri.ingredient.nutritionPer100g or {},
            "allergens": ri.ingredient.allergens or [],
        }
        for ri in recipe.ingredients
    ]

    profile = calculate_nutrition(
        recipe_serving_size_g=float(recipe.servingSizeG),
        recipe_ingredients=ingredient_rows,
    )

    # Cache on the Recipe row
    await prisma.recipe.update(
        where={"id": recipe.id},
        data={"nutritionProfile": profile.model_dump(by_alias=True)},
    )

    return profile
