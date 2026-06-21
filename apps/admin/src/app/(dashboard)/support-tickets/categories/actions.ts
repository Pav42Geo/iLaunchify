'use server'

// Admin CRUD for the TicketCategory taxonomy (W2-SUP, nice-to-have). Each
// category is a typed support bucket with a default priority, optional SLA
// overrides, and an optional default assignee. Mutations are admin-gated +
// audited (entityType "TicketCategory"). Slug is immutable after creation —
// createTicket + the /help forms resolve by slug, so changing it would orphan
// references.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { TicketPriority } from '@ilaunchify/db'

type Result = { ok: true } | { ok: false; error: string }

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

function isPriority(s: string): s is TicketPriority {
  return (PRIORITIES as readonly string[]).includes(s)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clampMinutes(n: unknown): number | null {
  if (n === undefined || n === null || n === '') return null
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v < 1) return null
  return Math.min(v, 60 * 24 * 30) // cap at 30 days
}

export interface CategoryInput {
  slug?: string
  name: string
  description?: string
  defaultPriority: string
  slaResponseMinutes?: number | string | null
  slaResolveMinutes?: number | string | null
  defaultAssigneeUserId?: string | null
  sortOrder?: number
  isActive?: boolean
}

export async function createTicketCategory(input: CategoryInput): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const name = input.name?.trim() ?? ''
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!isPriority(input.defaultPriority)) return { ok: false, error: 'Pick a valid default priority.' }

  const slug = slugify(input.slug?.trim() || name)
  if (!slug) return { ok: false, error: 'Slug could not be derived from the name.' }

  const conflict = await prisma.ticketCategory.findUnique({ where: { slug } })
  if (conflict) return { ok: false, error: `Slug "${slug}" is already taken.` }

  let sortOrder = input.sortOrder
  if (sortOrder === undefined || !Number.isFinite(sortOrder)) {
    const max = await prisma.ticketCategory.aggregate({ _max: { sortOrder: true } })
    sortOrder = (max._max.sortOrder ?? 0) + 10
  }

  const created = await prisma.ticketCategory.create({
    data: {
      slug,
      name,
      description: input.description?.trim() || null,
      defaultPriority: input.defaultPriority,
      slaResponseMinutes: clampMinutes(input.slaResponseMinutes),
      slaResolveMinutes: clampMinutes(input.slaResolveMinutes),
      defaultAssigneeUserId: input.defaultAssigneeUserId || null,
      sortOrder: Math.floor(sortOrder),
      isActive: input.isActive ?? true,
    },
    select: { id: true, slug: true, name: true },
  })

  await logAuditAs(user, {
    entityType: 'TicketCategory',
    entityId: created.id,
    action: 'TICKET_CATEGORY_CREATED',
    toValue: created.name,
    payload: { slug: created.slug },
  })

  revalidatePath('/support-tickets/categories')
  return { ok: true }
}

export async function updateTicketCategory(id: string, input: CategoryInput): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const existing = await prisma.ticketCategory.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!existing) return { ok: false, error: 'Category not found.' }

  const name = input.name?.trim() ?? ''
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!isPriority(input.defaultPriority)) return { ok: false, error: 'Pick a valid default priority.' }

  const data = {
    name,
    description: input.description?.trim() || null,
    defaultPriority: input.defaultPriority,
    slaResponseMinutes: clampMinutes(input.slaResponseMinutes),
    slaResolveMinutes: clampMinutes(input.slaResolveMinutes),
    defaultAssigneeUserId: input.defaultAssigneeUserId || null,
    ...(input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
      ? { sortOrder: Math.floor(input.sortOrder) }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  }

  await prisma.ticketCategory.update({ where: { id }, data })

  await logAuditAs(user, {
    entityType: 'TicketCategory',
    entityId: id,
    action: 'TICKET_CATEGORY_UPDATED',
    toValue: name,
    payload: data,
  })

  revalidatePath('/support-tickets/categories')
  return { ok: true }
}

export async function toggleTicketCategoryActive(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.ticketCategory.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  })
  if (!existing) return { ok: false, error: 'Category not found.' }

  await prisma.ticketCategory.update({ where: { id }, data: { isActive: !existing.isActive } })

  await logAuditAs(user, {
    entityType: 'TicketCategory',
    entityId: id,
    action: 'TICKET_CATEGORY_STATUS_CHANGED',
    fromValue: String(existing.isActive),
    toValue: String(!existing.isActive),
    payload: { isActive: !existing.isActive, name: existing.name },
  })

  revalidatePath('/support-tickets/categories')
  return { ok: true }
}
