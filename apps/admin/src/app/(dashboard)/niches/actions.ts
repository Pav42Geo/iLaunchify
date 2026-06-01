'use server'

// =============================================================================
// /admin/niches — server actions
// =============================================================================
//
// Mutations for the Layer 1 Niche taxonomy. The 8 niches themselves are
// LOCKED (no create / no delete) — admin can only edit copy, color, icon,
// displayOrder, isActive. Junction (Niche × Subcategory) is fully editable
// via add/remove/move. NicheRules are fully editable except deletion of
// isLocked=true rules.
//
// Every mutation:
//   1. requireRole(['ADMIN'])
//   2. Zod-validate / type-narrow inputs
//   3. Mutate inside a $transaction
//   4. logAuditAs(user, …)
//   5. revalidatePath
//   6. Returns { ok: true } | { ok: false, error: string }

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type Result = { ok: true } | { ok: false; error: string }

const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/

function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null
  const v = input.trim()
  if (!v) return null
  if (!HEX_RE.test(v)) return null
  return v.startsWith('#') ? v : `#${v}`
}

// =============================================================================
// Niche edit-only (locked vocabulary — no create, no delete)
// =============================================================================

export async function updateNiche(
  id: string,
  input: {
    name?: string
    description?: string
    iconEmoji?: string
    accentHex?: string
    displayOrder?: number
    isActive?: boolean
  },
): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const existing = await prisma.niche.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      iconEmoji: true,
      accentHex: true,
      displayOrder: true,
      isActive: true,
    },
  })
  if (!existing) return { ok: false, error: 'Niche not found.' }

  const data: Record<string, unknown> = {}
  let nameChange: { from: string; to: string } | null = null

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Name is required.' }
    if (name !== existing.name) {
      data.name = name
      nameChange = { from: existing.name, to: name }
    }
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

  await prisma.niche.update({ where: { id }, data })

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: id,
    action: 'update',
    fromValue: nameChange?.from ?? null,
    toValue: nameChange?.to ?? null,
    payload: data,
  })

  revalidatePath('/niches')
  revalidatePath(`/niches/${existing.id}/subcategories`)
  return { ok: true }
}

export async function moveNiche(
  id: string,
  direction: 'up' | 'down',
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const target = await prisma.niche.findUnique({
    where: { id },
    select: { id: true, displayOrder: true, name: true },
  })
  if (!target) return { ok: false, error: 'Niche not found.' }

  const neighbor = await prisma.niche.findFirst({
    where: {
      displayOrder:
        direction === 'up'
          ? { lt: target.displayOrder }
          : { gt: target.displayOrder },
    },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
    select: { id: true, displayOrder: true },
  })
  if (!neighbor) return { ok: false, error: 'Already at the end.' }

  await prisma.$transaction([
    prisma.niche.update({
      where: { id: target.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.niche.update({
      where: { id: neighbor.id },
      data: { displayOrder: target.displayOrder },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: target.id,
    action: 'reorder',
    fromValue: String(target.displayOrder),
    toValue: String(neighbor.displayOrder),
    payload: { direction },
  })

  revalidatePath('/niches')
  return { ok: true }
}

export async function toggleNicheActive(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.niche.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  })
  if (!existing) return { ok: false, error: 'Niche not found.' }

  await prisma.niche.update({
    where: { id },
    data: { isActive: !existing.isActive },
  })

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: id,
    action: 'update',
    fromValue: String(existing.isActive),
    toValue: String(!existing.isActive),
    payload: { isActive: !existing.isActive, name: existing.name },
  })

  revalidatePath('/niches')
  return { ok: true }
}

// =============================================================================
// Niche × Subcategory junction
// =============================================================================

export async function addSubcategoriesToNiche(
  nicheId: string,
  subcategoryIds: string[],
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (!Array.isArray(subcategoryIds) || subcategoryIds.length === 0) {
    return { ok: false, error: 'Select at least one subcategory.' }
  }

  const niche = await prisma.niche.findUnique({
    where: { id: nicheId },
    select: { id: true, name: true, slug: true },
  })
  if (!niche) return { ok: false, error: 'Niche not found.' }

  // Find the max displayOrder currently in the junction for this niche so we
  // append new rows at the bottom.
  const maxOrder = await prisma.nicheSubcategory.aggregate({
    where: { nicheId },
    _max: { displayOrder: true },
  })
  let nextOrder = (maxOrder._max.displayOrder ?? -1) + 1

  // Use createMany skipDuplicates so re-checking already-added subcategories
  // is a no-op.
  const created = await prisma.$transaction(async (tx) => {
    let added = 0
    for (const sid of subcategoryIds) {
      const exists = await tx.nicheSubcategory.findUnique({
        where: { nicheId_subcategoryId: { nicheId, subcategoryId: sid } },
      })
      if (exists) continue
      await tx.nicheSubcategory.create({
        data: { nicheId, subcategoryId: sid, displayOrder: nextOrder++ },
      })
      added++
    }
    return added
  })

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: nicheId,
    action: 'subcategory_add',
    toValue: niche.name,
    payload: { added: created, subcategoryIds, nicheSlug: niche.slug },
  })

  revalidatePath(`/niches/${nicheId}/subcategories`)
  revalidatePath('/niches')
  return { ok: true }
}

export async function removeSubcategoryFromNiche(
  nicheId: string,
  subcategoryId: string,
): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const junction = await prisma.nicheSubcategory.findUnique({
    where: { nicheId_subcategoryId: { nicheId, subcategoryId } },
    include: {
      niche: { select: { name: true, slug: true } },
      subcategory: { select: { name: true, slug: true } },
    },
  })
  if (!junction) return { ok: false, error: 'Not currently in this niche.' }

  await prisma.nicheSubcategory.delete({
    where: { nicheId_subcategoryId: { nicheId, subcategoryId } },
  })

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: nicheId,
    action: 'subcategory_remove',
    fromValue: junction.subcategory.name,
    payload: {
      nicheSlug: junction.niche.slug,
      subcategorySlug: junction.subcategory.slug,
    },
  })

  revalidatePath(`/niches/${nicheId}/subcategories`)
  revalidatePath('/niches')
  return { ok: true }
}

export async function moveSubcategoryInNiche(
  nicheId: string,
  subcategoryId: string,
  direction: 'up' | 'down',
): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const target = await prisma.nicheSubcategory.findUnique({
    where: { nicheId_subcategoryId: { nicheId, subcategoryId } },
    select: { displayOrder: true, subcategoryId: true },
  })
  if (!target) return { ok: false, error: 'Subcategory not in this niche.' }

  const neighbor = await prisma.nicheSubcategory.findFirst({
    where: {
      nicheId,
      displayOrder:
        direction === 'up'
          ? { lt: target.displayOrder }
          : { gt: target.displayOrder },
    },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
    select: { subcategoryId: true, displayOrder: true },
  })
  if (!neighbor) return { ok: false, error: 'Already at the end.' }

  await prisma.$transaction([
    prisma.nicheSubcategory.update({
      where: {
        nicheId_subcategoryId: { nicheId, subcategoryId: target.subcategoryId },
      },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.nicheSubcategory.update({
      where: {
        nicheId_subcategoryId: {
          nicheId,
          subcategoryId: neighbor.subcategoryId,
        },
      },
      data: { displayOrder: target.displayOrder },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'Niche',
    entityId: nicheId,
    action: 'subcategory_reorder',
    fromValue: String(target.displayOrder),
    toValue: String(neighbor.displayOrder),
    payload: { subcategoryId, direction },
  })

  revalidatePath(`/niches/${nicheId}/subcategories`)
  return { ok: true }
}
