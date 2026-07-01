import 'server-only'
import { prisma } from '@ilaunchify/db'
import {
  toSupplementPanelData,
  formatGuaranteedAnalysis,
  petIngredientOrder,
  adequacyStatement,
  type DietaryIngredient,
  type ProprietaryBlend,
  type SupplementNutrition,
  type GuaranteedAnalysis,
  type PetSpecies,
  type LifeStage,
  type AdequacyMethod,
} from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'
import type { DomainFacts } from './recipe-detail'

// Per-flavor Supplement Facts / Guaranteed Analysis for the marketplace PDP.
// The partner can author a distinct formulation PER FLAVOR (gummy flavors, or
// chicken-vs-beef pet food) — stored under
// `ProductTemplate.formulationData.supplementByFlavor[id]` / `petByFlavor[id]`.
// This is the READ-ONLY public counterpart of that authoring: it computes each
// flavor's regulated panel with the SAME engine the base panel uses
// (recipe-detail.ts), so a per-flavor panel and the base panel never diverge.
//
// Cosmetic is intentionally excluded — scents/shades are variants, not flavors.
// Empty array → no per-flavor panels (the PDP keeps showing the single base panel).

export interface FlavorDomainView {
  id: string // FlavorPreset id
  name: string
  swatchHex: string | null
  /** SUPPLEMENT → this flavor's Supplement Facts panel. */
  nutrition: PanelData | null
  /** PET → this flavor's Guaranteed Analysis declaration. */
  domain: DomainFacts
}

// formulationData payload shapes (mirror recipe-detail.ts).
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
interface PetPayload {
  ingredients: Array<{ uid: string; name: string; weight: number }>
  ga: GuaranteedAnalysis
  species: PetSpecies
  lifeStage: LifeStage
  method: AdequacyMethod
  feedingDirections: string
}
interface FormulationData {
  supplementByFlavor?: Record<string, SupplementPayload>
  petByFlavor?: Record<string, PetPayload>
}
interface FlavorPresetRow { id: string; name: string; swatchHex: string | null }

function supplementPanel(p: SupplementPayload): PanelData | null {
  if (!p.dietaryIngredients?.length) return null
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
  return panel
}

function petDomain(p: PetPayload, productName: string): DomainFacts {
  if (!p.ga) return null
  const gaRows = formatGuaranteedAnalysis(p.ga)
  const ingredients = petIngredientOrder((p.ingredients ?? []).map((r) => ({ id: r.uid, name: r.name, weight: Number(r.weight) || 0 }))).join(', ')
  return {
    kind: 'PET', gaRows, ingredients,
    adequacyStatement: adequacyStatement(productName, p.species, p.lifeStage, p.method),
    feedingDirections: p.feedingDirections || undefined,
  }
}

export async function getTemplateFlavorDomainFacts(slug: string): Promise<FlavorDomainView[]> {
  try {
    const tmpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        name: string; labelingType: string; formulationData: FormulationData | null
        flavorPresets: FlavorPresetRow[]
      } | null> }
    }).productTemplate.findUnique({
      where: { slug },
      select: {
        name: true,
        labelingType: true,
        formulationData: true,
        flavorPresets: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, swatchHex: true } },
      },
    })

    if (!tmpl || !tmpl.flavorPresets?.length) return []
    const fd = tmpl.formulationData
    const lt = tmpl.labelingType

    const out: FlavorDomainView[] = []
    for (const fp of tmpl.flavorPresets) {
      if (lt === 'DIETARY_SUPPLEMENT') {
        const p = fd?.supplementByFlavor?.[fp.id]
        const panel = p ? supplementPanel(p) : null
        if (panel) out.push({ id: fp.id, name: fp.name, swatchHex: fp.swatchHex, nutrition: panel, domain: null })
      } else if (lt === 'PET_PRODUCT') {
        const p = fd?.petByFlavor?.[fp.id]
        const dom = p ? petDomain(p, tmpl.name) : null
        if (dom) out.push({ id: fp.id, name: fp.name, swatchHex: fp.swatchHex, nutrition: null, domain: dom })
      }
    }
    return out
  } catch (err) {
    console.warn('[flavor-domain-facts] failed:', (err as Error).message)
    return []
  }
}
