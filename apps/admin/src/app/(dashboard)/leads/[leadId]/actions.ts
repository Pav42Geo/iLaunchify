'use server'

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertPartnerTransition } from '@ilaunchify/orders'
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

  assertPartnerTransition(partner.status, 'INVITED') // Model A edge: DRAFT/LEAD/INVITED→INVITED
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

// =============================================================================
// Task #575 — Notes + assignment + audit (lead detail v2)
//
// "Leads" in this app are Partner rows in the pre-onboarding funnel (DRAFT /
// INVITED / LEAD). There is no separate Lead model — these helpers operate on
// the Partner row and stash freeform admin notes inside Partner.leadNotes as
// a JSON blob with a notes[] array of { id, body, authorId, authorEmail, at }.
// Every write here is admin-gated and lands an AuditLog row.
// =============================================================================

type LeadNoteRow = {
  id: string
  body: string
  authorId: string
  authorEmail: string
  at: string // ISO
}

type LeadNotesBlob = {
  notes: LeadNoteRow[]
  assignedToUserId?: string | null
}

function safeParseNotes(raw: string | null | undefined): LeadNotesBlob {
  if (!raw) return { notes: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<LeadNotesBlob>
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      assignedToUserId: parsed.assignedToUserId ?? null,
    }
  } catch {
    return { notes: [] }
  }
}

export async function addLeadNote({
  leadId,
  body,
}: {
  leadId: string
  body: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireRole('ADMIN')

  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Note body required' }
  if (trimmed.length > 4000) return { ok: false, error: 'Note too long (max 4000 chars)' }

  const partner = await prisma.partner.findUnique({
    where: { id: leadId },
    select: { id: true, leadNotes: true, companyName: true },
  })
  if (!partner) return { ok: false, error: 'Lead not found' }

  const blob = safeParseNotes(partner.leadNotes)
  const note: LeadNoteRow = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    body: trimmed,
    authorId: admin.id,
    authorEmail: admin.email ?? '',
    at: new Date().toISOString(),
  }
  blob.notes = [note, ...blob.notes]

  await prisma.partner.update({
    where: { id: leadId },
    data: { leadNotes: JSON.stringify(blob) },
  })

  await logAuditAs(admin, {
    entityType: 'Lead',
    entityId: leadId,
    action: 'LEAD_NOTE_ADD',
    payload: { noteId: note.id, companyName: partner.companyName, preview: trimmed.slice(0, 140) },
  })

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

export async function assignLead({
  leadId,
  userId,
}: {
  leadId: string
  userId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({
    where: { id: leadId },
    select: { id: true, leadNotes: true, companyName: true },
  })
  if (!partner) return { ok: false, error: 'Lead not found' }

  if (userId) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    })
    if (!target || target.role !== 'ADMIN') {
      return { ok: false, error: 'Assignee must be an admin user' }
    }
  }

  const blob = safeParseNotes(partner.leadNotes)
  const previous = blob.assignedToUserId ?? null
  blob.assignedToUserId = userId

  await prisma.partner.update({
    where: { id: leadId },
    data: { leadNotes: JSON.stringify(blob) },
  })

  await logAuditAs(admin, {
    entityType: 'Lead',
    entityId: leadId,
    action: 'LEAD_ASSIGN',
    fromValue: previous,
    toValue: userId,
    payload: { companyName: partner.companyName },
  })

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}
