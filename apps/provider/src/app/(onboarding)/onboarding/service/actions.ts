'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
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

  revalidatePath('/onboarding')
  revalidatePath('/onboarding/service')
  return { ok: true as const }
}
