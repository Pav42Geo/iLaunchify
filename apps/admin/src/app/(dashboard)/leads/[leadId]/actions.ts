'use server'

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type QualifyResult =
  | { ok: true; invitationLink?: string; emailSent: boolean }
  | { ok: false; error: string }

/**
 * Qualify a lead: mark Partner INVITED and send a magic-link sign-in email.
 *
 * V1 uses Auth.js's Resend email provider for the magic link. In dev, if
 * AUTH_RESEND_KEY is missing, the link is logged to stderr — copy from there.
 */
export async function qualifyLead({ leadId }: { leadId: string }): Promise<QualifyResult> {
  const admin = await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({
    where: { id: leadId },
    include: { user: true },
  })
  if (!partner) return { ok: false, error: 'Lead not found' }
  if (!['DRAFT', 'INVITED'].includes(partner.status)) {
    return { ok: false, error: `Lead is in ${partner.status} status — already qualified` }
  }

  await prisma.partner.update({
    where: { id: leadId },
    data: { status: 'INVITED' },
  })

  await logAuditAs(admin, {
    entityType: 'Lead',
    entityId: leadId,
    action: 'LEAD_QUALIFY',
    fromValue: partner.status,
    toValue: 'INVITED',
    payload: { companyName: partner.companyName, partnerEmail: partner.user.email },
  })

  // Send the magic link via Resend (Auth.js).
  // We do this by hitting the Auth.js callback URL programmatically. The
  // simpler path used by V1 is to expose a /invite/[token] route and have
  // the partner click "Sign in" — Auth.js then issues a token.
  //
  // V1 short-circuit: rely on the partner using /login. We log a friendly
  // message; production email send is a TODO that lives with the email-templates work.
  const link = `https://partners.ilaunchify.com/login?email=${encodeURIComponent(partner.user.email)}`

  // In dev, log to stderr so Pavel can copy/paste:
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[ADMIN] Invitation issued for ${partner.user.email}. Share this link:\n  ${link}\n`,
    )
  }

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)

  return { ok: true, invitationLink: link, emailSent: false }
}

export async function disqualifyLead({
  leadId,
}: { leadId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({
    where: { id: leadId },
    include: { user: true, services: true },
  })
  if (!partner) return { ok: false, error: 'Lead not found' }
  if (partner.status === 'ACTIVE') {
    return { ok: false, error: 'Cannot disqualify an active partner. Use Suspend instead.' }
  }

  // Audit BEFORE delete so we still have the actor + payload after the row is gone.
  // entityId stays so historical lookups by id still surface "this lead was disqualified".
  await logAuditAs(admin, {
    entityType: 'Lead',
    entityId: leadId,
    action: 'LEAD_DISQUALIFY',
    fromValue: partner.status,
    toValue: null,
    payload: {
      companyName: partner.companyName,
      partnerEmail: partner.user.email,
      servicesCount: partner.services.length,
    },
  })

  // Cascade: PartnerService rows cascade-delete with Partner; Partner cascades with User
  await prisma.user.delete({ where: { id: partner.userId } })

  revalidatePath('/leads')

  return { ok: true }
}
