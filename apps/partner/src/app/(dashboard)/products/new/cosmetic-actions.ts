'use server'

// Cosmetic formulation persistence (Phase 2). Cosmetics have no facts box — the
// formulation is an INCI ingredient list (+ MoCRA contact + net contents), stored
// as a JSON payload under ProductTemplate.formulationData.cosmetic. Partner-gated
// to the owning service + audited. Cast-guarded until formulationData migrates.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export interface CosmeticIngredientRow {
  uid: string
  inciName: string
  pct: number
  isColorAdditive: boolean
  isFragrance: boolean
}
export interface CosmeticFormulationPayload {
  ingredients: CosmeticIngredientRow[]
  netContentsQty: number
  netContentsUnit: string // 'fl oz' | 'mL' | 'g' | 'oz'
  responsiblePerson: string // MoCRA responsible person / business
  adverseEventContact: string // MoCRA adverse-event contact (email/phone/US address)
}

type Result = { ok: true } | { ok: false; error: string }
type LoadResult = { ok: true; data: CosmeticFormulationPayload | null } | { ok: false; error: string }

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

export async function saveCosmeticFormulation(draftId: string, payload: CosmeticFormulationPayload): Promise<Result> {
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
    const merged = { ...(existing?.formulationData ?? {}), cosmetic: payload }
    await px.productTemplate.update({ where: { id: draftId }, data: { formulationData: merged } })
    await logAuditAs(gate.user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'COSMETIC_FORMULATION_SAVED',
      payload: { ingredients: payload.ingredients.length },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save formulation: ${(err as Error).message}` }
  }
}

export async function loadCosmeticFormulation(draftId: string): Promise<LoadResult> {
  const gate = await ownDraft(draftId)
  if (gate.error) return { ok: false, error: gate.error }
  try {
    const px = prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: { cosmetic?: CosmeticFormulationPayload } | null } | null> }
    }
    const row = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    return { ok: true, data: row?.formulationData?.cosmetic ?? null }
  } catch (err) {
    return { ok: false, error: `Could not load formulation: ${(err as Error).message}` }
  }
}
