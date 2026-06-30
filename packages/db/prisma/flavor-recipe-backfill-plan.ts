// Pure transforms for the Slice 6 per-flavor recipe backfill
// (docs/PER_FLAVOR_RECIPES.md §7.6). No Prisma / no I/O — unit-testable.
// The driver lives in backfill-flavor-recipes.ts.

/** A flavor `extras` entry. ingredientId is required to become a recipe slot
 *  (FlavorRecipeSlot.baseIngredientId is an FK); custom/no-id extras are skipped. */
export interface ExtraEntry {
  ingredientId?: string | null
  name?: string | null
  qty?: number | null
  unit?: string | null
}

/** Convert an extras quantity to grams. Mass units convert exactly; an unknown
 *  or missing unit is assumed to already be grams (flagged via `assumed`). */
export function extrasToGrams(qty: number | null | undefined, unit: string | null | undefined): { grams: number; assumed: boolean } {
  const q = typeof qty === 'number' && Number.isFinite(qty) ? qty : 0
  switch ((unit ?? '').trim().toLowerCase()) {
    case 'g':
    case 'gram':
    case 'grams':
      return { grams: q, assumed: false }
    case 'mg':
    case 'milligram':
    case 'milligrams':
      return { grams: q / 1000, assumed: false }
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return { grams: q * 1000, assumed: false }
    case 'oz':
    case 'ounce':
    case 'ounces':
      return { grams: q * 28.349523125, assumed: false }
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return { grams: q * 453.59237, assumed: false }
    default:
      return { grams: q, assumed: true } // unknown/empty → treat as grams
  }
}

export interface PlanReplacement { ingredientId: string; weightGOverride: string | null; displayOrder: number; calloutText: string | null }
export interface PlanSlot { baseIngredientId: string; weightG: string; costPerKgCents: number | null; displayOrder: number; allowReplacement: boolean; label: string | null; description: string | null; origin: 'base' | 'extra'; replacements: PlanReplacement[] }
export interface PlanOptional { ingredientId: string; weightG: string; displayOrder: number; calloutText: string | null }

export interface BaseSlotInput {
  baseIngredientId: string
  weightG: { toString(): string }
  costPerKgCents: number | null
  displayOrder: number
  allowReplacement: boolean
  label: string | null
  description: string | null
  replacements: { ingredientId: string; weightGOverride: { toString(): string } | null; displayOrder: number; calloutText: string | null }[]
}
export interface BaseOptionalInput { ingredientId: string; weightG: { toString(): string }; displayOrder: number; calloutText: string | null }

export interface FlavorRecipePlan { slots: PlanSlot[]; optionals: PlanOptional[]; skippedExtras: ExtraEntry[] }

/** Build the per-flavor recipe plan: clone the base slots/replacements/optionals,
 *  then append the flavor's extras (that have an ingredientId) as extra slots.
 *  Duplicate optional ingredients are de-duped (FlavorRecipeOptional is unique
 *  per (flavor, ingredient)). */
export function planFlavorRecipe(base: { slots: BaseSlotInput[]; optionals: BaseOptionalInput[] }, extras: ExtraEntry[]): FlavorRecipePlan {
  const slots: PlanSlot[] = base.slots
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((s, i) => ({
      baseIngredientId: s.baseIngredientId,
      weightG: s.weightG.toString(),
      costPerKgCents: s.costPerKgCents,
      displayOrder: i,
      allowReplacement: s.allowReplacement,
      label: s.label,
      description: s.description,
      origin: 'base' as const,
      replacements: s.replacements
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((r, ri) => ({ ingredientId: r.ingredientId, weightGOverride: r.weightGOverride ? r.weightGOverride.toString() : null, displayOrder: ri, calloutText: r.calloutText })),
    }))

  const skippedExtras: ExtraEntry[] = []
  let order = slots.length
  for (const e of extras) {
    if (!e.ingredientId) { skippedExtras.push(e); continue }
    const { grams } = extrasToGrams(e.qty, e.unit)
    slots.push({
      baseIngredientId: e.ingredientId,
      weightG: String(grams),
      costPerKgCents: null,
      displayOrder: order++,
      allowReplacement: false,
      label: e.name ?? null,
      description: null,
      origin: 'extra',
      replacements: [],
    })
  }

  // De-dupe optionals by ingredientId (unique constraint on the table).
  const seen = new Set<string>()
  const optionals: PlanOptional[] = []
  for (const o of base.optionals.slice().sort((a, b) => a.displayOrder - b.displayOrder)) {
    if (seen.has(o.ingredientId)) continue
    seen.add(o.ingredientId)
    optionals.push({ ingredientId: o.ingredientId, weightG: o.weightG.toString(), displayOrder: optionals.length, calloutText: o.calloutText })
  }

  return { slots, optionals, skippedExtras }
}

/** Parse the FlavorPreset.extras JSON into a typed array, tolerating null/garbage. */
export function parseExtras(raw: unknown): ExtraEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      ingredientId: typeof x.ingredientId === 'string' ? x.ingredientId : null,
      name: typeof x.name === 'string' ? x.name : null,
      qty: typeof x.qty === 'number' ? x.qty : null,
      unit: typeof x.unit === 'string' ? x.unit : null,
    }))
}
