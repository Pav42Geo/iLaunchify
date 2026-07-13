'use server'

// Services page actions (Pavel 2026-07-12/13):
//   addService            — extend the offering (DRAFT → Activation track)
//   saveCapabilities      — MERGE a patch into the service's capabilities JSON
//                           (never replaces the object — unknown keys survive)
//   saveStorageOffering   — the TYPED "storage at your facility" columns on a
//                           producing service (HOLD_AT_MANUFACTURER destination
//                           — explicitly NOT the 3PL/FC WAREHOUSE service)
//   setAppliesLabels      — typed appliesLabels flag on the print service
// All ownership-fenced + audited; nothing writes invented defaults — only the
// keys the partner actually set.

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

// WAREHOUSE deliberately excluded (Pavel 2026-07-13): the FC network is a
// CURATED, admin-contracted partner category (receiving SLAs, multi-client
// liability, network membership — managed in admin Logistics → Fulfillment
// Centers). A producer's own storage is the typed "storage at your facility"
// offering instead; a partner who genuinely wants to run a 3PL gets the
// WAREHOUSE service added by admin under a separate contract.
const SERVICE_TYPES = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as const
export type AddableServiceType = (typeof SERVICE_TYPES)[number]

// Void return so it can bind directly as a <form action>.
export async function addService(type: AddableServiceType): Promise<void> {
  if (!SERVICE_TYPES.includes(type)) return
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      services: { select: { type: true } },
      facilities: { where: { isDefault: true }, select: { id: true }, take: 1 },
    },
  })
  if (!partner) return
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED') return
  if (partner.services.some((s) => (s.type as string) === type)) return // one per type

  const service = await prisma.partnerService.create({
    data: {
      partnerId: partner.id,
      type,
      status: 'DRAFT', // goes live via its Activation track (D8)
      facilityId: partner.facilities[0]?.id ?? null,
      capabilities: { type },
    },
  })

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'SERVICE_ADDED',
    toValue: type,
    payload: { type, via: 'services-page' },
  })

  revalidatePath('/services')
  revalidatePath('/activation')
  revalidatePath('/dashboard')
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/** Ownership fence: the acting user's own service row, or null. */
async function ownService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, partner: { userId } },
    select: { id: true, type: true, capabilities: true },
  })
}

/**
 * MERGE a patch into capabilities JSON. Only keys present in the patch are
 * written; `null` removes a key; everything else in the object survives — a
 * purpose-built editor can never silently drop another editor's data.
 */
export async function saveCapabilities(
  serviceId: string,
  patch: Record<string, unknown>,
): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Service not found.' }
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid patch.' }

  const current = { ...((service.capabilities ?? {}) as Record<string, unknown>) }
  const changed: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    changed.push(k)
    if (v === null) delete current[k]
    else current[k] = v
  }
  if (changed.length === 0) return { ok: true }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: { capabilities: current as Prisma.InputJsonValue },
  })
  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'SERVICE_CAPABILITIES_UPDATED',
    payload: { type: service.type, keys: changed },
  })
  revalidatePath('/services')
  revalidatePath('/activation') // auto-detection reads capabilities
  return { ok: true }
}

const STORAGE_CLASSES = ['AMBIENT', 'PROTECT_HEAT', 'CHILLED', 'FROZEN'] as const
const BILLING_UNITS = ['PALLET_MONTH', 'CUFT_MONTH'] as const

export interface StorageOfferingInput {
  offersStorage?: boolean
  storageClasses?: string[]
  maxDwellDays?: number | null
  storageBillingUnit?: string | null
  storageRateCents?: number | null
  storageFreeGraceDays?: number | null
  storageMinMonthlyCents?: number | null
  canShipParcel?: boolean
  onDemandEnabled?: boolean
}

/**
 * Storage AT THE PARTNER'S OWN FACILITY (HOLD_AT_MANUFACTURER destination) —
 * typed columns on a PRODUCING service. Never touches WAREHOUSE/FC rows.
 */
export async function saveStorageOffering(
  serviceId: string,
  input: StorageOfferingInput,
): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Service not found.' }
  if (service.type === 'WAREHOUSE')
    return { ok: false, error: 'FC storage is managed in Settings → Storage (3PL service).' }

  const data: Record<string, unknown> = {}
  if (typeof input.offersStorage === 'boolean') data.offersStorage = input.offersStorage
  if (Array.isArray(input.storageClasses))
    data.storageClasses = input.storageClasses.filter((c) =>
      (STORAGE_CLASSES as readonly string[]).includes(c),
    )
  const int = (v: number | null | undefined) =>
    v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined
  if (input.maxDwellDays !== undefined) {
    const v = int(input.maxDwellDays)
    if (v !== undefined) data.maxDwellDays = v
  }
  if (input.storageRateCents !== undefined) {
    const v = int(input.storageRateCents)
    if (v !== undefined) data.storageRateCents = v
  }
  if (input.storageFreeGraceDays !== undefined) {
    const v = int(input.storageFreeGraceDays)
    if (v !== undefined) data.storageFreeGraceDays = v
  }
  if (input.storageMinMonthlyCents !== undefined) {
    const v = int(input.storageMinMonthlyCents)
    if (v !== undefined) data.storageMinMonthlyCents = v
  }
  if (input.storageBillingUnit !== undefined) {
    data.storageBillingUnit =
      input.storageBillingUnit &&
      (BILLING_UNITS as readonly string[]).includes(input.storageBillingUnit)
        ? input.storageBillingUnit
        : null
  }
  if (typeof input.canShipParcel === 'boolean') data.canShipParcel = input.canShipParcel
  if (typeof input.onDemandEnabled === 'boolean') data.onDemandEnabled = input.onDemandEnabled
  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.partnerService.update({ where: { id: service.id }, data: data as never })
  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'STORAGE_OFFERING_UPDATED',
    payload: { type: service.type, keys: Object.keys(data) },
  })
  revalidatePath('/services')
  return { ok: true }
}

/** Typed appliesLabels flag (print service applies labels in-house). */
export async function setAppliesLabels(serviceId: string, applies: boolean): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Service not found.' }
  await prisma.partnerService.update({
    where: { id: service.id },
    data: { appliesLabels: Boolean(applies) },
  })
  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'APPLIES_LABELS_SET',
    toValue: String(Boolean(applies)),
    payload: { type: service.type },
  })
  revalidatePath('/services')
  return { ok: true }
}
