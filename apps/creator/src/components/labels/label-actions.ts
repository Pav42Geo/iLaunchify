'use server'

// Creator-side label data for download (task #125). RECOMPUTES the regulated
// panel(s) from the creator's own customized recipe (single source of truth —
// the @ilaunchify/nutrition engine, the same math the partner preview uses).
//
// Returns EVERY label: for a single product, one Nutrition Facts panel; for a
// MULTI-FLAVOR variant, one panel PER FLAVOR (each = the shared base recipe +
// that flavor's overlay ingredients), so the creator downloads them all.
//
// GATED: Builder+ only (Maker excluded) via the `label_file_download` plan
// feature — the button is hidden for Maker client-side; this is the hard
// server-side gate. The client renders each PanelData with packages/ui
// NutritionFactsSvg and downloads.

import { requireUser, getCreatorTier, hasTier } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { calculateLabel, toPanelData, toGrams, type RecipeRow } from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'

// FALCPA Big-9 → label display names + canonical print order (21 CFR 101.4(b)).
const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Milk', eggs: 'Eggs', egg: 'Eggs', fish: 'Fish',
  shellfish: 'Shellfish', crustacean_shellfish: 'Shellfish', crustacean: 'Shellfish',
  tree_nuts: 'Tree Nuts', treenuts: 'Tree Nuts', 'tree-nuts': 'Tree Nuts',
  peanuts: 'Peanuts', peanut: 'Peanuts', wheat: 'Wheat',
  soybeans: 'Soy', soybean: 'Soy', soy: 'Soy', sesame: 'Sesame',
}
const ALLERGEN_ORDER = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame']
function formatContains(flags: Iterable<string>): string {
  const names = new Set<string>()
  for (const f of flags) {
    const label = ALLERGEN_LABELS[String(f).toLowerCase().trim()]
    if (label) names.add(label)
  }
  return ALLERGEN_ORDER.filter((n) => names.has(n)).join(', ')
}

// One ingredient resolved with everything a label needs.
interface Line {
  row: RecipeRow
  declarationName: string
  allergens: string[]
}

export interface ProductLabel {
  domain: 'FOOD'
  productName: string
  flavorName?: string
  panel: PanelData
  ingredientStatement: string
  contains: string
}
export type ComputeLabelResult = { ok: true; data: ProductLabel[] } | { ok: false; error: string }

function buildLabel(
  baseLines: Line[],
  overlayLines: Line[],
  geo: { servingSizeG: number; servingsPerPackage: number; servingSizeDesc?: string },
  productName: string,
  flavorName?: string,
): ProductLabel {
  const lines = [...baseLines, ...overlayLines]
  const result = calculateLabel(lines.map((l) => l.row), { basis: 'serving', servingSizeG: geo.servingSizeG, servingsPerPackage: geo.servingsPerPackage })
  const panel = toPanelData(result, { suggestedServing: geo.servingSizeDesc, showVoluntaryFats: true })
  const ingredientStatement = [...lines]
    .sort((a, b) => b.row.quantity - a.row.quantity)
    .map((l) => l.declarationName.trim())
    .filter((n) => n.length > 0)
    .join(', ')
  const allergenSet = new Set<string>()
  for (const l of lines) l.allergens.forEach((a) => allergenSet.add(a))
  return { domain: 'FOOD', productName, flavorName, panel, ingredientStatement, contains: formatContains(allergenSet) }
}

/** Recompute every downloadable Nutrition Facts label for a creator-owned
 *  product. Builder+ gated. One panel for a single product; one PER FLAVOR for
 *  a multi-flavor variant. FOOD today; other domains return a friendly error. */
export async function computeProductLabel(productId: string): Promise<ComputeLabelResult> {
  const user = await requireUser()

  // Hard server-side gate — Builder+ (Maker excluded).
  const tier = await getCreatorTier(user.id)
  if (!hasTier(tier, 'builder')) {
    return { ok: false, error: 'Label downloads are available on the Builder and Agency plans.' }
  }

  // Authorize: the creator owns this product (brand → creatorProfile → user).
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      name: true,
      recipe: {
        select: {
          servingSizeG: true,
          servingsPerContainer: true,
          servingSizeDesc: true,
          ingredients: {
            orderBy: { position: 'asc' },
            select: {
              weightG: true,
              ingredient: { select: { name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true } },
            },
          },
        },
      },
      productTemplate: {
        select: { flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true, extras: true } } },
      },
    },
  })
  if (!product) return { ok: false, error: 'Product not found.' }
  if (!product.recipe || product.recipe.ingredients.length === 0) {
    return { ok: false, error: 'This product has no recipe yet — finish customizing it first.' }
  }

  const r = product.recipe
  const geo = { servingSizeG: Number(r.servingSizeG) || 1, servingsPerPackage: Number(r.servingsPerContainer) || 1, servingSizeDesc: r.servingSizeDesc ?? undefined }

  const baseLines: Line[] = r.ingredients.map((ri, i) => ({
    row: { id: `b${i}`, name: ri.ingredient.internalName ?? ri.ingredient.name, per100g: (ri.ingredient.nutritionPer100g ?? {}) as Record<string, number>, quantity: Number(ri.weightG) || 0, unit: 'g', category: 'base', selected: true },
    declarationName: (ri.ingredient.labelDeclarationName ?? ri.ingredient.internalName ?? ri.ingredient.name) ?? '',
    allergens: ri.ingredient.allergenFlags ?? [],
  }))

  // Flavors with real overlay lines (qty > 0). No flavors → single base label.
  type Extra = { ingredientId: string; name?: string; qty: number; unit: string }
  const flavors = (product.productTemplate?.flavorPresets ?? [])
    .map((f) => ({ name: f.name, extras: (Array.isArray(f.extras) ? (f.extras as Extra[]) : []).filter((e) => e && e.ingredientId && Number(e.qty) > 0) }))
    .filter((f) => f.name.trim().length > 0 && f.extras.length > 0)

  if (flavors.length === 0) {
    return { ok: true, data: [buildLabel(baseLines, [], geo, product.name)] }
  }

  // Resolve nutrition for all overlay ingredients in one query.
  const ids = [...new Set(flavors.flatMap((f) => f.extras.map((e) => e.ingredientId)))]
  const ingByIdRows = await prisma.ingredient.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
  })
  const ingById = new Map(ingByIdRows.map((x) => [x.id, x]))

  const labels = flavors.map((f) => {
    const overlay: Line[] = f.extras.map((e, i) => {
      const ing = ingById.get(e.ingredientId)
      const grams = toGrams(Number(e.qty) || 0, e.unit || 'g', { densityGPerMl: ing?.densityGPerML ?? undefined })
      return {
        row: { id: `f${i}`, name: ing?.internalName ?? ing?.name ?? e.name ?? 'Ingredient', per100g: (ing?.nutritionPer100g ?? {}) as Record<string, number>, quantity: grams, unit: 'g', category: 'base', selected: true },
        declarationName: (ing?.labelDeclarationName ?? ing?.internalName ?? ing?.name ?? e.name) ?? '',
        allergens: ing?.allergenFlags ?? [],
      }
    })
    return buildLabel(baseLines, overlay, geo, product.name, f.name)
  })

  return { ok: true, data: labels }
}
