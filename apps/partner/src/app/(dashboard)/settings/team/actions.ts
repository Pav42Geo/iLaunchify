'use server'

// P3 partner team management — docs/PRINT_PRODUCTION_WORKFLOW.md §2.1–2.4
// (D1 LOCKED). Org-admin-only surface; team management unlocks once the
// Partner is ACTIVE ("invite your team after your company is approved").
// Every mutation writes an AuditLog row.

import { randomBytes } from 'node:crypto'
import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess, requirePartnerAdminAccess } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { sendTransactionalEmail, renderEmailHtml, renderEmailText } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const INVITE_TTL_DAYS = 14

export interface ServiceGrantInput {
  serviceId: string
  roles: string[] // PARTNER_PREPRESS / PARTNER_PRODUCTION
}

const VALID_SERVICE_ROLES = new Set(['PARTNER_PREPRESS', 'PARTNER_PRODUCTION'])

export async function invitePartnerTeammate({
  email,
  grantAdmin,
  serviceGrants,
}: {
  email: string
  grantAdmin: boolean
  serviceGrants: ServiceGrantInput[]
}): Promise<Result> {
  const user = await requireUser()
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) return { ok: false, error: 'Only organization admins can invite teammates.' }

  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: { id: true, status: true, companyName: true, services: { select: { id: true } } },
  })
  if (!partner) return { ok: false, error: 'Partner not found.' }
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED') {
    return { ok: false, error: 'Team invites unlock once your company is approved and active.' }
  }

  const address = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { ok: false, error: 'Enter a valid email address.' }

  const ownServiceIds = new Set(partner.services.map((s) => s.id))
  const grants = serviceGrants
    .filter((g) => ownServiceIds.has(g.serviceId))
    .map((g) => ({ serviceId: g.serviceId, roles: g.roles.filter((r) => VALID_SERVICE_ROLES.has(r)) }))
    .filter((g) => g.roles.length > 0)
  if (!grantAdmin && grants.length === 0) {
    return { ok: false, error: 'Grant at least one role — admin, or a service role.' }
  }

  // No duplicate active membership / pending invite for this address.
  const existingMember = await prisma.partnerMembership.findFirst({
    where: { partnerId: partner.id, removedAt: null, user: { email: address } },
    select: { id: true },
  })
  if (existingMember) return { ok: false, error: 'That person is already on your team.' }
  const pending = await prisma.partnerInvite.findFirst({
    where: { partnerId: partner.id, emailAddress: address, status: 'PENDING' },
    select: { id: true },
  })
  if (pending) return { ok: false, error: 'An invite for that address is already pending — revoke it first to change roles.' }

  const token = randomBytes(24).toString('base64url')
  const invite = await prisma.partnerInvite.create({
    data: {
      partnerId: partner.id,
      invitedByUserId: user.id,
      emailAddress: address,
      grantAdmin,
      serviceGrants: grants,
      token,
      tokenExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'PARTNER_TEAMMATE_INVITED',
    payload: { inviteId: invite.id, email: address, grantAdmin, serviceGrantCount: grants.length },
  })

  const host = process.env.PARTNER_LOGIN_HOST ?? 'http://localhost:3002'
  const emailContent = {
    title: `Join ${partner.companyName} on iLaunchify`,
    body: `You've been invited to join ${partner.companyName}'s partner workspace. The link below is valid for ${INVITE_TTL_DAYS} days. If you don't have an iLaunchify account yet, log in with this email address (${address}) — we'll create one for you.`,
    preheader: `${partner.companyName} invited you to their iLaunchify team`,
    cta: { label: 'Accept invitation', url: `${host}/invite/${token}` },
  }
  await sendTransactionalEmail({
    to: address,
    subject: `${partner.companyName} invited you to their iLaunchify team`,
    html: renderEmailHtml(emailContent),
    text: renderEmailText(emailContent),
  }).catch(() => {}) // invite row exists either way; admin can re-send by revoke+reinvite

  revalidatePath('/settings/team')
  return { ok: true }
}

