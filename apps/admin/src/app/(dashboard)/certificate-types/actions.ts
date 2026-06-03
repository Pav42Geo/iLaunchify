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
import type { CertificateTypeStatus, PartnerCertInstanceStatus, CertScope } from '@ilaunchify/db'

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
  scope?: CertScope | null
  issuingBodyUrl?: string | null
  applicabilityNotes?: string | null
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  await prisma.certificateType.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.verificationNotes !== undefined
        ? { verificationNotes: input.verificationNotes?.trim() || null }
        : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.issuingBodyUrl !== undefined
        ? { issuingBodyUrl: input.issuingBodyUrl?.trim() || null }
        : {}),
      ...(input.applicabilityNotes !== undefined
        ? { applicabilityNotes: input.applicabilityNotes?.trim() || null }
        : {}),
    },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateType',
    entityId: input.id,
    action: 'CERT_TYPE_UPDATE',
    payload: {
      fields: Object.keys(input).filter((k) => k !== 'id'),
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
// Badge uploads — admin-curated branded badge for a CertificateType. Two
// assets per type, each its own slot:
//   • PNG → thumbnailFileId — the WEB badge (marketplace product detail + cert
//     chips). Stored with a public URL so statically-rendered marketing pages
//     can <img> it directly.
//   • SVG → badgeSvgFileId  — the VECTOR badge used in the Design Studio for
//     print/production, where vector output is a hard requirement.
// File rows are Asset (ownerType=PLATFORM, ownerId=null — platform-owned).
// -----------------------------------------------------------------------------

type CertBadgeKind = 'PNG' | 'SVG'

const CERT_BADGE_ACCEPT: Record<CertBadgeKind, { mimes: string[]; label: string }> = {
  PNG: { mimes: ['image/png', 'image/webp'], label: 'PNG or WebP' },
  SVG: { mimes: ['image/svg+xml'], label: 'SVG' },
}

async function uploadCertBadge(formData: FormData, kind: CertBadgeKind): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const typeId = String(formData.get('typeId') ?? '')
  const file = formData.get('file')
  if (!typeId) return { ok: false, error: 'Missing typeId.' }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file provided.' }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Badge too large (max 5 MB).' }
  }

  // Validate the file is the right kind. Browsers occasionally send an empty
  // type for dragged .svg files, so sniff the extension as an SVG fallback.
  const accept = CERT_BADGE_ACCEPT[kind]
  const looksRight =
    accept.mimes.includes(file.type) ||
    (kind === 'SVG' && file.name.toLowerCase().endsWith('.svg'))
  if (!looksRight) {
    return { ok: false, error: `Wrong file type — upload a ${accept.label} file.` }
  }

  const ct = await prisma.certificateType.findUnique({
    where: { id: typeId },
    select: { id: true, slug: true },
  })
  if (!ct) return { ok: false, error: 'Certificate type not found.' }

  const contentType = file.type || (kind === 'SVG' ? 'image/svg+xml' : 'image/png')
  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: certificateThumbnailKey({ slug: ct.slug, filename: file.name }),
      body: buffer,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  // The PNG is shown on public, statically-rendered marketing pages → it needs
  // a stable public URL. The SVG is read through a signed URL in the studio,
  // so a public URL is optional for it (set it too when the bucket is public).
  const publicBase = (
    process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL
  )?.replace(/\/$/, '')
  const publicUrl = publicBase ? `${publicBase}/${upload.key}` : null

  // Asset row (ownerType=PLATFORM, ownerId=null — these aren't partner-owned).
  const asset = await prisma.asset.create({
    data: {
      ownerType: 'PLATFORM',
      ownerId: null,
      type: 'ICON',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      publicUrl,
      mimeType: contentType,
      sizeBytes: upload.sizeBytes,
      isPublic: true,
      uploadedByUserId: admin.id,
    },
  })

  await prisma.certificateType.update({
    where: { id: typeId },
    data: kind === 'SVG' ? { badgeSvgFileId: asset.id } : { thumbnailFileId: asset.id },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateType',
    entityId: typeId,
    action: kind === 'SVG' ? 'CERT_TYPE_BADGE_SVG_UPLOAD' : 'CERT_TYPE_BADGE_PNG_UPLOAD',
    payload: { slug: ct.slug, kind, mimeType: contentType },
  })

  revalidatePath('/certificate-types')
  revalidatePath(`/certificate-types/${typeId}`)
  return { ok: true }
}

/** PNG web badge (marketplace product detail + cert chips) → thumbnailFileId. */
export async function uploadCertificateTypeThumbnail(formData: FormData): Promise<Result> {
  return uploadCertBadge(formData, 'PNG')
}

/** Vector SVG print badge (Design Studio / production) → badgeSvgFileId. */
export async function uploadCertificateTypeBadgeSvg(formData: FormData): Promise<Result> {
  return uploadCertBadge(formData, 'SVG')
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
