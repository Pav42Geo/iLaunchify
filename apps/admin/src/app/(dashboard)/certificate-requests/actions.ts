'use server'

// C2 — admin review actions for partner-submitted CertificateTypeRequest rows.
//
// A partner (in C3) can request a cert type that isn't in the library yet.
// Admins triage here: APPROVE promotes the request into a real CertificateType
// (carrying the applicability metadata across) and links nothing else; REJECT
// records a reason. Both write an AuditLog row.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

/**
 * Approve a request → create the CertificateType (if the slug is free) and mark
 * the request APPROVED. Idempotent-ish: re-approving a non-PENDING request errors.
 */
export async function approveCertificateTypeRequest(input: {
  requestId: string
  /** Optional override; defaults to a slug derived from the request name. */
  slug?: string
}): Promise<Result<{ certificateTypeId: string }>> {
  const admin = await requireRole('ADMIN')

  const req = await prisma.certificateTypeRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') {
    return { ok: false, error: `Request already ${req.status.toLowerCase()}.` }
  }

  const slug = (input.slug?.trim() || slugify(req.name)).toLowerCase()
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: 'Could not derive a valid slug — set one manually.' }
  }
  const dup = await prisma.certificateType.findUnique({ where: { slug } })
  if (dup) {
    return {
      ok: false,
      error: `A certificate type with slug "${slug}" already exists. Reject this request as a duplicate.`,
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const ct = await tx.certificateType.create({
      data: {
        name: req.name,
        slug,
        description: req.description?.trim() || `${req.name}${req.issuingBody ? ` — issued by ${req.issuingBody}.` : '.'}`,
        issuingBodyUrl: null,
        applicabilityNotes: req.description?.trim() || null,
        applicableLabelingTypes: req.applicableLabelingTypes,
        applicableCategorySlugs: req.applicableCategorySlugs,
        applicableMarketSlugs: req.applicableMarketSlugs,
        status: 'ACTIVE',
      },
    })
    await tx.certificateTypeRequest.update({
      where: { id: req.id },
      data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: new Date() },
    })
    return ct
  })

  await logAuditAs(admin, {
    entityType: 'CertificateTypeRequest',
    entityId: req.id,
    action: 'CERT_TYPE_REQUEST_APPROVE',
    payload: {
      requestName: req.name,
      createdByPartnerId: req.createdByPartnerId,
      certificateTypeId: created.id,
      slug,
    },
  })

  revalidatePath('/certificate-requests')
  revalidatePath('/certificate-types')
  return { ok: true, data: { certificateTypeId: created.id } }
}

/** Reject a request with a required reason. */
export async function rejectCertificateTypeRequest(input: {
  requestId: string
  reason: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const reason = input.reason.trim()
  if (!reason) return { ok: false, error: 'A rejection reason is required.' }

  const req = await prisma.certificateTypeRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') {
    return { ok: false, error: `Request already ${req.status.toLowerCase()}.` }
  }

  await prisma.certificateTypeRequest.update({
    where: { id: req.id },
    data: {
      status: 'REJECTED',
      reviewedById: admin.id,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateTypeRequest',
    entityId: req.id,
    action: 'CERT_TYPE_REQUEST_REJECT',
    payload: {
      requestName: req.name,
      createdByPartnerId: req.createdByPartnerId,
      reason,
    },
  })

  revalidatePath('/certificate-requests')
  return { ok: true }
}
