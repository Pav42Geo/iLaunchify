// Admin team invites (docs/ADMIN_RBAC.md). CRUD over the AdminInvite model.
// Token HASHING happens in the caller (the server action) — this layer only
// stores/reads the hash. Cast-guarded: the generated client doesn't know
// AdminInvite until the Mac `prisma generate`, so reads fail safe (empty).

import { prisma } from './index'

export type AdminInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export type AdminInviteRow = {
  id: string
  email: string
  adminRole: string
  status: AdminInviteStatus
  invitedById: string
  invitedByName: string | null
  invitedByEmail: string | null
  acceptedById: string | null
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

function model() {
  // ADMIN-RBAC-CAST: drop once the generated client knows AdminInvite.
  return prisma as unknown as {
    adminInvite: {
      create: (a: unknown) => Promise<{ id: string }>
      findUnique: (a: unknown) => Promise<AdminInviteRow | null>
      findMany: (a?: unknown) => Promise<AdminInviteRow[]>
      update: (a: unknown) => Promise<unknown>
      updateMany: (a: unknown) => Promise<{ count: number }>
    }
  }
}

const LIST_SELECT = {
  id: true,
  email: true,
  adminRole: true,
  status: true,
  invitedById: true,
  acceptedById: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  invitedBy: { select: { name: true, email: true } },
} as const

type RawRow = Omit<AdminInviteRow, 'invitedByName' | 'invitedByEmail'> & {
  invitedBy: { name: string | null; email: string | null } | null
}

function flatten(r: RawRow): AdminInviteRow {
  const { invitedBy, ...rest } = r
  return { ...rest, invitedByName: invitedBy?.name ?? null, invitedByEmail: invitedBy?.email ?? null }
}

export async function createAdminInvite(input: {
  email: string
  adminRole: string
  tokenHash: string
  invitedById: string
  expiresAt: Date
}): Promise<string> {
  const row = await model().adminInvite.create({
    data: {
      email: input.email,
      adminRole: input.adminRole,
      tokenHash: input.tokenHash,
      invitedById: input.invitedById,
      expiresAt: input.expiresAt,
    },
  })
  return row.id
}

/** Lookup by token hash (acceptance). Returns null if unknown. */
export async function getAdminInviteByTokenHash(tokenHash: string): Promise<AdminInviteRow | null> {
  const r = (await model().adminInvite.findUnique({
    where: { tokenHash },
    select: LIST_SELECT,
  })) as RawRow | null
  return r ? flatten(r) : null
}

/** Pending (non-accepted/revoked) invites, newest first. Empty on missing model. */
export async function listAdminInvites(): Promise<AdminInviteRow[]> {
  try {
    const rows = (await model()
      .adminInvite.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: LIST_SELECT,
      })
      .catch(() => [] as RawRow[])) as RawRow[]
    return rows.map(flatten)
  } catch {
    return []
  }
}

export async function markAdminInviteAccepted(id: string, acceptedById: string): Promise<void> {
  await model().adminInvite.update({
    where: { id },
    data: { status: 'ACCEPTED', acceptedById, acceptedAt: new Date() },
  })
}

export async function revokeAdminInvite(id: string): Promise<void> {
  await model().adminInvite.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  })
}
