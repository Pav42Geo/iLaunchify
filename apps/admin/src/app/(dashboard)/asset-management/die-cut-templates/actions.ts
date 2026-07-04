'use server'

// Die-cut Templates — Library mutations. Create a canonical DieCutTemplate (cut-outline
// shape) + toggle active/standard. catalog:write-gated + audited, mirroring the Packaging
// Studio model-library actions. Additive: no schema change (DieCutTemplate already exists).

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { DIE_CUT_CATEGORIES } from './constants'

type Result = { ok: true; id?: string } | { ok: false; error: string }

type DcDelegate = {
  findUnique: (a: unknown) => Promise<{ id: string } | null>
  create: (a: unknown) => Promise<{ id: string }>
  update: (a: unknown) => Promise<unknown>
}
const dc = () => (prisma as unknown as { dieCutTemplate?: DcDelegate }).dieCutTemplate ?? null

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'die-cut'
}

async function uniqueSlug(base: string): Promise<string> {
  const d = dc()
  let slug = base
  let i = 2
  for (let tries = 0; tries < 25; tries++) {
    const hit = await d?.findUnique({ where: { slug }, select: { id: true } }).catch(() => null)
    if (!hit) return slug
    slug = `${base}-${i++}`
  }
  return `${base}-${Date.now()}`
}

export async function createDieCutTemplate(input: {
  name: string
  category: string
  widthMm: number
  heightMm: number
  outlineSvg: string
  bleedMm?: number
  safeAreaMm?: number
}): Promise<Result> {
  const admin = await requireCapability('catalog:write')

  const name = input.name.trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!DIE_CUT_CATEGORIES.includes(input.category)) return { ok: false, error: 'Pick a valid category.' }
  const widthMm = Number(input.widthMm)
  const heightMm = Number(input.heightMm)
  if (!(widthMm > 0) || !(heightMm > 0)) return { ok: false, error: 'Width and height must be greater than 0.' }
  const outlineSvg = input.outlineSvg.trim()
  if (!outlineSvg) return { ok: false, error: 'An outline (SVG path or markup) is required.' }
  const bleedMm = Number.isFinite(Number(input.bleedMm)) ? Number(input.bleedMm) : 3
  const safeAreaMm = Number.isFinite(Number(input.safeAreaMm)) ? Number(input.safeAreaMm) : 3

  const slug = await uniqueSlug(slugify(name))
  const created = await dc()
    ?.create({
      data: {
        name,
        slug,
        category: input.category,
        widthMm,
        heightMm,
        outlineSvg,
        bleedMm,
        safeAreaMm,
        isStandard: true,
        isActive: true,
      },
    })
    .catch(() => null)
  if (!created) return { ok: false, error: 'Could not create the die-cut template (is the schema pushed?).' }

  await logAuditAs(admin, { entityType: 'DieCutTemplate', entityId: created.id, action: 'die-cut.created', payload: { slug, category: input.category, widthMm, heightMm } })
  revalidatePath('/asset-management/die-cut-templates')
  return { ok: true, id: created.id }
}

export async function setDieCutTemplateActive(id: string, isActive: boolean): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await dc()?.update({ where: { id }, data: { isActive } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not update status.' }
  await logAuditAs(admin, { entityType: 'DieCutTemplate', entityId: id, action: 'die-cut.active', payload: { isActive } })
  revalidatePath('/asset-management/die-cut-templates')
  return { ok: true }
}

export async function setDieCutTemplateStandard(id: string, isStandard: boolean): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await dc()?.update({ where: { id }, data: { isStandard } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not update flag.' }
  await logAuditAs(admin, { entityType: 'DieCutTemplate', entityId: id, action: 'die-cut.standard', payload: { isStandard } })
  revalidatePath('/asset-management/die-cut-templates')
  return { ok: true }
}
