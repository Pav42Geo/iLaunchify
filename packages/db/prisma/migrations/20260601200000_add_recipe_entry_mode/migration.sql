-- Recipe entry mode (Slice 2 — Mode chooser). Analytics: which method the
-- partner used to build the recipe. Additive + nullable; legacy templates keep
-- NULL. The first method to add a slot owns the value (never overwritten).
CREATE TYPE "RecipeEntryMode" AS ENUM ('SEARCH_BUILD', 'AI_PARSER', 'DECLARED_PANEL');
ALTER TABLE "ProductTemplate" ADD COLUMN "recipeEntryMode" "RecipeEntryMode";
