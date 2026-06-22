'use server'

// Creator-side label data for download (task #125 / #127). RECOMPUTES the
// regulated label(s) for a creator-owned product from authoritative data and the
// shared @ilaunchify/nutrition assembly (same math the partner preview uses).
//
// Domains:
//   FOOD               → Nutrition Facts, recomputed from the creator's own recipe
//                         (one panel; one PER FLAVOR for a multi-flavor variant).
//   DIETARY_SUPPLEMENT → Supplement Facts, from the template's supplement payload.
//   COSMETIC           → INCI declaration, from the template's cosmetic payload.
//   PET_PRODUCT        → Guaranteed Analysis, from the template's pet payload.
//   OTC                → blocked (domain off / flow not live).
//
// GATED: Builder+ only (Maker excluded) via the `label_file_download` plan feature
// — the button is hidden for Maker client-side; this is the hard server gate. The
// admin domain on/off (DomainSetting) is also enforced. The client renders each
// label with the matching packages/ui SVG renderer and prints to PDF.

import { requireUser, getCreatorTier, hasTier } from '@ilaunchify/auth'
import { prisma, isDomainEnabled } from '@ilaunchify/db'
import {
  calculateLabel, toPanelData, toGrams, toSupplementPanelData, toInciDeclaration,
  petIngredientOrder, formatGuaranteedAnalysis, adequacyStatement,
  type RecipeRow, type DietaryIngredient, type ProprietaryBlend, type SupplementNutrition,
  type CosmeticIngredient, type GuaranteedAnalysis, type PetSpecies, type LifeStage, type AdequacyMethod,
} from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'

const DOMAIN_ARTIFACT: Record<string, string> = {
  FOOD: 'Nutrition Facts',
  DIETARY_SUPPLEMENT: 'Supplement Facts',
  COSMETIC: 'INCI declaration',
  PET_PRODUCT: 'Guaranteed Analysis',
  OTC: 'Drug Facts',
}

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

// One ingredient resolved with everything a food label needs.
interface Line {
  row: RecipeRow
  declarationName: string
  allergens: string[]
}

// Discriminated label union — the client renders the matching SVG per `domain`.
export type ProductLabel =
  | { domain: 'FOOD'; productName: string; flavorName?: string; panel: PanelData; ingredientStatement: string; contains: string }
  | { domain: 'DIETARY_SUPPLEMENT'; productName: string; panel: PanelData; otherIngredients: string[] }
  | { domain: 'COSMETIC'; productName: string; ingredients: string; netContents?: string; responsiblePerson?: string; adverseEventContact?: string }
  | { domain: 'PET_PRODUCT'; productName: string; gaRows: { label: string; value: string }[]; ingredients: string; adequacyStatement?: string; feedingDirections?: string }
export type ComputeLabelResult = { ok: true; data: ProductLabel[] } | { ok: false; error: string }

