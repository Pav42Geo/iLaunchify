'use server'

// Partner certifications — claim cert types from admin library, upload private
// PDFs, manage expiry. Per docs/MANUFACTURER_PRODUCT_BUILDER.md §7.2 + #129.
//
// Privacy model: PDF is private (admin-only). Public product detail pages
// only show the CertificateType's branded thumbnail badge — never the PDF
// itself. Standard B2B practice (NSF/USDA/Amazon Brand Registry pattern).
//
// Status lifecycle:
//   PENDING_REVIEW → VERIFIED   (admin verifies)
//                  → REJECTED   (admin rejects with reason)
//   VERIFIED       → EXPIRED    (auto on expiryDate elapsing; cron job V1.5+)
//                  → REJECTED   (admin revoke)

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, deleteFile, certPdfKey, getSignedReadUrl } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { CERT_UPLOAD_CONSENT_VERSION } from './consent'

/** P10 — the upload-consent checkbox must be ticked (formData `consent`). */
function consentGiven(formData: FormData): boolean {
  const v = String(formData.get('consent') ?? '')
  return v === 'true' || v === '1' || v === 'on'
}

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const UPLOAD_MAX_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'NOT_A_PARTNER' as const }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, companyName: true },
  })
  if (!partner) return { user, partner: null as null, error: 'PARTNER_NOT_FOUND' as const }
  return { user, partner, error: null as null }
}

// -----------------------------------------------------------------------------
// CLAIM a CertificateType — creates a PartnerCertificateInstance + uploads PDF.
// One transaction: create row, then upload PDF, then update row with file id.
// If PDF upload fails after the row is created, we delete the orphan row.
// -----------------------------------------------------------------------------

export async function claimCertificate(formData: FormData): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const certificateTypeId = String(formData.get('certificateTypeId') ?? '')
  const certificateNumber = String(formData.get('certificateNumber') ?? '').trim() || null
  const issuingBody = String(formData.get('issuingBody') ?? '').trim() || null
  const issueDateRaw = String(formData.get('issueDate') ?? '').trim()
  const expiryDateRaw = String(formData.get('expiryDate') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const file = formData.get('file')

  if (!certificateTypeId) return { ok: false, error: 'Pick a certificate type.' }
  if (!expiryDateRaw) return { ok: false, error: 'Expiry date is required.' }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'PDF upload is required.' }
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, error: 'File too large (max 20 MB).' }
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type}". Use PDF, PNG, JPEG, or WebP.` }
  }
  if (!consentGiven(formData)) {
    return { ok: false, error: 'Please confirm the upload consent before submitting.' }
  }

  const certType = await prisma.certificateType.findUnique({
    where: { id: certificateTypeId },
    select: { id: true, name: true, status: true },
  })
  if (!certType || certType.status !== 'ACTIVE') {
    return { ok: false, error: 'That certificate type is no longer available.' }
  }

  // Check duplicate — one PENDING_REVIEW/VERIFIED instance per (partner, type).
  // EXPIRED/REJECTED rows can co-exist (history).
  const existing = await prisma.partnerCertificateInstance.findFirst({
    where: {
      partnerId: partner.id,
      certificateTypeId: certType.id,
      status: { in: ['PENDING_REVIEW', 'VERIFIED'] },
    },
  })
  if (existing) {
    return {
      ok: false,
      error: `You already have an active ${certType.name} certificate. Edit or replace it instead.`,
    }
  }

  // Create the row first so we have an instance id for the R2 key.
  let instance
  try {
    instance = await prisma.partnerCertificateInstance.create({
      data: {
        partnerId: partner.id,
        certificateTypeId: certType.id,
        pdfFileId: 'pending', // overwritten after upload
        certificateNumber,
        issuingBody,
        issueDate: issueDateRaw ? new Date(issueDateRaw) : null,
        expiryDate: new Date(expiryDateRaw),
        status: 'PENDING_REVIEW',
        notes,
        consentAcceptedAt: new Date(),
        consentVersion: CERT_UPLOAD_CONSENT_VERSION,
      },
    })
  } catch (err) {
    return { ok: false, error: `Could not create certificate: ${(err as Error).message}` }
  }

  // Upload PDF to R2
  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: certPdfKey({
        partnerId: partner.id,
        instanceId: instance.id,
        filename: file.name,
      }),
      body: buffer,
      contentType: file.type,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '_')}"`,
    })
  } catch (err) {
    // Roll back the orphan instance row
    await prisma.partnerCertificateInstance.delete({ where: { id: instance.id } }).catch(() => {})
    return { ok: false, error: `PDF upload failed: ${(err as Error).message}` }
  }

  // Create PartnerFile + link it on the instance
  const partnerFile = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType: 'DOCUMENTS',
      kind: 'CERTIFICATE',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  await prisma.partnerCertificateInstance.update({
    where: { id: instance.id },
    data: { pdfFileId: partnerFile.id },
  })

  await logAuditAs(user, {
    entityType: 'PartnerCertificateInstance',
    entityId: instance.id,
    action: 'CERT_INSTANCE_CLAIM',
    toValue: 'PENDING_REVIEW',
    payload: {
      partnerId: partner.id,
      certificateType: certType.name,
      filename: file.name,
    },
  })

  revalidatePath('/certifications')
  return { ok: true, data: { id: instance.id } }
}

