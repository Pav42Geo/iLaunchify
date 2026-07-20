'use server'

// CP-4 — the co-pack Service Builder writer (docs/COPACK_SERVICE_SPEC §5, CP-4).
// This is the FIRST writer for the typed co-pack pricing model (CP-1 tables:
// PartnerCopackLine / PartnerCopackOperation / PartnerCopackConfig). Until now a
// co-packer could not be paid what they charge because co-packing had no price
// at all (spec §0). This action lets them author it.
//
// One transactional save for the whole 6-step builder, mirroring the prototype's
// single draft/publish model (design/copacker-service-builder-prototype.html):
//   • lines      — REPLACE the set (physics: speed + changeover + rate + window)
//   • operations — UPSERT by opType (@@unique), delete the ones switched off
//   • config     — 1:1 upsert (basics + run charges + supply model)
//   • scope      — MERGE into capabilities JSON (formats/fills/packs/certs) +
//                  the typed appliesLabels column
// HARD RULES (Pavel): real data only, no invented defaults; ownership-fenced;
// every write audited; cents/bps are Int, hours→minutes ×60, never Decimal.
// SHADOW: nothing here reaches an invoice yet — CP-3 wires the quote into the
// price behind the PP-0 shadow. This only lets the partner declare the price.

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

export const COPACK_OP_TYPES = [
  'FILL_CLOSE',
  'LABEL_APPLY',
  'KIT_ASSEMBLY',
  'INSERT',
  'SHRINK_BUNDLE',
  'CASE_PACK',
  'QC_COA',
  'REWORK',
] as const
export type CopackOpType = (typeof COPACK_OP_TYPES)[number]

export const COPACK_PRICING_UNITS = [
  'PER_UNIT',
  'PER_PACK',
  'PER_CASE',
  'PER_PALLET',
  'PER_RUN',
  'PER_HOUR',
] as const
export type CopackPricingUnit = (typeof COPACK_PRICING_UNITS)[number]

export interface CopackLineDraft {
  name: string
  runSpeedUnitsPerHour: number
  changeoverMinutes: number
  lineRateCentsPerHour: number
  minRunUnits: number
  maxRunUnits: number | null
  allergenClass: string | null
  active: boolean
}

export interface CopackOpDraft {
  opType: CopackOpType
  pricingUnit: CopackPricingUnit
  priceCents: number
  on: boolean
}

export interface CopackBuilderPayload {
  serviceName: string | null
  facilityId: string | null
  baseLeadTimeDays: number | null
  minOrderValueCents: number | null
  weeklyCapacityUnits: number | null
  rushUpliftBps: number | null
  rushLeadTimeDays: number | null
  maxRushPerWeek: number | null
  changeoverFeeCents: number | null
  minRunChargeCents: number | null
  repeatRunDiscountBps: number | null
  supplyModel: 'FILL_ONLY' | 'SUPPLIES_CONTAINER'
  appliesLabels: boolean
  containerFormats: string[]
  fillTypes: string[]
  packStyles: string[]
  certifications: string[]
  suppliesContainer: boolean | null
  lines: CopackLineDraft[]
  operations: CopackOpDraft[]
}

/** Ownership fence: the acting user's own COPACKING service row, or null. */
async function ownCopackService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: 'COPACKING', partner: { userId } },
    select: { id: true, capabilities: true },
  })
}

/** Non-negative finite Int, or null. Rejects garbage rather than defaulting it. */
const posInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null

/**
 * Write the whole co-pack builder in one transaction. Additive to the DB, safe
 * to re-run: lines are replaced wholesale, operations reconcile by opType,
 * config is a 1:1 upsert. Returns the first validation failure, never a partial
 * write (the transaction rolls back on throw).
 */
