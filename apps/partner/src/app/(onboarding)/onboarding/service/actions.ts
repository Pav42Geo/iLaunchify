'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const Schema = z.object({
  serviceId: z.string(),
  capabilities: z.record(z.string(), z.unknown()),
  disclosureLevel: z.enum(['FULL', 'CITY_STATE', 'ANONYMOUS']),
})

export async function saveServiceProfile(input: z.infer<typeof Schema>) {
  const user = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message }

  const service = await prisma.partnerService.findFirst({
    where: { id: parsed.data.serviceId, partner: { userId: user.id } },
  })
  if (!service) return { ok: false as const, error: 'Service not found' }

  await prisma.partnerService.update({
    where: { id: service.id },
    data: {
      capabilities: parsed.data.capabilities,
      disclosureLevel: parsed.data.disclosureLevel,
    },
  })

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'SERVICE_UPDATE',
    payload: {
      type: service.type,
      capabilities: parsed.data.capabilities,
      disclosureLevel: parsed.data.disclosureLevel,
    },
  })

  // Revalidate everywhere this data is shown
  revalidatePath('/onboarding')
  revalidatePath('/onboarding/service')
  revalidatePath('/services')
  revalidatePath('/my-application')
  return { ok: true as const }
}