// -----------------------------------------------------------------------------
// RENEW an existing instance (C4). Creates a NEW PartnerCertificateInstance
// (status PENDING_REVIEW) with a fresh PDF + expiry, and links the OLD instance
// forward via replacedById = newInstance.id. The old instance keeps its status
// + product attachments until an admin verifies the new one, at which point
// attachments auto-migrate (see admin setCertInstanceStatus). This preserves
// the full audit trail rather than mutating the expired row in place.
// -----------------------------------------------------------------------------

export async function renewCertificate(formData: FormData): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const oldInstanceId = String(formData.get('oldInstanceId') ?? '')
  const certificateNumber = String(formData.get('certificateNumber') ?? '').trim() || null
  const issuingBody = String(formData.get('issuingBody') ?? '').trim() || null
  const issueDateRaw = String(formData.get('issueDate') ?? '').trim()
  const expiryDateRaw = String(formData.get('expiryDate') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const file = formData.get('file')

  if (!oldInstanceId) return { ok: false, error: 'Missing the certificate being renewed.' }
  if (!expiryDateRaw) return { ok: false, error: 'New expiry date is required.' }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'A renewed PDF upload is required.' }
  }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: 'File too large (max 20 MB).' }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type}". Use PDF, PNG, JPEG, or WebP.` }
  }
  if (!consentGiven(formData)) {
    return { ok: false, error: 'Please confirm the upload consent before submitting.' }
  }

  const old = await prisma.partnerCertificateInstance.findUnique({
    where: { id: oldInstanceId },
    include: { certificateType: { select: { id: true, name: true } } },
  })
  if (!old) return { ok: false, error: 'Certificate to renew not found.' }
  if (old.partnerId !== partner.id) return { ok: false, error: 'Not your certificate.' }
  if (old.replacedById) {
    return { ok: false, error: 'A renewal is already in progress for this certificate.' }
  }

  // Create the new instance first (need its id for the R2 key).
  let instance
  try {
    instance = await prisma.partnerCertificateInstance.create({
      data: {
        partnerId: partner.id,
        certificateTypeId: old.certificateType.id,
        pdfFileId: 'pending',
        certificateNumber,
        issuingBody,
        issueDate: issueDateRaw ? new Date(issueDateRaw) : null,
        expiryDate: new Date(expiryDateRaw),
        status: 'PENDING_REVIEW',
        notes,
        consentAcceptedAt: new Date(),
        consentVersion: CERT_UPLOAD_CONSENT_VERSION,
      },
    })
  } catch (err) {
    return { ok: false, error: `Could not create renewal: ${(err as Error).message}` }
  }

  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: certPdfKey({ partnerId: partner.id, instanceId: instance.id, filename: file.name }),
      body: buffer,
      contentType: file.type,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '_')}"`,
    })
  } catch (err) {
    await prisma.partnerCertificateInstance.delete({ where: { id: instance.id } }).catch(() => {})
    return { ok: false, error: `PDF upload failed: ${(err as Error).message}` }
  }

  const partnerFile = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType: 'DOCUMENTS',
      kind: 'CERTIFICATE',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  // Link new PDF + point the OLD instance forward to the new one.
  await prisma.$transaction([
    prisma.partnerCertificateInstance.update({
      where: { id: instance.id },
      data: { pdfFileId: partnerFile.id },
    }),
    prisma.partnerCertificateInstance.update({
      where: { id: old.id },
      data: { replacedById: instance.id },
    }),
  ])

  await logAuditAs(user, {
    entityType: 'PartnerCertificateInstance',
    entityId: instance.id,
    action: 'CERT_INSTANCE_RENEW',
    toValue: 'PENDING_REVIEW',
    payload: {
      partnerId: partner.id,
      certificateType: old.certificateType.name,
      replacesInstanceId: old.id,
      filename: file.name,
    },
  })

  revalidatePath('/certifications')
  return { ok: true, data: { id: instance.id } }
}

