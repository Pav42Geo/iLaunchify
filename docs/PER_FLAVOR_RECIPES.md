# Per-flavor recipes + per-flavor lead time — spec

Status: PROPOSED · 2026-06-30 · Pavel-locked decisions in §1 · additive schema · NOT built
Supersedes the per-flavor "extras overlay" UX with full independent per-flavor recipes.

## 1. Locked decisions (Pavel 2026-06-30)

1. **Each flavor has its OWN full recipe** (base + replaceable + optional), stored
   independently — NOT an overlay/diff on a shared base. A **Duplicate to…** action
   is the productivity tool: author one flavor, copy it to selected/all flavors,
   then adjust each.
2. **Recipe step = flavor TABS.** The flavor "cards" go away. Tabs at the top of
   the recipe area; the active tab IS that flavor's editable recipe; the Facts
   label switches with the tab. A **Base** tab holds a starting recipe to author +
   duplicate from (single-flavor products use it as their only recipe).
3. **Recipe library**: keep two tabs — **My recipes** = this partner's product
   recipes (incl. the current product's flavors, to copy across flavors), and
   **Recipe templates** = a GLOBAL/platform recipe library. Both can **Apply to**
   the active flavor / base / all flavors.
4. **Per-flavor lead time** (optional override). Per-flavor wins; the product
   quotes the **max** effective lead across involved flavors; soft non-blocking
   warning when the product standard exceeds every flavor's lead.
5. **Marketplace** shows + navigates each flavor's recipe (flavor tabs on the PDP
   recipe studio; Facts swap per flavor).

## 2. Today (what exists)

