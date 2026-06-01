'use server'

// =============================================================================
// /admin/categories — server actions
// =============================================================================
//
// Mutations for the marketplace taxonomy (Category + Subcategory). Every
// action:
//   1. Guards with requireRole(['ADMIN']).
//   2. Writes the affected row.
//   3. Records an AuditLog entry via @ilaunchify/audit.
//   4. revalidatePath('/categories') so the admin UI updates.
//   5. Returns { ok: true } | { ok: false; error: string } for client toasts.
//
// Reorder is implemented as a tiny "swap displayOrder with the adjacent row"
// helper — drag-and-drop is V1.5+; V1 ships chevron up/down buttons.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type Result = { ok: true } | { ok: false; error: string }

const MAIN_CATEGORIES = ['Food', 'Beverages', 'Supplements', 'Other'] as const
type MainCategory = (typeof MAIN_CATEGORIES)[number]

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// =============================================================================
// Category CRUD
// =============================================================================

export async function createCategory(input: {
  name: string
  mainCategory: string
  description?: string
  icon?: string
  color?: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!MAIN_CATEGORIES.includes(input.mainCategory as MainCategory)) {
    return { ok: false, error: 'Invalid main category.' }
  }

  const slug = slugify(name)
  if (!slug) return { ok: false, error: 'Name must contain letters or numbers.' }

  const conflict = await prisma.category.findFirst({
    where: { OR: [{ slug }, { externalId: `admin-${slug}` }] },
    select: { id: true },
  })
  if (conflict) return { ok: false, error: 'A category with this name already exists.' }

  // displayOrder = next in its main category group
  const maxOrder = await prisma.category.aggregate({
    where: { mainCategory: input.mainCategory },
    _max: { displayOrder: true },
  })
  const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1

  const created = await prisma.category.create({
    data: {
      name,
      slug,
      externalId: `admin-${slug}`,
      mainCategory: input.mainCategory,
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      displayOrder: nextOrder,
    },
    select: { id: true, name: true, mainCategory: true },
  })

  await logAuditAs(user, {
    entityType: 'Category',
    entityId: created.id,
    action: 'create',
    toValue: created.name,
    payload: { mainCategory: created.mainCategory },
  })

  revalidatePath('/categories')
  return { ok: true }
}

export async function updateCategory(
  id: string,
  input: {
    name?: string
    mainCategory?: string
    description?: string
    icon?: string
    color?: string
    isActive?: boolean
  },
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, mainCategory: true, isActive: true },
  })
  if (!existing) return { ok: false, error: 'Category not found.' }

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
  if (input.mainCategory !== undefined) {
    if (!MAIN_CATEGORIES.includes(input.mainCategory as MainCategory)) {
      return { ok: false, error: 'Invalid main category.' }
    }
    data.mainCategory = input.mainCategory
  }
  if (input.description !== undefined) data.description = input.description.trim() || null
  if (input.icon !== undefined) data.icon = input.icon.trim() || null
  if (input.color !== undefined) data.color = input.color.trim() || null
  if (input.isActive !== undefined) data.isActive = input.isActive

  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.category.update({ where: { id }, data })

  await logAuditAs(user, {
    entityType: 'Category',
    entityId: id,
    action: 'update',
    fromValue: nameChange?.from ?? null,
    toValue: nameChange?.to ?? null,
    payload: data,
  })

  revalidatePath('/categories')
  return { ok: true }
}

export async function deleteCategory(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      mainCategory: true,
      subcategories: { select: { id: true } },
    },
  })
  if (!existing) return { ok: false, error: 'Category not found.' }
  if (existing.subcategories.length > 0) {
    return {
      ok: false,
      error: `Remove its ${existing.subcategories.length} subcategor${existing.subcategories.length === 1 ? 'y' : 'ies'} first.`,
    }
  }

  await prisma.category.delete({ where: { id } })

  await logAuditAs(user, {
    entityType: 'Category',
    entityId: id,
    action: 'delete',
    fromValue: existing.name,
    payload: { mainCategory: existing.mainCategory },
  })

  revalidatePath('/categories')
  return { ok: true }
}

// =============================================================================
// Subcategory CRUD
// =============================================================================

