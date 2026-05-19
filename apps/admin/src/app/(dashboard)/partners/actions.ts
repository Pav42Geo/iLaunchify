'use server'

// Admin-initiated partner invitation.
// Creates User + Partner + draft PartnerService idempotently. Returns the
// magic-link URL the admin can share with the invitee — until Resend email
// is wired, the admin pastes this into an email manually.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ServiceType } from '@prisma/client'

const InviteSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(1).max(200),
  serviceType: z.enum(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING']),
})

export type InvitePartnerResult =
  | { ok: true; partnerId: string; invitationUrl: string; created: boolean }
  | { ok: false; error: string }

const PARTNER_LOGIN_HOST =
  process.env.PARTNER_LOGIN_HOST ?? 'http://localhost:3002'

export async function invitePartner(input: {
  email: string
  companyName: string
  serviceType: ServiceType
}): Promise<InvitePartnerResult> {
  const admin = await requireRole('ADMIN')
  const parsed = InviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message }
  }

  const { email, companyName, serviceType } = parsed.data
  const lowerEmail = email.toLowerCase().trim()

  // Idempotent: if a user with this email already exists, treat as "re-invite"
  // — flip Partner status back to INVITED without creating duplicates.
  const existingUser = await prisma.user.findUnique({
    where: { email: lowerEmail },
    include: { partner: { include: { services: true } } },
  })

  if (existingUser) {
    if (existingUser.role !== 'PARTNER') {
      return {
        ok: false,
        error: `User ${lowerEmail} already exists with role ${existingUser.role}. Cannot convert to PARTNER.`,
      }
    }
    if (existingUser.partner && existingUser.partner.status === 'ACTIVE') {
      return {
        ok: false,
        error: `${lowerEmail} is already an ACTIVE partner — no re-invite needed.`,
      }
    }

    if (existingUser.partner) {
      // Re-flip to INVITED so they get the invite shell again
      await prisma.partner.update({
        where: { id: existingUser.partner.id },
        data: { status: 'INVITED' },
      })

      await logAuditAs(admin, {
        entityType: 'Partner',
        entityId: existingUser.partner.id,
        action: 'PARTNER_APPLY',
        fromValue: existingUser.partner.status,
        toValue: 'INVITED',
        payload: { reinvite: true, companyName: existingUser.partner.companyName },
      })

      revalidatePath('/partners')
      return {
        ok: true,
        partnerId: existingUser.partner.id,
        invitationUrl: `${PARTNER_LOGIN_HOST}/login?email=${encodeURIComponent(lowerEmail)}`,
        created: false,
      }
    }
  }

  // Fresh creation — User + Partner + draft PartnerService in one transaction
  const partner = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: lowerEmail,
          role: 'PARTNER',
        },
      }))

    const created = await tx.partner.create({
      data: {
        userId: user.id,
        companyName,
        legalName: companyName,
        status: 'INVITED',
        leadSource: 'ADMIN_INVITE',
      },
    })

    await tx.partnerService.create({
      data: {
        partnerId: created.id,
        type: serviceType,
        status: 'DRAFT',
        capabilities: {},
      },
    })

    return created
  })

  await logAuditAs(admin, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'PARTNER_APPLY',
    fromValue: null,
    toValue: 'INVITED',
    payload: {
      adminInvite: true,
      companyName,
      partnerEmail: lowerEmail,
      serviceType,
    },
  })

  revalidatePath('/partners')
  revalidatePath('/leads')

  return {
    ok: true,
    partnerId: partner.id,
    invitationUrl: `${PARTNER_LOGIN_HOST}/login?email=${encodeURIComponent(lowerEmail)}`,
    created: true,
  }
}
