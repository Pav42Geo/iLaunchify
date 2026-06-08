# Handoff to Code — option-overlay binding + engine merge

Owner of design: `docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md` §1, §12b (read those first).
This handoff is the one remaining slice of the configurator: letting a
label-affecting option value change the recipe, and having the Facts panel +
allergens recompute per resolved SKU. Everything upstream (axis capture,
deltas, schema, persistence) is already built and migrated.

## What already exists (don't rebuild)

- **Schema** (`packages/db/prisma/schema.prisma`, migrated): `ProductOptionAxis`
  (`affectsLabel`, `editableByCreator`, `boundSlotId`), `ProductOptionValue`
  (`overlayOp` enum NONE|SWAP|ADD|REMOVE default NONE, `recipeOverlay Json?`,
  the lead/cost/MOQ deltas), `OverlayOp` enum.
- **Capture UI**: `apps/partner/.../products/new/OptionAxesCard.tsx` — manufacturer
  defines axes + values + `affectsLabel` + deltas. Local state today.
- **Persistence**: `saveOptionAxes(productTemplateId, OptionAxisInput[])` in
  `apps/partner/.../products/new/build-actions.ts`. `OptionAxisInput.boundSlotId`
  and `OptionValueInput.overlayOp` / `recipeOverlay` are ALREADY accepted and
  written (default NONE/null). You only need to set them from the binding UI.
- **Base recipe slots**: `TemplateIngredientSlot` (baseIngredientId, weightG,
  displayOrder) — these are the slots a SWAP/REMOVE axis binds to.
- **Engine** (`packages/nutrition/src/`): `calculateLabel(ingredients, geometry)`,
  and the selection helpers `publicSelection(rows)` / `previewSelection(rows)`
  in `index.ts` that turn `RecipeRow[]` → `IngredientInput[]`. `FlavorPreset`
  already overlays via `slotResolution` — mirror that pattern.

## Part A — Recipe-step binding UI (partner app, additive)

1. **Lift `axes` to shared state** in `GuidedBuilder.tsx` (mirror how `flavors`
   is lifted): `const [axes, setAxes] = useState<...>([])`, move the
   `saveOptionAxes` debounce autosave UP to GuidedBuilder so it persists from any
   step, and pass `axes`/`onAxes` to BOTH `VariantsPacksStep` (→ `OptionAxesCard`)
   and `RecipeBuilderStep`. Convert `OptionAxesCard` to controlled props (drop its
   local state + its own autosave).
2. In **`RecipeBuilderStep`**, add a `Label options` section (additive — do not
   refactor the existing recipe/flavor UI). For each axis with `affectsLabel === true`:
   - **Bind the slot** (SWAP/REMOVE): a dropdown of the base recipe slots (the
     step's `rows` where `category === 'base'`) → sets `axis.boundSlotId`.
   - **Per value**: pick `overlayOp` (Swap / Add / Remove / None) and, for
     Swap/Add, an ingredient via the existing `IngredientPicker`
     (`../[id]/edit/cards/IngredientPicker`) → writes `recipeOverlay`:
     `SWAP {toIngredientId}` · `ADD {addIngredientId,qty,unit}` · `REMOVE {}`.
   - Default value's op is the base slot's current ingredient (keeps the default
     configuration coherent).
3. Persistence is automatic once `axes` carries `boundSlotId`/`overlayOp`/
   `recipeOverlay` — `saveOptionAxes` already writes them.

## Part B — Engine merge (additive, low-risk)

**Do NOT rewrite `calculateLabel`.** Add a new selection helper beside
`publicSelection`/`previewSelection` in `packages/nutrition/src/index.ts`:

```ts
export interface OptionOverlay { op: 'SWAP'|'ADD'|'REMOVE'; slotId?: string;
  ingredient?: IngredientInput; }  // resolved value's overlay

/** Resolve the ingredient list for one configured SKU: base (+swapped
 *  replaceables) then apply the flavor overlay then each selected option overlay.
 *  Precedence on slotId conflict: option > flavor > base (last writer wins). */
export function resolveConfiguredSelection(
  rows: RecipeRow[], flavorOverlay: OptionOverlay[], optionOverlays: OptionOverlay[],
): IngredientInput[] { /* base list → apply SWAP(slotId), REMOVE(slotId), ADD(ingredient) */ }
```

Then the caller does `calculateLabel(resolveConfiguredSelection(...), geometry)`.
Allergens need NO special handling — `calculateLabel` already derives them from
the ingredient list, so swap/add/remove propagate automatically.

Wire the FactsPanel preview in `RecipeBuilderStep` to call it for the selected
combination (a small combo picker: choose one value per editable label-affecting
axis → preview that SKU's panel).

> **Single-writer caveat:** `@ilaunchify/nutrition` is shared (creator order-time
> recalc + compliance scan read it) and on Code's hot path. The change is purely
> additive (one new exported helper, no edit to `calculateLabel`), but coordinate
> before committing — see [[ilaunchify-two-agent-hot-file-collisions]].

## Part C — Marketplace consumption (downstream, read-only contract)

The creator configurator reads `editableByCreator` axes + values, lets the brand
pick one per axis, then computes the SKU's quote (spec §9 formula) AND its label
via `resolveConfiguredSelection`. Each sold SKU = one combination = one
deterministic panel. Out of scope for this handoff; documented for continuity.

## Guardrails to implement (spec §12b)

- Default `overlayOp = NONE`; if a value's axis `affectsLabel` but the value is
  still NONE, show an inline warning.
- Live **"this creates N distinct labels"** counter = Π(values of each label-
  affecting editable axis). V1 **soft-cap label-affecting axes at 2**.
- A label-affecting axis (or new value) is a recipe variant → route through
  `RECIPE_CHANGE` / `FLAVOR_ADD` approval (`ProductChangeApprovalRule`, #7).

## Acceptance

- Manufacturer adds a "Sweetener" axis (affectsLabel), binds it to the base
  sweetener slot, sets Cane sugar (default) / Stevia values → previewing
  "Stevia" recomputes sugars/calories AND the ingredient statement.
- A swap that changes an allergen (e.g. peanut → sunflower oil) updates the
  allergen line with no extra step.
- Axes/values + boundSlotId + overlayOp + recipeOverlay survive reload.
- `pnpm --filter @ilaunchify/nutrition test` stays green (add a merge case).
- `pnpm typecheck` clean across partner + nutrition.
