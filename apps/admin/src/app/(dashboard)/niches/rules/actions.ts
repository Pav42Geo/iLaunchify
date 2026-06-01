'use server'

// =============================================================================
// /admin/niches/rules — NicheRule CRUD server actions
// =============================================================================
//
// NicheRule is the deterministic engine that pre-suggests niche assignments
// at ProductTemplate submit. Conditions are AND across rows, OR within
// `values` per row. isLocked=true rules can be edited but not deleted —
// they exist because the manufacturer cannot deselect them (e.g.
// PET_PRODUCT → Pet Wellness).

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { NicheRuleConditionKind } from '@ilaunchify/marketplace'

type Result = { ok: true } | { ok: false; error: string }

const CONDITION_KINDS = [
  'LABELING_TYPE',
  'CATEGORY',
  'SUBCATEGORY',
  'CERT_ATTACHED',
  'LIFESTYLE_TAG',
] as const

export interface RuleConditionInput {
  kind: NicheRuleConditionKind
  values: string[]
}

interface RuleInputBase {
  nicheId: string
  slug: string
  description: string
  weight: number
  isLocked: boolean
  isActive: boolean
  conditions: RuleConditionInput[]
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isConditionKind(s: string): s is NicheRuleConditionKind {
  return (CONDITION_KINDS as readonly string[]).includes(s)
}

function validateBase(input: Partial<RuleInputBase>): RuleInputBase | string {
  if (!input.nicheId || typeof input.nicheId !== 'string') {
    return 'Pick a niche for this rule.'
  }
  const description = (input.description ?? '').trim()
  if (!description) return 'Description is required.'

  let slug = (input.slug ?? '').trim()
  if (!slug) slug = slugify(description)
  if (!slug) return 'Slug could not be derived — provide a slug or description.'
  slug = slugify(slug)

  const weight = Number.isFinite(input.weight) ? Math.max(0, Math.min(100, Math.floor(input.weight as number))) : 50

  const conditions = Array.isArray(input.conditions) ? input.conditions : []
  if (conditions.length === 0) {
    return 'Add at least one condition row.'
  }
  for (const c of conditions) {
    if (!c || typeof c !== 'object' || !isConditionKind(c.kind)) {
      return 'Each condition row needs a valid kind.'
    }
    if (!Array.isArray(c.values) || c.values.length === 0) {
      return `Pick at least one value for the ${c.kind} condition.`
    }
  }

  return {
    nicheId: input.nicheId,
    slug,
    description,
    weight,
    isLocked: Boolean(input.isLocked),
    isActive: input.isActive ?? true,
    conditions: conditions.map((c) => ({
      kind: c.kind,
      values: c.values.map((v) => String(v).trim()).filter(Boolean),
    })),
  }
}

// =============================================================================
// Create
// =============================================================================

export async function createNicheRule(input: Partial<RuleInputBase>): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const v = validateBase(input)
  if (typeof v === 'string') return { ok: false, error: v }

  const niche = await prisma.niche.findUnique({
    where: { id: v.nicheId },
    select: { id: true, name: true },
  })
  if (!niche) return { ok: false, error: 'Niche not found.' }

  const slugConflict = await prisma.nicheRule.findUnique({ where: { slug: v.slug } })
  if (slugConflict) return { ok: false, error: `A rule with slug "${v.slug}" already exists.` }

  const created = await prisma.nicheRule.create({
    data: {
      slug: v.slug,
      nicheId: v.nicheId,
      description: v.description,
      weight: v.weight,
      isLocked: v.isLocked,
      isActive: v.isActive,
      conditions: v.conditions as unknown as object,
    },
    select: { id: true, slug: true },
  })

  await logAuditAs(user, {
    entityType: 'NicheRule',
    entityId: created.id,
    action: 'create',
    toValue: created.slug,
    payload: { nicheId: v.nicheId, nicheName: niche.name, weight: v.weight, conditions: v.conditions },
  })

  revalidatePath('/niches/rules')
  return { ok: true }
}

// =============================================================================
// Update
// =============================================================================

export async function updateNicheRule(
  id: string,
  input: Partial<RuleInputBase>,
): Promise<Result> {
  const user = await requireRole(['ADMIN'])

  const existing = await prisma.nicheRule.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      nicheId: true,
      description: true,
      weight: true,
      isLocked: true,
      isActive: true,
      conditions: true,
    },
  })
  if (!existing) return { ok: false, error: 'Rule not found.' }

  // Allow partial edits: fill missing with existing values, then run full validation.
  const merged: Partial<RuleInputBase> = {
    nicheId: input.nicheId ?? existing.nicheId,
    slug: input.slug ?? existing.slug,
    description: input.description ?? existing.description,
    weight: input.weight ?? existing.weight,
    isLocked: input.isLocked ?? existing.isLocked,
    isActive: input.isActive ?? existing.isActive,
    conditions:
      input.conditions ??
      (existing.conditions as unknown as RuleConditionInput[]),
  }
  const v = validateBase(merged)
  if (typeof v === 'string') return { ok: false, error: v }

  if (v.slug !== existing.slug) {
    const conflict = await prisma.nicheRule.findUnique({ where: { slug: v.slug } })
    if (conflict) return { ok: false, error: `Slug "${v.slug}" already in use.` }
  }

  await prisma.nicheRule.update({
    where: { id },
    data: {
      slug: v.slug,
      nicheId: v.nicheId,
      description: v.description,
      weight: v.weight,
      isLocked: v.isLocked,
      isActive: v.isActive,
      conditions: v.conditions as unknown as object,
    },
  })

  await logAuditAs(user, {
    entityType: 'NicheRule',
    entityId: id,
    action: 'update',
    fromValue: existing.slug,
    toValue: v.slug,
    payload: { weight: v.weight, conditions: v.conditions, isLocked: v.isLocked, isActive: v.isActive },
  })

  revalidatePath('/niches/rules')
  return { ok: true }
}

// =============================================================================
// Toggle active
// =============================================================================

export async function toggleNicheRuleActive(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.nicheRule.findUnique({
    where: { id },
    select: { id: true, slug: true, isActive: true },
  })
  if (!existing) return { ok: false, error: 'Rule not found.' }

  await prisma.nicheRule.update({
    where: { id },
    data: { isActive: !existing.isActive },
  })

  await logAuditAs(user, {
    entityType: 'NicheRule',
    entityId: id,
    action: 'update',
    fromValue: String(existing.isActive),
    toValue: String(!existing.isActive),
    payload: { isActive: !existing.isActive, slug: existing.slug },
  })

  revalidatePath('/niches/rules')
  return { ok: true }
}

// =============================================================================
// Delete (refuses if locked)
// =============================================================================

export async function deleteNicheRule(id: string): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.nicheRule.findUnique({
    where: { id },
    select: { id: true, slug: true, isLocked: true },
  })
  if (!existing) return { ok: false, error: 'Rule not found.' }
  if (existing.isLocked) {
    return {
      ok: false,
      error: 'Cannot delete a locked rule. Unlock it first (locked rules guarantee niche assignment).',
    }
  }

  await prisma.nicheRule.delete({ where: { id } })

  await logAuditAs(user, {
    entityType: 'NicheRule',
    entityId: id,
    action: 'delete',
    fromValue: existing.slug,
  })

  revalidatePath('/niches/rules')
  return { ok: true }
}