export async function revokePartnerInvite({ inviteId }: { inviteId: string }): Promise<Result> {
  const user = await requireUser()
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) return { ok: false, error: 'Only organization admins can manage invites.' }

  const invite = await prisma.partnerInvite.findFirst({
    where: { id: inviteId, partnerId: access.partnerId, status: 'PENDING' },
    select: { id: true, emailAddress: true },
  })
  if (!invite) return { ok: false, error: 'Invite not found or already settled.' }

  await prisma.partnerInvite.update({
    where: { id: invite.id },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: user.id },
  })
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: access.partnerId,
    action: 'PARTNER_INVITE_REVOKED',
    payload: { inviteId: invite.id, email: invite.emailAddress },
  })

  revalidatePath('/settings/team')
  return { ok: true }
}

export async function removePartnerTeammate({
  membershipId,
  reason,
}: {
  membershipId: string
  reason?: string
}): Promise<Result> {
  const user = await requireUser()
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) return { ok: false, error: 'Only organization admins can remove teammates.' }

  const membership = await prisma.partnerMembership.findFirst({
    where: { id: membershipId, partnerId: access.partnerId, removedAt: null },
    select: { id: true, userId: true, partner: { select: { userId: true } } },
  })
  if (!membership) return { ok: false, error: 'Membership not found.' }
  if (membership.userId === membership.partner.userId) {
    return { ok: false, error: 'The founder of record cannot be removed.' }
  }
  if (membership.userId === user.id) {
    return { ok: false, error: 'You cannot remove yourself — ask another admin.' }
  }

  const cleanReason = reason?.trim().slice(0, 300) || null
  await prisma.$transaction([
    prisma.partnerMembership.update({
      where: { id: membership.id },
      data: { removedAt: new Date(), removedByUserId: user.id, removedReason: cleanReason },
    }),
    prisma.partnerServiceMembership.updateMany({
      where: { partnerMembershipId: membership.id, removedAt: null },
      data: { removedAt: new Date(), removedByUserId: user.id },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: access.partnerId,
    action: 'PARTNER_TEAMMATE_REMOVED',
    payload: { membershipId: membership.id, removedUserId: membership.userId, reason: cleanReason },
  })

  revalidatePath('/settings/team')
  return { ok: true }
}

export async function acceptPartnerInvite({ token }: { token: string }): Promise<Result> {
  const user = await requireUser()

  const invite = await prisma.partnerInvite.findUnique({
    where: { token },
    select: {
      id: true,
      partnerId: true,
      emailAddress: true,
      grantAdmin: true,
      serviceGrants: true,
      status: true,
      tokenExpiresAt: true,
      invitedByUserId: true,
    },
  })
  if (!invite || invite.status !== 'PENDING') return { ok: false, error: 'This invite is no longer valid.' }
  if (invite.tokenExpiresAt < new Date()) {
    await prisma.partnerInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } })
    return { ok: false, error: 'This invite has expired — ask your admin to send a new one.' }
  }
  if (user.email?.toLowerCase() !== invite.emailAddress) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.emailAddress} — log in with that address to accept.`,
    }
  }
  // A founder of another partner can't also join a second org in V1.
  if (await getPartnerAccess(user.id)) {
    return { ok: false, error: 'Your account already belongs to a partner organization.' }
  }

  const grants = Array.isArray(invite.serviceGrants)
    ? (invite.serviceGrants as { serviceId: string; roles: string[] }[])
    : []

  await prisma.$transaction(async (tx) => {
    const membership = await tx.partnerMembership.create({
      data: {
        partnerId: invite.partnerId,
        userId: user.id,
        isAdmin: invite.grantAdmin,
        invitedByUserId: invite.invitedByUserId,
        invitedAt: new Date(),
      },
      select: { id: true },
    })
    for (const g of grants) {
      await tx.partnerServiceMembership.create({
        data: {
          partnerMembershipId: membership.id,
          partnerServiceId: g.serviceId,
          roles: g.roles as never,
        },
      })
    }
    await tx.partnerInvite.update({
      where: { id: invite.id },
      data: { status: 'CONSUMED', consumedAt: new Date(), consumedByUserId: user.id },
    })
    // The partner dashboard requires role=PARTNER; a valid consumed invite is
    // the authorization for that flip (role alone grants nothing without a
    // membership — tenant isolation stays membership-keyed).
    if (user.role !== 'PARTNER') {
      await tx.user.update({ where: { id: user.id }, data: { role: 'PARTNER' } })
    }
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: invite.partnerId,
    action: 'PARTNER_INVITE_ACCEPTED',
    payload: { inviteId: invite.id, grantAdmin: invite.grantAdmin, serviceGrantCount: grants.length },
  })

  return { ok: true }
}