// -----------------------------------------------------------------------------
// UPDATE editable fields on an existing instance (number/issuing body/dates).
// PDF is replaced via separate action.
// -----------------------------------------------------------------------------

export async function updateCertificate(input: {
  id: string
  certificateNumber: string | null
  issuingBody: string | null
  issueDate: string | null
  expiryDate: string
  notes: string | null
}): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const instance = await prisma.partnerCertificateInstance.findUnique({
    where: { id: input.id },
    select: { partnerId: true, status: true, certificateType: { select: { name: true } } },
  })
  if (!instance) return { ok: false, error: 'Certificate not found.' }
  if (instance.partnerId !== partner.id) return { ok: false, error: 'Not your certificate.' }
  if (!input.expiryDate) return { ok: false, error: 'Expiry date is required.' }

  const kickedBack = instance.status === 'VERIFIED'
  await prisma.partnerCertificateInstance.update({
    where: { id: input.id },
    data: {
      certificateNumber: input.certificateNumber?.trim() || null,
      issuingBody: input.issuingBody?.trim() || null,
      issueDate: input.issueDate ? new Date(input.issueDate) : null,
      expiryDate: new Date(input.expiryDate),
      notes: input.notes?.trim() || null,
      // Editing a previously-verified cert kicks it back to review.
      ...(kickedBack ? { status: 'PENDING_REVIEW' as const } : {}),
    },
  })

  await logAuditAs(user, {
    entityType: 'PartnerCertificateInstance',
    entityId: input.id,
    action: 'CERT_INSTANCE_UPDATE',
    fromValue: instance.status,
    toValue: kickedBack ? 'PENDING_REVIEW' : instance.status,
    payload: {
      partnerId: partner.id,
      certificateType: instance.certificateType.name,
      expiryDate: input.expiryDate,
    },
  })

  revalidatePath('/certifications')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// DOWNLOAD own cert PDF — the file is the partner's own upload (privacy model
// keeps it off PUBLIC surfaces; the owner can always retrieve it). Signed 5-min
// URL, ownership-checked, audited — same pattern as Company verification docs.
// -----------------------------------------------------------------------------

