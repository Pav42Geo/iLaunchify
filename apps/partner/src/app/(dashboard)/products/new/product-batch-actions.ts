'use server'

// MB-5 (product side) — the product's batch overrides: which MANUFACTURING LINE runs
// this product, and (optionally) a per-product batch size / run time that overrides
// the line default. This is the missing half of Pavel's MOQ split: the LINE carries a
// default batch (PartnerManufacturingLine.unitsPerBatch), and a PRODUCT overrides it
// here, so the DERIVED MOQ (deriveProductMoq, read by routing) actually varies per
// product (sparkling water 30k vs peanut-spice packs 5k, same maker).
//
// Cast-guarded: ProductTemplate.{unitsPerBatch,batchTimeMinutes,manufacturingLineId}
// and PartnerManufacturingLine are not in the generated client until the MB-1 db:push,
// so we reach them via the `prisma as unknown as` pattern this file's neighbors already
// use (loadDraft / loadMedia). Compiles now, runs after the push.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

export interface BatchLine {
  id: string
  name: string
  unitsPerBatch: number | null
}
export interface ProductBatchOptions {
  /** The owning manufacturer's lines to choose from (ACTIVE + DRAFT). */
  lines: BatchLine[]
  /** capabilities.moqMin on the owning manufacturing service (the legacy flat floor). */
  declaredMoqMin: number | null
  /** Current values on the product. */
  manufacturingLineId: string | null
  unitsPerBatch: number | null
  batchTimeMinutes: number | null
}

interface TplRow {
  manufacturerServiceId: string | null
  unitsPerBatch: number | null
  batchTimeMinutes: number | null
  manufacturingLineId: string | null
}

/** The ungenerated delegates, reached via the interim cast (pending MB-1 db:push). */
function castClient(client: unknown) {
  return client as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<TplRow | null>
      update: (a: unknown) => Promise<unknown>
    }
    partnerManufacturingLine: {
      findMany: (a: unknown) => Promise<{ id: string; name: string; unitsPerBatch: number | null }[]>
    }
    partnerService: {
      findUnique: (a: unknown) => Promise<{ capabilities: unknown } | null>
    }
  }
}

async function ownerServiceIds(userId: string): Promise<string[]> {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  return partner?.services.map((s) => s.id) ?? []
}

const posInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null

export async function loadProductBatchOptions(productTemplateId: string): Promise<ProductBatchOptions> {
  const empty: ProductBatchOptions = { lines: [], declaredMoqMin: null, manufacturingLineId: null, unitsPerBatch: null, batchTimeMinutes: null }
  try {
    const user = await requireUser()
    const ownIds = await ownerServiceIds(user.id)
    const p = castClient(prisma)
    const tpl = await p.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, unitsPerBatch: true, batchTimeMinutes: true, manufacturingLineId: true },
    })
    if (!tpl) return empty
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty

    // Offer the OWNING service's lines, else this partner's first manufacturing service.
    const svcId = tpl.manufacturerServiceId ?? ownIds[0] ?? null
    if (!svcId) return { ...empty, unitsPerBatch: tpl.unitsPerBatch, batchTimeMinutes: tpl.batchTimeMinutes, manufacturingLineId: tpl.manufacturingLineId }

    const [lines, svc] = await Promise.all([
      p.partnerManufacturingLine.findMany({
        where: { partnerServiceId: svcId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, unitsPerBatch: true },
      }),
      p.partnerService.findUnique({ where: { id: svcId }, select: { capabilities: true } }),
    ])
    const caps = (svc?.capabilities ?? {}) as Record<string, unknown>
    return {
      lines: lines.map((l) => ({ id: l.id, name: l.name, unitsPerBatch: l.unitsPerBatch })),
      declaredMoqMin: posInt(caps.moqMin),
      manufacturingLineId: tpl.manufacturingLineId,
      unitsPerBatch: tpl.unitsPerBatch,
      batchTimeMinutes: tpl.batchTimeMinutes,
    }
  } catch {
    return empty // models not generated yet (pre MB-1 db:push)
  }
}

export interface ProductBatchInput {
  manufacturingLineId: string | null
  unitsPerBatch: number | null
  batchTimeMinutes: number | null
}

export async function saveProductBatch(productTemplateId: string, input: ProductBatchInput): Promise<Result> {
  try {
    const user = await requireUser()
    const ownIds = await ownerServiceIds(user.id)
    const p = castClient(prisma)
    const tpl = await p.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, unitsPerBatch: true, batchTimeMinutes: true, manufacturingLineId: true },
    })
    if (!tpl) return { ok: false, error: 'Product not found.' }
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'You do not own this product.' }
    }

    // A chosen line must belong to the owning service (never bind another shop's line).
    let lineId: string | null = null
    if (input.manufacturingLineId) {
      const svcId = tpl.manufacturerServiceId ?? ownIds[0] ?? null
      const lines = svcId
        ? await p.partnerManufacturingLine.findMany({ where: { partnerServiceId: svcId }, select: { id: true } })
        : []
      if (lines.some((l) => l.id === input.manufacturingLineId)) lineId = input.manufacturingLineId
    }

    await p.productTemplate.update({
      where: { id: productTemplateId },
      data: {
        manufacturingLineId: lineId,
        unitsPerBatch: posInt(input.unitsPerBatch),
        batchTimeMinutes: posInt(input.batchTimeMinutes),
      },
    })

    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_BATCH_SAVED',
      payload: { manufacturingLineId: lineId, unitsPerBatch: posInt(input.unitsPerBatch) },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message || 'unknown error'}` }
  }
}
