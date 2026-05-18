'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const Schema = z.object({
  partnerId: z.string(),
  companyName: z.string().min(2).max(120),
  legalName: z.string().min(2).max(120),
  websiteUrl: z.string().max(200).optional(),
  contactPhone: z.string().max(30).optional(),
  addressLine1: z.string().min(2).max(120),
  addressLine2: z.string().max(120).optional(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(40),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(40),
})

export async function saveCompany(input: z.infer<typeof Schema>) {
  const user = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message }

  const partner = await prisma.partner.findFirst({
    where: { id: parsed.data.partnerId, userId: user.id },
  })
  if (!partner) return { ok: false as const, error: 'Partner not found' }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      companyName: parsed.data.companyName,
      legalName: parsed.data.legalName,
      websiteUrl: parsed.data.websiteUrl || null,
      contactPhone: parsed.data.contactPhone || null,
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city,
      state: parsed.data.state,
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
    },
  })

  revalidatePath('/onboarding')
  return { ok: true as const }
}