export async function getCertPdfUrl(
  instanceId: string,
): Promise<{ ok: true; url: string; filename: string } | { ok: false; error: string }> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const instance = await prisma.partnerCertificateInstance.findUnique({
    where: { id: instanceId },
    select: { partnerId: true, pdfFileId: true, certificateType: { select: { name: true } } },
  })
  if (!instance) return { ok: false, error: 'Certificate not found.' }
  if (instance.partnerId !== partner.id) return { ok: false, error: 'Not your certificate.' }

  const file = await prisma.partnerFile.findUnique({
    where: { id: instance.pdfFileId },
    select: { id: true, r2Key: true, originalFilename: true },
  })
  if (!file) return { ok: false, error: 'No file on record for this certificate.' }

  try {
    const url = await getSignedReadUrl(file.r2Key, { expiresInSeconds: 300 })
    await logAuditAs(user, {
      entityType: 'PartnerFile',
      entityId: file.id,
      action: 'FILE_DOWNLOAD_URL_ISSUED',
      payload: {
        partnerId: partner.id,
        certificateType: instance.certificateType.name,
        filename: file.originalFilename,
      },
    })
    return { ok: true, url, filename: file.originalFilename }
  } catch (err) {
    return { ok: false, error: `Could not sign the download: ${(err as Error).message}` }
  }
}

// -----------------------------------------------------------------------------
// REQUEST a new certificate type (C3). When a partner carries a cert that isn't
// in the admin library, they submit a CertificateTypeRequest here; admins triage
// it in /admin/certificate-requests (C2) and APPROVE → it becomes a real
// CertificateType the partner can then claim.
// -----------------------------------------------------------------------------

export async function requestCertificateType(input: {
  name: string
  issuingBody?: string
  description?: string
}): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'Enter the certificate name (at least 2 characters).' }
  if (name.length > 120) return { ok: false, error: 'Name is too long (max 120 characters).' }

  // If a cert type already exists with this name, nudge them to claim it instead.
  const existingType = await prisma.certificateType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, status: 'ACTIVE' },
    select: { name: true },
  })
  if (existingType) {
    return {
      ok: false,
      error: `"${existingType.name}" is already in the library — claim it from the list instead of requesting it.`,
    }
  }

  // Avoid stacking duplicate pending requests from the same partner.
  const dupePending = await prisma.certificateTypeRequest.findFirst({
    where: {
      createdByPartnerId: partner.id,
      status: 'PENDING',
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (dupePending) {
    return { ok: false, error: 'You already have a pending request for this certificate.' }
  }

  const created = await prisma.certificateTypeRequest.create({
    data: {
      createdByPartnerId: partner.id,
      name,
      issuingBody: input.issuingBody?.trim() || null,
      description: input.description?.trim() || null,
      status: 'PENDING',
    },
  })

  await logAuditAs(user, {
    entityType: 'CertificateTypeRequest',
    entityId: created.id,
    action: 'CERT_TYPE_REQUEST_CREATE',
    toValue: 'PENDING',
    payload: { partnerId: partner.id, name, issuingBody: input.issuingBody?.trim() || null },
  })

  revalidatePath('/certifications')
  revalidatePath('/certifications/request')
  return { ok: true, data: { id: created.id } }
}

// -----------------------------------------------------------------------------
// DELETE an instance + its R2 PDF + the PartnerFile row.
// -----------------------------------------------------------------------------

export async function deleteCertificate(id: string): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const instance = await prisma.partnerCertificateInstance.findUnique({
    where: { id },
    include: {
      certificateType: { select: { name: true } },
    },
  })
  if (!instance) return { ok: false, error: 'Certificate not found.' }
  if (instance.partnerId !== partner.id) return { ok: false, error: 'Not your certificate.' }

  // Look up the PartnerFile to get the r2Key before nuking it
  const file = await prisma.partnerFile.findUnique({
    where: { id: instance.pdfFileId },
    select: { r2Key: true },
  })

  await prisma.partnerCertificateInstance.delete({ where: { id } })

  if (file) {
    try {
      await deleteFile(file.r2Key)
    } catch {
      // Best-effort — DB row is already gone, log left orphan in R2.
    }
    await prisma.partnerFile.delete({ where: { id: instance.pdfFileId } }).catch(() => {})
  }

  await logAuditAs(user, {
    entityType: 'PartnerCertificateInstance',
    entityId: id,
    action: 'CERT_INSTANCE_DELETE',
    payload: { partnerId: partner.id, certificateType: instance.certificateType.name },
  })

  revalidatePath('/certifications')
  return { ok: true }
}
