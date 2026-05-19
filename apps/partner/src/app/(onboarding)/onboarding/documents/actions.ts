'use server'

// Server actions for the documents onboarding step.
// Upload pattern: browser POSTs a FormData (file + metadata fields) to
// uploadPartnerDocument(). The action:
//   1. Validates auth + ownership (current user owns the partner record)
//   2. Streams the file body to R2 via @ilaunchify/storage
//   3. Creates a PartnerFile row pointing at the R2 key
//   4. Writes an audit log entry
//
// Files larger than UPLOAD_MAX_BYTES are rejected. Browsers honor the
// formData limit, but we double-check server-side.

import { prisma } from '@ilaunchify/db'
import type { PartnerFileKind, VerificationSectionType } from '@prisma/client'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, deleteFile, partnerFileKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

const UPLOAD_MAX_BYTES = 20 * 1024 * 1024 // 20 MB per file

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
])

export type UploadResult =
  | { ok: true; fileId: string }
  | { ok: false; error: string }

export async function uploadPartnerDocument(formData: FormData): Promise<UploadResult> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account' }

  const file = formData.get('file')
  const sectionType = formData.get('sectionType') as VerificationSectionType | null
  const kind = formData.get('kind') as PartnerFileKind | null

  if (!(file instanceof File)) return { ok: false, error: 'No file provided' }
  if (!sectionType) return { ok: false, error: 'Missing sectionType' }
  if (!kind) return { ok: false, error: 'Missing kind' }

  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, error: `File too large (max ${UPLOAD_MAX_BYTES / 1024 / 1024} MB)` }
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type}". Allowed: PDF, PNG, JPEG, WebP.` }
  }

  // Resolve the current partner record (one per user)
  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return { ok: false, error: 'No partner record for this user' }

  // Find (or skip) the matching verification section row. We create the row
  // lazily here so partners can upload before the admin queue scaffold runs.
  const section = await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId: partner.id, type: sectionType } },
    create: { partnerId: partner.id, type: sectionType, status: 'PENDING' },
    update: {},
  })

  // Stream the file body to R2
  const buffer = Buffer.from(await file.arrayBuffer())
  const key = partnerFileKey({
    partnerId: partner.id,
    section: sectionType.toLowerCase() as never,
    filename: file.name,
  })

  let uploadResult
  try {
    uploadResult = await uploadFile({
      key,
      body: buffer,
      contentType: file.type,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '_')}"`,
    })
  } catch (err) {
    return {
      ok: false,
      error: `Upload to R2 failed: ${(err as Error).message}`,
    }
  }

  // Record in DB
  const record = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType,
      sectionId: section.id,
      kind,
      r2Key: uploadResult.key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: uploadResult.sizeBytes,
      uploadedById: user.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'PartnerFile',
    entityId: record.id,
    action: 'FILE_UPLOAD',
    payload: {
      partnerId: partner.id,
      kind,
      sectionType,
      filename: file.name,
      sizeBytes: uploadResult.sizeBytes,
    },
  })

  revalidatePath('/onboarding/documents')
  return { ok: true, fileId: record.id }
}

export async function deletePartnerDocument({
  fileId,
}: { fileId: string }): Promise<UploadResult> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account' }

  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return { ok: false, error: 'No partner record for this user' }

  const file = await prisma.partnerFile.findUnique({ where: { id: fileId } })
  if (!file) return { ok: false, error: 'File not found' }
  if (file.partnerId !== partner.id) {
    return { ok: false, error: 'Not your file' }
  }

  // R2 delete first; if that fails we keep the row so we don't lose track
  try {
    await deleteFile(file.r2Key)
  } catch (err) {
    return { ok: false, error: `R2 delete failed: ${(err as Error).message}` }
  }

  await prisma.partnerFile.delete({ where: { id: fileId } })

  await logAuditAs(user, {
    entityType: 'PartnerFile',
    entityId: fileId,
    action: 'FILE_DELETE',
    payload: { kind: file.kind, sectionType: file.sectionType, filename: file.originalFilename },
  })

  revalidatePath('/onboarding/documents')
  return { ok: true, fileId }
}
