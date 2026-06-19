import 'server-only'
import { prisma } from '@ilaunchify/db'
import {
  calculateLabel, toPanelData, type RecipeRow,
  toSupplementPanelData, toInciDeclaration, formatGuaranteedAnalysis,
  petIngredientOrder, adequacyStatement,
  type DietaryIngredient, type ProprietaryBlend, type SupplementNutrition,
  type CosmeticIngredient, type GuaranteedAnalysis, type PetSpecies, type LifeStage, type AdequacyMethod,
} from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'
import type { IngredientRow, IngredientAddOn } from '@ilaunchify/ui'

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
 * Domain coverage:
 *   - FOOD → Nutrition Facts computed from TemplateIngredientSlot recipe.
 *   - DIETARY_SUPPLEMENT → Supplement Facts computed from formulationData →
 *     a SUPPLEMENT_FACTS PanelData (rendered by the same NutritionFactsRenderer).
 *   - COSMETIC → INCI declaration; PET_PRODUCT → Guaranteed Analysis — returned
 *     in `domain` for the detail page's domain-specific renderer.
 *   - BASE recipe only for FOOD (TemplateIngredientSlot.baseIngredient); swaps +
 *     optional add-ons are choices but the public panel is the default recipe.
 *   - DECLARED templates (manufacturer-entered panel) return their stored
 *     declaredPanel instead of a computed one.
 * Returns empty/null on missing data so the detail page keeps the fixture.
 */

/** Non-food domain declaration for the public detail page. */
export type DomainFacts =
  | { kind: 'COSMETIC'; ingredients: string; netContents?: string; responsiblePerson?: string; adverseEventContact?: string }
  | { kind: 'PET'; gaRows: { label: string; value: string }[]; ingredients: string; adequacyStatement?: string; feedingDirections?: string }
  | null

export interface TemplateRecipeDetail {
  /** Base recipe rows (label-declaration names, %-of-recipe, allergens, swaps). */
  ingredients: IngredientRow[]
  /** Optional add-ons the creator can toggle (from the template's optional
   *  ingredients). priceDelta is omitted — optional ingredients carry no
   *  authoritative per-unit cost — so the toggle shows without a price chip. */
  addOns: IngredientAddOn[]
  /** Computed (or declared) Nutrition / Supplement Facts panel; null → fixture. */
  nutrition: PanelData | null
  /** Cosmetic INCI / pet Guaranteed Analysis declaration; null for food/supplement. */
  domain: DomainFacts
}

const EMPTY: TemplateRecipeDetail = { ingredients: [], addOns: [], nutrition: null, domain: null }

