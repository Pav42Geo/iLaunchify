"""Pydantic schemas mirroring the TypeScript contracts in @ilaunchify/types.

Keep in sync with:
  - packages/types/src/compliance.ts
  - packages/db/prisma/schema.prisma (ComplianceCheck, NutritionProfile)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CheckRequest(BaseModel):
    """POST /v1/compliance/check body."""
    recipe_id: str = Field(alias="recipeId")
    rule_pack_id: str = Field(alias="rulePackId")
    triggered_by_user_id: str | None = Field(default=None, alias="triggeredByUserId")

    model_config = {"populate_by_name": True}


class NutritionRequest(BaseModel):
    """POST /v1/nutrition/calculate body."""
    recipe_id: str = Field(alias="recipeId")

    model_config = {"populate_by_name": True}


class LabelRenderRequest(BaseModel):
    """POST /v1/labels/render body."""
    recipe_id: str = Field(alias="recipeId")
    rule_pack_id: str = Field(alias="rulePackId")
    format: Literal["PDF", "SVG"] = "PDF"

    model_config = {"populate_by_name": True}


class Violation(BaseModel):
    severity: Literal["BLOCKING", "WARNING"]
    rule_id: str = Field(alias="ruleId")
    cfr_citation: str | None = Field(default=None, alias="cfrCitation")
    message: str
    field: str | None = None
    suggested_fix: str | None = Field(default=None, alias="suggestedFix")

    model_config = {"populate_by_name": True, "ser_by_alias": True}


class Disclosure(BaseModel):
    id: str
    text: str
    placement: str
    required: bool = True


class NutrientRow(BaseModel):
    id: str
    label: str
    amount: float | str          # string allows "less than 1 g" form
    unit: str | None = None
    percent_daily_value: int | None = Field(default=None, alias="percentDailyValue")
    indent: int = 0

    model_config = {"populate_by_name": True, "ser_by_alias": True}


class PanelData(BaseModel):
    format: Literal["STANDARD", "SUPPLEMENT_FACTS", "TABULAR", "LINEAR"]
    rows: list[NutrientRow]
    serving_size: str = Field(alias="servingSize")
    servings_per_container: str = Field(alias="servingsPerContainer")
    required_footer: str = Field(alias="requiredFooter")
    required_warnings: list[str] = Field(alias="requiredWarnings")

    model_config = {"populate_by_name": True, "ser_by_alias": True}


class ComplianceResult(BaseModel):
    passed: bool
    outcome: Literal["PASSED", "PASSED_WITH_WARNINGS", "FAILED"]
    violations: list[Violation]
    warnings: list[Violation]
    disclosures: list[Disclosure]
    panel_data: PanelData = Field(alias="panelData")
    audit_ref: str = Field(alias="auditRef")
    rule_pack_version: str = Field(alias="rulePackVersion")
    evaluated_at: str = Field(alias="evaluatedAt")

    model_config = {"populate_by_name": True, "ser_by_alias": True}


class NutrientProfile(BaseModel):
    """Raw per-serving nutrient amounts (before FDA rounding)."""
    calories: float = 0
    total_fat: float = Field(default=0, alias="totalFat")
    saturated_fat: float = Field(default=0, alias="saturatedFat")
    trans_fat: float = Field(default=0, alias="transFat")
    cholesterol: float = 0
    sodium: float = 0
    total_carbohydrate: float = Field(default=0, alias="totalCarbohydrate")
    dietary_fiber: float = Field(default=0, alias="dietaryFiber")
    total_sugars: float = Field(default=0, alias="totalSugars")
    added_sugars: float = Field(default=0, alias="addedSugars")
    protein: float = 0
    vitamin_d: float = Field(default=0, alias="vitaminD")
    calcium: float = 0
    iron: float = 0
    potassium: float = 0
    # Extras (voluntary)
    vitamin_a: float = Field(default=0, alias="vitaminA")
    vitamin_c: float = Field(default=0, alias="vitaminC")
    vitamin_e: float = Field(default=0, alias="vitaminE")

    model_config = {"populate_by_name": True, "ser_by_alias": True}
