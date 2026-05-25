"""POST /v1/compliance/check — the main entry point.

Loads recipe + ingredients from DB, runs calculation + rule evaluation,
writes a ComplianceCheck audit row, returns ComplianceResult.
"""
from __future__ import annotations

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, HTTPException

from app.calculation import calculate_nutrition
from app.compliance import compute_inputs_hash, evaluate_compliance
from app.db import get_prisma
from app.rule_packs import load_rule_pack
from app.schemas import CheckRequest, ComplianceResult

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/v1/compliance/check", response_model=ComplianceResult)
async def check_recipe_compliance(body: CheckRequest) -> ComplianceResult:
    prisma = await get_prisma()

    # 1. Load recipe + ingredients + product context
    recipe = await prisma.recipe.find_unique(
        where={"id": body.recipe_id},
        include={
            "ingredients": {"include": {"ingredient": True}},
            "product": True,
        },
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # 2. Find the rule pack version. body.rule_pack_id is the EXTERNAL id
    #    of the RulePack ('us-fda-food-2026'); look up its active version row.
    rule_pack_row = await prisma.rulepack.find_unique(
        where={"externalId": body.rule_pack_id},
        include={"versions": {"orderBy": {"createdAt": "desc"}, "take": 1}},
    )
    if not rule_pack_row or not rule_pack_row.versions:
        raise HTTPException(status_code=404, detail=f"Rule pack '{body.rule_pack_id}' not found")

    rule_pack_version = rule_pack_row.versions[0]
    # RulePackVersion.fileRef is the JSON stem (e.g. 'us-fda-food-2026.01')
    try:
        rule_pack_json = load_rule_pack(rule_pack_version.fileRef)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    # 3. Compute nutrition
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

    inputs_hash = compute_inputs_hash(
        recipe_id=recipe.id,
        rule_pack_id=body.rule_pack_id,
        profile=profile,
    )

    # 4. Evaluate compliance
    serving_size_desc = recipe.servingSizeDesc or f"{float(recipe.servingSizeG):g} g"
    violations, warnings, disclosures, panel = evaluate_compliance(
        rule_pack=rule_pack_json,
        profile=profile,
        recipe_ingredients=ingredient_rows,
        serving_size_desc=serving_size_desc,
        servings_per_container=int(recipe.servingsPerContainer),
        claim_texts=[],  # V1: claim text capture comes in W6
        product_category=recipe.product.category,
    )

    outcome = "FAILED" if violations else ("PASSED_WITH_WARNINGS" if warnings else "PASSED")
    passed = not violations

    # 5. Write audit row + cache the calculated nutrition on the recipe
    audit = await prisma.compliancecheck.create(
        data={
            "recipeId": recipe.id,
            "rulePackVersionId": rule_pack_version.id,
            "inputsHash": inputs_hash,
            "outcome": outcome,
            "violations": [v.model_dump(by_alias=True) for v in violations],
            "warnings": [w.model_dump(by_alias=True) for w in warnings],
            "disclosures": [d.model_dump() for d in disclosures],
            "panelData": panel.model_dump(by_alias=True),
            "triggeredByUserId": body.triggered_by_user_id,
        }
    )

    # Cache the freshly-calculated nutrition on the Recipe row
    await prisma.recipe.update(
        where={"id": recipe.id},
        data={
            "nutritionProfile": profile.model_dump(by_alias=True),
            "status": "COMPLIANCE_CHECKED",
        },
    )

    log.info(
        "compliance.check.completed",
        recipe_id=recipe.id,
        rule_pack=body.rule_pack_id,
        outcome=outcome,
        violation_count=len(violations),
        warning_count=len(warnings),
    )

    return ComplianceResult(
        passed=passed,
        outcome=outcome,
        violations=violations,
        warnings=warnings,
        disclosures=disclosures,
        panelData=panel,
        auditRef=audit.id,
        rulePackVersion=rule_pack_version.version,
        evaluatedAt=datetime.now(UTC).isoformat(),
    )
