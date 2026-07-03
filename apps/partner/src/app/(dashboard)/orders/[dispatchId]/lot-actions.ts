'use server'

// P2 lot traceability, producing-partner side (docs/PARTNER_ROLE_ACCOUNTS.md
// §3.2.B): structured output-lot records on PRODUCT/COPACKING dispatches —
// output lot ↔ input ingredient lots + yield. Complements the COA ship-doc
// (file ↔ lot linkage); this is the recall-trace data structure. Records are
// immutable once created (corrections = a new record + note; audit trail
// stays whole).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { serviceOwnedBy } from '@/lib/partner-context'

type Result = { ok: true } | { ok: false; error: string }

const LOT_RECORD_STATUSES = new Set(['PRODUCING', 'QUALITY_CHECK', 'READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'])

export interface IngredientLotLine {
  ingredientName: string
  supplierLot: string
}

export async function recordProductionLot({
  dispatchId,
  lotNumber,
  expiryAt,
  unitsProduced,
  unitsExpected,
  scrapReason,
  ingredientLots,
}: {
  dispatchId: string
  lotNumber: string
  expiryAt?: string // yyyy-mm-dd
  unitsProduced: number
  unitsExpected?: number
  scrapReason?: string
  ingredientLots: IngredientLotLine[]
}): Promise<Result> {
  const user = await requireUser()

  const dispatch = await prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: serviceOwnedBy(user.id) },
    select: { id: true, type: true, status: true, orderId: true },
  })
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.type === 'LABEL') {
    return { ok: false, error: 'Lot records apply to production and co-packing dispatches.' }
  }
  if (!LOT_RECORD_STATUSES.has(dispatch.status)) {
    return { ok: false, error: `Cannot record a lot from ${dispatch.status}.` }
  }

  const lot = lotNumber.trim()
  if (lot.length === 0 || lot.length > 64) {
    return { ok: false, error: 'Enter the lot number (max 64 characters).' }
  }
  if (!Number.isInteger(unitsProduced) || unitsProduced <= 0) {
    return { ok: false, error: 'Units produced must be a positive whole number.' }
  }
  if (unitsExpected != null && (!Number.isInteger(unitsExpected) || unitsExpected <= 0)) {
    return { ok: false, error: 'Expected units must be a positive whole number.' }
  }
  let expiry: Date | null = null
  if (expiryAt?.trim()) {
    expiry = new Date(expiryAt)
    if (Number.isNaN(expiry.getTime())) return { ok: false, error: 'Expiry must be a valid date.' }
  }
  const cleanIngredients = ingredientLots
    .map((l) => ({ ingredientName: l.ingredientName.trim().slice(0, 120), supplierLot: l.supplierLot.trim().slice(0, 64) }))
    .filter((l) => l.ingredientName && l.supplierLot)

  const existing = await prisma.productionLot.findFirst({
    where: { orderDispatchId: dispatch.id, lotNumber: lot },
    select: { id: true },
  })
  if (existing) return { ok: false, error: `Lot ${lot} is already recorded on this dispatch.` }

  const row = await prisma.productionLot.create({
    data: {
      orderDispatchId: dispatch.id,
      lotNumber: lot,
      expiryAt: expiry,
      unitsProduced,
      unitsExpected: unitsExpected ?? null,
      scrapReason: scrapReason?.trim().slice(0, 300) || null,
      ingredientLotsJson: cleanIngredients,
      recordedById: user.id,
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'PRODUCTION_LOT_RECORDED',
    payload: {
      orderId: dispatch.orderId,
      productionLotId: row.id,
      lotNumber: lot,
      unitsProduced,
      unitsExpected: unitsExpected ?? null,
      ingredientLotCount: cleanIngredients.length,
    },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}
