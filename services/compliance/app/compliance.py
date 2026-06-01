"""Rule evaluator.

Takes a calculated NutrientProfile + recipe metadata + a rule pack JSON and
returns a ComplianceResult: violations, warnings, required disclosures, and
the rounded panel data ready for rendering.

V1 evaluates:
  - Allergen statement (Contains: ...)
  - Iron warning (≥30 mg/serving for supplements per 21 CFR 101.17(e))
  - Drug-claim regex blocking on any provided claim text
  - Mandatory nutrient presence per panel format
  - Rounded panel data per Appendix H

V1.5+ adds: nutrient content claim qualification, authorized health claim
qualifying criteria, structure/function claim disclaimer enforcement.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from app.bioengineered import build_bioengineered_disclosure
from app.calculation import collect_allergens
from app.ingredient_statement import render_ingredient_statement
from app.overrides import apply_nutrient_overrides, merge_overrides
from app.rounding import round_nutrient, round_percent_dv
from app.rule_packs import (
    get_allergen_list,
    get_conditional_warnings,
    get_daily_values,
    get_prohibited_claim_patterns,
    get_rounding_rules,
)
from app.schemas import Disclosure, NutrientProfile, NutrientRow, PanelData, Violation


def evaluate_compliance(
    *,
    rule_pack: dict[str, Any],
    profile: NutrientProfile,
    recipe_ingredients: list[dict[str, Any]],
    serving_size_desc: str,
    servings_per_container: int,
    claim_texts: list[str] | None = None,
    product_category: str = "FOOD",
    # V1 Recipal-parity additions per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5c-e
    nutrient_overrides: list[dict[str, Any]] | None = None,
    preset_nutrient_overrides: list[dict[str, Any]] | None = None,
    ingredient_groups: list[dict[str, Any]] | None = None,
) -> tuple[list[Violation], list[Violation], list[Disclosure], PanelData]:
    """Run the full V1 compliance evaluation.

    Args:
        rule_pack: Loaded rule pack JSON.
        profile: Per-serving NutrientProfile from calculate_nutrition (raw).
        recipe_ingredients: Resolved ingredient rows (incl. label_declaration_name,
            ingredient_id, weight_g, allergens, bioengineered_status).
        serving_size_desc: Display string for the panel header.
        servings_per_container: Integer count for the panel header.
        claim_texts: Optional marketing claim strings to evaluate.
        product_category: 'FOOD' | 'SUPPLEMENT' | 'BEVERAGE_FUNCTIONAL'.
        nutrient_overrides: ProductTemplate.nutrientOverrides JSON (or None).
        preset_nutrient_overrides: FlavorPreset.nutrientOverrides JSON (or None);
            preset wins on conflict per §4a.5c.
        ingredient_groups: ProductTemplate.ingredientGroups JSON (or None).

    Returns: (violations, warnings, disclosures, panel_data)

    Note: nutrient overrides are applied AFTER summing-from-ingredients and
    BEFORE rounding/rendering. The overrides are persisted to the audit row
    by the caller (router) via apply_nutrient_overrides()'s second return.
    """
    violations: list[Violation] = []
    warnings: list[Violation] = []
    disclosures: list[Disclosure] = []

    # 0. Apply manual nutrient overrides per §4a.5c — preset wins on conflict.
    merged_overrides = merge_overrides(nutrient_overrides, preset_nutrient_overrides)
    profile, _applied_audit = apply_nutrient_overrides(profile, merged_overrides)

    # 1. Allergen detection — produce "Contains: ..." disclosure
    rule_pack_allergens = {a["id"]: a for a in get_allergen_list(rule_pack)}
    used_allergens = [a for a in collect_allergens(recipe_ingredients) if a in rule_pack_allergens]
    if used_allergens:
        labels = [rule_pack_allergens[a]["label"] for a in used_allergens]
        disclosures.append(
            Disclosure(
                id="contains_allergen_statement",
                text=f"Contains: {', '.join(labels)}",
                placement="ADJACENT_TO_INGREDIENT_LIST",
                required=True,
            )
        )

    # 2. Conditional warnings — iron threshold etc.
    for warning_def in get_conditional_warnings(rule_pack):
        if _conditional_warning_triggered(warning_def, profile):
            disclosures.append(
                Disclosure(
                    id=warning_def["id"],
                    text=warning_def["text"],
                    placement=warning_def.get("placement", "INFORMATION_PANEL"),
                    required=True,
                )
            )

    # 3. Drug-claim blocking
    if claim_texts:
        for pattern_def in get_prohibited_claim_patterns(rule_pack):
            severity = pattern_def.get("severity", "BLOCKING")
            for pat in pattern_def.get("patterns", []):
                regex = re.compile(pat, re.IGNORECASE)
                for text in claim_texts:
                    if regex.search(text):
                        v = Violation(
                            severity=severity,
                            ruleId=pattern_def["id"],
                            cfrCitation=pattern_def.get("cfrCitation"),
                            message=(
                                f"Prohibited claim pattern matched in: "
                                f'"{text[:80]}{"…" if len(text) > 80 else ""}"'
                            ),
                            field="claims",
                            suggestedFix=(
                                "Rephrase as a structure/function claim "
                                "(supplements) or remove the disease reference."
                            ),
                        )
                        if severity == "BLOCKING":
                            violations.append(v)
                        else:
                            warnings.append(v)

    # 4. Build the panel data (rounded values, %DV per rule pack)
    panel = _build_panel_data(
        rule_pack=rule_pack,
        profile=profile,
        serving_size_desc=serving_size_desc,
        servings_per_container=servings_per_container,
        product_category=product_category,
        disclosures=disclosures,
    )

    # 5. Structure/function claim disclaimer reminder for supplements
    if product_category == "SUPPLEMENT" and claim_texts:
        sf_block = rule_pack.get("structureFunctionClaims", {})
        if isinstance(sf_block, dict) and sf_block.get("permitted"):
            disclaimer = sf_block.get("requiredDisclaimer", {})
            disclosures.append(
                Disclosure(
                    id=disclaimer.get("id", "dshea_disclaimer"),
                    text=disclaimer.get("text", ""),
                    placement=disclaimer.get("placement", "ADJACENT_TO_CLAIM"),
                    required=True,
                )
            )

    # 6. Bioengineered disclosure per 7 CFR Part 66 (USDA BE Standard 2022).
    #    Triggered when any ingredient is flagged BIOENGINEERED or
    #    DERIVED_FROM_BIOENGINEERED. See app/bioengineered.py.
    be_disclosure = build_bioengineered_disclosure(recipe_ingredients)
    if be_disclosure is not None:
        disclosures.append(be_disclosure)

    # 7. Ingredient statement with FDA-allowed grouping (21 CFR 101.4).
    #    Rendered into a Disclosure with id 'ingredient_statement' so the
    #    label renderer can pick it up alongside the existing Contains:
    #    block. See app/ingredient_statement.py.
    if recipe_ingredients:
        statement = render_ingredient_statement(recipe_ingredients, ingredient_groups)
        if statement:
            disclosures.append(
                Disclosure(
                    id="ingredient_statement",
                    text=f"Ingredients: {statement}",
                    placement="INFORMATION_PANEL",
                    required=True,
                )
            )

    return violations, warnings, disclosures, panel


def compute_inputs_hash(*, recipe_id: str, rule_pack_id: str, profile: NutrientProfile) -> str:
    """Deterministic hash for ComplianceCheck.inputsHash — same inputs → same hash → same outputs.

    Lets us short-circuit a re-check when nothing has changed.
    """
    h = hashlib.sha256()
    h.update(recipe_id.encode())
    h.update(b"|")
    h.update(rule_pack_id.encode())
    h.update(b"|")
    h.update(profile.model_dump_json().encode())
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _conditional_warning_triggered(warning_def: dict[str, Any], profile: NutrientProfile) -> bool:
    trigger = warning_def.get("trigger", {})
    nutrient = trigger.get("nutrient")
    operator = trigger.get("operator", ">=")
    threshold = float(trigger.get("value", 0))

    if not nutrient:
        return False

    # Map camelCase rule-pack nutrient ids to NutrientProfile field names
    profile_value = getattr(profile, _snake_case(nutrient), None)
    if profile_value is None:
        return False

    if operator == ">=":
        return profile_value >= threshold
    if operator == ">":
        return profile_value > threshold
    if operator == "<=":
        return profile_value <= threshold
    if operator == "<":
        return profile_value < threshold
    if operator == "==":
        return profile_value == threshold
    return False


def _snake_case(camel: str) -> str:
    out: list[str] = []
    for ch in camel:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)


def _build_panel_data(
    *,
    rule_pack: dict[str, Any],
    profile: NutrientProfile,
    serving_size_desc: str,
    servings_per_container: int,
    product_category: str,
    disclosures: list[Disclosure],
) -> PanelData:
    rounding_rules = get_rounding_rules(rule_pack)
    daily_values = get_daily_values(rule_pack)
    is_supplement = product_category == "SUPPLEMENT"

    # Build rows in panel order (matches rule pack's mandatoryNutrients)
    rows: list[NutrientRow] = []
    for nutrient_def in rule_pack.get("mandatoryNutrients", []):
        nid = nutrient_def.get("id")
        if nid in (
            "servingSize",
            "servingsPerContainer",
            "amountPerServingHeader",
            "percentDailyValueHeader",
        ):
            continue
        if nid is None:
            continue

        raw_value = getattr(profile, _snake_case(nid), 0.0)
        rounded = round_nutrient(nid, raw_value, rounding_rules)

        pct_dv: int | None = None
        if nutrient_def.get("displayPercentDV"):
            dv_meta = daily_values.get(nid)
            if dv_meta is not None:
                pct_dv = round_percent_dv(raw_value, float(dv_meta["value"]), rule_pack)

        rows.append(
            NutrientRow(
                id=nid,
                label=nutrient_def.get("label", nid),
                amount=rounded,
                unit=_default_unit_for(nid, daily_values),
                percentDailyValue=pct_dv,
                indent=int(nutrient_def.get("indent", 0)),
            )
        )

    required_warnings = [d.text for d in disclosures if d.id.endswith("_warning")]

    return PanelData(
        format="SUPPLEMENT_FACTS" if is_supplement else "STANDARD",
        rows=rows,
        servingSize=serving_size_desc,
        servingsPerContainer=str(servings_per_container or "—"),
        requiredFooter="* % Daily Value based on a 2,000 calorie diet.",
        requiredWarnings=required_warnings,
    )


def _default_unit_for(nutrient_id: str, daily_values: dict[str, Any]) -> str | None:
    if nutrient_id == "calories":
        return None
    dv = daily_values.get(nutrient_id)
    if dv:
        return dv.get("unit")
    return None
