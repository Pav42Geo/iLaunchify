'use server'

import { prisma } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import { z } from 'zod'

const LeadSchema = z.object({
  companyName: z.string().min(2).max(120),
  legalName: z.string().max(120).optional(),
  contactName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  website: z.string().url().max(200).optional().or(z.literal('')),
  serviceType: z.enum(['MANUFACTURING', 'LABEL_PRINTING', 'COPACKING']),
  monthlyCapacity: z.string().max(80),
  certifications: z.string().max(200),
  successDescription: z.string().min(20).max(800),
})

export type SubmitLeadResult = { ok: true } | { ok: false; error: string }

export async function submitLead(input: z.infer<typeof LeadSchema>): Promise<SubmitLeadResult> {
  const parsed = LeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }
  const v = parsed.data

  // Idempotency: don't duplicate if a Partner with this email already exists.
  const existingUser = await prisma.user.findUnique({ where: { email: v.email } })
  if (existingUser?.partner) {
    return {
      ok: false,
      error: 'An application with this email already exists. We will follow up there.',
    }
  }

  // Create User + Partner + draft PartnerService in one transaction.
  const created = await prisma.user.create({
    data: {
      email: v.email,
      name: v.contactName,
      role: 'PARTNER',
      partner: {
        create: {
          companyName: v.companyName,
          legalName: v.legalName || v.companyName,
          status: 'DRAFT',
          leadSource: 'public-apply-form',
          leadNotes: JSON.stringify({
            contactName: v.contactName,
            phone: v.phone || null,
            monthlyCapacity: v.monthlyCapacity,
            certifications: v.certifications,
            successDescription: v.successDescription,
            submittedAt: new Date().toISOString(),
          }),
          websiteUrl: v.website || null,
          contactPhone: v.phone || null,
          country: 'US',
          services: {
            create: {
              type: v.serviceType,
              status: 'DRAFT',
              disclosureLevel: 'ANONYMOUS',
              capabilities: { type: v.serviceType }, // empty stub — partner fills during onboarding
            },
          },
        },
      },
    },
    include: { partner: true },
  })

  // Fan out PARTNER_APPLIED to every admin user. Notifications dispatcher
  // never throws, so this won't block the response if email is unconfigured.
  if (created.partner) {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    })
    await Promise.allSettled(
      admins.map((a) =>
        dispatchNotification({
          userId: a.id,
          event: 'PARTNER_APPLIED',
          data: {
            companyName: v.companyName,
            partnerEmail: v.email,
            partnerId: created.partner!.id,
          },
          audience: 'admin',
        }),
      ),
    )
  }

  return { ok: true }
}
