'use server'

// Admin Packaging Studio — model library mutations (ADMIN_PACKAGING_STUDIO.md P1).
// Create a packaging model (PackagingType) + toggle its status. catalog:write-gated
// + audited. The 3D authoring (surfaces, glTF import, die-line binding) lands in P2.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; id?: string } | { ok: false; error: string }

const TOPOLOGIES = [
  'SINGLE_CONTAINER',
  'MULTI_CONTAINER_BOX',
  'STICK_PACK',
  'SACHET',
  'CASE',
  'CAPSULE_JAR',
  'POUCH_STAND_UP',
  'POUCH_FLAT',
  'TUBE',
  'OTHER',
] as const

type PtDelegate = {
  findUnique: (a: unknown) => Promise<{ id: string } | null>
  create: (a: unknown) => Promise<{ id: string }>
  update: (a: unknown) => Promise<unknown>
}
const pt = () => (prisma as unknown as { packagingType?: PtDelegate }).packagingType ?? null

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'package'
}

async function uniqueSlug(base: string): Promise<string> {
  const d = pt()
  let slug = base
  let i = 2
  // Bounded probe; degrades to a timestamp suffix if the delegate is unavailable.
  for (let tries = 0; tries < 25; tries++) {
    const hit = await d?.findUnique({ where: { slug }, select: { id: true } }).catch(() => null)
    if (!hit) return slug
    slug = `${base}-${i++}`
  }
  return `${base}-${Date.now()}`
}

export async function createPackagingModel(input: {
  displayName: string
  topology: string
  containerCategory?: string
}): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const name = input.displayName.trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Name is required.' }
  const topology = (TOPOLOGIES as readonly string[]).includes(input.topology) ? input.topology : 'SINGLE_CONTAINER'
  const slug = await uniqueSlug(slugify(name))

  const created = await pt()
    ?.create({
      data: {
        slug,
        displayName: name,
        defaultTopology: topology,
        ...(input.containerCategory ? { containerCategory: input.containerCategory } : {}),
        model3dSource: 'PARAMETRIC',
        defaultSurfaces: [],
      },
    })
    .catch(() => null)
  if (!created) return { ok: false, error: 'Could not create the model (is the schema pushed?).' }

  await logAuditAs(admin, { entityType: 'PackagingType', entityId: created.id, action: 'packaging-model.created', payload: { slug, topology } })
  revalidatePath('/packaging-studio')
  return { ok: true, id: created.id }
}

export async function setPackagingModelStatus(id: string, status: 'ACTIVE' | 'DEPRECATED'): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id }, data: { status } }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not update status.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging-model.status', payload: { status } })
  revalidatePath('/packaging-studio')
  return { ok: true }
}
