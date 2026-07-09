'use server'

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { z } from 'zod'

const LeadSchema = z.object({
  companyName: z.string().min(2).max(120),
  legalName: z.string().max(120).optional().or(z.literal('')),
  yearsInBusiness: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(4).default('US'),
  regionCode: z.string().max(8).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  facilityCount: z.string().max(12).optional().or(z.literal('')),
  companySize: z.string().max(16).optional().or(z.literal('')),
  entityType: z.string().max(20).optional().or(z.literal('')),
  contactName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional().or(z.literal('')),
  website: z.string().url().max(200).optional().or(z.literal('')),
  serviceTypes: z
    .array(z.enum(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']))
    .min(1),
  // Adaptive per-service answers (declaration blob, one key per selected service).
  // The authoritative structured capture happens in onboarding; this is triage.
  serviceDetails: z.record(z.string(), z.unknown()).default({}),
  certificateTypeIds: z.array(z.string()).default([]),
  producedFor: z.string().max(600).optional().or(z.literal('')),
  successDescription: z.string().min(20).max(800),
})

export type SubmitLeadResult = { ok: true } | { ok: false; error: string }

export async function submitLead(input: z.infer<typeof LeadSchema>): Promise<SubmitLeadResult> {
  const parsed = LeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  const v = parsed.data

  // Idempotency: don't duplicate if a Partner with this email already exists.
  const existingUser = await prisma.user.findUnique({ where: { email: v.email }, include: { partner: true } })
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
            yearsInBusiness: v.yearsInBusiness || null,
            facilityCount: v.facilityCount || null,
            companySize: v.companySize || null,
            entityType: v.entityType || null,
            serviceDetails: v.serviceDetails,
            certificateTypeIds: v.certificateTypeIds,
            producedFor: v.producedFor || null,
            successDescription: v.successDescription,
            submittedAt: new Date().toISOString(),
          }),
          websiteUrl: v.website || null,
          contactPhone: v.phone || null,
          // Location → real Partner columns so onboarding pre-fills (no re-typing).
          country: v.country || 'US',
          state: v.regionCode || null,
          city: v.city || null,
          services: {
            // One DRAFT service per selected capability — partners are multi-service;
            // the onboarding/activation flow composes off this set.
            create: v.serviceTypes.map((t) => ({
              type: t,
              status: 'DRAFT' as const,
              disclosureLevel: 'ANONYMOUS' as const,
              capabilities: { type: t }, // empty stub — partner fills during onboarding
            })),
          },
        },
      },
    },
    include: { partner: true },
  })

  // Fan out PARTNER_APPLIED to every admin user. Notifications dispatcher
  // never throws, so this won't block the response if email is unconfigured.
  if (created.partner) {
    logSystemAudit({
      entityType: 'Partner',
      entityId: created.partner.id,
      action: 'PARTNER_LEAD_CREATE',
      payload: { email: v.email, companyName: v.companyName, serviceTypes: v.serviceTypes },
    })

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

    // Acknowledge to the applicant (PARTNER_APPLICATION_RECEIVED). Best-effort —
    // the dispatcher never throws, so a missing Resend key won't block the apply.
    await dispatchNotification({
      userId: created.id,
      event: 'PARTNER_APPLICATION_RECEIVED',
      data: { companyName: v.companyName },
      audience: 'partner',
    })
  }

  return { ok: true }
}