function buildFoodLabel(
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

// ---- Persisted non-food formulation payloads (ProductTemplate.formulationData) ----
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
      productTemplateId: true,
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

  // Domain + persisted formulation (cast-guarded — labelingType / formulationData
  // ship with a pending migration on some machines).
  const tmpl = product.productTemplateId
    ? await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ labelingType: string | null; formulationData: FormulationData | null } | null> }
      }).productTemplate.findUnique({ where: { id: product.productTemplateId }, select: { labelingType: true, formulationData: true } })
    : null
  const domain = (tmpl?.labelingType ?? 'FOOD') as string
  if (!(await isDomainEnabled(domain))) {
    return { ok: false, error: 'This product’s label type isn’t available for download right now.' }
  }

  // ===================== Non-food domains =====================
  if (domain === 'OTC') {
    return { ok: false, error: 'Drug Facts downloads aren’t available yet.' }
  }
  if (domain === 'DIETARY_SUPPLEMENT') {
    const p = tmpl?.formulationData?.supplement
    if (!p || !p.dietaryIngredients?.length) return { ok: false, error: 'This supplement has no formulation yet.' }
    const dietary: DietaryIngredient[] = p.dietaryIngredients.filter((r) => r.name?.trim()).map((r, i, arr) => ({
      id: r.uid, name: r.name.trim(), amountPerServing: r.amount, unit: r.unit,
      percentDV: r.percentDV?.trim() === '' || r.percentDV == null ? null : Number(r.percentDV),
      blendId: r.blendId || null, isOtherIngredient: r.isOther, sortWeight: arr.length - i,
      amountLessThan: r.amountLessThan, symbol: r.symbol?.trim() || undefined,
    }))
    const blends: ProprietaryBlend[] = (p.blends ?? []).map((b) => ({ id: b.id, name: b.name, totalAmount: b.total, unit: b.unit, percentDV: null, amountLessThan: b.amountLessThan }))
    const { panel, otherIngredients } = toSupplementPanelData(dietary, blends, {
      servingSize: p.servingForm, servingsPerContainer: p.servingsPerContainer,
      nutrition: p.nutrition, nutritionLessThan: p.nutritionLessThan as Partial<Record<keyof SupplementNutrition, boolean>> | undefined,
      noDvSymbol: p.noDvSymbol, customFootnotes: p.customFootnotes,
    })
    return { ok: true, data: [{ domain: 'DIETARY_SUPPLEMENT', productName: product.name, panel, otherIngredients }] }
  }
  if (domain === 'COSMETIC') {
    const p = tmpl?.formulationData?.cosmetic
    if (!p || !p.ingredients?.length) return { ok: false, error: 'This product has no ingredient list yet.' }
    const items: CosmeticIngredient[] = p.ingredients.map((r) => ({ id: r.uid, inciName: r.inciName, pct: Number(r.pct) || 0, isColorAdditive: r.isColorAdditive, isFragrance: r.isFragrance }))
    const decl = toInciDeclaration(items)
    const netContents = Number(p.netContentsQty) > 0 ? `Net contents: ${p.netContentsQty} ${p.netContentsUnit}`.trim() : undefined
    return { ok: true, data: [{ domain: 'COSMETIC', productName: product.name, ingredients: decl.text, netContents, responsiblePerson: p.responsiblePerson || undefined, adverseEventContact: p.adverseEventContact || undefined }] }
  }
  if (domain === 'PET_PRODUCT') {
    const p = tmpl?.formulationData?.pet
    if (!p || !p.ga) return { ok: false, error: 'This product has no guaranteed analysis yet.' }
    const gaRows = formatGuaranteedAnalysis(p.ga)
    const ingredients = petIngredientOrder((p.ingredients ?? []).map((r) => ({ id: r.uid, name: r.name, weight: Number(r.weight) || 0 }))).join(', ')
    return {
      ok: true,
      data: [{
        domain: 'PET_PRODUCT', productName: product.name, gaRows, ingredients,
        adequacyStatement: adequacyStatement(product.name, p.species, p.lifeStage, p.method),
        feedingDirections: p.feedingDirections || undefined,
      }],
    }
  }

  // ===================== FOOD (default) =====================
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

  type Extra = { ingredientId: string; name?: string; qty: number; unit: string }
  const flavors = (product.productTemplate?.flavorPresets ?? [])
    .map((f) => ({ name: f.name, extras: (Array.isArray(f.extras) ? (f.extras as Extra[]) : []).filter((e) => e && e.ingredientId && Number(e.qty) > 0) }))
    .filter((f) => f.name.trim().length > 0 && f.extras.length > 0)

  if (flavors.length === 0) {
    return { ok: true, data: [buildFoodLabel(baseLines, [], geo, product.name)] }
  }

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
    return buildFoodLabel(baseLines, overlay, geo, product.name, f.name)
  })

  return { ok: true, data: labels }
}

// ---------------------------------------------------------------------------
// getVarietyPreviewColumns — per-flavor VarietyColumn data for the pack-builder
// live preview (variety-pack builder Slice 2b). UNGATED (it's a preview, not a
// download) but still ownership-scoped. FOOD only — the VarietyFactsSvg renderer
// is Nutrition Facts; non-food multi-flavor previews are out of scope. Reuses the
// exact per-flavor recompute as the FOOD label download above (buildFoodLabel),
// so the preview matches what prints. Returns columns keyed by flavorPresetId so
// the builder can filter to the picked flavors.
// ---------------------------------------------------------------------------

