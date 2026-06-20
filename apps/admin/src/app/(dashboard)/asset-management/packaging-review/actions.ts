'use server'

// Admin packaging-catalog review (docs/PACKAGING_REVIEW.md). Partners submit a
// custom packaging from the Packaging Studio "My" tab; admin approves it into an
// ACTIVE PackagingType (which the studio Library catalog surfaces) + assigns a
// container category, or rejects with notes. The PackagingSystem review columns
// ship with a pending migration → cast-guarded.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

/** Resolve the owning partner's user id + a display name for notifications. */
async function systemOwner(systemId: string): Promise<{ userId: string; name: string } | null> {
  const row = await prisma.packagingSystem.findUnique({
    where: { id: systemId },
    select: { partnerName: true, overrideDisplayName: true, partner: { select: { userId: true } } },
  })
  if (!row?.partner?.userId) return null
  return { userId: row.partner.userId, name: row.overrideDisplayName ?? row.partnerName }
}

const PATH = '/asset-management/packaging-review'

type Result = { ok: true } | { ok: false; error: string }

export interface ReviewFile {
  url: string | null
  name: string
  role: string // 'MOCKUP' | 'DIELINE'
  panel: string | null
  label: string | null
}

export interface ReviewRow {
  id: string
  name: string
  topology: string
  suggestedCategory: string | null
  submittedAt: string | null
  // Parameters + uploaded artwork (cast-guarded — material + PackagingSystemFile
  // ship with a pending migration).
  material: string | null
  dimensions: { lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null } | null
  maxWeightG: number | null
  files: ReviewFile[]
}

interface PsDelegate {
  findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
  update: (a: unknown) => Promise<unknown>
}
function ps(): PsDelegate {
  return (prisma as unknown as { packagingSystem: PsDelegate }).packagingSystem
}

export async function loadPackagingReviewQueue(): Promise<ReviewRow[]> {
  await requireRole('ADMIN')
  // Base query (existing columns only — `material` ships with a pending migration
  // so it's fetched separately, cast-guarded, to keep this safe pre-push).
  const rows = await ps().findMany({
    where: { reviewStatus: 'SUBMITTED' },
    select: { id: true, partnerName: true, overrideDisplayName: true, topology: true, suggestedCategory: true, submittedForReviewAt: true, dimensions: true, maxWeightG: true },
    orderBy: { submittedForReviewAt: 'asc' },
  })
  const ids = rows.map((r) => String(r.id))
  if (ids.length === 0) return []

  // Material (cast-guarded — new column).
  const materialRows = await (prisma as unknown as {
    packagingSystem: { findMany: (a: unknown) => Promise<Array<{ id: string; material: string | null }>> }
  }).packagingSystem
    .findMany({ where: { id: { in: ids } }, select: { id: true, material: true } })
    .catch(() => [] as Array<{ id: string; material: string | null }>)
  const materialById = new Map(materialRows.map((m) => [m.id, m.material]))

  // Uploaded files (cast-guarded — PackagingSystemFile is a new model).
  const fileRows = await (prisma as unknown as {
    packagingSystemFile: { findMany: (a: unknown) => Promise<Array<{ packagingSystemId: string; partnerFileId: string; role: string; panel: string | null; label: string | null; displayOrder: number }>> }
  }).packagingSystemFile
    .findMany({ where: { packagingSystemId: { in: ids } }, orderBy: [{ role: 'asc' }, { displayOrder: 'asc' }] })
    .catch(() => [] as Array<{ packagingSystemId: string; partnerFileId: string; role: string; panel: string | null; label: string | null; displayOrder: number }>)

  // Resolve PartnerFile r2Key → signed URL.
  const partnerFileIds = [...new Set(fileRows.map((f) => f.partnerFileId))]
  const partnerFiles = partnerFileIds.length
    ? await prisma.partnerFile.findMany({ where: { id: { in: partnerFileIds } }, select: { id: true, r2Key: true, originalFilename: true } })
    : []
  const pfById = new Map(partnerFiles.map((p) => [p.id, p]))
  const urlByPf = new Map<string, string | null>()
  await Promise.all(partnerFiles.map(async (p) => { urlByPf.set(p.id, p.r2Key ? await getSignedReadUrl(p.r2Key).catch(() => null) : null) }))

  const filesBySystem = new Map<string, ReviewFile[]>()
  for (const f of fileRows) {
    const pf = pfById.get(f.partnerFileId)
    const arr = filesBySystem.get(f.packagingSystemId) ?? []
    arr.push({ url: urlByPf.get(f.partnerFileId) ?? null, name: pf?.originalFilename ?? 'file', role: f.role, panel: f.panel, label: f.label })
    filesBySystem.set(f.packagingSystemId, arr)
  }

  return rows.map((r) => {
    const id = String(r.id)
    const dims = (r.dimensions && typeof r.dimensions === 'object') ? r.dimensions as ReviewRow['dimensions'] : null
    return {
      id,
      name: String(r.overrideDisplayName ?? r.partnerName ?? 'Custom packaging'),
      topology: String(r.topology ?? 'OTHER'),
      suggestedCategory: r.suggestedCategory ? String(r.suggestedCategory) : null,
      submittedAt: r.submittedForReviewAt ? new Date(r.submittedForReviewAt as string).toISOString() : null,
      material: materialById.get(id) ?? null,
      dimensions: dims,
      maxWeightG: typeof r.maxWeightG === 'number' ? r.maxWeightG : null,
      files: filesBySystem.get(id) ?? [],
    }
  })
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'packaging'
}

