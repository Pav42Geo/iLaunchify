import 'server-only'
import { prisma } from '@ilaunchify/db'
import { calculateLabel, toPanelData, composeMarketplaceRows, type NutritionAudience } from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'
import type { IngredientRow, IngredientAddOn } from '@ilaunchify/ui'

// Slice 4 — per-flavor recipe views for the marketplace PDP Recipe & nutrition
// studio. Each multi-flavor product's flavors (FlavorPreset rows that carry an
// independent recipe, FlavorRecipeSlot[]) become a tab: switching shows that
// flavor's ingredients + computed Nutrition Facts. Mirrors getTemplateRecipeDetail
// but reads the flavor's own slots/optionals. Empty array → no flavor tabs (the
// studio keeps showing the shared base recipe).

export interface FlavorRecipeView {
  id: string // FlavorPreset id (routes per-flavor recompute)
  name: string
  swatchHex: string | null
  ingredients: IngredientRow[]
  addOns: IngredientAddOn[]
  nutrition: PanelData | null
}

function displayAllergens(flags: string[] | null | undefined): string[] {
  return (flags ?? []).map((f) => f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
}

const ING_SELECT = { name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true } as const

interface ResolvedIng { name: string; internalName: string | null; labelDeclarationName: string | null; nutritionPer100g: unknown; densityGPerML: number | null; allergenFlags: string[] | null }
interface FlavorRow { weightG: unknown; label?: string | null; baseIngredient: ResolvedIng; replacements: { id: string; ingredient: ResolvedIng }[] }
interface FlavorOpt { id: string; calloutText: string | null; ingredient: ResolvedIng }
interface FlavorPresetRow {
  id: string; name: string; swatchHex: string | null
  recipeSlots: FlavorRow[]
  recipeOptionals: FlavorOpt[]
}

export async function getTemplateFlavorRecipes(slug: string): Promise<FlavorRecipeView[]> {
  try {
    const tmpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        labelingType: string; nutrientSource: string; intendedAgeGroup: string | null
        variants: { servingSizeG: unknown; servingsPerContainer: unknown; servingSizeDesc: string | null }[]
        flavorPresets: FlavorPresetRow[]
      } | null> }
    }).productTemplate.findUnique({
      where: { slug },
      select: {
        labelingType: true,
        nutrientSource: true,
        intendedAgeGroup: true,
        variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1, select: { servingSizeG: true, servingsPerContainer: true, servingSizeDesc: true } },
        flavorPresets: {
          where: { status: 'ACTIVE', recipeSlots: { some: {} } },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true, swatchHex: true,
            recipeSlots: {
              orderBy: { displayOrder: 'asc' },
              select: { weightG: true, label: true, baseIngredient: { select: ING_SELECT }, replacements: { orderBy: { displayOrder: 'asc' }, select: { id: true, ingredient: { select: ING_SELECT } } } },
            },
            recipeOptionals: { orderBy: { displayOrder: 'asc' }, select: { id: true, calloutText: true, ingredient: { select: ING_SELECT } } },
          },
        },
      },
    })

    if (!tmpl || !tmpl.flavorPresets?.length) return []

    const variant = tmpl.variants[0]
    const servingSizeG = Number(variant?.servingSizeG) || 0
    const servingsPerPackage = Number(variant?.servingsPerContainer) || 1
    const canComputeFacts = tmpl.labelingType === 'FOOD' && tmpl.nutrientSource !== 'DECLARED' && servingSizeG > 0

    return tmpl.flavorPresets.map((fp) => {
      const totalG = fp.recipeSlots.reduce((sum, s) => sum + (Number(s.weightG) || 0), 0)
      const ingredients: IngredientRow[] = fp.recipeSlots.map((s, i) => {
        const ing = s.baseIngredient
        const grams = Number(s.weightG) || 0
        return {
          id: `slot-${i}`,
          name: s.label ?? ing.labelDeclarationName ?? ing.internalName ?? ing.name,
          percent: totalG > 0 ? Math.round((grams / totalG) * 1000) / 10 : 0,
          allergens: displayAllergens(ing.allergenFlags),
          replacements: s.replacements.map((r) => ({
            id: r.id,
            name: r.ingredient.labelDeclarationName ?? r.ingredient.internalName ?? r.ingredient.name,
            allergens: displayAllergens(r.ingredient.allergenFlags),
          })),
        }
      })
      const addOns: IngredientAddOn[] = fp.recipeOptionals.map((o) => ({
        id: o.id,
        name: o.ingredient.labelDeclarationName ?? o.ingredient.internalName ?? o.ingredient.name,
        description: o.calloutText ?? undefined,
        allergens: displayAllergens(o.ingredient.allergenFlags),
      }))

      let nutrition: PanelData | null = null
      if (canComputeFacts && fp.recipeSlots.length > 0) {
        const rows = composeMarketplaceRows(
          fp.recipeSlots.map((s) => ({
            weightG: Number(s.weightG) || 0,
            base: { name: s.baseIngredient.internalName ?? s.baseIngredient.name, per100g: (s.baseIngredient.nutritionPer100g ?? {}) as Record<string, number>, densityGPerMl: s.baseIngredient.densityGPerML ?? undefined },
          })),
          [],
          {},
        )
        const result = calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage }, { audience: (tmpl.intendedAgeGroup ?? 'GENERAL') as NutritionAudience })
        nutrition = toPanelData(result, { suggestedServing: variant?.servingSizeDesc ?? undefined, showVoluntaryFats: true })
      }

      return { id: fp.id, name: fp.name, swatchHex: fp.swatchHex, ingredients, addOns, nutrition }
    })
  } catch (err) {
    console.warn('[flavor-recipe-detail] failed:', (err as Error).message)
    return []
  }
}