export interface VarietyPreviewColumn {
  flavorPresetId: string
  label: string
  panel: PanelData
  contains: string
}
export type VarietyPreviewResult = { ok: true; columns: VarietyPreviewColumn[] } | { ok: false; error: string }

export async function getVarietyPreviewColumns(productId: string): Promise<VarietyPreviewResult> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      productTemplateId: true,
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
        select: { flavorPresets: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, extras: true } } },
      },
    },
  })
  if (!product) return { ok: false, error: 'Product not found.' }

  // FOOD only — the variety panel is Nutrition Facts. Cast-guarded domain read.
  const tmpl = product.productTemplateId
    ? await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ labelingType: string | null } | null> }
      }).productTemplate.findUnique({ where: { id: product.productTemplateId }, select: { labelingType: true } })
    : null
  if ((tmpl?.labelingType ?? 'FOOD') !== 'FOOD') return { ok: true, columns: [] }
  if (!product.recipe || product.recipe.ingredients.length === 0) return { ok: true, columns: [] }

  const r = product.recipe
  const geo = { servingSizeG: Number(r.servingSizeG) || 1, servingsPerPackage: Number(r.servingsPerContainer) || 1, servingSizeDesc: r.servingSizeDesc ?? undefined }
  const baseLines: Line[] = r.ingredients.map((ri, i) => ({
    row: { id: `b${i}`, name: ri.ingredient.internalName ?? ri.ingredient.name, per100g: (ri.ingredient.nutritionPer100g ?? {}) as Record<string, number>, quantity: Number(ri.weightG) || 0, unit: 'g', category: 'base', selected: true },
    declarationName: (ri.ingredient.labelDeclarationName ?? ri.ingredient.internalName ?? ri.ingredient.name) ?? '',
    allergens: ri.ingredient.allergenFlags ?? [],
  }))

  type Extra = { ingredientId: string; name?: string; qty: number; unit: string }
  const flavors = (product.productTemplate?.flavorPresets ?? [])
    .map((f) => ({ id: f.id, name: f.name, extras: (Array.isArray(f.extras) ? (f.extras as Extra[]) : []).filter((e) => e && e.ingredientId && Number(e.qty) > 0) }))
    .filter((f) => f.name.trim().length > 0 && f.extras.length > 0)
  if (flavors.length === 0) return { ok: true, columns: [] }

  const ids = [...new Set(flavors.flatMap((f) => f.extras.map((e) => e.ingredientId)))]
  const ingByIdRows = await prisma.ingredient.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
  })
  const ingById = new Map(ingByIdRows.map((x) => [x.id, x]))

  const columns: VarietyPreviewColumn[] = flavors.map((f) => {
    const overlay: Line[] = f.extras.map((e, i) => {
      const ing = ingById.get(e.ingredientId)
      const grams = toGrams(Number(e.qty) || 0, e.unit || 'g', { densityGPerMl: ing?.densityGPerML ?? undefined })
      return {
        row: { id: `f${i}`, name: ing?.internalName ?? ing?.name ?? e.name ?? 'Ingredient', per100g: (ing?.nutritionPer100g ?? {}) as Record<string, number>, quantity: grams, unit: 'g', category: 'base', selected: true },
        declarationName: (ing?.labelDeclarationName ?? ing?.internalName ?? ing?.name ?? e.name) ?? '',
        allergens: ing?.allergenFlags ?? [],
      }
    })
    const lbl = buildFoodLabel(baseLines, overlay, geo, '', f.name) as Extract<ProductLabel, { domain: 'FOOD' }>
    return { flavorPresetId: f.id, label: f.name, panel: lbl.panel, contains: lbl.contains }
  })

  return { ok: true, columns }
}

