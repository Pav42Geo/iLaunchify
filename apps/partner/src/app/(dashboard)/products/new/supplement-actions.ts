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
}
export interface SupplementBlend {
  id: string
  name: string
  total: number
  unit: string
}
export interface SupplementFormulationPayload {
  dietaryIngredients: SupplementDietaryRow[]
  blends: SupplementBlend[]
  servingForm: string
  servingsPerContainer: number
  dosageForm?: string // 'capsule' | 'gummy' | 'powder' | … (DSLD physical state)
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

/** Persist the supplement formulation onto the draft (merged into formulationData). */
export async function saveSupplementFormulation(draftId: string, payload: SupplementFormulationPayload): Promise<Result> {
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
    const merged = { ...(existing?.formulationData ?? {}), supplement: payload }
    await px.productTemplate.update({ where: { id: draftId }, data: { formulationData: merged } })
    await logAuditAs(gate.user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'SUPPLEMENT_FORMULATION_SAVED',
      payload: { dietaryCount: payload.dietaryIngredients.length, blends: payload.blends.length },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save formulation: ${(err as Error).message}` }
  }
}

/** Load the supplement formulation for a draft (null if none). */
export async function loadSupplementFormulation(draftId: string): Promise<LoadResult> {
  const gate = await ownDraft(draftId)
  if (gate.error) return { ok: false, error: gate.error }
  try {
    const px = prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: { supplement?: SupplementFormulationPayload } | null } | null> }
    }
    const row = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    return { ok: true, data: row?.formulationData?.supplement ?? null }
  } catch (err) {
    return { ok: false, error: `Could not load formulation: ${(err as Error).message}` }
  }
}
