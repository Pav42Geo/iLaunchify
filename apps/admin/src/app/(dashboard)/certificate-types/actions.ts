'use server'

// Admin CRUD for the CertificateType library + reviewer actions on individual
// PartnerCertificateInstance rows (Verify / Reject).
//
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §7.2 + #129.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { uploadFile, certificateThumbnailKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { CertificateTypeStatus, PartnerCertInstanceStatus } from '@prisma/client'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

// -----------------------------------------------------------------------------
// Library CRUD
// -----------------------------------------------------------------------------

export async function createCertificateType(input: {
  name: string
  slug: string
  description: string
  verificationNotes: string
}): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')

  if (!input.name.trim() || !input.description.trim()) {
    return { ok: false, error: 'Name + description are required.' }
  }
  const slug = input.slug.trim().toLowerCase()
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: 'Slug must be lowercase letters, numbers, and dashes (2-42 chars).' }
  }
  const dup = await prisma.certificateType.findUnique({ where: { slug } })
  if (dup) return { ok: false, error: `Slug "${slug}" is already taken.` }

  const created = await prisma.certificateType.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description.trim(),
      verificationNotes: input.verificationNotes.trim() || null,
      status: 'ACTIVE',
    },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateType',
    entityId: created.id,
    action: 'CERT_TYPE_CREATE',
    payload: { slug, name: input.name },
  })

  revalidatePath('/certificate-types')
  return { ok: true, data: { id: created.id } }
}

export async function updateCertificateType(input: {
  id: string
  name?: string
  description?: string
  verificationNotes?: string | null
}): Promise<Result> {
  await requireRole('ADMIN')
  await prisma.certificateType.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.verificationNotes !== undefined
        ? { verificationNotes: input.verificationNotes?.trim() || null }
        : {}),
    },
  })
  revalidatePath('/certificate-types')
  revalidatePath(`/certificate-types/${input.id}`)
  return { ok: true }
}

export async function setCertificateTypeStatus(
  id: string,
  status: CertificateTypeStatus,
): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const ct = await prisma.certificateType.findUnique({ where: { id } })
  if (!ct) return { ok: false, error: 'Certificate type not found.' }

  await prisma.certificateType.update({ where: { id }, data: { status } })

  await logAuditAs(admin, {
    entityType: 'CertificateType',
    entityId: id,
    action: status === 'ACTIVE' ? 'CERT_TYPE_REACTIVATE' : 'CERT_TYPE_DEPRECATE',
    fromValue: ct.status,
    toValue: status,
    payload: { slug: ct.slug, name: ct.name },
  })

  revalidatePath('/certificate-types')
  revalidatePath(`/certificate-types/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Thumbnail upload — admin-curated branded badge image (the public face of
// the cert). Stored on R2 + linked via thumbnailFileId on CertificateType.
// We reuse PartnerFile for the file row (ownerType-less convention since
// these are platform-owned, not partner-owned; partnerId is set to the
// admin user's id as a placeholder so the FK satisfies).
// Cleaner long-term: an Asset row with ownerType=PLATFORM. For V1 we lean on
// PartnerFile to ship the loop.
// -----------------------------------------------------------------------------

export async function uploadCertificateTypeThumbnail(formData: FormData): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const typeId = String(formData.get('typeId') ?? '')
  const file = formData.get('file')
  if (!typeId) return { ok: false, error: 'Missing typeId.' }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No image provided.' }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Thumbnail too large (max 5 MB).' }
  }

  const ct = await prisma.certificateType.findUnique({
    where: { id: typeId },
    select: { id: true, slug: true },
  })
  if (!ct) return { ok: false, error: 'Certificate type not found.' }

  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: certificateThumbnailKey({ slug: ct.slug, filename: file.name }),
      body: buffer,
      contentType: file.type,
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  // Asset row (ownerType=PLATFORM, ownerId=null — these aren't partner-owned).
  const asset = await prisma.asset.create({
    data: {
      ownerType: 'PLATFORM',
      ownerId: null,
      type: 'ICON',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      mimeType: file.type,
      sizeBytes: upload.sizeBytes,
      isPublic: true,
      uploadedByUserId: admin.id,
    },
  })

  await prisma.certificateType.update({
    where: { id: typeId },
    data: { thumbnailFileId: asset.id },
  })

  revalidatePath('/certificate-types')
  revalidatePath(`/certificate-types/${typeId}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Reviewer actions on PartnerCertificateInstance rows (Verify / Reject)
// Called from the cert-review block on /admin/partners/[id]/verification.
// -----------------------------------------------------------------------------

export async function setCertInstanceStatus(input: {
  instanceId: string
  to: PartnerCertInstanceStatus
  reason?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const inst = await prisma.partnerCertificateInstance.findUnique({
    where: { id: input.instanceId },
    include: { certificateType: { select: { name: true } } },
  })
  if (!inst) return { ok: false, error: 'Certificate instance not found.' }

  await prisma.partnerCertificateInstance.update({
    where: { id: input.instanceId },
    data: {
      status: input.to,
      reviewedById: admin.id,
      reviewedAt: new Date(),
      rejectionReason: input.to === 'REJECTED' ? input.reason?.trim() || null : null,
    },
  })

  await logAuditAs(admin, {
    entityType: 'PartnerCertificateInstance',
    entityId: input.instanceId,
    action:
      input.to === 'VERIFIED'
        ? 'CERT_INSTANCE_VERIFY'
        : input.to === 'REJECTED'
          ? 'CERT_INSTANCE_REJECT'
          : 'CERT_INSTANCE_STATUS_CHANGE',
    fromValue: inst.status,
    toValue: input.to,
    payload: {
      partnerId: inst.partnerId,
      certificateType: inst.certificateType.name,
      reason: input.to === 'REJECTED' ? input.reason ?? null : null,
    },
  })

  revalidatePath(`/partners/${inst.partnerId}/verification`)
  revalidatePath(`/partners/${inst.partnerId}`)
  return { ok: true }
}
