'use server'

// Partner labeling-capability editor (docs/PRINT_PROVIDER_SELECTION.md §2/§8.1/§8.1a).
// Three declarations, all routing-grade:
//   • labelingMode (MANUFACTURING) — can they PRINT decoration? Drives provider-
//     card visibility + routing via effectivePrintSourcing(). Audited on change.
//   • appliesLabels (MANUFACTURING/COPACKING) — can they APPLY labels at fill?
//     The application-point resolver's step 1/2 (the honey problem).
//   • FC value-added services (WAREHOUSE) — declarable jobs; rows stay DRAFT
//     until an ADMIN verifies them (a false RELABEL claim is a platform loss).
//
// AUTH: mirrors settings/storage — service-scoped via the partner's own
// service ids; client-supplied ids outside that set are refused.

import { prisma } from '@ilaunchify/db'
import type { LabelingMode, FcVasJobType, DecorationMethod } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const LABELING_MODES: LabelingMode[] = ['IN_HOUSE', 'EXTERNAL_ALLOWED', 'EXTERNAL_REQUIRED']
const VAS_JOBS: FcVasJobType[] = ['RELABEL', 'KITTING', 'LIGHT_ASSEMBLY', 'BAGGING_BUNDLING', 'DISPLAY_BUILDS', 'REWORK']
const APPLY_METHODS: DecorationMethod[] = ['PRESSURE_SENSITIVE_LABEL', 'SHRINK_SLEEVE', 'HEAT_TRANSFER']

async function ownedService(partnerId: string, serviceId: string, types: string[]) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: { in: types as never }, partnerId },
    select: { id: true, type: true, labelingMode: true, appliesLabels: true },
  })
}

export async function saveLabelingCapabilities(input: {
  serviceId: string
  labelingMode?: LabelingMode
  appliesLabels?: boolean
}): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: 'Not authorized' }
  const service = await ownedService(actor.partnerId, input.serviceId, ['MANUFACTURING', 'COPACKING'])
  if (!service) return { ok: false, error: 'Service not found' }
  if (input.labelingMode && !LABELING_MODES.includes(input.labelingMode)) {
    return { ok: false, error: 'Invalid labeling mode' }
  }
  // labelingMode is a MANUFACTURING declaration only.
  if (input.labelingMode && service.type !== 'MANUFACTURING') {
    return { ok: false, error: 'Labeling mode applies to manufacturing services' }
  }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: {
      ...(input.labelingMode ? { labelingMode: input.labelingMode } : {}),
      ...(typeof input.appliesLabels === 'boolean' ? { appliesLabels: input.appliesLabels } : {}),
    },
  })

  if (input.labelingMode && input.labelingMode !== service.labelingMode) {
    // The audited "event that specifies it" (§2) — routing-grade signal change.
    await logAuditAs(actor.user, {
      entityType: 'PartnerService',
      entityId: service.id,
      action: 'LABELING_MODE_CHANGED',
      fromValue: service.labelingMode,
      toValue: input.labelingMode,
    })
  }
  if (typeof input.appliesLabels === 'boolean' && input.appliesLabels !== service.appliesLabels) {
    await logAuditAs(actor.user, {
      entityType: 'PartnerService',
      entityId: service.id,
      action: 'LABEL_APPLICATION_CHANGED',
      fromValue: String(service.appliesLabels),
      toValue: String(input.appliesLabels),
    })
  }

  revalidatePath('/settings/labeling')
  return { ok: true }
}

// SR-2.2 — printer declares whether its floor can run 1-unit pre-production
// samples (only sampleCapable printers enter the sample rotation pool).
export async function saveSampleCapable(input: {
  serviceId: string
  sampleCapable: boolean
}): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: 'Not authorized' }
  const service = await prisma.partnerService.findFirst({
    where: { id: input.serviceId, type: 'LABEL_PRINTING', partnerId: actor.partnerId },
    select: { id: true, sampleCapable: true },
  })
  if (!service) return { ok: false, error: 'Service not found' }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: { sampleCapable: input.sampleCapable },
  })
  if (input.sampleCapable !== service.sampleCapable) {
    await logAuditAs(actor.user, {
      entityType: 'PartnerService',
      entityId: service.id,
      action: 'SAMPLE_CAPABILITY_CHANGED',
      fromValue: String(service.sampleCapable),
      toValue: String(input.sampleCapable),
    })
  }
  revalidatePath('/settings/labeling')
  return { ok: true }
}

export async function saveVasService(input: {
  serviceId: string
  jobType: FcVasJobType
  labelMethods: DecorationMethod[]
  feeCentsPerUnit: number
  minUnits: number
  leadTimeDays: number
  notes?: string
}): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: 'Not authorized' }
  const service = await ownedService(actor.partnerId, input.serviceId, ['WAREHOUSE'])
  if (!service) return { ok: false, error: 'Fulfillment service not found' }
  if (!VAS_JOBS.includes(input.jobType)) return { ok: false, error: 'Unknown job type' }
  if (!Number.isInteger(input.feeCentsPerUnit) || input.feeCentsPerUnit < 0 || input.feeCentsPerUnit > 100_000) {
    return { ok: false, error: 'Fee must be between $0 and $1,000 per unit' }
  }
  if (!Number.isInteger(input.minUnits) || input.minUnits < 1) return { ok: false, error: 'Minimum units must be ≥ 1' }
  if (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0 || input.leadTimeDays > 60) {
    return { ok: false, error: 'Lead time must be 0–60 days' }
  }
  const labelMethods =
    input.jobType === 'RELABEL' ? input.labelMethods.filter((m) => APPLY_METHODS.includes(m)) : []
  if (input.jobType === 'RELABEL' && labelMethods.length === 0) {
    return { ok: false, error: 'Pick at least one application method your floor can run' }
  }

  // Any partner edit returns the row to DRAFT — admin re-verifies (§8.1a).
  const row = await prisma.fcValueAddedService.upsert({
    where: { partnerServiceId_jobType: { partnerServiceId: service.id, jobType: input.jobType } },
    create: {
      partnerServiceId: service.id,
      jobType: input.jobType,
      labelMethods,
      feeCentsPerUnit: input.feeCentsPerUnit,
      minUnits: input.minUnits,
      leadTimeDays: input.leadTimeDays,
      notes: input.notes?.trim().slice(0, 500) || null,
      status: 'DRAFT',
    },
    update: {
      labelMethods,
      feeCentsPerUnit: input.feeCentsPerUnit,
      minUnits: input.minUnits,
      leadTimeDays: input.leadTimeDays,
      notes: input.notes?.trim().slice(0, 500) || null,
      status: 'DRAFT',
    },
  })

  await logAuditAs(actor.user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'FC_VAS_SUBMITTED',
    payload: { vasId: row.id, jobType: input.jobType, labelMethods },
  })

  revalidatePath('/settings/labeling')
  return { ok: true }
}

export async function removeVasService(input: {
  serviceId: string
  jobType: FcVasJobType
}): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: 'Not authorized' }
  const service = await ownedService(actor.partnerId, input.serviceId, ['WAREHOUSE'])
  if (!service) return { ok: false, error: 'Fulfillment service not found' }
  const row = await prisma.fcValueAddedService.findUnique({
    where: { partnerServiceId_jobType: { partnerServiceId: service.id, jobType: input.jobType } },
  })
  if (!row) return { ok: true }
  await prisma.fcValueAddedService.delete({ where: { id: row.id } })
  await logAuditAs(actor.user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'FC_VAS_REMOVED',
    payload: { jobType: input.jobType },
  })
  revalidatePath('/settings/labeling')
  return { ok: true }
}
