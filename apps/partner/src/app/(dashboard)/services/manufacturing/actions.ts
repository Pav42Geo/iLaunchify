'use server'

// MB-3 — the manufacturing service builder writer (docs/PARTNER_SERVICE_BUILDER_FAMILY_PLAN §2).
// Mirrors saveCopackBuilder (CP-4): one transaction for the whole builder —
//   • lines   — REPLACE the set (PartnerManufacturingLine: the EQUIPMENT, reused across products)
//   • config  — 1:1 upsert (PartnerManufacturingConfig: minOrderValue + overrun policy)
//   • scope   — MERGE into capabilities JSON (categories / fillTypes / containerFormats + lead + name)
// HARD RULES (Pavel): real data only, no invented defaults; ownership-fenced; audited; cents/bps/minutes
// are Int, hours→minutes ×60. The batch SIZE is NOT here (it is a per-product field, MOQ derived per
// product — Pavel's split). Gated on the MB-1 db:push (PartnerManufacturing* in the client).

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

export interface ManufacturingLineDraft {
  name: string
  loadedRateCentsPerHour: number
  changeoverMinutes: number
  maxBatchesPerRun: number
  weeklyCapacityHours: number | null
  allergenClass: string | null
  active: boolean
}

export interface ManufacturingBuilderPayload {
  serviceName: string | null
  leadStockDays: number | null
  leadCustomDays: number | null
  minOrderValueCents: number | null
  overrunPolicyPct: number | null
  categories: string[]
  fillTypes: string[]
  containerFormats: string[]
  lines: ManufacturingLineDraft[]
}

async function ownManufacturingService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: 'MANUFACTURING', partner: { userId } },
    select: { id: true, capabilities: true },
  })
}

const posInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null

export async function saveManufacturingBuilder(
  serviceId: string,
  payload: ManufacturingBuilderPayload,
): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownManufacturingService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Manufacturing service not found.' }

  const lines = payload.lines ?? []
  for (const l of lines) {
    if (!l.name?.trim()) return { ok: false, error: 'Every line needs a name.' }
    if (posInt(l.loadedRateCentsPerHour) === null || l.loadedRateCentsPerHour <= 0)
      return { ok: false, error: `Line "${l.name}" needs a loaded rate above zero.` }
    if (posInt(l.changeoverMinutes) === null) return { ok: false, error: `Line "${l.name}" needs a changeover time.` }
    if (posInt(l.maxBatchesPerRun) === null || l.maxBatchesPerRun < 1)
      return { ok: false, error: `Line "${l.name}" needs a max-batches-per-run of at least 1.` }
  }

  const capsPatch: Record<string, unknown> = {
    categories: payload.categories ?? [],
    fillTypes: payload.fillTypes ?? [],
    containerFormats: payload.containerFormats ?? [],
  }
  if (payload.serviceName?.trim()) capsPatch.serviceName = payload.serviceName.trim()
  if (posInt(payload.leadStockDays) !== null) capsPatch.leadTimeStockDays = posInt(payload.leadStockDays)
  if (posInt(payload.leadCustomDays) !== null) capsPatch.leadTimeCustomDays = posInt(payload.leadCustomDays)

  try {
    await prisma.$transaction(async (tx) => {
      const currentCaps = { ...((service.capabilities ?? { type: 'MANUFACTURING' }) as Record<string, unknown>) }
      const nextCaps = { ...currentCaps, ...capsPatch }
      await tx.partnerService.update({
        where: { id: service.id },
        data: { capabilities: nextCaps as Prisma.InputJsonValue },
      })

      const configData = {
        minOrderValueCents: posInt(payload.minOrderValueCents),
        overrunPolicyPct: payload.overrunPolicyPct != null ? Math.max(0, Math.min(100, Math.round(payload.overrunPolicyPct))) : null,
      } as const
      await tx.partnerManufacturingConfig.upsert({
        where: { partnerServiceId: service.id },
        create: { partnerServiceId: service.id, ...configData },
        update: configData,
      })

      await tx.partnerManufacturingLine.deleteMany({ where: { partnerServiceId: service.id } })
      if (lines.length > 0) {
        await tx.partnerManufacturingLine.createMany({
          data: lines.map((l) => ({
            partnerServiceId: service.id,
            name: l.name.trim(),
            loadedRateCentsPerHour: Math.round(l.loadedRateCentsPerHour),
            changeoverMinutes: Math.round(l.changeoverMinutes),
            maxBatchesPerRun: Math.round(l.maxBatchesPerRun),
            weeklyCapacityHours: l.weeklyCapacityHours != null ? posInt(l.weeklyCapacityHours) : null,
            allergenClass: l.allergenClass?.trim() || null,
            status: l.active ? 'ACTIVE' : 'DRAFT',
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
    action: 'MANUFACTURING_BUILDER_SAVED',
    payload: { lines: lines.length },
  })
  revalidatePath('/services/manufacturing')
  revalidatePath('/services')
  revalidatePath('/activation')
  return { ok: true }
}
