import 'server-only'
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

// Admin read-only Supplement Facts / Guaranteed Analysis for the product detail
// page. Computes the BASE panel (formulationData.supplement / .pet) plus each
// flavor's own panel (supplementByFlavor / petByFlavor) with the SAME engine the
// creator PDP + partner Passport use, so all three surfaces agree. Pure — no
// prisma; the caller passes the already-loaded formulationData + flavorPresets.
//
// Cosmetic is out of scope (variants, not flavors). Food nutrition is already
// rendered elsewhere on the admin page.

export interface AdminPetFacts {
  gaRows: Array<{ label: string; value: string }>
  ingredients: string
  adequacyStatement: string | null
  feedingDirections: string | null
}
export interface AdminFlavorFacts {
  id: string
  name: string
  swatchHex: string | null
  panel: PanelData | null // SUPPLEMENT
  petFacts: AdminPetFacts | null // PET
}
export interface AdminDomainFacts {
  kind: 'SUPPLEMENT' | 'PET'
  baseNutrition: PanelData | null
  basePet: AdminPetFacts | null
  flavors: AdminFlavorFacts[]
}

interface SupplementPayload {
  dietaryIngredients?: Array<{ uid?: string; name?: string; amount?: number; unit?: string; percentDV?: string; blendId?: string; isOther?: boolean; amountLessThan?: boolean; symbol?: string }>
  blends?: Array<{ id?: string; name?: string; total?: number; unit?: string; amountLessThan?: boolean }>
  servingForm?: string
  servingsPerContainer?: number
  nutrition?: SupplementNutrition
  nutritionLessThan?: Record<string, boolean>
  noDvSymbol?: string
  customFootnotes?: Array<{ symbol: string; text: string }>
}
interface PetPayload {
  ingredients?: Array<{ uid?: string; name?: string; weight?: number }>
  ga?: GuaranteedAnalysis
  species?: PetSpecies
  lifeStage?: LifeStage
  method?: AdequacyMethod
  feedingDirections?: string
}
interface FormulationData {
  supplement?: SupplementPayload
  pet?: PetPayload
  supplementByFlavor?: Record<string, SupplementPayload>
  petByFlavor?: Record<string, PetPayload>
}

function supplementPanel(p: SupplementPayload | undefined): PanelData | null {
  const di = p?.dietaryIngredients ?? []
  if (!di.length) return null
  const dietary: DietaryIngredient[] = di.filter((r) => r.name?.trim()).map((r, i, arr) => ({
    id: r.uid ?? `di-${i}`, name: r.name!.trim(), amountPerServing: r.amount ?? 0, unit: r.unit ?? '',
    percentDV: r.percentDV?.trim() === '' || r.percentDV == null ? null : Number(r.percentDV),
    blendId: r.blendId || null, isOtherIngredient: Boolean(r.isOther), sortWeight: arr.length - i,
    amountLessThan: r.amountLessThan, symbol: r.symbol?.trim() || undefined,
  }))
  const blends: ProprietaryBlend[] = (p!.blends ?? []).map((b, i) => ({ id: b.id ?? `bl-${i}`, name: b.name ?? 'Blend', totalAmount: b.total ?? 0, unit: b.unit ?? '', percentDV: null, amountLessThan: b.amountLessThan }))
  const { panel } = toSupplementPanelData(dietary, blends, {
    servingSize: p!.servingForm ?? '', servingsPerContainer: p!.servingsPerContainer ?? 1,
    nutrition: p!.nutrition, nutritionLessThan: p!.nutritionLessThan as Partial<Record<keyof SupplementNutrition, boolean>> | undefined,
    noDvSymbol: p!.noDvSymbol, customFootnotes: p!.customFootnotes,
  })
  return panel
}

function petFacts(p: PetPayload | undefined, productName: string): AdminPetFacts | null {
  if (!p?.ga) return null
  const gaRows = formatGuaranteedAnalysis(p.ga)
  const ingredients = petIngredientOrder((p.ingredients ?? []).map((r, i) => ({ id: r.uid ?? `pi-${i}`, name: r.name ?? '', weight: Number(r.weight) || 0 }))).join(', ')
  return {
    gaRows, ingredients,
    adequacyStatement: p.species && p.lifeStage && p.method ? adequacyStatement(productName, p.species, p.lifeStage, p.method) : null,
    feedingDirections: p.feedingDirections?.trim() || null,
  }
}

export function buildAdminDomainFacts(
  labelingType: string,
  formulationDataRaw: unknown,
  flavorPresets: Array<{ id: string; name: string; swatchHex: string | null }>,
  productName: string,
): AdminDomainFacts | null {
  if (labelingType !== 'DIETARY_SUPPLEMENT' && labelingType !== 'PET_PRODUCT') return null
  const fd = (formulationDataRaw ?? {}) as FormulationData

  if (labelingType === 'DIETARY_SUPPLEMENT') {
    const baseNutrition = supplementPanel(fd.supplement)
    const byFlavor = fd.supplementByFlavor ?? {}
    const flavors: AdminFlavorFacts[] = []
    for (const f of flavorPresets) {
      const panel = supplementPanel(byFlavor[f.id])
      if (panel) flavors.push({ id: f.id, name: f.name, swatchHex: f.swatchHex, panel, petFacts: null })
    }
    if (!baseNutrition && flavors.length === 0) return null
    return { kind: 'SUPPLEMENT', baseNutrition, basePet: null, flavors }
  }

  // PET_PRODUCT
  const basePet = petFacts(fd.pet, productName)
  const byFlavor = fd.petByFlavor ?? {}
  const flavors: AdminFlavorFacts[] = []
  for (const f of flavorPresets) {
    const pf = petFacts(byFlavor[f.id], productName)
    if (pf) flavors.push({ id: f.id, name: f.name, swatchHex: f.swatchHex, panel: null, petFacts: pf })
  }
  if (!basePet && flavors.length === 0) return null
  return { kind: 'PET', baseNutrition: null, basePet, flavors }
}