// ---------------------------------------------------------------------------
// Phase 2b — resolve the REAL Nutrition Facts PanelData for the Studio canvas:
// the product's base recipe (flavorPresetId null) or a specific flavor (base +
// that flavor's overlay). Same buildFoodLabel path as the variety preview / the
// label download, so the canvas panel == what prints. FOOD only for now; other
// domains return { domain: 'OTHER' } and keep their own panel renderers.
// ---------------------------------------------------------------------------

export type StudioNutritionResult =
  | { ok: true; domain: 'FOOD'; panel: PanelData }
  | { ok: true; domain: 'OTHER' }
  | { ok: false; error: string }

export async function resolveStudioNutrition(
  productId: string,
  flavorPresetId?: string | null,
): Promise<StudioNutritionResult> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      name: true,
      productTemplateId: true,
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
        select: { flavorPresets: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, extras: true } } },
      },
    },
  })
  if (!product) return { ok: false, error: 'Product not found.' }

  const tmpl = product.productTemplateId
    ? await (prisma as unknown as {
        productTemplate: { findUnique: (a: unknown) => Promise<{ labelingType: string | null } | null> }
      }).productTemplate.findUnique({ where: { id: product.productTemplateId }, select: { labelingType: true } })
    : null
  if ((tmpl?.labelingType ?? 'FOOD') !== 'FOOD') return { ok: true, domain: 'OTHER' }
  if (!product.recipe || product.recipe.ingredients.length === 0) {
    return { ok: false, error: 'No recipe yet — add ingredients to compute nutrition.' }
  }

  const r = product.recipe
  const geo = { servingSizeG: Number(r.servingSizeG) || 1, servingsPerPackage: Number(r.servingsPerContainer) || 1, servingSizeDesc: r.servingSizeDesc ?? undefined }
  const baseLines: Line[] = r.ingredients.map((ri, i) => ({
    row: { id: `b${i}`, name: ri.ingredient.internalName ?? ri.ingredient.name, per100g: (ri.ingredient.nutritionPer100g ?? {}) as Record<string, number>, quantity: Number(ri.weightG) || 0, unit: 'g', category: 'base', selected: true },
    declarationName: (ri.ingredient.labelDeclarationName ?? ri.ingredient.internalName ?? ri.ingredient.name) ?? '',
    allergens: ri.ingredient.allergenFlags ?? [],
  }))

  let overlay: Line[] = []
  let flavorName = ''
  if (flavorPresetId) {
    type Extra = { ingredientId: string; name?: string; qty: number; unit: string }
    const fp = product.productTemplate?.flavorPresets?.find((f) => f.id === flavorPresetId)
    if (!fp) return { ok: false, error: 'Flavor not found.' }
    flavorName = fp.name
    const extras = (Array.isArray(fp.extras) ? (fp.extras as Extra[]) : []).filter((e) => e && e.ingredientId && Number(e.qty) > 0)
    if (extras.length) {
      const ids = [...new Set(extras.map((e) => e.ingredientId))]
      const ingRows = await prisma.ingredient.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, internalName: true, labelDeclarationName: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
      })
      const ingById = new Map(ingRows.map((x) => [x.id, x]))
      overlay = extras.map((e, i) => {
        const ing = ingById.get(e.ingredientId)
        const grams = toGrams(Number(e.qty) || 0, e.unit || 'g', { densityGPerMl: ing?.densityGPerML ?? undefined })
        return {
          row: { id: `f${i}`, name: ing?.internalName ?? ing?.name ?? e.name ?? 'Ingredient', per100g: (ing?.nutritionPer100g ?? {}) as Record<string, number>, quantity: grams, unit: 'g', category: 'base', selected: true },
          declarationName: (ing?.labelDeclarationName ?? ing?.internalName ?? ing?.name ?? e.name) ?? '',
          allergens: ing?.allergenFlags ?? [],
        }
      })
    }
  }

  const lbl = buildFoodLabel(baseLines, overlay, geo, flavorPresetId ? '' : product.name, flavorName || undefined) as Extract<ProductLabel, { domain: 'FOOD' }>
  return { ok: true, domain: 'FOOD', panel: lbl.panel }
}
