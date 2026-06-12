'use server'

// Pet formulation persistence (Phase 3). Pet products use an ingredient list +
// Guaranteed Analysis + AAFCO nutritional-adequacy statement + feeding directions,
// stored under ProductTemplate.formulationData.pet. Partner-gated + audited.
// Cast-guarded until formulationData migrates.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export interface PetIngredientRow { uid: string; name: string; weight: number }
export interface PetGuaranteedAnalysis {
  crudeProteinMinPct: number
  crudeFatMinPct: number
  crudeFiberMaxPct: number
  moistureMaxPct: number
  others: { name: string; value: number; bound: 'min' | 'max'; unit: string }[]
}
export interface PetFormulationPayload {
  ingredients: PetIngredientRow[]
  ga: PetGuaranteedAnalysis
  species: 'Dog' | 'Cat'
  lifeStage: 'growth' | 'maintenance' | 'all' | 'gestation'
  method: 'formulated' | 'feeding_test' | 'intermittent'
  feedingDirections: string
}

type Result = { ok: true } | { ok: false; error: string }
type LoadResult = { ok: true; data: PetFormulationPayload | null } | { ok: false; error: string }

async function ownDraft(draftId: string) {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user: null, error: 'Not a partner account.' as string }
  const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true, services: { select: { id: true } } } })
  if (!partner) return { user: null, error: 'Partner profile not found.' }
  const tpl = await prisma.productTemplate.findUnique({ where: { id: draftId }, select: { manufacturerServiceId: true } })
  if (!tpl) return { user: null, error: 'Draft not found.' }
  const ownIds = partner.services.map((s) => s.id)
  if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { user: null, error: 'Not your product.' }
  return { user, error: null as null }
}

export async function savePetFormulation(draftId: string, payload: PetFormulationPayload): Promise<Result> {
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
    const merged = { ...(existing?.formulationData ?? {}), pet: payload }
    await px.productTemplate.update({ where: { id: draftId }, data: { formulationData: merged } })
    await logAuditAs(gate.user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'PET_FORMULATION_SAVED',
      payload: { ingredients: payload.ingredients.length, method: payload.method },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save formulation: ${(err as Error).message}` }
  }
}

export async function loadPetFormulation(draftId: string): Promise<LoadResult> {
  const gate = await ownDraft(draftId)
  if (gate.error) return { ok: false, error: gate.error }
  try {
    const px = prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: { pet?: PetFormulationPayload } | null } | null> }
    }
    const row = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    return { ok: true, data: row?.formulationData?.pet ?? null }
  } catch (err) {
    return { ok: false, error: `Could not load formulation: ${(err as Error).message}` }
  }
}
