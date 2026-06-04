'use server'

// C7 — admin CRUD for a CertificateType's brand-asset variants (color / B&W /
// outline / contextual lockups) + per-variant SVG/PNG upload. Each variant
// carries reproduction standards (min/max mm, approved colors, required co-text,
// clear-space factor, brand guidelines URL).

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { uploadFile, certificateThumbnailKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { CertAssetVariantKind } from '@ilaunchify/db'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

export interface VariantInput {
  certificateTypeId: string
  kind: CertAssetVariantKind
  label: string
  minWidthMm?: number | null
  maxWidthMm?: number | null
  approvedColorSpec?: string | null
  requiredCoText?: string | null
  clearSpaceFactor?: number | null
  brandGuidelinesUrl?: string | null
  notes?: string | null
}

function clean(s: string | null | undefined): string | null {
  const v = (s ?? '').trim()
  return v || null
}

export async function createCertAssetVariant(
  input: VariantInput,
): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }

  const ct = await prisma.certificateType.findUnique({
    where: { id: input.certificateTypeId },
    select: { id: true, slug: true },
  })
  if (!ct) return { ok: false, error: 'Certificate type not found.' }

  const count = await prisma.certificateAssetVariant.count({
    where: { certificateTypeId: ct.id },
  })

  const created = await prisma.certificateAssetVariant.create({
    data: {
      certificateTypeId: ct.id,
      kind: input.kind,
      label: input.label.trim(),
      minWidthMm: input.minWidthMm ?? null,
      maxWidthMm: input.maxWidthMm ?? null,
      approvedColorSpec: clean(input.approvedColorSpec),
      requiredCoText: clean(input.requiredCoText),
      clearSpaceFactor: input.clearSpaceFactor ?? null,
      brandGuidelinesUrl: clean(input.brandGuidelinesUrl),
      notes: clean(input.notes),
      sortOrder: count,
    },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateAssetVariant',
    entityId: created.id,
    action: 'CERT_ASSET_VARIANT_CREATE',
    payload: { certificateTypeId: ct.id, slug: ct.slug, kind: input.kind, label: input.label },
  })

  revalidatePath(`/certificate-types/${ct.id}/variants`)
  return { ok: true, data: { id: created.id } }
}

export async function updateCertAssetVariant(
  input: VariantInput & { id: string },
): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }

  const existing = await prisma.certificateAssetVariant.findUnique({
    where: { id: input.id },
    select: { id: true, certificateTypeId: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }

  await prisma.certificateAssetVariant.update({
    where: { id: input.id },
    data: {
      kind: input.kind,
      label: input.label.trim(),
      minWidthMm: input.minWidthMm ?? null,
      maxWidthMm: input.maxWidthMm ?? null,
      approvedColorSpec: clean(input.approvedColorSpec),
      requiredCoText: clean(input.requiredCoText),
      clearSpaceFactor: input.clearSpaceFactor ?? null,
      brandGuidelinesUrl: clean(input.brandGuidelinesUrl),
      notes: clean(input.notes),
    },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateAssetVariant',
    entityId: input.id,
    action: 'CERT_ASSET_VARIANT_UPDATE',
    payload: { certificateTypeId: existing.certificateTypeId, kind: input.kind, label: input.label },
  })

  revalidatePath(`/certificate-types/${existing.certificateTypeId}/variants`)
  return { ok: true }
}

export async function deleteCertAssetVariant(id: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const existing = await prisma.certificateAssetVariant.findUnique({
    where: { id },
    select: { id: true, certificateTypeId: true, label: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }

  await prisma.certificateAssetVariant.delete({ where: { id } })

  await logAuditAs(admin, {
    entityType: 'CertificateAssetVariant',
    entityId: id,
    action: 'CERT_ASSET_VARIANT_DELETE',
    payload: { certificateTypeId: existing.certificateTypeId, label: existing.label },
  })

  revalidatePath(`/certificate-types/${existing.certificateTypeId}/variants`)
  return { ok: true }
}

const VARIANT_ASSET_ACCEPT: Record<'SVG' | 'PNG', string[]> = {
  SVG: ['image/svg+xml'],
  PNG: ['image/png', 'image/webp'],
}

/** Upload a per-variant SVG (vector/production) or PNG (raster/UI) asset. */
export async function uploadCertVariantAsset(
  formData: FormData,
  kind: 'SVG' | 'PNG',
): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const variantId = String(formData.get('variantId') ?? '')
  const file = formData.get('file')
  if (!variantId) return { ok: false, error: 'Missing variant id.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file provided.' }
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'File too large (max 5 MB).' }

  const looksRight =
    VARIANT_ASSET_ACCEPT[kind].includes(file.type) ||
    (kind === 'SVG' && file.name.toLowerCase().endsWith('.svg'))
  if (!looksRight) {
    return { ok: false, error: `Wrong file type — upload a ${kind} file.` }
  }

  const variant = await prisma.certificateAssetVariant.findUnique({
    where: { id: variantId },
    select: { id: true, certificateTypeId: true, certificateType: { select: { slug: true } } },
  })
  if (!variant) return { ok: false, error: 'Variant not found.' }

  const contentType = file.type || (kind === 'SVG' ? 'image/svg+xml' : 'image/png')
  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: certificateThumbnailKey({
        slug: `${variant.certificateType.slug}-variant-${variant.id}`,
        filename: file.name,
      }),
      body: buffer,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '')
  const publicUrl = publicBase ? `${publicBase}/${upload.key}` : null

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

  await prisma.certificateAssetVariant.update({
    where: { id: variantId },
    data: kind === 'SVG' ? { svgFileId: asset.id } : { pngFileId: asset.id },
  })

  await logAuditAs(admin, {
    entityType: 'CertificateAssetVariant',
    entityId: variantId,
    action: kind === 'SVG' ? 'CERT_ASSET_VARIANT_SVG_UPLOAD' : 'CERT_ASSET_VARIANT_PNG_UPLOAD',
    payload: { certificateTypeId: variant.certificateTypeId, kind, mimeType: contentType },
  })

  revalidatePath(`/certificate-types/${variant.certificateTypeId}/variants`)
  return { ok: true }
}

export async function uploadCertVariantSvg(formData: FormData): Promise<Result> {
  return uploadCertVariantAsset(formData, 'SVG')
}
export async function uploadCertVariantPng(formData: FormData): Promise<Result> {
  return uploadCertVariantAsset(formData, 'PNG')
}
