'use server'

// Live Nutrition Facts recompute for the marketplace Customize rail.
//
// When a creator swaps a replaceable slot OR ticks an optional add-on, the panel
// must recompute. Rather than ship per-option nutrient deltas + the FDA rounding
// rules to the browser (error-prone, and the "labels are deterministic /
// build-to-spec" rule says the engine is the single source of truth), we re-run
// the SAME engine (@ilaunchify/nutrition · calculateLabel → toPanelData)
// server-side with the resolved composition. The resolution itself is the pure,
// unit-tested composeMarketplaceRows — so swaps respect weightGOverride and
// optional add-ons contribute their full nutrition.
//
// Scope: FOOD, COMPUTED templates. DECLARED panels are static (one synthetic
// slot, no options) and non-food domains don't use this rail → null.

import { prisma } from '@ilaunchify/db'
import {
  calculateLabel,
  toPanelData,
  composeMarketplaceRows,
  type RecomposeSlot,
  type RecomposeOptional,
} from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'

export interface RecomputeSelection {
  /** Key `slot-${index}` → TemplateIngredientReplacement.id ('__default'/absent = base). */
  replacements?: Record<string, string>
  /** Selected TemplateOptionalIngredient ids. */
  addOnIds?: string[]
}

/**
 * Recompute the Nutrition Facts panel for a FOOD template under the given
 * customization. Returns null when the product can't be recomputed (declared /
 * non-food / no serving geometry / error) — the caller keeps its base panel.
 */
export async function recomputeMarketplacePanel(
  slug: string,
  selection: RecomputeSelection,
): Promise<PanelData | null> {
  try {
    const tmpl = await prisma.productTemplate.findUnique({
      where: { slug },
      select: {
        labelingType: true,
        nutrientSource: true,
        intendedAgeGroup: true,
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          select: {
            weightG: true,
            baseIngredient: {
              select: { name: true, internalName: true, nutritionPer100g: true, densityGPerML: true },
            },
            replacements: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                weightGOverride: true,
                ingredient: {
                  select: { name: true, internalName: true, nutritionPer100g: true, densityGPerML: true },
                },
              },
            },
          },
        },
        optionalIngredients: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            weightG: true,
            ingredient: {
              select: { name: true, internalName: true, nutritionPer100g: true, densityGPerML: true },
            },
          },
        },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { servingSizeG: true, servingsPerContainer: true, servingSizeDesc: true },
        },
      },
    })

    // Only FOOD + COMPUTED recipes recompute; declared/non-food keep their panel.
    if (!tmpl || tmpl.nutrientSource === 'DECLARED' || tmpl.labelingType !== 'FOOD') return null

    const slots = tmpl.ingredientSlots
    if (slots.length === 0) return null

    const variant = tmpl.variants[0]
    const servingSizeG = Number(variant?.servingSizeG) || 0
    const servingsPerPackage = Number(variant?.servingsPerContainer) || 1
    if (servingSizeG <= 0) return null

    // Map the DB rows into the pure composer's shape.
    const toIng = (i: { name: string; internalName: string | null; nutritionPer100g: unknown; densityGPerML: number | null }) => ({
      name: i.internalName ?? i.name,
      per100g: (i.nutritionPer100g ?? {}) as Record<string, number>,
      densityGPerMl: i.densityGPerML ?? undefined,
    })

    const composeSlots: RecomposeSlot[] = slots.map((s) => ({
      weightG: Number(s.weightG) || 0,
      base: toIng(s.baseIngredient),
      replacements: s.replacements.map((r) => ({
        id: r.id,
        weightGOverride: r.weightGOverride != null ? Number(r.weightGOverride) : null,
        ingredient: toIng(r.ingredient),
      })),
    }))

    const composeOptionals: RecomposeOptional[] = tmpl.optionalIngredients.map((o) => ({
      id: o.id,
      weightG: Number(o.weightG) || 0,
      ingredient: toIng(o.ingredient),
    }))

    const rows = composeMarketplaceRows(composeSlots, composeOptionals, {
      replacements: selection.replacements ?? {},
      addOnIds: selection.addOnIds ?? [],
    })

    const result = calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage }, {
      audience: tmpl.intendedAgeGroup ?? 'GENERAL',
    })
    return toPanelData(result, {
      suggestedServing: variant?.servingSizeDesc ?? undefined,
      showVoluntaryFats: true,
    })
  } catch (err) {
    console.warn('[recipe-recompute] failed, keeping base panel:', (err as Error).message)
    return null
  }
}