/**
 * Approve a submission into the catalog: create an ACTIVE PackagingType with the
 * chosen displayName + container category, link the partner's system to it, and
 * mark the review APPROVED. The admin then preps 3D/2D mockups on the new type
 * via the Product Mockups tool.
 */
export async function approvePackagingReview(systemId: string, displayName: string, category: string): Promise<Result> {
  const user = await requireRole('ADMIN')
  const name = displayName.trim()
  if (name.length < 2) return { ok: false, error: 'Give the catalog entry a name.' }

  const sys = (await ps().findFirst({ where: { id: systemId, reviewStatus: 'SUBMITTED' }, select: { id: true, topology: true } })) as { id: string; topology: string } | null
  if (!sys) return { ok: false, error: 'Submission not found or already handled.' }

  const slug = `${slugify(name)}-${systemId.slice(-6)}`
  const created = await prisma.packagingType.create({
    data: {
      slug,
      displayName: name,
      defaultTopology: sys.topology as never,
      containerCategory: category as never,
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  // Carry the partner's first uploaded mockup over as the new type's catalog
  // thumbnail (model3dThumbKey is an R2 key, same as PartnerFile.r2Key). Falls
  // back to the legacy partnerImageFileId. Cast-guarded — PackagingSystemFile is
  // a pending-migration model.
  const mockupRow = await (prisma as unknown as {
    packagingSystemFile: { findFirst: (a: unknown) => Promise<{ partnerFileId: string } | null> }
  }).packagingSystemFile
    .findFirst({ where: { packagingSystemId: systemId, role: 'MOCKUP' }, orderBy: { displayOrder: 'asc' }, select: { partnerFileId: true } })
    .catch(() => null)
  let thumbFileId = mockupRow?.partnerFileId ?? null
  if (!thumbFileId) {
    const legacy = (await ps().findFirst({ where: { id: systemId }, select: { partnerImageFileId: true } })) as { partnerImageFileId: string | null } | null
    thumbFileId = legacy?.partnerImageFileId ?? null
  }
  if (thumbFileId) {
    const pf = await prisma.partnerFile.findUnique({ where: { id: thumbFileId }, select: { r2Key: true } })
    if (pf?.r2Key) await prisma.packagingType.update({ where: { id: created.id }, data: { model3dThumbKey: pf.r2Key } })
  }

  await ps().update({
    where: { id: systemId },
    data: { reviewStatus: 'APPROVED', packagingTypeId: created.id, approvedPackagingTypeId: created.id, reviewNotes: null },
  })

  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_APPROVE', payload: { packagingTypeId: created.id, category, displayName: name } })
  const owner = await systemOwner(systemId)
  // 'PACKAGING_APPROVED' enum value ships with a pending migration → cast until generated.
  if (owner) await dispatchNotification({ userId: owner.userId, event: 'PACKAGING_APPROVED' as never, data: { name, category }, audience: 'partner' })
  revalidatePath(PATH)
  return { ok: true }
}

export async function rejectPackagingReview(systemId: string, notes: string): Promise<Result> {
  const user = await requireRole('ADMIN')
  const sys = (await ps().findFirst({ where: { id: systemId, reviewStatus: 'SUBMITTED' }, select: { id: true } })) as { id: string } | null
  if (!sys) return { ok: false, error: 'Submission not found or already handled.' }
  await ps().update({ where: { id: systemId }, data: { reviewStatus: 'REJECTED', reviewNotes: notes.trim() || null } })
  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_REJECT', payload: { notes: notes.trim() || null } })
  const owner = await systemOwner(systemId)
  if (owner) await dispatchNotification({ userId: owner.userId, event: 'PACKAGING_REJECTED' as never, data: { name: owner.name, notes: notes.trim() || undefined }, audience: 'partner' })
  revalidatePath(PATH)
  return { ok: true }
}
