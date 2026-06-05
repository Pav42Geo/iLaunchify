'use server'

// =============================================================================
// C8 — admin actions on PackagingDecorationCompatibility (composite PK matrix)
// =============================================================================
//
// Admins curate which DecorationMethods are valid on which ContainerCategory.
// The model has a composite PK [containerCategory, decorationMethod] so every
// action is keyed by that pair. The audit entityId is the joined composite key
// "<CATEGORY>:<METHOD>" so the /admin/audit deep-link stays stable.
//
// Every action: requireRole('ADMIN') (returns the admin user) + logAuditAs.

import { prisma } from '@ilaunchify/db'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const CATEGORIES: readonly string[] = [
  'BOTTLE',
  'JAR',
  'CAN',
  'TUBE',
  'POUCH',
  'SACHET',
  'STICK_PACK',
  'BOX',
  'CARTON',
  'CASE',
  'OTHER',
]

const METHODS: readonly string[] = [
  'DIRECT_PRINT',
  'PRESSURE_SENSITIVE_LABEL',
  'SHRINK_SLEEVE',
  'IN_MOLD_LABEL',
  'HEAT_TRANSFER',
  'FOIL_STAMP',
  'EMBOSS',
  'DEBOSS',
  'SPOT_UV',
  'NONE',
]

function entityKey(c: ContainerCategory, m: DecorationMethod): string {
  return `${c}:${m}`
}

function parseCategory(v: FormDataEntryValue | null): ContainerCategory | null {
  return typeof v === 'string' && CATEGORIES.includes(v) ? (v as ContainerCategory) : null
}

function parseMethod(v: FormDataEntryValue | null): DecorationMethod | null {
  return typeof v === 'string' && METHODS.includes(v) ? (v as DecorationMethod) : null
}

/**
 * Create or update a (containerCategory × decorationMethod) compatibility row.
 * Validates against the composite unique key — an upsert so re-saving an
 * existing pair edits its notes / active flag instead of erroring.
 *
 * FormData fields: containerCategory, decorationMethod, notes?, isActive ("on"|"")
 */
export async function upsertCompatibility(formData: FormData): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const containerCategory = parseCategory(formData.get('containerCategory'))
  const decorationMethod = parseMethod(formData.get('decorationMethod'))
  if (!containerCategory) return { ok: false, error: 'Invalid container category.' }
  if (!decorationMethod) return { ok: false, error: 'Invalid decoration method.' }

  const notesRaw = formData.get('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim() : null
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true'

  const existing = await prisma.packagingDecorationCompatibility.findUnique({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
    select: { isActive: true, notes: true },
  })

  await prisma.packagingDecorationCompatibility.upsert({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
    create: { containerCategory, decorationMethod, notes, isActive },
    update: { notes, isActive },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingDecorationCompatibility',
    entityId: entityKey(containerCategory, decorationMethod),
    action: existing ? 'DECORATION_COMPAT_UPDATE' : 'DECORATION_COMPAT_CREATE',
    fromValue: existing ? String(existing.isActive) : null,
    toValue: String(isActive),
    payload: { containerCategory, decorationMethod, notes, isActive },
  })

  revalidatePath('/decoration-compatibility')
  return { ok: true }
}

/** Toggle a combo's active flag without touching its notes. */
export async function setCompatibilityActive(
  containerCategory: ContainerCategory,
  decorationMethod: DecorationMethod,
  isActive: boolean,
): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const existing = await prisma.packagingDecorationCompatibility.findUnique({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
    select: { isActive: true },
  })
  if (!existing) return { ok: false, error: 'Combo not found.' }

  await prisma.packagingDecorationCompatibility.update({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
    data: { isActive },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingDecorationCompatibility',
    entityId: entityKey(containerCategory, decorationMethod),
    action: isActive ? 'DECORATION_COMPAT_ACTIVATE' : 'DECORATION_COMPAT_DEACTIVATE',
    fromValue: String(existing.isActive),
    toValue: String(isActive),
    payload: { containerCategory, decorationMethod },
  })

  revalidatePath('/decoration-compatibility')
  return { ok: true }
}

/** Hard-delete a combo row (matrix entry, not a domain object — safe to remove). */
export async function deleteCompatibility(
  containerCategory: ContainerCategory,
  decorationMethod: DecorationMethod,
): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const existing = await prisma.packagingDecorationCompatibility.findUnique({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
    select: { isActive: true, notes: true },
  })
  if (!existing) return { ok: false, error: 'Combo not found.' }

  await prisma.packagingDecorationCompatibility.delete({
    where: { containerCategory_decorationMethod: { containerCategory, decorationMethod } },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingDecorationCompatibility',
    entityId: entityKey(containerCategory, decorationMethod),
    action: 'DECORATION_COMPAT_DELETE',
    fromValue: String(existing.isActive),
    toValue: null,
    payload: { containerCategory, decorationMethod, notes: existing.notes },
  })

  revalidatePath('/decoration-compatibility')
  return { ok: true }
}
