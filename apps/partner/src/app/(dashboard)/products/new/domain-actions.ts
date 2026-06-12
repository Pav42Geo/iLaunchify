'use server'

// Persist the product domain (ProductTemplate.labelingType) chosen in the step-3
// toggle (Phase 1+). The labeling type drives the compliance rule pack + the Facts
// panel. Selecting a domain in the builder is an explicit manufacturer choice, so
// we also clear the category-derived lock (labelingTypeLocked = false). Partner-
// gated to the owning service + audited. Cast-guarded.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export type LabelingTypeValue = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'
const VALID: LabelingTypeValue[] = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'OTC', 'COSMETIC']

type Result = { ok: true } | { ok: false; error: string }

export async function setDraftLabelingType(draftId: string, labelingType: LabelingTypeValue): Promise<Result> {
  if (!VALID.includes(labelingType)) return { ok: false, error: 'Invalid labeling type.' }
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true, services: { select: { id: true } } } })
  if (!partner) return { ok: false, error: 'Partner profile not found.' }
  const tpl = await prisma.productTemplate.findUnique({ where: { id: draftId }, select: { manufacturerServiceId: true } })
  if (!tpl) return { ok: false, error: 'Draft not found.' }
  const ownIds = partner.services.map((s) => s.id)
  if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }
  try {
    await (prisma as unknown as { productTemplate: { update: (a: unknown) => Promise<unknown> } }).productTemplate.update({
      where: { id: draftId },
      data: { labelingType, labelingTypeLocked: false },
    })
    await logAuditAs(user, { entityType: 'ProductTemplate', entityId: draftId, action: 'LABELING_TYPE_SET', payload: { labelingType } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not set labeling type: ${(err as Error).message}` }
  }
}