export async function saveCopackBuilder(
  serviceId: string,
  payload: CopackBuilderPayload,
): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownCopackService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Co-packing service not found.' }

  // --- validate lines (the physics must be real to quote) ---
  const lines = payload.lines ?? []
  for (const l of lines) {
    if (!l.name?.trim()) return { ok: false, error: 'Every line needs a name.' }
    if (posInt(l.runSpeedUnitsPerHour) === null || l.runSpeedUnitsPerHour <= 0)
      return { ok: false, error: `Line "${l.name}" needs a run speed above zero.` }
    if (posInt(l.changeoverMinutes) === null)
      return { ok: false, error: `Line "${l.name}" needs a changeover time.` }
    if (posInt(l.lineRateCentsPerHour) === null || l.lineRateCentsPerHour <= 0)
      return { ok: false, error: `Line "${l.name}" needs a line rate above zero.` }
    if (l.maxRunUnits != null && l.minRunUnits != null && l.maxRunUnits < l.minRunUnits)
      return { ok: false, error: `Line "${l.name}" max run is below its min run.` }
  }

  // --- validate the switched-on operations ---
  const ops = (payload.operations ?? []).filter((o) => o.on)
  for (const o of ops) {
    if (!COPACK_OP_TYPES.includes(o.opType)) return { ok: false, error: `Unknown operation ${o.opType}.` }
    if (!COPACK_PRICING_UNITS.includes(o.pricingUnit))
      return { ok: false, error: `Unknown pricing unit for ${o.opType}.` }
    if (posInt(o.priceCents) === null) return { ok: false, error: `Operation ${o.opType} needs a price.` }
  }

  const capsPatch: Record<string, unknown> = {
    containerFormats: payload.containerFormats ?? [],
    fillTypes: payload.fillTypes ?? [],
    packStyles: payload.packStyles ?? [],
    certifications: payload.certifications ?? [],
  }
  if (payload.suppliesContainer !== null) capsPatch.suppliesContainer = payload.suppliesContainer
  if (posInt(payload.maxRushPerWeek) !== null) capsPatch.maxRushJobsPerWeek = posInt(payload.maxRushPerWeek)
  // PartnerService has no `name` column; the internal service name (creators
  // never see it) lives in capabilities.
  if (payload.serviceName?.trim()) capsPatch.serviceName = payload.serviceName.trim()

  try {
    await prisma.$transaction(async (tx) => {
      const currentCaps = { ...((service.capabilities ?? { type: 'COPACKING' }) as Record<string, unknown>) }
      const nextCaps = { ...currentCaps, ...capsPatch }

      await tx.partnerService.update({
        where: { id: service.id },
        data: {
          ...(payload.facilityId ? { facilityId: payload.facilityId } : {}),
          appliesLabels: Boolean(payload.appliesLabels),
          capabilities: nextCaps as Prisma.InputJsonValue,
        },
      })

      // Config — 1:1 upsert (all cents/bps/day Ints; null = derive/none).
      const configData = {
        changeoverFeeCents: posInt(payload.changeoverFeeCents),
        minRunChargeCents: posInt(payload.minRunChargeCents),
        repeatRunDiscountBps: posInt(payload.repeatRunDiscountBps),
        rushUpliftBps: posInt(payload.rushUpliftBps),
        rushLeadTimeDays: posInt(payload.rushLeadTimeDays),
        minOrderValueCents: posInt(payload.minOrderValueCents),
        weeklyCapacityUnits: posInt(payload.weeklyCapacityUnits),
        baseLeadTimeDays: posInt(payload.baseLeadTimeDays),
        supplyModel: payload.supplyModel === 'SUPPLIES_CONTAINER' ? 'SUPPLIES_CONTAINER' : 'FILL_ONLY',
      } as const
      await tx.partnerCopackConfig.upsert({
        where: { partnerServiceId: service.id },
        create: { partnerServiceId: service.id, ...configData },
        update: configData,
      })

      // Lines — replace the set. Regenerating ids is fine; nothing references a
      // line id yet (routing reads config + operations, not a specific line).
      await tx.partnerCopackLine.deleteMany({ where: { partnerServiceId: service.id } })
      if (lines.length > 0) {
        await tx.partnerCopackLine.createMany({
          data: lines.map((l) => ({
            partnerServiceId: service.id,
            name: l.name.trim(),
            runSpeedUnitsPerHour: Math.round(l.runSpeedUnitsPerHour),
            changeoverMinutes: Math.round(l.changeoverMinutes),
            lineRateCentsPerHour: Math.round(l.lineRateCentsPerHour),
            minRunUnits: posInt(l.minRunUnits) ?? 0,
            maxRunUnits: l.maxRunUnits != null ? posInt(l.maxRunUnits) : null,
            allergenClass: l.allergenClass?.trim() || null,
            // Per-line format constraints land with CP-5 (routing job vocabulary).
            // Empty = "no constraint on this axis" (engine §3); service scope in
            // capabilities is the gate today, so a line is never wrongly excluded.
            containerFormats: [],
            fillTypes: [],
            status: l.active ? 'ACTIVE' : 'DRAFT',
          })),
        })
      }

      // Operations — reconcile by opType. On → upsert; off → remove if present.
      const onTypes = new Set(ops.map((o) => o.opType))
      await tx.partnerCopackOperation.deleteMany({
        where: { partnerServiceId: service.id, opType: { notIn: [...onTypes] as CopackOpType[] } },
      })
      for (const o of ops) {
        const opData = { pricingUnit: o.pricingUnit, priceCents: Math.round(o.priceCents), status: 'ACTIVE' as const }
        await tx.partnerCopackOperation.upsert({
          where: { partnerServiceId_opType: { partnerServiceId: service.id, opType: o.opType } },
          create: { partnerServiceId: service.id, opType: o.opType, ...opData },
          update: opData,
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message || 'unknown error'}` }
  }

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'COPACK_BUILDER_SAVED',
    payload: {
      lines: lines.length,
      operations: ops.length,
      supplyModel: payload.supplyModel,
      appliesLabels: payload.appliesLabels,
    },
  })

  revalidatePath('/services/copacking')
  revalidatePath('/services')
  revalidatePath('/activation')
  return { ok: true }
}
