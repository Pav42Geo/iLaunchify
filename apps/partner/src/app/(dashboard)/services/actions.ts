'use server'

// Services page actions — "Add a service" (prototype #p-capabilities,
// Pavel 2026-07-12). A partner can extend their offering post-approval:
// the new PartnerService starts as DRAFT, scoped to the primary facility,
// and goes LIVE only through its Activation Setup track (the dashboard
// nudge + activation engine already handle later-added services). Audited;
// one service per type per partner (schema @@unique).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

const SERVICE_TYPES = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE'] as const
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
