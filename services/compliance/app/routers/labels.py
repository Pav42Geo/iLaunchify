"""POST /v1/labels/render — produce label PDF or SVG from a recipe.

Internally runs the same pipeline as /v1/compliance/check (load → calc → eval)
and pipes the resulting panel into label_render. PDF byte stream or SVG text
is returned directly; storage to R2 happens in the export pipeline (Week 8+).
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, Response

from app.calculation import calculate_nutrition
from app.compliance import evaluate_compliance
from app.db import get_prisma
from app.label_render import render_panel_pdf, render_panel_svg
from app.rule_packs import load_rule_pack
from app.schemas import LabelRenderRequest

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/v1/labels/render")
async def render_label(body: LabelRenderRequest):
    prisma = await get_prisma()

    recipe = await prisma.recipe.find_unique(
        where={"id": body.recipe_id},
        include={
            "ingredients": {"include": {"ingredient": True}},
            "product": True,
        },
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    rule_pack_row = await prisma.rulepack.find_unique(
        where={"externalId": body.rule_pack_id},
        include={"versions": {"orderBy": {"createdAt": "desc"}, "take": 1}},
    )
    if not rule_pack_row or not rule_pack_row.versions:
        raise HTTPException(status_code=404, detail=f"Rule pack '{body.rule_pack_id}' not found")
    version = rule_pack_row.versions[0]
    rule_pack_json = load_rule_pack(version.fileRef)

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

    serving_size_desc = recipe.servingSizeDesc or f"{float(recipe.servingSizeG):g} g"
    _, _, _, panel = evaluate_compliance(
        rule_pack=rule_pack_json,
        profile=profile,
        recipe_ingredients=ingredient_rows,
        serving_size_desc=serving_size_desc,
        servings_per_container=int(recipe.servingsPerContainer),
        product_category=recipe.product.category,
    )

    if body.format == "PDF":
        pdf_bytes = render_panel_pdf(panel)
        return Response(content=pdf_bytes, media_type="application/pdf")
    elif body.format == "SVG":
        svg = render_panel_svg(panel)
        return Response(content=svg, media_type="image/svg+xml")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {body.format}")
