# Design Studio — "Product picture" details modal (proposal)

**Date:** 2026-07-04. Refactor the thin Details modal (today: Overview / Compliance / Manufacturing
text tabs in `ProductDetailsDrawer.tsx`) into the creator's **full order picture** — selected flavors'
recipes, real rendered Facts labels, single-vs-multi-flavor tabbing, aggregate + per-flavor labels, and
everything else that travels with the product. Everything below reads the creator's SELECTED subset
(docs/SELECTION_THREADING_AUDIT.md) — never the full template pool.

## Structure (driven by label topology)

**SINGLE product** → one scrolling panel, no flavor tabs:
`Overview · Recipe · Facts label (rendered) · Compliance · Packaging · Pricing · Certificates`

**MULTI-flavor** (`PER_FLAVOR` / `AGGREGATE`) → tabbed:
```
[ Overview ] [ Aggregate ]* [ Strawberry ] [ Chocolate ] …   (one tab per SELECTED flavor)
  Overview   → whole-product summary (identity · manufacturer · pricing/MOQ · packaging · compliance · certs)
  Aggregate* → the variety-pack multi-column VarietyFacts panel (all selected flavors side-by-side)
               + the aggregate/outer variety-pack label. Shown only when the pack carries one.
  <Flavor>   → that flavor's Statement of Identity · FINAL recipe (ingredient list) · its Facts label
```

## Real renderers + data (all already exist)

| Domain | Renderer (`@ilaunchify/ui`) | Data source (loader already computes) |
|---|---|---|
| Food (single) | `NutritionFactsRenderer` | `nutritionPanelData` |
| Food (variety, multi-col) | `VarietyFactsSvg` | `aggregateNutritionData` |
| Food (per flavor) | `NutritionFactsRenderer` per column | `getVarietyPreviewColumns(productId)` → per-flavor panels |
| Supplement | `SupplementFactsSvg` | `nonFoodPanelData.supplement` |
| Pet | `GuaranteedAnalysisSvg` | `nonFoodPanelData.aafco` |
| OTC | `DrugFactsSvg` | (sample today; engine wired) |
| Cosmetic | `InciDeclarationSvg` | `formulationData` |

Recipes: the final ingredient list per flavor = base recipe + `FlavorPreset.extras`, already available via
`resolveStudioNutrition(productId, flavorPresetId)` / `getVarietyPreviewColumns`, and by the pure
`resolveFlavorRecipe` in `@ilaunchify/orders`. So the modal renders **real** labels + recipes, not samples.

## The "whole picture" — everything that comes with the product

For the creator to see the full order/product before committing:

1. **Identity & ownership** — product name · brand · category · label domain · owner-pinned manufacturer.
2. **Selected configuration** — the chosen flavors (subset, swatch + name + SoI) · pack size + composition
   (units per flavor) · quantity / MOQ.
3. **Recipe (per selected flavor)** — final ingredient list (base + extras, FDA weight-descending) ·
   servings · serving size · allergens · bioengineered flag.
4. **Facts labels (rendered, real)** — per-flavor panel + the aggregate multi-column panel (or the single
   panel for a single product), domain-correct.
5. **Compliance** — required label type · mandatory/eligible phrases · claims · allergen statement ·
   bioengineered disclosure · any restricted-category flag.
6. **Packaging** — net quantity · container (packaging type · material · dimensions · fragility) · die-cut /
   print spec (bleed/trim/safe · DPI) · surfaces.
7. **Commercial** — per-flavor + pack pricing · MOQ · lead time · fulfillment mode · sample availability/credit.
8. **Retail identity** — GTIN/UPC · internal SKU · barcode mode.
9. **Certificates** — earned certs (thumbnails) + consent status.
10. **Finishes** — the finishes this product offers (foil/gloss/…).
11. **Label status** — which selected flavors already have a saved label (completeness) · design version.

Items 1–2, 5–10 are the "spec sheet"; 3–4 are the per-flavor depth; 11 ties to the safety/completeness work.

## Build split
- **Cowork (my file, no collision):** rebuild the modal in `ProductDetailsDrawer.tsx` — topology-driven
  single/multi tabs, render the Facts renderers, per-flavor recipe + SoI, the whole-picture sections.
  Define a rich `productPicture` prop contract.
- **Code (hot files):** pass the data into the drawer — `CanvasLayoutShell.tsx` forwards the panel data it
  already holds (`nutritionPanelData` / `aggregateNutritionData` / `nonFoodPanelData`) + per-flavor
  `getVarietyPreviewColumns` output + per-flavor recipes + the selected config; `page.tsx` resolves the
  per-flavor columns/recipes for the SELECTED flavors only.
- **Seed:** extend `seed-product-full.ts` so each flavor has distinct `extras` → the per-flavor panels
  actually differ (real end-to-end test).

## Phasing
1. **Cowork** builds the modal UI + contract (renders real labels/recipes from props).
2. **Code** wires the data forwarding (panel data + per-flavor columns/recipes + selected config).
3. **Seed** distinct per-flavor extras; test single-product AND a 2-of-6 variety pack.
