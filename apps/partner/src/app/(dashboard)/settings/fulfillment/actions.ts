'use server'

// FC settings actions — Partner Role Accounts P1 (docs/PARTNER_ROLE_ACCOUNTS.md
// §3.1.E): receiving-spec editor + blackout dates. Ownership guard walks
// service → partner → userId (tenant isolation, threat #1); every mutation
// writes an AuditLog row.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

async function loadOwnedWarehouseService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: 'WAREHOUSE', partner: { userId } },
    select: { id: true, receivingSpecJson: true },
  })
}

export interface ReceivingSpecInput {
  appointmentRequired: boolean
  appointmentNotice: string // e.g. "48h notice via email"
  receivingHours: string // e.g. "Mon–Fri 7:00–15:00 PT"
  palletSpec: string // e.g. "GMA 48x40, ≤ 60in stack, stretch-wrapped"
  labelPlacement: string // e.g. "Pallet labels on two adjacent sides"
  notes: string
}

export async function saveReceivingSpec({
  serviceId,
  spec,
}: {
  serviceId: string
  spec: ReceivingSpecInput
}): Promise<Result> {
  const user = await requireUser()
  const service = await loadOwnedWarehouseService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Fulfillment service not found' }

  const clean: ReceivingSpecInput = {
    appointmentRequired: Boolean(spec.appointmentRequired),
    appointmentNotice: (spec.appointmentNotice ?? '').trim().slice(0, 300),
    receivingHours: (spec.receivingHours ?? '').trim().slice(0, 300),
    palletSpec: (spec.palletSpec ?? '').trim().slice(0, 500),
    labelPlacement: (spec.labelPlacement ?? '').trim().slice(0, 300),
    notes: (spec.notes ?? '').trim().slice(0, 1000),
  }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: { receivingSpecJson: clean as unknown as object },
  })

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'FC_RECEIVING_SPEC_UPDATED',
    payload: { spec: clean },
  })

  revalidatePath('/settings/fulfillment')
  return { ok: true }
}

export async function addBlackoutDate({
  serviceId,
  startsOn,
  endsOn,
  reason,
}: {
  serviceId: string
  startsOn: string // yyyy-mm-dd
  endsOn: string
  reason?: string
}): Promise<Result> {
  const user = await requireUser()
  const service = await loadOwnedWarehouseService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Fulfillment service not found' }

  const start = new Date(startsOn)
  const end = new Date(endsOn)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Enter valid start and end dates.' }
  }
  if (end < start) return { ok: false, error: 'End date must be on or after the start date.' }
  const spanDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  if (spanDays > 60) return { ok: false, error: 'Blackout windows are capped at 60 days — contact support for longer closures.' }
  const note = reason?.trim().slice(0, 200) || null

  const row = await prisma.partnerBlackoutDate.create({
    data: {
      partnerServiceId: service.id,
      startsOn: start,
      endsOn: end,
      reason: note,
      createdById: user.id,
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'FC_BLACKOUT_ADDED',
    payload: { blackoutId: row.id, startsOn, endsOn, reason: note },
  })

  revalidatePath('/settings/fulfillment')
  return { ok: true }
}

export async function removeBlackoutDate({ blackoutId }: { blackoutId: string }): Promise<Result> {
  const user = await requireUser()
  const row = await prisma.partnerBlackoutDate.findFirst({
    where: { id: blackoutId, partnerService: { partner: { userId: user.id } } },
    select: { id: true, partnerServiceId: true, startsOn: true, endsOn: true },
  })
  if (!row) return { ok: false, error: 'Blackout window not found' }

  await prisma.partnerBlackoutDate.delete({ where: { id: row.id } })

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: row.partnerServiceId,
    action: 'FC_BLACKOUT_REMOVED',
    payload: {
      blackoutId: row.id,
      startsOn: row.startsOn.toISOString(),
      endsOn: row.endsOn.toISOString(),
    },
  })

  revalidatePath('/settings/fulfillment')
  return { ok: true }
}
