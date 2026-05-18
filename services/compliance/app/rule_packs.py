"""Rule pack JSON loader.

Rule packs live at app/rule_packs/*.json. Each version is a separate file.
This module loads + caches them and exposes typed accessors.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import settings


@lru_cache(maxsize=32)
def load_rule_pack(rule_pack_id_with_version: str) -> dict[str, Any]:
    """Load a rule pack by its external id + version (e.g. 'us-fda-food-2026.01').

    Maps id → app/rule_packs/{id}.json.
    """
    filename = f"{rule_pack_id_with_version}.json"
    path = settings.rule_packs_dir / filename
    if not path.exists():
        raise FileNotFoundError(f"Rule pack not found: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


def get_latest_rule_pack_for_category(category: str) -> dict[str, Any]:
    """Pick the highest-numbered rule pack file for a product category.

    V1 ships exactly one version per category, but this future-proofs against
    monthly/quarterly rule pack revisions.
    """
    files = list(settings.rule_packs_dir.glob("us-fda-*.json"))
    candidates = [f for f in files if _category_matches(f, category)]
    if not candidates:
        raise FileNotFoundError(f"No rule pack found for category {category}")
    # Sort by filename (version is in the filename, e.g. us-fda-food-2026.01)
    candidates.sort(reverse=True)
    return load_rule_pack(candidates[0].stem)


def _category_matches(path: Path, category: str) -> bool:
    if category in ("FOOD", "BEVERAGE_FUNCTIONAL") and "food" in path.stem:
        return True
    if category == "SUPPLEMENT" and "supplements" in path.stem:
        return True
    return False


def get_daily_values(rule_pack: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Extract the Daily Values table from a rule pack."""
    return rule_pack.get("dailyValues", {})


def get_rounding_rules(rule_pack: dict[str, Any]) -> list[dict[str, Any]]:
    return rule_pack.get("roundingRules", [])


def get_allergen_list(rule_pack: dict[str, Any]) -> list[dict[str, Any]]:
    return rule_pack.get("allergenList", [])


def get_prohibited_claim_patterns(rule_pack: dict[str, Any]) -> list[dict[str, Any]]:
    return rule_pack.get("prohibitedClaims", [])


def get_conditional_warnings(rule_pack: dict[str, Any]) -> list[dict[str, Any]]:
    return rule_pack.get("conditionalWarnings", [])
