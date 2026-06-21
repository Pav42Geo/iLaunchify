'use server'

// Admin CRUD for SupportCannedReply (canned / macro replies). Admin-gated +
// audited (entityType "SupportCannedReply"). Cast-guarded: the model lands on the
// generated client only after the migration.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type Result = { ok: true } | { ok: false; error: string }

// SUPPORT-CANNED-CAST — drop after db generate knows SupportCannedReply.
function cannedModel() {
  return (
    prisma as unknown as {
      supportCannedReply: {
        create: (a: unknown) => Promise<{ id: string }>
        update: (a: unknown) => Promise<unknown>
        delete: (a: unknown) => Promise<unknown>
        findUnique: (a: unknown) => Promise<{ id: string; title: string; isActive: boolean } | null>
        aggregate: (a: unknown) => Promise<{ _max: { sortOrder: number | null } }>
      }
    }
  ).supportCannedReply
}

export interface CannedReplyInput {
  title: string
  body: string
  categoryId?: string | null
  sortOrder?: number
  isActive?: boolean
}

export async function createCannedReply(input: CannedReplyInput): Promise<Result> {
  const admin = await requireRole(['ADMIN'])
  const title = input.title?.trim() ?? ''
  const body = input.body?.trim() ?? ''
  if (title.length < 2) return { ok: false, error: 'Title is required.' }
  if (body.length < 2) return { ok: false, error: 'Reply body is required.' }

  let sortOrder = input.sortOrder
  if (sortOrder === undefined || !Number.isFinite(sortOrder)) {
    const max = await cannedModel().aggregate({ _max: { sortOrder: true } }).catch(() => ({ _max: { sortOrder: null } }))
    sortOrder = (max._max.sortOrder ?? 0) + 10
  }

  try {
    const created = await cannedModel().create({
      data: {
        title: title.slice(0, 120),
        body: body.slice(0, 10000),
        categoryId: input.categoryId || null,
        sortOrder: Math.floor(sortOrder),
        isActive: input.isActive ?? true,
        createdById: admin.id,
      },
    })
    await logAuditAs(admin, {
      entityType: 'SupportCannedReply',
      entityId: created.id,
      action: 'CANNED_REPLY_CREATED',
      toValue: title,
    })
    revalidatePath('/support-tickets/saved-replies')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

export async function updateCannedReply(id: string, input: CannedReplyInput): Promise<Result> {
  const admin = await requireRole(['ADMIN'])
  const title = input.title?.trim() ?? ''
  const body = input.body?.trim() ?? ''
  if (title.length < 2) return { ok: false, error: 'Title is required.' }
  if (body.length < 2) return { ok: false, error: 'Reply body is required.' }

  try {
    await cannedModel().update({
      where: { id },
      data: {
        title: title.slice(0, 120),
        body: body.slice(0, 10000),
        categoryId: input.categoryId || null,
        ...(input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
          ? { sortOrder: Math.floor(input.sortOrder) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
    await logAuditAs(admin, {
      entityType: 'SupportCannedReply',
      entityId: id,
      action: 'CANNED_REPLY_UPDATED',
      toValue: title,
    })
    revalidatePath('/support-tickets/saved-replies')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

export async function toggleCannedReplyActive(id: string): Promise<Result> {
  const admin = await requireRole(['ADMIN'])
  const existing = await cannedModel().findUnique({ where: { id } }).catch(() => null)
  if (!existing) return { ok: false, error: 'Reply not found.' }
  try {
    await cannedModel().update({ where: { id }, data: { isActive: !existing.isActive } })
    await logAuditAs(admin, {
      entityType: 'SupportCannedReply',
      entityId: id,
      action: 'CANNED_REPLY_STATUS_CHANGED',
      fromValue: String(existing.isActive),
      toValue: String(!existing.isActive),
    })
    revalidatePath('/support-tickets/saved-replies')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` }
  }
}

export async function deleteCannedReply(id: string): Promise<Result> {
  const admin = await requireRole(['ADMIN'])
  const existing = await cannedModel().findUnique({ where: { id } }).catch(() => null)
  if (!existing) return { ok: false, error: 'Reply not found.' }
  try {
    await cannedModel().delete({ where: { id } })
    await logAuditAs(admin, {
      entityType: 'SupportCannedReply',
      entityId: id,
      action: 'CANNED_REPLY_DELETED',
      fromValue: existing.title,
    })
    revalidatePath('/support-tickets/saved-replies')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not delete: ${(err as Error).message}` }
  }
}
