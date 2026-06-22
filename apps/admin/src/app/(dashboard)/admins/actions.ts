'use server'

// Admin team management (docs/ADMIN_RBAC.md P4). SUPER_ADMIN-only: assign an
// admin's RBAC role. Every change is audited. You cannot change your OWN role
// (prevents self-lockout — ask another super admin).

import { randomBytes, createHash } from 'node:crypto'
import { requireCapability, ADMIN_ROLES, ADMIN_ROLE_LABEL, type AdminRole } from '@ilaunchify/auth'
import { prisma, createAdminInvite as createAdminInviteRow, revokeAdminInvite as revokeAdminInviteRow } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { sendTransactionalEmail } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const INVITE_TTL_DAYS = 7

function adminBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ADMIN_URL ??
    process.env.ADMIN_URL ??
    'http://localhost:3003'
  ).replace(/\/$/, '')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function setAdminRole(input: { userId: string; role: AdminRole }): Promise<Result> {
  const actor = await requireCapability('users:admin')

  if (!ADMIN_ROLES.includes(input.role)) return { ok: false, error: 'Unknown role.' }
  if (input.userId === actor.id) {
    return { ok: false, error: 'Ask another super admin to change your own role.' }
  }

  // ADMIN-RBAC-CAST: generated client doesn't know `adminRole` until Mac generate.
  const userModel = prisma.user as unknown as {
    findUnique: (a: unknown) => Promise<{ id: string; role: string; adminRole: AdminRole | null } | null>
    update: (a: unknown) => Promise<unknown>
  }

  const target = await userModel.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, adminRole: true },
  })
  if (!target || target.role !== 'ADMIN') return { ok: false, error: 'Not an admin user.' }
  if (target.adminRole === input.role) return { ok: true }

  await userModel.update({ where: { id: input.userId }, data: { adminRole: input.role } })

  await logAuditAs(actor, {
    entityType: 'User',
    entityId: input.userId,
    action: 'ADMIN_ROLE_CHANGED',
    fromValue: target.adminRole ?? 'SUPER_ADMIN (default)',
    toValue: input.role,
  })

  revalidatePath('/admins')
  return { ok: true }
}

// Grant admin access to an EXISTING user (by email) + assign their role. We do
// NOT create accounts or set passwords here — the person must already have an
// account (have signed up). Promoting a creator/partner account is blocked to
// avoid accidentally converting a real customer account into an admin.
export async function grantAdminAccess(input: { email: string; role: AdminRole }): Promise<Result> {
  const actor = await requireCapability('users:admin')
  if (!ADMIN_ROLES.includes(input.role)) return { ok: false, error: 'Unknown role.' }
  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  // ADMIN-RBAC-CAST: generated client doesn't know `adminRole` until Mac generate.
  const userModel = prisma.user as unknown as {
    findFirst: (a: unknown) => Promise<{
      id: string
      role: string
      creatorProfile: { id: string } | null
      partner: { id: string } | null
    } | null>
    update: (a: unknown) => Promise<unknown>
  }

  const user = await userModel.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true, creatorProfile: { select: { id: true } }, partner: { select: { id: true } } },
  })
  if (!user) {
    return { ok: false, error: 'No account with that email. Ask them to sign up first, then grant access.' }
  }
  if (user.role !== 'ADMIN' && (user.creatorProfile || user.partner)) {
    return { ok: false, error: 'That email belongs to a creator/partner account — use a separate admin account.' }
  }

  await userModel.update({
    where: { id: user.id },
    data: { role: 'ADMIN', adminRole: input.role },
  })

  await logAuditAs(actor, {
    entityType: 'User',
    entityId: user.id,
    action: 'ADMIN_ACCESS_GRANTED',
    toValue: input.role,
    payload: { email },
  })

  revalidatePath('/admins')
  return { ok: true }
}

// Invite a NEW person to the admin team. We never create the account — we mint a
// signed invite link; the invitee signs up through the normal auth providers and
// accepts the invite, which assigns the role. Returns the link to share.
export async function createAdminInvite(input: {
  email: string
  role: AdminRole
}): Promise<{ ok: true; link: string; email: string; emailed: boolean } | { ok: false; error: string }> {
  const actor = await requireCapability('users:admin')
  if (!ADMIN_ROLES.includes(input.role)) return { ok: false, error: 'Unknown role.' }
  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  // If they already have an account that is an admin, no invite needed.
  const existing = await (
    prisma.user as unknown as {
      findFirst: (a: unknown) => Promise<{ role: string } | null>
    }
  ).findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { role: true } })
  if (existing?.role === 'ADMIN') {
    return { ok: false, error: 'That email is already an admin. Change their role on this page instead.' }
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const inviteId = await createAdminInviteRow({
    email,
    adminRole: input.role,
    tokenHash: hashToken(token),
    invitedById: actor.id,
    expiresAt,
  })

  const link = `${adminBaseUrl()}/accept-invite?token=${token}`
  const roleLabel = ADMIN_ROLE_LABEL[input.role]

  const result = await sendTransactionalEmail({
    to: email,
    subject: `You've been invited to the iLaunchify admin team`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <h2 style="font-size:20px;margin:0 0 8px">You're invited to the admin team</h2>
        <p style="font-size:14px;line-height:1.5;color:#444">
          You've been invited to join the iLaunchify admin console as
          <strong>${roleLabel}</strong>. Click below to accept — you'll sign in (or sign up)
          with this email address and land with that role.
        </p>
        <p style="margin:20px 0">
          <a href="${link}" style="background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:9999px;font-size:14px;font-weight:600;display:inline-block">Accept invite</a>
        </p>
        <p style="font-size:12px;color:#888">This invite expires in ${INVITE_TTL_DAYS} days. If you weren't expecting it, you can ignore this email.</p>
      </div>`,
    text: `You've been invited to the iLaunchify admin team as ${roleLabel}. Accept: ${link} (expires in ${INVITE_TTL_DAYS} days).`,
  })

  await logAuditAs(actor, {
    entityType: 'AdminInvite',
    entityId: inviteId,
    action: 'ADMIN_INVITE_CREATED',
    toValue: input.role,
    payload: { email, emailed: result.sent },
  })

  revalidatePath('/admins')
  return { ok: true, link, email, emailed: result.sent }
}

export async function revokeAdminInvite(input: { inviteId: string }): Promise<Result> {
  const actor = await requireCapability('users:admin')
  await revokeAdminInviteRow(input.inviteId)
  await logAuditAs(actor, {
    entityType: 'AdminInvite',
    entityId: input.inviteId,
    action: 'ADMIN_INVITE_REVOKED',
  })
  revalidatePath('/admins')
  return { ok: true }
}
