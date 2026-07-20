'use server'

// PP-1 (writer half) — persist a printer's per-process price curves
// (docs/PRINT_PRICING_SPEC §3.1). The evaluator is @ilaunchify/orders/print-price.
//
// GATED on the PS-9-0 db:push: `PartnerOfferingPriceCurve` is not in the generated client yet, so we
// reach it via the `prisma as unknown as {...}` cast the spec already established (§8 "accessed via
// prisma as unknown as casts pending db:push"). It compiles now and runs after the push.
//
// OFFERING COUPLING (open decision, Pavel): curves key on `offeringId`, not the service, so this writes
// them to the printer's PRIMARY PartnerPackagingOffering. If Pavel decides curves should live at the
// service level, adjust the schema + this resolver; the shape here does not change.

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

export interface PrintCurveDraft {
  process: string // PrintProcess enum value
  baseQty: number
  basePriceCents: number
  incrementQty: number
  incrementPriceCents: number
  maxQty: number | null
  quoteRequired: boolean
}

export interface PrintCurvesPayload {
  serviceName: string | null
  standardLeadDays: number | null
  minOrderValueCents: number | null
  curves: PrintCurveDraft[]
}

/** The ungenerated curve delegate, reached via the established interim cast (pending PS-9-0). */
type CurveDelegate = {
  deleteMany: (a: unknown) => Promise<unknown>
  createMany: (a: unknown) => Promise<unknown>
  findMany: (a: unknown) => Promise<unknown>
}
const curveDelegate = (client: unknown): CurveDelegate =>
  (client as { partnerOfferingPriceCurve: CurveDelegate }).partnerOfferingPriceCurve

async function ownPrintService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: 'LABEL_PRINTING', partner: { userId } },
    select: { id: true, capabilities: true },
  })
}

const posInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null

export async function savePrintCurves(serviceId: string, payload: PrintCurvesPayload): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownPrintService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Print service not found.' }

  // Curves attach to an offering (the coupling). Use the printer's primary one.
  const offering = await prisma.partnerPackagingOffering.findFirst({
    where: { partnerServiceId: service.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!offering) {
    return { ok: false, error: 'Add a packaging offering first, then your price curves attach to it.' }
  }

  const curves = payload.curves ?? []
  for (const c of curves) {
    if (posInt(c.baseQty) === null || c.baseQty <= 0) return { ok: false, error: `A ${c.process} curve needs a base quantity above zero.` }
    if (posInt(c.basePriceCents) === null) return { ok: false, error: `The ${c.process} curve needs a price at its base quantity.` }
    if (posInt(c.incrementQty) === null || c.incrementQty <= 0) return { ok: false, error: `The ${c.process} curve needs an increment above zero.` }
  }

  const capsPatch: Record<string, unknown> = {}
  if (payload.serviceName?.trim()) capsPatch.serviceName = payload.serviceName.trim()
  if (posInt(payload.standardLeadDays) !== null) capsPatch.leadTimeDays = posInt(payload.standardLeadDays)
  if (posInt(payload.minOrderValueCents) !== null) capsPatch.minOrderValueCents = posInt(payload.minOrderValueCents)

  try {
    await prisma.$transaction(async (tx) => {
      const currentCaps = { ...((service.capabilities ?? { type: 'LABEL_PRINTING' }) as Record<string, unknown>) }
      const nextCaps = { ...currentCaps, ...capsPatch }
      await tx.partnerService.update({ where: { id: service.id }, data: { capabilities: nextCaps as Prisma.InputJsonValue } })

      const del = curveDelegate(tx)
      await del.deleteMany({ where: { offeringId: offering.id } })
      if (curves.length > 0) {
        await del.createMany({
          data: curves.map((c) => ({
            offeringId: offering.id,
            printProcess: c.process,
            baseQty: Math.round(c.baseQty),
            basePriceCents: Math.round(c.basePriceCents),
            incrementQty: Math.round(c.incrementQty),
            incrementPriceCents: Math.round(c.incrementPriceCents),
            maxQty: c.maxQty != null ? Math.round(c.maxQty) : null,
            quoteRequired: Boolean(c.quoteRequired),
            status: 'ACTIVE',
          })),
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message || 'unknown error'}` }
  }

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'PRINT_CURVES_SAVED',
    payload: { offeringId: offering.id, curves: curves.length },
  })
  revalidatePath('/services/printing')
  revalidatePath('/services')
  return { ok: true }
}
