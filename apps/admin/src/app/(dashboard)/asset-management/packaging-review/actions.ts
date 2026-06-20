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

export async function loadPackagingReviewQueue(): Promise<ReviewRow[]> {
  await requireRole('ADMIN')
  const rows = await prisma.packagingSystem.findMany({
    where: { reviewStatus: 'SUBMITTED' },
    select: { id: true, partnerName: true, overrideDisplayName: true, topology: true, suggestedCategory: true, submittedForReviewAt: true, dimensions: true, maxWeightG: true, material: true },
    orderBy: { submittedForReviewAt: 'asc' },
  })
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return []

  // Uploaded files.
  const fileRows = await prisma.packagingSystemFile.findMany({ where: { packagingSystemId: { in: ids } }, orderBy: [{ role: 'asc' }, { displayOrder: 'asc' }] })

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
    const dims = (r.dimensions && typeof r.dimensions === 'object') ? r.dimensions as ReviewRow['dimensions'] : null
    return {
      id: r.id,
      name: r.overrideDisplayName ?? r.partnerName ?? 'Custom packaging',
      topology: String(r.topology ?? 'OTHER'),
      suggestedCategory: r.suggestedCategory ? String(r.suggestedCategory) : null,
      submittedAt: r.submittedForReviewAt ? r.submittedForReviewAt.toISOString() : null,
      material: r.material ?? null,
      dimensions: dims,
      maxWeightG: r.maxWeightG ?? null,
      files: filesBySystem.get(r.id) ?? [],
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

  const sys = await prisma.packagingSystem.findFirst({ where: { id: systemId, reviewStatus: 'SUBMITTED' }, select: { id: true, topology: true, partnerId: true } })
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
  // back to the legacy partnerImageFileId.
  const mockupRow = await prisma.packagingSystemFile.findFirst({ where: { packagingSystemId: systemId, role: 'MOCKUP' }, orderBy: { displayOrder: 'asc' }, select: { partnerFileId: true } })
  let thumbFileId = mockupRow?.partnerFileId ?? null
  if (!thumbFileId) {
    const legacy = await prisma.packagingSystem.findFirst({ where: { id: systemId }, select: { partnerImageFileId: true } })
    thumbFileId = legacy?.partnerImageFileId ?? null
  }
  if (thumbFileId) {
    const pf = await prisma.partnerFile.findUnique({ where: { id: thumbFileId }, select: { r2Key: true } })
    if (pf?.r2Key) await prisma.packagingType.update({ where: { id: created.id }, data: { model3dThumbKey: pf.r2Key } })
  }

  // Promote the partner's die-line work into the new catalog type. A multi-package
  // upload (e.g. supplement bottle + outer carton) carries MORE THAN ONE DIELINE
  // file — promote EVERY one so nothing is dropped. The partner's inline mandatory
  // frames (customDielineLayout) describe a single die-line, so they attach to the
  // FIRST die-line (PARTNER_CONFIRMED); the remaining packages' die-lines come over
  // as UPLOADED (file preserved, frames to be placed later). If the partner only
  // laid inline frames with no uploaded file, we still create one from the layout.
  const cdlRow = await prisma.packagingSystem.findUnique({ where: { id: systemId }, select: { customDielineLayout: true } })
  const cdl = (cdlRow?.customDielineLayout ?? null) as { layout?: unknown; trim?: unknown; safe?: unknown } | null
  const dlFileRows = await prisma.packagingSystemFile.findMany({
    where: { packagingSystemId: systemId, role: 'DIELINE' },
    orderBy: { displayOrder: 'asc' },
    select: { partnerFileId: true },
  })
  if (cdl?.layout || dlFileRows.length > 0) {
    const svc = await prisma.partnerService.findFirst({ where: { partnerId: sys.partnerId }, select: { id: true } })
    if (svc) {
      // One die-line per uploaded file; fall back to a single layout-only die-line
      // when the partner placed frames but uploaded no file.
      const fileIds: Array<string | undefined> =
        dlFileRows.length > 0 ? dlFileRows.map((f) => f.partnerFileId) : [undefined]
      await Promise.all(
        fileIds.map((partnerFileId, i) => {
          const carriesFrames = i === 0 && Boolean(cdl?.layout)
          return prisma.packagingDieline.create({
            data: {
              partnerServiceId: svc.id,
              packagingTypeId: created.id,
              decorationMethod: 'DIRECT_PRINT',
              frames: carriesFrames ? (cdl!.layout as never) : undefined,
              trimBox: carriesFrames ? ((cdl!.trim ?? undefined) as never) : undefined,
              safeAreaBox: carriesFrames ? ((cdl!.safe ?? undefined) as never) : undefined,
              partnerFileId: partnerFileId ?? undefined,
              framesUpdatedAt: carriesFrames ? new Date() : undefined,
              status: carriesFrames ? 'PARTNER_CONFIRMED' : 'UPLOADED',
            },
          })
        }),
      )
    }
  }

  await prisma.packagingSystem.update({
    where: { id: systemId },
    data: { reviewStatus: 'APPROVED', packagingTypeId: created.id, approvedPackagingTypeId: created.id, reviewNotes: null },
  })

  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_APPROVE', payload: { packagingTypeId: created.id, category, displayName: name } })
  const owner = await systemOwner(systemId)
  if (owner) await dispatchNotification({ userId: owner.userId, event: 'PACKAGING_APPROVED', data: { name, category }, audience: 'partner' })
  revalidatePath(PATH)
  return { ok: true }
}

export async function rejectPackagingReview(systemId: string, notes: string): Promise<Result> {
  const user = await requireRole('ADMIN')
  const sys = await prisma.packagingSystem.findFirst({ where: { id: systemId, reviewStatus: 'SUBMITTED' }, select: { id: true } })
  if (!sys) return { ok: false, error: 'Submission not found or already handled.' }
  await prisma.packagingSystem.update({ where: { id: systemId }, data: { reviewStatus: 'REJECTED', reviewNotes: notes.trim() || null } })
  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_REJECT', payload: { notes: notes.trim() || null } })
  const owner = await systemOwner(systemId)
  if (owner) await dispatchNotification({ userId: owner.userId, event: 'PACKAGING_REJECTED', data: { name: owner.name, notes: notes.trim() || undefined }, audience: 'partner' })
  revalidatePath(PATH)
  return { ok: true }
}
