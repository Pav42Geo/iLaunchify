'use server'

// =============================================================================
// /admin/lifestyle-tags — Layer 4 LifestyleTag CRUD server actions
// =============================================================================
//
// Admin-curated vocabulary. Create / edit / soft-toggle / delete (only when
// not in use by any product). Every mutation writes an AuditLog row with
// entityType "LifestyleTag".

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { LifestyleTagGroup } from '@prisma/client'

type Result = { ok: true } | { ok: false; error: string }

const GROUPS = ['LIFESTYLE', 'AUDIENCE', 'TREND'] as const
const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isGroup(s: string): s is LifestyleTagGroup {
  return (GROUPS as readonly string[]).includes(s)
}

function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null
  const v = input.trim()
  if (!v) return null
  if (!HEX_RE.test(v)) return null
  return v.startsWith('#') ? v : `#${v}`
}

// =============================================================================
// Create
// =============================================================================

export async function createLifestyleTag(input: {
  slug?: string
  name: string
  group: string
  description?: string
  iconEmoji?: string
  accentHex?: string
  displayOrder?: number
  isActive?: boolean
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const name = input.name?.trim() ?? ''
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!isGroup(input.group)) return { ok: false, error: 'Pick a valid group.' }

  const slug = slugify(input.slug?.trim() || name)
  if (!slug) return { ok: false, error: 'Slug could not be derived.' }

  const conflict = await prisma.lifestyleTag.findUnique({ where: { slug } })
  if (conflict) return { ok: false, error: `Slug "${slug}" is already taken.` }

  if (input.accentHex && !HEX_RE.test(input.accentHex.trim())) {
    return { ok: false, error: 'Accent must be a hex color like #FF2E63.' }
  }

  // Default displayOrder to the next available slot within the group * 10.
  let displayOrder: number
  if (input.displayOrder === undefined || !Number.isFinite(input.displayOrder)) {
    const max = await prisma.lifestyleTag.aggregate({
      where: { group: input.group },
      _max: { displayOrder: true },
    })
    displayOrder = (max._max.displayOrder ?? 0) + 10
  } else {
    displayOrder = input.displayOrder
  }

  const created = await prisma.lifestyleTag.create({
    data: {
      slug,
      name,
      group: input.group,
      description: input.description?.trim() || null,
      iconEmoji: input.iconEmoji?.trim() || null,
      accentHex: normalizeHex(input.accentHex),
      displayOrder: Math.floor(displayOrder),
      isActive: input.isActive ?? true,
    },
    select: { id: true, slug: true, name: true, group: true },
  })

  await logAuditAs(user, {
    entityType: 'LifestyleTag',
    entityId: created.id,
    action: 'create',
    toValue: created.name,
    payload: { slug: created.slug, group: created.group },
  })

  revalidatePath('/lifestyle-tags')
  return { ok: true }
}

// =============================================================================
// Update
// =============================================================================

export async function updateLifestyleTag(
  id: string,
  input: {
    slug?: string
    name?: string
    group?: string
    description?: string
    iconEmoji?: string
    accentHex?: string
    displayOrder?: number
    isActive?: boolean
  },
): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const existing = await prisma.lifestyleTag.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      group: true,
      description: true,
      iconEmoji: true,
      accentHex: true,
      displayOrder: true,
      isActive: true,
    },
  })
  if (!existing) return { ok: false, error: 'Tag not found.' }

  const data: Record<string, unknown> = {}
  let nameChange: { from: string; to: string } | null = null

  if (input.name !== undefined) {
    const v = input.name.trim()
    if (!v) return { ok: false, error: 'Name is required.' }
    if (v !== existing.name) {
      data.name = v
      nameChange = { from: existing.name, to: v }
    }
  }
  if (input.slug !== undefined) {
    const newSlug = slugify(input.slug.trim())
    if (!newSlug) return { ok: false, error: 'Slug cannot be empty.' }
    if (newSlug !== existing.slug) {
      const conflict = await prisma.lifestyleTag.findUnique({ where: { slug: newSlug } })
      if (conflict) return { ok: false, error: `Slug "${newSlug}" is already taken.` }
      data.slug = newSlug
    }
  }
  if (input.group !== undefined) {
    if (!isGroup(input.group)) return { ok: false, error: 'Pick a valid group.' }
    data.group = input.group
  }
  if (input.description !== undefined) {
    data.description = input.description.trim() || null
  }
  if (input.iconEmoji !== undefined) {
    data.iconEmoji = input.iconEmoji.trim() || null
  }
  if (input.accentHex !== undefined) {
    const v = input.accentHex.trim()
    if (v && !HEX_RE.test(v)) {
      return { ok: false, error: 'Accent must be a hex color like #FF2E63.' }
    }
    data.accentHex = normalizeHex(v)
  }
  if (input.displayOrder !== undefined) {
    if (!Number.isFinite(input.displayOrder) || input.displayOrder < 0) {
      return { ok: false, error: 'Display order must be a non-negative number.' }
    }
    data.displayOrder = Math.floor(input.displayOrder)
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.lifestyleTag.update({ where: { id }, data })

  await logAuditAs(user, {
    entityType: 'LifestyleTag',
    entityId: id,
    action: 'update',
    fromValue: nameChange?.from ?? null,
    toValue: nameChange?.to ?? null,
    payload: data,
  })

  revalidatePath('/lifestyle-tags')
  return { ok: true }
}

// =============================================================================
// Toggle active
// =============================================================================

export async function toggleLifestyleTagActive(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.lifestyleTag.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  })
  if (!existing) return { ok: false, error: 'Tag not found.' }

  await prisma.lifestyleTag.update({
    where: { id },
    data: { isActive: !existing.isActive },
  })

  await logAuditAs(user, {
    entityType: 'LifestyleTag',
    entityId: id,
    action: 'update',
    fromValue: String(existing.isActive),
    toValue: String(!existing.isActive),
    payload: { isActive: !existing.isActive, name: existing.name },
  })

  revalidatePath('/lifestyle-tags')
  return { ok: true }
}

// =============================================================================
// Delete (refused while in use)
// =============================================================================

export async function deleteLifestyleTag(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.lifestyleTag.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { productTemplates: true } },
    },
  })
  if (!existing) return { ok: false, error: 'Tag not found.' }
  if (existing._count.productTemplates > 0) {
    return {
      ok: false,
      error: `Cannot remove — used by ${existing._count.productTemplates} product${existing._count.productTemplates === 1 ? '' : 's'}. Reassign first.`,
    }
  }

  await prisma.lifestyleTag.delete({ where: { id } })

  await logAuditAs(user, {
    entityType: 'LifestyleTag',
    entityId: id,
    action: 'delete',
    fromValue: existing.name,
    payload: { slug: existing.slug },
  })

  revalidatePath('/lifestyle-tags')
  return { ok: true }
}
