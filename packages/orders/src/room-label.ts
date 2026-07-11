// Room recipe → live domain-aware label bundle (Pavel 2026-07-10, mockup-
// approved). Resolves the recipe object's rows against the Ingredient catalog
// and computes the facts panel + MANDATORY statements through the platform's
// single label-math source (@ilaunchify/nutrition), mirroring the canonical
// creator label builder (apps/creator/.../labels/label-actions.ts):
//   calculateLabel(rows, { basis: 'serving', servingSizeG, servingsPerPackage })
//
// HONESTY GATES (same posture as the benchmark):
//   • the panel computes only from resolved rows and reports coverage;
//   • the FALCPA "Contains" line renders ONLY at 100% resolution — a partial
//     allergen statement is a safety hazard, so until then the UI shows an
//     explicit "allergen review pending" warning instead;
//   • nothing is invented: no serving data → no panel, just the statement.
//
// Visibility: an ingredient may resolve from the global catalog or the room
// maker's own private rows — never another partner's.

import { prisma, type Prisma } from '@ilaunchify/db'
import {
  calculateLabel,
  toPanelData,
  toInciDeclaration,
  toSupplementPanelData,
  buildIngredientStatement,
  formatFalcpaContains,
  type IngredientInput,
  type DietaryIngredient,
  type ProprietaryBlend,
  type SupplementNutrition,
} from '@ilaunchify/nutrition'
import type { PanelData } from '@ilaunchify/types'
import { parseAmountToGrams } from './recipe-materialize'

export interface RoomRecipeServing {
  sizeG: number | null
  sizeDesc: string | null
  perContainer: number | null
  /** Net quantity input for 21 CFR 101.105 (formatted by the UI helper). */
  netQuantity: {
    kind: 'solid' | 'liquid' | 'count'
    grams?: number
    milliliters?: number
    count?: number
    countUnit?: string
  } | null
}

export interface RoomRecipeRowResolution {
  name: string
  amount: string
  note: string
  grams: number | null
  ingredientId: string | null
  declarationName: string | null
  /** Ingredient.source (USDA / LIBRARY / PARTNER_PRIVATE / …) for the chip. */
  source: string | null
}

export interface RoomRecipeLabel {
  domain: string
  rows: RoomRecipeRowResolution[]
  coverage: { resolved: number; total: number; unresolvedNames: string[] }
  serving: RoomRecipeServing
  /** FOOD / BEVERAGE_FUNCTIONAL / SUPPLEMENT facts panel (needs serving + ≥1 resolved row). */
  panel: PanelData | null
  /** 21 CFR 101.4 descending-weight ingredient statement (resolved rows). */
  statement: string | null
  /** FALCPA Contains — null unless fully resolved AND allergens present. */
  containsLine: string | null
  /** true while any row is unresolved → UI shows the safety warning. */
  containsIncomplete: boolean
  /** COSMETIC: INCI declaration text. */
  inciText: string | null
  /** PET: descending-weight ingredient order (GA values come from lab results). */
  petOrder: string[] | null
  /** SUPPLEMENT: "Other ingredients:" line items (rendered below the box). */
  otherIngredients: string[] | null
  /** PET: maker-entered Guaranteed Analysis block (lab results, never computed). */
  petGa: {
    rows: { label: string; value: string }[]
    adequacyStatement: string | null
    feedingDirections: string | null
  } | null
}

/** PET payload block — GA values come from the maker's LAB RESULTS; the
 *  platform carries them verbatim (operational-trust: nothing invented). */
