-- Per-ingredient cost for the recipe cost summary.
-- Additive + nullable: safe on existing rows, no data movement.
ALTER TABLE "TemplateIngredientSlot" ADD COLUMN "costPerKgCents" INT4;
