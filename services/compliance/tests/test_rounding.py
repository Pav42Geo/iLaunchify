"""Tests for the FDA Appendix H rounding engine.

Each test corresponds to a row in the FDA Food Labeling Guide Appendix H
(docs/compliance-references/FDA-Food-Labeling-Guide.pdf, page 129–130).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.rounding import round_nutrient, round_percent_dv


@pytest.fixture(scope="module")
def rule_pack() -> dict:
    path = Path(__file__).parent.parent / "app" / "rule_packs" / "us-fda-food-2026.01.json"
    return json.loads(path.read_text())


@pytest.fixture(scope="module")
def rules(rule_pack) -> list[dict]:
    return rule_pack["roundingRules"]


class TestCaloriesRounding:
    """21 CFR 101.9(c)(1): < 5 = 0; ≤ 50 = nearest 5; > 50 = nearest 10."""

    def test_under_5_expresses_as_zero(self, rules):
        assert round_nutrient("calories", 3, rules) == "0"

    def test_at_5_rounds_to_5(self, rules):
        # 5 is ≤ 50, rounded to nearest 5
        assert round_nutrient("calories", 5, rules) == 5

    def test_48_rounds_to_50(self, rules):
        assert round_nutrient("calories", 48, rules) == 50

    def test_50_rounds_to_50(self, rules):
        assert round_nutrient("calories", 50, rules) == 50

    def test_55_rounds_to_60(self, rules):
        # > 50, nearest 10
        assert round_nutrient("calories", 55, rules) == 60

    def test_134_rounds_to_130(self, rules):
        assert round_nutrient("calories", 134, rules) == 130


class TestTotalFatRounding:
    """21 CFR 101.9(c)(2): < 0.5 = 0; < 5 = nearest 0.5; ≥ 5 = nearest 1."""

    def test_under_half_g_expresses_as_zero(self, rules):
        assert round_nutrient("totalFat", 0.3, rules) == "0"

    def test_quarter_below_5_rounds_to_quarter(self, rules):
        # 2.7 → nearest 0.5 → 2.5
        assert round_nutrient("totalFat", 2.7, rules) == 2.5

    def test_3_25_rounds_up(self, rules):
        # halfway-rounds-up rule: 3.25 is between 3.0 and 3.5 nearest 0.5 → 3.5
        assert round_nutrient("totalFat", 3.25, rules) == 3.5

    def test_5_rounds_to_5(self, rules):
        assert round_nutrient("totalFat", 5, rules) == 5

    def test_7_7_rounds_to_8(self, rules):
        # ≥ 5, nearest 1 → 8
        assert round_nutrient("totalFat", 7.7, rules) == 8


class TestSodiumRounding:
    """21 CFR 101.9(c)(4): < 5 = 0; 5-140 = nearest 5; > 140 = nearest 10."""

    def test_under_5_is_zero(self, rules):
        assert round_nutrient("sodium", 3, rules) == "0"

    def test_mid_range_rounds_to_5(self, rules):
        # 137 → between 5 and 140 → nearest 5 → 135
        assert round_nutrient("sodium", 137, rules) == 135

    def test_over_140_rounds_to_10(self, rules):
        # 247 → nearest 10 → 250
        assert round_nutrient("sodium", 247, rules) == 250


class TestCholesterolRounding:
    """21 CFR 101.9(c)(3): < 2 = 0; 2-5 = 'less than 5 mg'; > 5 = nearest 5."""

    def test_under_2_is_zero(self, rules):
        assert round_nutrient("cholesterol", 1, rules) == "0"

    def test_2_to_5_is_less_than_5(self, rules):
        assert round_nutrient("cholesterol", 3, rules) == "less than 5 mg"

    def test_over_5_rounds_to_5(self, rules):
        assert round_nutrient("cholesterol", 12, rules) == 10


class TestProteinRounding:
    """21 CFR 101.9(c)(7): < 0.5 = 0; < 1 = 'less than 1 g'; ≥ 1 = nearest 1."""

    def test_under_half_is_zero(self, rules):
        assert round_nutrient("protein", 0.3, rules) == "0"

    def test_half_to_one_is_less_than_one(self, rules):
        assert round_nutrient("protein", 0.7, rules) == "less than 1 g"

    def test_at_one_rounds_to_one(self, rules):
        assert round_nutrient("protein", 1, rules) == 1

    def test_high_protein_rounds_to_whole(self, rules):
        assert round_nutrient("protein", 22.7, rules) == 23


class TestPercentDV:
    """Vitamins & minerals: < 2% = '*' (or 0); ≤ 10% = nearest 2%; 10-50% = nearest 5%; > 50% = nearest 10%."""

    def test_below_2pct_returns_none(self, rule_pack):
        # 1mg calcium against 1300mg DV = 0.08% → *
        assert round_percent_dv(1, 1300, rule_pack) is None

    def test_low_pct_rounds_to_nearest_2(self, rule_pack):
        # 100mg calcium against 1300mg DV = 7.7% → nearest 2% → 8
        assert round_percent_dv(100, 1300, rule_pack) == 8

    def test_mid_pct_rounds_to_nearest_5(self, rule_pack):
        # 400mg calcium against 1300mg DV = 30.7% → nearest 5% → 30
        assert round_percent_dv(400, 1300, rule_pack) == 30

    def test_high_pct_rounds_to_nearest_10(self, rule_pack):
        # 1000mg calcium against 1300mg DV = 76.9% → nearest 10% → 80
        assert round_percent_dv(1000, 1300, rule_pack) == 80
