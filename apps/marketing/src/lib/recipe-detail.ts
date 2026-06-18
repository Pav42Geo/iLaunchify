import 'server-only'
import { prisma } from '@ilaunchify/db'
import { calculateLabel, toPanelData, type RecipeRow } from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'
import type { IngredientRow } from '@ilaunchify/ui'

/**
 * Recipe-derived detail for the marketplace product page — the REAL base
 * ingredients + a REAL Nutrition Facts panel, computed from a ProductTemplate's
 * recipe slots via @ilaunchify/nutrition (the same engine the creator's label
 * download and the partner live preview use).
 *
 * This replaces the hand-authored `ingredients` + `nutrition` fixture fields on
 * the detail page for FOOD templates that actually carry recipe data. Returns
 * empty/null when the template has no slots, isn't FOOD, or the query fails —
 * the detail page then keeps the fixture, so fixture-only demo templates and
 * non-food domains render exactly as before.
 *
 * SCOPE (intentional):
 *   - FOOD domain only. Supplement / cosmetic / pet formulations live in
 *     ProductTemplate.formulationData (a different shape) and are computed by
 *     the non-food renderers — not wired here yet.
 *   - BASE recipe only (TemplateIngredientSlot.baseIngredient). Swaps + optional
 *     add-ons are surfaced as choices but the public panel is the default recipe
 *     (matches @ilaunchify/nutrition `publicSelection` semantics).
 *   - DECLARED templates (manufacturer-entered panel) return their stored
 *     declaredPanel instead of a computed one.
 */

export interface TemplateRecipeDetail {
  /** Base recipe rows (label-declaration names, %-of-recipe, allergens, swaps). */
  ingredients: IngredientRow[]
  /** Computed (or declared) Nutrition Facts panel; null → use the fixture. */
  nutrition: PanelData | null
}

const EMPTY: TemplateRecipeDetail = { ingredients: [], nutrition: null }

// FALCPA Big-9 allergen codes → display labels for the ingredient/allergen pills.
const ALLERGEN_DISPLAY: Record<string, string> = {
  milk: 'Milk', eggs: 'Eggs', egg: 'Eggs', fish: 'Fish',
  shellfish: 'Shellfish', crustacean_shellfish: 'Shellfish', crustacean: 'Shellfish',
  tree_nuts: 'Tree Nuts', treenuts: 'Tree Nuts', 'tree-nuts': 'Tree Nuts',
  peanuts: 'Peanuts', peanut: 'Peanuts', wheat: 'Wheat',
  soybeans: 'Soy', soybean: 'Soy', soy: 'Soy', sesame: 'Sesame', coconut: 'Coconut',
}
function displayAllergens(flags: string[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const f of flags ?? []) {
    const key = String(f).toLowerCase().trim()
    out.add(ALLERGEN_DISPLAY[key] ?? titleCase(key))
  }
  return [...out]
}
function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Narrow an unknown JSON blob to a PanelData (declared panels). */
function asPanelData(v: unknown): PanelData | null {
  if (v && typeof v === 'object' && 'format' in v && Array.isArray((v as { rows?: unknown }).rows)) {
    return v as PanelData
  }
  return null
}

export async function getTemplateRecipeDetail(slug: string): Promise<TemplateRecipeDetail> {
  try {
    const tmpl = await prisma.productTemplate.findUnique({
      where: { slug },
      select: {
        labelingType: true,
        nutrientSource: true,
        declaredPanel: true,
        intendedAgeGroup: true,
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          select: {
            weightG: true,
            label: true,
            baseIngredient: {
              select: {
                name: true,
                internalName: true,
                labelDeclarationName: true,
                nutritionPer100g: true,
                densityGPerML: true,
                allergenFlags: true,
              },
            },
            replacements: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                ingredient: {
                  select: { name: true, internalName: true, labelDeclarationName: true, allergenFlags: true },
                },
              },
            },
          },
        },
        // Representative serving geometry — the panel needs a serving size +
        // servings/container. Take the first active variant (single-flavor
        // templates have one; multi keep consistent geometry across flavors).
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { servingSizeG: true, servingsPerContainer: true, servingSizeDesc: true },
        },
      },
    })

    if (!tmpl) return EMPTY

    // --- ingredients (base recipe) ---
    const slots = tmpl.ingredientSlots
    const totalG = slots.reduce((sum, s) => sum + (Number(s.weightG) || 0), 0)
    const ingredients: IngredientRow[] = slots.map((s, i) => {
      const ing = s.baseIngredient
      const name = s.label ?? ing.labelDeclarationName ?? ing.internalName ?? ing.name
      const grams = Number(s.weightG) || 0
      return {
        id: `slot-${i}`,
        name,
        percent: totalG > 0 ? Math.round((grams / totalG) * 1000) / 10 : 0,
        allergens: displayAllergens(ing.allergenFlags),
        replacements: s.replacements.map((r) => ({
          id: r.id,
          name: r.ingredient.labelDeclarationName ?? r.ingredient.internalName ?? r.ingredient.name,
          allergens: displayAllergens(r.ingredient.allergenFlags),
        })),
      }
    })

    // --- nutrition panel ---
    let nutrition: PanelData | null = null

    if (tmpl.nutrientSource === 'DECLARED') {
      // Manufacturer-entered panel — use it verbatim (the page already shows the
      // "entered by the manufacturer" disclosure via getProductNutrientSource).
      nutrition = asPanelData(tmpl.declaredPanel)
    } else if (tmpl.labelingType === 'FOOD' && slots.length > 0) {
      const variant = tmpl.variants[0]
      const servingSizeG = Number(variant?.servingSizeG) || 0
      const servingsPerPackage = Number(variant?.servingsPerContainer) || 1
      // Need a real serving size to compute a per-serving panel; without a
      // variant we leave nutrition to the fixture.
      if (servingSizeG > 0) {
        const rows: RecipeRow[] = slots.map((s, i) => ({
          id: `b${i}`,
          name: s.baseIngredient.internalName ?? s.baseIngredient.name,
          per100g: (s.baseIngredient.nutritionPer100g ?? {}) as Record<string, number>,
          quantity: Number(s.weightG) || 0,
          unit: 'g',
          densityGPerMl: s.baseIngredient.densityGPerML ?? undefined,
          category: 'base',
          selected: true,
        }))
        const result = calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage }, {
          // Age-group-correct %DV (21 CFR 101.9(j)(5)) — infant/child panels.
          audience: tmpl.intendedAgeGroup ?? 'GENERAL',
        })
        nutrition = toPanelData(result, {
          suggestedServing: variant?.servingSizeDesc ?? undefined,
          showVoluntaryFats: true,
        })
      }
    }

    return { ingredients, nutrition }
  } catch (err) {
    console.warn('[recipe-detail] failed, using fixture:', (err as Error).message)
    return EMPTY
  }
}