export async function createSubcategory(input: {
  categoryId: string
  name: string
  description?: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Name is required.' }

  const parent = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true, slug: true },
  })
  if (!parent) return { ok: false, error: 'Parent category not found.' }

  const baseSlug = slugify(name)
  if (!baseSlug) return { ok: false, error: 'Name must contain letters or numbers.' }
  const slug = `${parent.slug}-${baseSlug}`

  const conflict = await prisma.subcategory.findFirst({
    where: { OR: [{ slug }, { externalId: `admin-${slug}` }] },
    select: { id: true },
  })
  if (conflict) return { ok: false, error: 'A subcategory with this name already exists in this category.' }

  const maxOrder = await prisma.subcategory.aggregate({
    where: { categoryId: input.categoryId },
    _max: { displayOrder: true },
  })
  const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1

  const created = await prisma.subcategory.create({
    data: {
      categoryId: input.categoryId,
      name,
      slug,
      externalId: `admin-${slug}`,
      description: input.description?.trim() || null,
      displayOrder: nextOrder,
    },
    select: { id: true, name: true, categoryId: true },
  })

  await logAuditAs(user, {
    entityType: 'Subcategory',
    entityId: created.id,
    action: 'create',
    toValue: created.name,
    payload: { categoryId: created.categoryId },
  })

  revalidatePath('/categories')
  return { ok: true }
}

export async function updateSubcategory(
  id: string,
  input: {
    name?: string
    description?: string
    isActive?: boolean
  },
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.subcategory.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true, categoryId: true },
  })
  if (!existing) return { ok: false, error: 'Subcategory not found.' }

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
  if (input.description !== undefined) data.description = input.description.trim() || null
  if (input.isActive !== undefined) data.isActive = input.isActive

  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.subcategory.update({ where: { id }, data })

  await logAuditAs(user, {
    entityType: 'Subcategory',
    entityId: id,
    action: 'update',
    fromValue: nameChange?.from ?? null,
    toValue: nameChange?.to ?? null,
    payload: data,
  })

  revalidatePath('/categories')
  return { ok: true }
}

export async function deleteSubcategory(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.subcategory.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      categoryId: true,
      _count: { select: { productTemplates: true } },
    },
  })
  if (!existing) return { ok: false, error: 'Subcategory not found.' }
  if (existing._count.productTemplates > 0) {
    return {
      ok: false,
      error: `Cannot delete — ${existing._count.productTemplates} product${existing._count.productTemplates === 1 ? '' : 's'} tagged.`,
    }
  }

  await prisma.subcategory.delete({ where: { id } })

  await logAuditAs(user, {
    entityType: 'Subcategory',
    entityId: id,
    action: 'delete',
    fromValue: existing.name,
    payload: { categoryId: existing.categoryId },
  })

  revalidatePath('/categories')
  return { ok: true }
}

// =============================================================================
// Reorder — swap displayOrder with adjacent row in same parent group
// =============================================================================

export async function moveSubcategory(
  id: string,
  direction: 'up' | 'down',
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const target = await prisma.subcategory.findUnique({
    where: { id },
    select: { id: true, categoryId: true, displayOrder: true, name: true },
  })
  if (!target) return { ok: false, error: 'Subcategory not found.' }

  const neighbor = await prisma.subcategory.findFirst({
    where: {
      categoryId: target.categoryId,
      displayOrder:
        direction === 'up'
          ? { lt: target.displayOrder }
          : { gt: target.displayOrder },
    },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
    select: { id: true, displayOrder: true },
  })
  if (!neighbor) return { ok: false, error: 'Already at the end.' }

  // Swap displayOrder values atomically.
  await prisma.$transaction([
    prisma.subcategory.update({
      where: { id: target.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.subcategory.update({
      where: { id: neighbor.id },
      data: { displayOrder: target.displayOrder },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'Subcategory',
    entityId: target.id,
    action: 'reorder',
    fromValue: String(target.displayOrder),
    toValue: String(neighbor.displayOrder),
    payload: { direction },
  })

  revalidatePath('/categories')
  return { ok: true }
}

export async function moveCategory(
  id: string,
  direction: 'up' | 'down',
): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const target = await prisma.category.findUnique({
    where: { id },
    select: { id: true, mainCategory: true, displayOrder: true },
  })
  if (!target) return { ok: false, error: 'Category not found.' }

  const neighbor = await prisma.category.findFirst({
    where: {
      mainCategory: target.mainCategory,
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
    prisma.category.update({
      where: { id: target.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.category.update({
      where: { id: neighbor.id },
      data: { displayOrder: target.displayOrder },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'Category',
    entityId: target.id,
    action: 'reorder',
    fromValue: String(target.displayOrder),
    toValue: String(neighbor.displayOrder),
    payload: { direction },
  })

  revalidatePath('/categories')
  return { ok: true }
}