// ---- ProductTemplate.formulationData payload shapes (mirror the creator's
// computeProductLabel; this is the read-only public counterpart). ----
interface SupplementPayload {
  dietaryIngredients: Array<{ uid: string; name: string; amount: number; unit: string; percentDV: string; blendId: string; isOther: boolean; amountLessThan?: boolean; symbol?: string }>
  blends: Array<{ id: string; name: string; total: number; unit: string; amountLessThan?: boolean }>
  servingForm: string
  servingsPerContainer: number
  nutrition?: SupplementNutrition
  nutritionLessThan?: Record<string, boolean>
  noDvSymbol?: string
  customFootnotes?: Array<{ symbol: string; text: string }>
}
interface CosmeticPayload {
  ingredients: Array<{ uid: string; inciName: string; pct: number; isColorAdditive: boolean; isFragrance: boolean }>
  netContentsQty: number
  netContentsUnit: string
  responsiblePerson: string
  adverseEventContact: string
}
interface PetPayload {
  ingredients: Array<{ uid: string; name: string; weight: number }>
  ga: GuaranteedAnalysis
  species: PetSpecies
  lifeStage: LifeStage
  method: AdequacyMethod
  feedingDirections: string
}
interface FormulationData { supplement?: SupplementPayload; cosmetic?: CosmeticPayload; pet?: PetPayload }

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
        optionalIngredients: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            calloutText: true,
            ingredient: {
              select: { name: true, internalName: true, labelDeclarationName: true, allergenFlags: true },
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

    // --- optional add-ons (template optional ingredients) ---
    const addOns: IngredientAddOn[] = tmpl.optionalIngredients.map((o) => ({
      id: o.id,
      name: o.ingredient.labelDeclarationName ?? o.ingredient.internalName ?? o.ingredient.name,
      description: o.calloutText ?? undefined,
      allergens: displayAllergens(o.ingredient.allergenFlags),
      // priceDelta intentionally omitted — no authoritative per-unit cost on an
      // optional ingredient. The UI renders the toggle without a price chip.
    }))

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

    // --- non-food domains: compute from formulationData (cast-guarded) ---
    let domain: DomainFacts = null
    const lt = tmpl.labelingType
    if (lt === 'DIETARY_SUPPLEMENT' || lt === 'COSMETIC' || lt === 'PET_PRODUCT') {
      const fd = await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ name: string; formulationData: FormulationData | null } | null> }
      }).productTemplate
        .findUnique({ where: { slug }, select: { name: true, formulationData: true } })
        .catch(() => null)
      const f = fd?.formulationData ?? null

      if (lt === 'DIETARY_SUPPLEMENT' && !nutrition && f?.supplement?.dietaryIngredients?.length) {
        // Supplement Facts → a SUPPLEMENT_FACTS PanelData (rendered by the same
        // NutritionFactsRenderer the food panel uses). Mirrors computeProductLabel.
        const p = f.supplement
        const dietary: DietaryIngredient[] = p.dietaryIngredients.filter((r) => r.name?.trim()).map((r, i, arr) => ({
          id: r.uid, name: r.name.trim(), amountPerServing: r.amount, unit: r.unit,
          percentDV: r.percentDV?.trim() === '' || r.percentDV == null ? null : Number(r.percentDV),
          blendId: r.blendId || null, isOtherIngredient: r.isOther, sortWeight: arr.length - i,
          amountLessThan: r.amountLessThan, symbol: r.symbol?.trim() || undefined,
        }))
        const blends: ProprietaryBlend[] = (p.blends ?? []).map((b) => ({ id: b.id, name: b.name, totalAmount: b.total, unit: b.unit, percentDV: null, amountLessThan: b.amountLessThan }))
        const { panel } = toSupplementPanelData(dietary, blends, {
          servingSize: p.servingForm, servingsPerContainer: p.servingsPerContainer,
          nutrition: p.nutrition, nutritionLessThan: p.nutritionLessThan as Partial<Record<keyof SupplementNutrition, boolean>> | undefined,
          noDvSymbol: p.noDvSymbol, customFootnotes: p.customFootnotes,
        })
        nutrition = panel
      } else if (lt === 'COSMETIC' && f?.cosmetic?.ingredients?.length) {
        const p = f.cosmetic
        const items: CosmeticIngredient[] = p.ingredients.map((r) => ({ id: r.uid, inciName: r.inciName, pct: Number(r.pct) || 0, isColorAdditive: r.isColorAdditive, isFragrance: r.isFragrance }))
        const decl = toInciDeclaration(items)
        const netContents = Number(p.netContentsQty) > 0 ? `Net contents: ${p.netContentsQty} ${p.netContentsUnit}`.trim() : undefined
        domain = { kind: 'COSMETIC', ingredients: decl.text, netContents, responsiblePerson: p.responsiblePerson || undefined, adverseEventContact: p.adverseEventContact || undefined }
      } else if (lt === 'PET_PRODUCT' && f?.pet?.ga) {
        const p = f.pet
        const gaRows = formatGuaranteedAnalysis(p.ga)
        const ingredients = petIngredientOrder((p.ingredients ?? []).map((r) => ({ id: r.uid, name: r.name, weight: Number(r.weight) || 0 }))).join(', ')
        domain = {
          kind: 'PET', gaRows, ingredients,
          adequacyStatement: adequacyStatement(fd?.name ?? '', p.species, p.lifeStage, p.method),
          feedingDirections: p.feedingDirections || undefined,
        }
      }
    }

    return { ingredients, addOns, nutrition, domain }
  } catch (err) {
    console.warn('[recipe-detail] failed, using fixture:', (err as Error).message)
    return EMPTY
  }
}