function payloadPetGa(payload: unknown): RoomRecipeLabel['petGa'] {
  const p =
    payload && typeof payload === 'object'
      ? (payload as { pet?: Record<string, unknown> }).pet
      : null
  if (!p || typeof p !== 'object') return null
  const rawRows = Array.isArray(p.gaRows) ? p.gaRows : []
  const rows = (rawRows as Partial<{ label: string; value: string }>[])
    .filter((r) => String(r?.label ?? '').trim() && String(r?.value ?? '').trim())
    .map((r) => ({ label: String(r.label).trim(), value: String(r.value).trim() }))
  if (rows.length === 0) return null
  return {
    rows,
    adequacyStatement:
      typeof p.adequacyStatement === 'string' && p.adequacyStatement.trim()
        ? p.adequacyStatement.trim()
        : null,
    feedingDirections:
      typeof p.feedingDirections === 'string' && p.feedingDirections.trim()
        ? p.feedingDirections.trim()
        : null,
  }
}

/**
 * Structured supplement formulation carried on the recipe payload
 * (SUPPLEMENT-domain rooms). EXACT mirror of toSupplementPanelData's inputs —
 * the same shape the partner product builder saves, so the room and the
 * builder can never disagree about what a formulation means.
 */
export interface RoomSupplementFormulation {
  dietaryIngredients: DietaryIngredient[]
  blends: ProprietaryBlend[]
  servingForm: string
  servingsPerContainer: number
  nutrition?: SupplementNutrition
}

function payloadSupplement(payload: unknown): RoomSupplementFormulation | null {
  const s =
    payload && typeof payload === 'object'
      ? (payload as { supplement?: Record<string, unknown> }).supplement
      : null
  if (!s || typeof s !== 'object') return null
  const rawRows = Array.isArray(s.dietaryIngredients) ? s.dietaryIngredients : []
  const dietaryIngredients: DietaryIngredient[] = (rawRows as Partial<DietaryIngredient>[])
    .filter(
      (d) =>
        String(d?.name ?? '').trim() &&
        typeof d?.amountPerServing === 'number' &&
        Number.isFinite(d.amountPerServing) &&
        d.amountPerServing > 0 &&
        String(d?.unit ?? '').trim(),
    )
    .map((d, i) => ({
      id: String(d!.id ?? `row-${i}`),
      name: String(d!.name).trim(),
      amountPerServing: d!.amountPerServing!,
      unit: String(d!.unit).trim(),
      percentDV: typeof d!.percentDV === 'number' ? d!.percentDV : null,
      ...(d!.blendId ? { blendId: String(d!.blendId) } : {}),
      ...(d!.isOtherIngredient ? { isOtherIngredient: true } : {}),
      ...(typeof d!.sortWeight === 'number' ? { sortWeight: d!.sortWeight } : {}),
    }))
  if (dietaryIngredients.length === 0) return null
  const spc = Number((s as { servingsPerContainer?: unknown }).servingsPerContainer)
  return {
    dietaryIngredients,
    blends: Array.isArray(s.blends) ? (s.blends as ProprietaryBlend[]) : [],
    servingForm: String(s.servingForm ?? '').trim() || '1 serving',
    servingsPerContainer: Number.isFinite(spc) && spc > 0 ? spc : 1,
    ...(s.nutrition && typeof s.nutrition === 'object'
      ? { nutrition: s.nutrition as SupplementNutrition }
      : {}),
  }
}

interface PayloadRow {
  name: string
  amount: string
  note: string
  ingredientId?: string
}

function payloadRows(payload: unknown): PayloadRow[] {
  if (!payload || typeof payload !== 'object') return []
  const raw = (payload as { rows?: unknown }).rows
  if (!Array.isArray(raw)) return []
  return (raw as Partial<PayloadRow>[])
    .filter((r) => String(r?.name ?? '').trim())
    .map((r) => ({
      name: String(r!.name).trim(),
      amount: String(r?.amount ?? '').trim(),
      note: String(r?.note ?? '').trim(),
      ...(r?.ingredientId ? { ingredientId: String(r.ingredientId) } : {}),
    }))
}

function payloadServing(payload: unknown): RoomRecipeServing {
  const s =
    payload && typeof payload === 'object' ? (payload as { serving?: Record<string, unknown> }).serving : null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const nq = s?.netQuantity as RoomRecipeServing['netQuantity'] | undefined
  return {
    sizeG: num(s?.sizeG),
    sizeDesc: typeof s?.sizeDesc === 'string' && s.sizeDesc.trim() ? String(s.sizeDesc).trim() : null,
    perContainer: num(s?.perContainer),
    netQuantity:
      nq && (nq.kind === 'solid' || nq.kind === 'liquid' || nq.kind === 'count') ? nq : null,
  }
}

