'use server'

// Verification-document replacement from Settings → Company profile
// (prototype #p-company "Verification documents" docslots, Pavel 2026-07-12).
//
// Reuses the onboarding upload rail (uploadPartnerDocument: R2 private upload +
// PartnerFile row + audit + optional expiry for the Expiry Engine), then flips
// the DOCUMENTS verification section back to PENDING — replacing an approved
// compliance document re-enters admin review (keeps "verified" honest). Audited.

import { prisma } from '@ilaunchify/db'
import type { PartnerFileKind } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'
import { uploadPartnerDocument } from '@/app/(onboarding)/onboarding/documents/actions'

const REPLACEABLE_KINDS: PartnerFileKind[] = [
  'CERT_OF_INCORPORATION',
  'BUSINESS_LICENSE',
  'INSURANCE',
]

export type ReplaceDocResult = { ok: true } | { ok: false; error: string }

export async function replaceVerificationDocument(
  kind: PartnerFileKind,
  formData: FormData,
): Promise<ReplaceDocResult> {
  if (!REPLACEABLE_KINDS.includes(kind)) return { ok: false, error: 'Invalid document kind.' }
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true },
  })
  if (!partner) return { ok: false, error: 'No partner account.' }

  formData.set('sectionType', 'DOCUMENTS')
  formData.set('kind', kind)
  const res = await uploadPartnerDocument(formData)
  if (!res.ok) return res

  // Approved partners: a replaced compliance doc re-enters admin review.
  if (partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED') {
    await prisma.partnerVerificationSection.upsert({
      where: { partnerId_type: { partnerId: partner.id, type: 'DOCUMENTS' } },
      create: { partnerId: partner.id, type: 'DOCUMENTS', status: 'PENDING' },
      update: { status: 'PENDING', verifiedAt: null, verifiedById: null },
    })
    await logAuditAs(user, {
      entityType: 'PartnerVerificationSection',
      entityId: partner.id,
      action: 'VERIFICATION_DOC_REPLACED',
      toValue: 'PENDING',
      payload: { kind, fileId: res.fileId, section: 'DOCUMENTS' },
    })
  }

  revalidatePath('/settings/company')
  revalidatePath('/my-application')
  return { ok: true }
}

export type DocUrlResult = { ok: true; url: string; filename: string } | { ok: false; error: string }

/**
 * Short-lived signed download URL for the partner's OWN latest document of a
 * kind (private R2 object — never a public URL). Ownership-fenced + audited.
 */
export async function getVerificationDocUrl(kind: PartnerFileKind): Promise<DocUrlResult> {
  if (!REPLACEABLE_KINDS.includes(kind)) return { ok: false, error: 'Invalid document kind.' }
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'No partner account.' }

  const file = await prisma.partnerFile.findFirst({
    where: { partnerId: partner.id, kind, sectionType: 'DOCUMENTS' },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, r2Key: true, originalFilename: true },
  })
  if (!file) return { ok: false, error: 'No document on file yet.' }

  try {
    const url = await getSignedReadUrl(file.r2Key, { expiresInSeconds: 300 }) // 5-minute link
    await logAuditAs(user, {
      entityType: 'PartnerFile',
      entityId: file.id,
      action: 'FILE_DOWNLOAD_URL_ISSUED',
      payload: { kind, filename: file.originalFilename },
    })
    return { ok: true, url, filename: file.originalFilename }
  } catch (err) {
    return { ok: false, error: `Could not sign the download: ${(err as Error).message}` }
  }
}
