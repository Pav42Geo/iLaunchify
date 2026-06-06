'use server'

// Admin CRUD for the mandatory-phrase catalog (required label phrases). Every
// mutation is admin-gated + audited.

import { prisma } from '@ilaunchify/db'
import type { MandatoryPhraseCategory, PhraseRequirement } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
// Constants live in a plain module (NOT this 'use server' file) so the client
// PhraseForm can import them — a 'use server' module only exposes async functions.
import { PHRASE_CATEGORIES, PHRASE_REQUIREMENTS, PHRASE_LABELING_TYPES } from './constants'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function parse(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const category = String(formData.get('category') ?? '') as MandatoryPhraseCategory
  const requirement = (String(formData.get('requirement') ?? 'MANDATORY') as PhraseRequirement)
  const cfrCitation = String(formData.get('cfrCitation') ?? '').trim() || null
  const appliesWhen = String(formData.get('appliesWhen') ?? '').trim() || null
  const isActive = formData.get('isActive') === 'on'
  const labelingTypes = formData
    .getAll('labelingTypes')
    .map(String)
    .filter((t) => (PHRASE_LABELING_TYPES as readonly string[]).includes(t))
  return { title, body, category, requirement, cfrCitation, appliesWhen, isActive, labelingTypes }
}

function validate(p: ReturnType<typeof parse>): string | null {
  if (!p.title) return 'Title is required.'
  if (!p.body) return 'Phrase body is required.'
  if (!PHRASE_CATEGORIES.includes(p.category)) return 'Pick a category.'
  if (!PHRASE_REQUIREMENTS.includes(p.requirement)) return 'Pick mandatory or recommended.'
  if (p.labelingTypes.length === 0) return 'Pick at least one labeling type.'
  return null
}

export async function createMandatoryPhrase(formData: FormData): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  const p = parse(formData)
  const err = validate(p)
  if (err) return { ok: false, error: err }

  let slug = String(formData.get('slug') ?? '').trim() || slugify(p.title)
  // Ensure unique slug.
  if (await prisma.mandatoryPhrase.findUnique({ where: { slug }, select: { slug: true } })) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`
  }

  const last = await prisma.mandatoryPhrase.findFirst({
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  })

  const created = await prisma.mandatoryPhrase.create({
    data: {
      slug,
      title: p.title,
      body: p.body,
      category: p.category,
      requirement: p.requirement,
      labelingTypes: p.labelingTypes,
      cfrCitation: p.cfrCitation,
      appliesWhen: p.appliesWhen,
      isActive: p.isActive,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
    select: { id: true },
  })

  await logAuditAs(admin, {
    entityType: 'MandatoryPhrase',
    entityId: created.id,
    action: 'create',
    payload: { slug, category: p.category },
  })
  revalidatePath('/mandatory-phrases')
  return { ok: true, data: created }
}

export async function updateMandatoryPhrase(
  id: string,
  formData: FormData,
): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const p = parse(formData)
  const err = validate(p)
  if (err) return { ok: false, error: err }

  const existing = await prisma.mandatoryPhrase.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { ok: false, error: 'Phrase not found.' }

  await prisma.mandatoryPhrase.update({
    where: { id },
    data: {
      title: p.title,
      body: p.body,
      category: p.category,
      requirement: p.requirement,
      labelingTypes: p.labelingTypes,
      cfrCitation: p.cfrCitation,
      appliesWhen: p.appliesWhen,
      isActive: p.isActive,
    },
  })

  await logAuditAs(admin, {
    entityType: 'MandatoryPhrase',
    entityId: id,
    action: 'update',
    payload: { category: p.category, requirement: p.requirement },
  })
  revalidatePath('/mandatory-phrases')
  revalidatePath(`/mandatory-phrases/${id}`)
  return { ok: true }
}

export async function setPhraseActive(id: string, isActive: boolean): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const existing = await prisma.mandatoryPhrase.findUnique({
    where: { id },
    select: { isActive: true },
  })
  if (!existing) return { ok: false, error: 'Phrase not found.' }

  await prisma.mandatoryPhrase.update({ where: { id }, data: { isActive } })
  await logAuditAs(admin, {
    entityType: 'MandatoryPhrase',
    entityId: id,
    action: 'update',
    fromValue: String(existing.isActive),
    toValue: String(isActive),
    payload: { field: 'isActive' },
  })
  revalidatePath('/mandatory-phrases')
  return { ok: true }
}
