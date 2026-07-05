'use server'

// OTC Drug Facts persistence. OTC monograph drugs declare a Drug Facts box
// (21 CFR 201.66): active ingredients + purpose, uses, warnings, directions,
// other information, inactive ingredients, questions line. Stored as a JSON
// payload under ProductTemplate.formulationData.otc — the same envelope the
// supplement / cosmetic / pet formulations use, and exactly the shape
// computeProductLabel's OTC resolver reads. Partner-gated to the owning
// service + audited. Cast-guarded until formulationData migrates.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export interface OtcActiveIngredientRow {
  uid: string
  /** "Acetaminophen 500 mg (in each caplet)". */
  name: string
  /** "Pain reliever/fever reducer". */
  purpose: string
}
export interface OtcWarningRow {
  uid: string
  text: string
  /** Bold sub-header lines ("Do not use", "Ask a doctor before use if"). */
  bold: boolean
}
export interface OtcFormulationPayload {
  activeIngredients: OtcActiveIngredientRow[]
  uses: string[]
  warnings: OtcWarningRow[]
  directions: string
  otherInformation: string[]
  inactiveIngredients: string
  questions: string
}

type Result = { ok: true } | { ok: false; error: string }
type LoadResult = { ok: true; data: OtcFormulationPayload | null } | { ok: false; error: string }

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

export async function saveOtcFormulation(draftId: string, payload: OtcFormulationPayload): Promise<Result> {
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
    const merged = { ...(existing?.formulationData ?? {}), otc: payload }
    await px.productTemplate.update({ where: { id: draftId }, data: { formulationData: merged } })
    await logAuditAs(gate.user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'OTC_FORMULATION_SAVED',
      payload: { activeIngredients: payload.activeIngredients.length, uses: payload.uses.length, warnings: payload.warnings.length },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save Drug Facts: ${(err as Error).message}` }
  }
}

export async function loadOtcFormulation(draftId: string): Promise<LoadResult> {
  const gate = await ownDraft(draftId)
  if (gate.error) return { ok: false, error: gate.error }
  try {
    const px = prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{ formulationData: { otc?: OtcFormulationPayload } | null } | null> }
    }
    const row = await px.productTemplate.findUnique({ where: { id: draftId }, select: { formulationData: true } }).catch(() => null)
    return { ok: true, data: row?.formulationData?.otc ?? null }
  } catch (err) {
    return { ok: false, error: `Could not load Drug Facts: ${(err as Error).message}` }
  }
}