type CatalogRow = {
  id: string
  name: string
  internalName: string | null
  labelDeclarationName: string | null
  nutritionPer100g: Prisma.JsonValue
  densityGPerML: number | null
  allergenFlags: string[]
  source: string | null
  domainData: Prisma.JsonValue | null
}

const CATALOG_SELECT = {
  id: true,
  name: true,
  internalName: true,
  labelDeclarationName: true,
  nutritionPer100g: true,
  densityGPerML: true,
  allergenFlags: true,
  source: true,
  domainData: true,
} as const

/**
 * Resolve + compute the room recipe's label bundle. Caller has already
 * verified room membership; partnerId scopes private-ingredient visibility.
 */
export async function resolveRoomRecipeLabel(input: {
  partnerId: string
  domain: string
  payload: unknown
}): Promise<RoomRecipeLabel | null> {
  const rows = payloadRows(input.payload)
  const supplement = input.domain === 'SUPPLEMENT' ? payloadSupplement(input.payload) : null
  if (rows.length === 0 && !supplement) return null
  const serving = payloadServing(input.payload)

  const visibility = { OR: [{ ownerPartnerId: null }, { ownerPartnerId: input.partnerId }] }

  // Resolve by pinned id first, then case-insensitive exact name.
  const resolved: (CatalogRow | null)[] = []
  for (const row of rows) {
    let ing: CatalogRow | null = null
    if (row.ingredientId) {
      ing = await prisma.ingredient.findFirst({
        where: { id: row.ingredientId, ...visibility },
        select: CATALOG_SELECT,
      })
    }
    if (!ing) {
      ing = await prisma.ingredient.findFirst({
        where: {
          AND: [
            visibility,
            {
              OR: [
                { name: { equals: row.name, mode: 'insensitive' } },
                { internalName: { equals: row.name, mode: 'insensitive' } },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: CATALOG_SELECT,
      })
    }
    resolved.push(ing)
  }

  const rowResolutions: RoomRecipeRowResolution[] = rows.map((row, i) => {
    const ing = resolved[i] ?? null
    return {
      name: row.name,
      amount: row.amount,
      note: row.note,
      grams: parseAmountToGrams(row.amount),
      ingredientId: ing?.id ?? null,
      declarationName: ing ? (ing.labelDeclarationName ?? ing.internalName ?? ing.name) : null,
      source: ing?.source ?? null,
    }
  })

  const matched = rowResolutions
    .map((r, i) => ({ r, ing: resolved[i] }))
    .filter((x): x is { r: RoomRecipeRowResolution; ing: CatalogRow } => x.ing !== null)
  const unresolvedNames = rowResolutions.filter((r) => !r.ingredientId).map((r) => r.name)
  const fullyResolved = unresolvedNames.length === 0

  // Statement: resolved rows with parseable grams, descending weight (101.4).
  const statementItems = matched
    .filter((m) => typeof m.r.grams === 'number' && m.r.grams! > 0)
    .map((m) => ({ declarationName: m.r.declarationName!, grams: m.r.grams! }))
  const statement = buildIngredientStatement(statementItems)

  // Contains: ONLY when everything is resolved (safety gate).
  const containsLine = fullyResolved
    ? formatFalcpaContains(matched.map((m) => m.ing.allergenFlags))
    : null

  // Facts panel — food/beverage math via the canonical engine call.
  let panel: PanelData | null = null
  const isFoodish = input.domain === 'FOOD' || input.domain === 'BEVERAGE_FUNCTIONAL'
  if (isFoodish && serving.sizeG && serving.perContainer && statementItems.length > 0) {
    const engineRows: IngredientInput[] = matched
      .filter((m) => typeof m.r.grams === 'number' && m.r.grams! > 0)
      .map((m) => ({
        id: m.ing.id,
        name: m.r.declarationName ?? m.r.name,
        per100g: (m.ing.nutritionPer100g ?? {}) as IngredientInput['per100g'],
        quantity: m.r.grams!,
        unit: 'g',
        densityGPerMl: m.ing.densityGPerML ?? undefined,
      }))
    const result = calculateLabel(engineRows, {
      basis: 'serving',
      servingSizeG: serving.sizeG,
      servingsPerPackage: serving.perContainer,
    })
    // The engine appends "(NNNg)" to the household measure itself — strip a
    // gram suffix the maker may have typed so it never doubles up.
    const householdMeasure = serving.sizeDesc
      ? serving.sizeDesc.replace(/\s*\(\s*\d+(?:\.\d+)?\s*g\s*\)\s*$/i, '').trim() || undefined
      : undefined
    panel = toPanelData(result, {
      suggestedServing: householdMeasure,
      showVoluntaryFats: true,
    })
  }

  // SUPPLEMENT: panel from the structured formulation block via the canonical
  // engine (21 CFR 101.36) — never derived from free-text gram rows, because
  // %DV and per-serving mg/mcg amounts can't be guessed from a formula list.
  let otherIngredients: string[] | null = null
  if (input.domain === 'SUPPLEMENT' && supplement) {
    const result = toSupplementPanelData(supplement.dietaryIngredients, supplement.blends, {
      servingSize: supplement.servingForm,
      servingsPerContainer: supplement.servingsPerContainer,
      ...(supplement.nutrition ? { nutrition: supplement.nutrition } : {}),
    })
    panel = result.panel
    otherIngredients = result.otherIngredients.length > 0 ? result.otherIngredients : null
  }

  // COSMETIC: INCI from domainData.inci name when present, else declaration name.
  let inciText: string | null = null
  if (input.domain === 'COSMETIC' && matched.length > 0) {
    const items = matched.map((m) => {
      const inci =
        m.ing.domainData && typeof m.ing.domainData === 'object'
          ? ((m.ing.domainData as { inci?: { name?: string } }).inci?.name ?? null)
          : null
      return { inciName: inci ?? m.r.declarationName ?? m.r.name, pct: m.r.grams ?? 0 }
    })
    inciText = toInciDeclaration(items as never).text ?? null
  }

  // PET: descending-weight order; GA values require lab results (not invented).
  const petOrder =
    input.domain === 'PET' && statementItems.length > 0
      ? [...statementItems].sort((a, b) => b.grams - a.grams).map((i) => i.declarationName)
      : null

  return {
    domain: input.domain,
    rows: rowResolutions,
    coverage: {
      resolved: matched.length,
      total: rows.length,
      unresolvedNames,
    },
    serving,
    panel,
    statement,
    containsLine,
    containsIncomplete: !fullyResolved,
    inciText,
    petOrder,
    otherIngredients,
    petGa: input.domain === 'PET' ? payloadPetGa(input.payload) : null,
  }
}

/**
 * Auto-match rows by exact name at submit time so most rows arrive resolved —
 * returns the payload with `ingredientId` pinned where a match exists.
 */
export async function autoMatchRecipePayload(
  payload: Record<string, unknown>,
  partnerId: string,
): Promise<Record<string, unknown>> {
  const rows = payloadRows(payload)
  if (rows.length === 0) return payload
  const visibility = { OR: [{ ownerPartnerId: null }, { ownerPartnerId: partnerId }] }
  const out: PayloadRow[] = []
  for (const row of rows) {
    if (row.ingredientId) {
      out.push(row)
      continue
    }
    const ing = await prisma.ingredient.findFirst({
      where: {
        AND: [
          visibility,
          {
            OR: [
              { name: { equals: row.name, mode: 'insensitive' } },
              { internalName: { equals: row.name, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    out.push(ing ? { ...row, ingredientId: ing.id } : row)
  }
  return { ...payload, rows: out }
}
