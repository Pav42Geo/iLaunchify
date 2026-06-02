-- Mode 3 — Declare panel (Slice 4). Additive.
-- nutrientSource: COMPUTED (platform-summed, default) vs DECLARED (manufacturer-
-- entered). declaredPanel: the typed PanelData + statement + net qty + allergens.
-- isDeclaredPanelSynthetic: the one-off Whole Product ingredient that carries a
-- declared panel (hidden from the normal ingredient picker).
CREATE TYPE "NutrientSource" AS ENUM ('COMPUTED', 'DECLARED');
ALTER TABLE "ProductTemplate" ADD COLUMN "nutrientSource" "NutrientSource" NOT NULL DEFAULT 'COMPUTED';
ALTER TABLE "ProductTemplate" ADD COLUMN "declaredPanel" JSONB;
ALTER TABLE "Ingredient" ADD COLUMN "isDeclaredPanelSynthetic" BOOL NOT NULL DEFAULT false;