- A flavor is an **overlay**: shared base `TemplateIngredientSlot[]` + each
  `FlavorPreset.extras` (flavor-only ADDITIONS). The nutrition engine already
  computes per-flavor Facts (base + that flavor's extras). It can only ADD per
  flavor — no per-flavor adjust/swap/remove of base slots.
- Recipe step (`RecipeBuilderStep.tsx`): base recipe builder + flavor "cards"
  (`flavtabs`) editing an extras table; tabs `BUILD / INGREDIENTS / ALLERGENS /
  COST / LABEL / MY RECIPES / RECIPE TEMPLATES`. "My recipes" lists owned
  ProductTemplates' base slots (`listMyRecipes`); "Recipe templates" = code-defined
  curated starters (`RECIPE_TEMPLATES`).
- No per-flavor lead time (FlavorPreset has none).

## 3. Data model (additive — CockroachDB-safe, no drops)

### 3.1 Per-flavor recipe
A flavor owns a full recipe = its own slots (+ replacements + optionals), mirroring
the template-level recipe models.

```prisma
model FlavorRecipeSlot {
  id               String   @id @default(uuid())
  flavorPresetId   String
  baseIngredientId String
  weightG          Decimal
  costPerKgCents   Int?
  displayOrder     Int      @default(0)
  allowReplacement Boolean  @default(false)
  label            String?
  description      String?
  flavorPreset     FlavorPreset @relation(fields: [flavorPresetId], references: [id], onDelete: Cascade)
  baseIngredient   Ingredient   @relation(fields: [baseIngredientId], references: [id])
  replacements     FlavorRecipeReplacement[]
  optionalIngredients FlavorRecipeOptional[]
  @@index([flavorPresetId, displayOrder])
}
model FlavorRecipeReplacement { id String @id @default(uuid()); slotId String; ingredientId String; weightGOverride Decimal?; displayOrder Int @default(0); slot FlavorRecipeSlot @relation(fields:[slotId],references:[id],onDelete:Cascade); … }
model FlavorRecipeOptional    { id String @id @default(uuid()); flavorPresetId String; ingredientId String; weightG Decimal; displayOrder Int @default(0); calloutText String?; flavorPreset FlavorPreset @relation(fields:[flavorPresetId],references:[id],onDelete:Cascade); … }
```

- `FlavorPreset` gains back-relations `recipeSlots FlavorRecipeSlot[]` +
  `recipeOptionals FlavorRecipeOptional[]`. `extras`/`slotResolution` stay
  (legacy, not dropped); the new slots are the source of truth for multi-flavor.
- **Single-flavor** products are unchanged — they use the template
  `TemplateIngredientSlot` (the "Base" recipe). Multi-flavor: per-flavor slots win.
- **Seeding a flavor**: when a flavor is created / "Duplicate from Base" is used,
  its `FlavorRecipeSlot[]` are copied from the Base recipe (or another flavor).

### 3.2 Per-flavor lead time
```prisma
// FlavorPreset
leadTimeDays Int?   // optional override of the product standard lead (null = use standard)
```
Plus a clearer label for the existing product-level field: "Repeat lead time" →
surfaced as **"Standard lead time"** (still `ProductTemplate.leadTimeRepeatDays`).

## 4. Lead-time resolution (§1.4)

- **Per flavor**, effective lead = `flavor.leadTimeDays ?? standardLead`.
- **Effective product / order lead** = `max(effective lead over the involved
  flavors)` + the existing flavor-changeover (`applyFlavorChangeover`). For a whole
  product (no specific selection) the headline = max across ALL flavors.
- **No-disable**: the standard lead stays (fallback + single-flavor + the floor for
  any un-overridden flavor). A flavor override can be LOWER than the standard.
- **Soft warning** (builder, non-blocking) when `standardLead > max(flavor
  overrides that are set)` and every flavor is overridden: "Standard lead (21d)
  exceeds every flavor (max 19d) — the product will quote 19d."
- **Display**: card = worst-case/range; PDP = live for the chosen flavors; **flavor
  card on the PDP gets its lead under the price**.

## 5. Recipe-step refactor (§1.2-1.3)

- Replace the flavor cards with a **flavor tab bar** in the recipe area: `[ Base ]
  [ Flavor A ] [ Flavor B ] … [ + ]`. The active tab renders the SAME full recipe
  builder (base slots + replaceable + optional + IngredientPicker) bound to that
  flavor's `FlavorRecipeSlot[]`. The Base tab edits the template recipe.
- **Facts label** (right rail) recomputes for the active tab's recipe.
- **Duplicate to…** control: copy the active recipe → chosen flavors / all flavors
  (overwrites their slots; confirm before overwrite). Also "Apply Base to all".
- **My recipes / Recipe templates** apply targets the **active flavor** (or base /
  all). My recipes = partner's product recipes; Recipe templates = global library
  (promote `RECIPE_TEMPLATES` to a real `GlobalRecipeTemplate` model OR keep curated
  for V1 — decide at build; the apply-to-flavor wiring is the same).
- Autosave + audit per the existing pattern; new `saveFlavorRecipe(flavorPresetId,
  slots)` + `duplicateFlavorRecipe(fromId, toIds[])` actions.

## 6. Marketplace (§1.5)

- PDP recipe studio (`RecipeNutritionStudio`) gains **flavor tabs**; selecting a
  flavor shows that flavor's recipe (ingredients + swaps + optionals) and swaps the
  Facts panel. Loader resolves each flavor's `FlavorRecipeSlot[]` → engine.
- Single-flavor / base-only products render exactly as today.

## 7. Slices

1. **Schema + engine + loaders** — `FlavorRecipeSlot`(+children), `FlavorPreset.
   leadTimeDays`; per-flavor recipe → nutrition engine; lead-time resolver
   (`effectiveLead`) + tests. Cast-guarded. (no UI yet)
2. **Recipe-step tabs** — flavor tab bar + per-flavor recipe editor + Facts switch
   + Duplicate-to + library apply-to-flavor; `saveFlavorRecipe`/`duplicateFlavorRecipe`.
3. **Per-flavor lead time** — builder field per flavor + "Standard lead" rename +
   soft warning; thread effective lead to cards/PDP + flavor-card lead under price.
4. **Marketplace** — PDP recipe studio flavor tabs + Facts swap.
5. **Review/Passport + admin** — show per-flavor recipes + leads.
6. **Migration/backfill** — for existing multi-flavor products, seed each flavor's
   `FlavorRecipeSlot[]` from base + its `extras` (one-time script); demo seed authors
   independent flavor recipes.

## 8. Open / build-time decisions

- Global recipe templates: promote to a `GlobalRecipeTemplate` model (admin-curated)
  vs keep the curated code list for V1. (Lean: model, so admins can grow it.)
- Duplicate overwrite vs merge (lean: overwrite with confirm).
- Whether the Base tab is editable independently or is just the single-flavor recipe
  (lean: Base = template recipe = single-flavor recipe + the duplicate source).
