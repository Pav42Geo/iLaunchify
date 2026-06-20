'use server'

// Admin packaging-catalog review (docs/PACKAGING_REVIEW.md). Partners submit a
// custom packaging from the Packaging Studio "My" tab; admin approves it into an
// ACTIVE PackagingType (which the studio Library catalog surfaces) + assigns a
// container category, or rejects with notes. The PackagingSystem review columns
// ship with a pending migration → cast-guarded.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

const PATH = '/asset-management/packaging-review'

type Result = { ok: true } | { ok: false; error: string }

export interface ReviewRow {
  id: string
  name: string
  topology: string
  suggestedCategory: string | null
  submittedAt: string | null
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
  const rows = await ps().findMany({
    where: { reviewStatus: 'SUBMITTED' },
    select: { id: true, partnerName: true, overrideDisplayName: true, topology: true, suggestedCategory: true, submittedForReviewAt: true },
    orderBy: { submittedForReviewAt: 'asc' },
  })
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.overrideDisplayName ?? r.partnerName ?? 'Custom packaging'),
    topology: String(r.topology ?? 'OTHER'),
    suggestedCategory: r.suggestedCategory ? String(r.suggestedCategory) : null,
    submittedAt: r.submittedForReviewAt ? new Date(r.submittedForReviewAt as string).toISOString() : null,
  }))
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

  await ps().update({
    where: { id: systemId },
    data: { reviewStatus: 'APPROVED', packagingTypeId: created.id, approvedPackagingTypeId: created.id, reviewNotes: null },
  })

  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_APPROVE', payload: { packagingTypeId: created.id, category, displayName: name } })
  revalidatePath(PATH)
  return { ok: true }
}

export async function rejectPackagingReview(systemId: string, notes: string): Promise<Result> {
  const user = await requireRole('ADMIN')
  const sys = (await ps().findFirst({ where: { id: systemId, reviewStatus: 'SUBMITTED' }, select: { id: true } })) as { id: string } | null
  if (!sys) return { ok: false, error: 'Submission not found or already handled.' }
  await ps().update({ where: { id: systemId }, data: { reviewStatus: 'REJECTED', reviewNotes: notes.trim() || null } })
  await logAuditAs(user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_REVIEW_REJECT', payload: { notes: notes.trim() || null } })
  revalidatePath(PATH)
  return { ok: true }
}
