'use server'

// Supplement formulation persistence (Phase 1C). Supplements don't fit the food
// TemplateIngredientSlot model, so the dietary ingredients + proprietary blends +
// serving form are stored as a JSON payload under ProductTemplate.formulationData
// (keyed by domain). Partner-gated to the owning service + audited. Cast-guarded
// until the formulationData migration lands on the generated client.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export interface SupplementDietaryRow {
  uid: string
  name: string
  amount: number
  unit: string
  percentDV: string // '' = no established DV (†)
  blendId: string
  isOther: boolean
  amountLessThan?: boolean // print "<" before the amount
  symbol?: string // custom footnote glyph for this row's %DV cell
}
export interface SupplementBlend {
  id: string
  name: string
  total: number
  unit: string
  amountLessThan?: boolean
}
/** Optional Calories/fat/carb/sugars/protein declaration (21 CFR 101.36(b)(2)). */
export interface SupplementNutritionPayload {
  calories?: number
  totalFat?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  totalCarbohydrate?: number
  dietaryFiber?: number
  totalSugars?: number
  addedSugars?: number
  protein?: number
}
export interface SupplementFormulationPayload {
  dietaryIngredients: SupplementDietaryRow[]
  blends: SupplementBlend[]
  servingForm: string
  servingsPerContainer: number
  dosageForm?: string // 'capsule' | 'gummy' | 'powder' | … (DSLD physical state)
  nutrition?: SupplementNutritionPayload // Calories/fat/carb/sugars/protein, if present
  nutritionLessThan?: Record<string, boolean> // per-nutrient "<" trace flags
  noDvSymbol?: string // footnote glyph for no-DV ingredients (default "†")
  customFootnotes?: Array<{ symbol: string; text: string }>
}

type Result = { ok: true } | { ok: false; error: string }
type LoadResult = { ok: true; data: SupplementFormulationPayload | null } | { ok: false; error: string }

async function ownDraft(draftId: string) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user: null, error: 'Not a partner account.' as string }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return { user: null, error: 'Partner profile not found.' }
  const tpl = await prisma.productTemplate.findUnique({ where: { id: draftId }, select: { manufacturerServiceId: true } })
  if (!tpl) return { user: null, error: 'Draft not found.' }
  const ownIds = partner.services.map((s) => s.id)
  if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { user: null, error: 'Not your product.' }
  return { user, error: null as null }
}

/**
 * Persist the supplement formulation onto the draft (merged into formulationData).
 * When `flavorPresetId` is given, the payload is stored PER FLAVOR under
 * `formulationData.supplementByFlavor[flavorPresetId]` (multi-flavor supplements —
 * e.g. gummy flavors that differ). Without it, the base `formulationData.supplement`
 * is written exactly as before. Backward-compatible.
 */
export async function saveSupplementFormulation(
  draftId: string,
  payload: SupplementFormulationPayload,
  flavorPresetId?: string,
): Promise<Result> {
  const gate = await ownDraft(draftId)
  if (gate.error || !gate.user) return { ok: false, error: gate.error ?? 'Unauthorized.' }
  try {
    const px = prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{ formulationData: Record<string, unknown> | null } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
    const existing = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    const baseFd = (existing?.formulationData ?? {}) as Record<string, unknown>
    const merged = flavorPresetId
      ? {
          ...baseFd,
          supplementByFlavor: {
            ...((baseFd.supplementByFlavor as Record<string, unknown>) ?? {}),
            [flavorPresetId]: payload,
          },
        }
      : { ...baseFd, supplement: payload }
    await px.productTemplate.update({ where: { id: draftId }, data: { formulationData: merged } })
    await logAuditAs(gate.user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'SUPPLEMENT_FORMULATION_SAVED',
      payload: { dietaryCount: payload.dietaryIngredients.length, blends: payload.blends.length, flavorPresetId: flavorPresetId ?? null },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save formulation: ${(err as Error).message}` }
  }
}

/** Load the supplement formulation for a draft (null if none). `flavorPresetId`
 *  loads that flavor's formulation; omitted loads the base. */
export async function loadSupplementFormulation(draftId: string, flavorPresetId?: string): Promise<LoadResult> {
  const gate = await ownDraft(draftId)
  if (gate.error) return { ok: false, error: gate.error }
  try {
    const px = prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: { supplement?: SupplementFormulationPayload; supplementByFlavor?: Record<string, SupplementFormulationPayload> } | null } | null> }
    }
    const row = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    const fd = row?.formulationData
    const data = flavorPresetId ? (fd?.supplementByFlavor?.[flavorPresetId] ?? null) : (fd?.supplement ?? null)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: `Could not load formulation: ${(err as Error).message}` }
  }
}
