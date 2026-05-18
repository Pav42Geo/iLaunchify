# iLaunchify Compliance Service

Python (FastAPI) service that owns nutrition calculation, compliance rule evaluation, and label PDF rendering.

## Why a separate service

- Compute-heavy work (rule evaluation against rule-pack JSON, PDF generation) doesn't belong on the Next.js edge runtime.
- Reuses the FOD calculation engine (Python, FastAPI) — a port to TypeScript would discard the audit's "keep" pile.
- Decouples release cadence: rule-pack updates can ship without redeploying the front of the house.

## V1 scope

| Endpoint | Description | Reads | Writes |
|---|---|---|---|
| `POST /v1/nutrition/calculate` | Sum ingredient nutrients into a NutritionProfile | Recipe, RecipeIngredient, Ingredient | NutritionProfile cache |
| `POST /v1/compliance/check` | Evaluate against the active RulePack for the product's market | Recipe, NutritionProfile, RulePackVersion | ComplianceCheck audit log |
| `POST /v1/labels/render` | Generate FDA Nutrition Facts or Supplement Facts PDF | NutritionProfile, Template | R2 (PDF bytes) |
| `GET /healthz` | Liveness | — | — |
| `GET /readyz` | Readiness (db ping) | — | — |

## Local dev

```bash
cd services/compliance
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Run
uvicorn app.main:app --reload
```

Or from the repo root:

```bash
pnpm compliance:dev
```

Service listens on `:8000` by default.

## Rule packs

Rule packs are JSON files version-controlled in `app/rule_packs/`. V1 ships:

- `us-fda-food-2026.json` — 21 CFR 101 (Nutrition Facts panel)
- `us-fda-supplements-2026.json` — 21 CFR 111 / DSHEA (Supplement Facts panel)

See `docs/COMPLIANCE.md` (root repo) for the rule-pack schema and how to add a new jurisdiction.

## What gets ported from FOD-reference

| FOD source | Lands here |
|---|---|
| `services/calculation/calc_service.py` | `app/calculation.py` (cleaned: hardcoded compliance check removed; replaced by rule-pack evaluator) |
| `frontend/src/data/usda/` + chunking scripts | `app/usda/` (data loader; chunks served from R2 in production) |
| `verify-usda-data.py` | `tests/test_usda_integrity.py` (test, not script) |
| `nutrition-label-jquery-plugin` (vendored) | **Replaced** by `app/label_render.py` using WeasyPrint |
