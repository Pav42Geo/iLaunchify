'use server'

// C7 — admin CRUD for the LabelingSymbol catalog (attribution, storage,
// allergen, disclosure, warning) + per-symbol variants with SVG/PNG assets.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { uploadFile, certificateThumbnailKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { LabelingSymbolFamily, SymbolRequirement, AssetCatalogStatus } from '@ilaunchify/db'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

function clean(s: string | null | undefined): string | null {
  const v = (s ?? '').trim()
  return v || null
}
function csv(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export interface SymbolInput {
  name: string
  slug: string
  description?: string | null
  family: LabelingSymbolFamily
  applicableCategorySlugs?: string | null
  applicableMarkets?: string | null
  requirement: SymbolRequirement
  requiredWhen?: string | null
  requiredCoText?: string | null
}

export async function createLabelingSymbol(input: SymbolInput): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' }
  const slug = input.slug.trim().toLowerCase()
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: 'Slug must be lowercase letters, numbers, and dashes (2-42 chars).' }
  }
  const dup = await prisma.labelingSymbol.findUnique({ where: { slug } })
  if (dup) return { ok: false, error: `Slug "${slug}" is already taken.` }

  const created = await prisma.labelingSymbol.create({
    data: {
      name: input.name.trim(),
      slug,
      description: clean(input.description),
      family: input.family,
      applicableCategorySlugs: csv(input.applicableCategorySlugs),
      applicableMarkets: csv(input.applicableMarkets),
      requirement: input.requirement,
      requiredWhen: clean(input.requiredWhen),
      requiredCoText: clean(input.requiredCoText),
      status: 'ACTIVE',
    },
  })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: created.id,
    action: 'LABELING_SYMBOL_CREATE',
    payload: { slug, name: input.name, family: input.family },
  })

  revalidatePath('/assets/labeling-symbols')
  return { ok: true, data: { id: created.id } }
}

export async function updateLabelingSymbol(input: SymbolInput & { id: string }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' }

  const existing = await prisma.labelingSymbol.findUnique({ where: { id: input.id }, select: { id: true } })
  if (!existing) return { ok: false, error: 'Symbol not found.' }

  await prisma.labelingSymbol.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      description: clean(input.description),
      family: input.family,
      applicableCategorySlugs: csv(input.applicableCategorySlugs),
      applicableMarkets: csv(input.applicableMarkets),
      requirement: input.requirement,
      requiredWhen: clean(input.requiredWhen),
      requiredCoText: clean(input.requiredCoText),
    },
  })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: input.id,
    action: 'LABELING_SYMBOL_UPDATE',
    payload: { name: input.name, family: input.family },
  })

  revalidatePath('/assets/labeling-symbols')
  revalidatePath(`/assets/labeling-symbols/${input.id}`)
  return { ok: true }
}

export async function setLabelingSymbolStatus(id: string, status: AssetCatalogStatus): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const sym = await prisma.labelingSymbol.findUnique({ where: { id }, select: { slug: true, status: true } })
  if (!sym) return { ok: false, error: 'Symbol not found.' }

  await prisma.labelingSymbol.update({ where: { id }, data: { status } })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: id,
    action: status === 'ACTIVE' ? 'LABELING_SYMBOL_REACTIVATE' : 'LABELING_SYMBOL_DEPRECATE',
    fromValue: sym.status,
    toValue: status,
    payload: { slug: sym.slug },
  })

  revalidatePath('/assets/labeling-symbols')
  revalidatePath(`/assets/labeling-symbols/${id}`)
  return { ok: true }
}

// ---- Variants --------------------------------------------------------------

export interface LblVariantInput {
  labelingSymbolId: string
  label: string
  minWidthMm?: number | null
  maxWidthMm?: number | null
  approvedColorSpec?: string | null
  clearSpaceFactor?: number | null
  brandGuidelinesUrl?: string | null
  notes?: string | null
}

export async function createLabelingSymbolVariant(input: LblVariantInput): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }
  const sym = await prisma.labelingSymbol.findUnique({ where: { id: input.labelingSymbolId }, select: { id: true } })
  if (!sym) return { ok: false, error: 'Symbol not found.' }

  const count = await prisma.labelingSymbolVariant.count({ where: { labelingSymbolId: sym.id } })
  const created = await prisma.labelingSymbolVariant.create({
    data: {
      labelingSymbolId: sym.id,
      label: input.label.trim(),
      minWidthMm: input.minWidthMm ?? null,
      maxWidthMm: input.maxWidthMm ?? null,
      approvedColorSpec: clean(input.approvedColorSpec),
      clearSpaceFactor: input.clearSpaceFactor ?? null,
      brandGuidelinesUrl: clean(input.brandGuidelinesUrl),
      notes: clean(input.notes),
      sortOrder: count,
    },
  })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: sym.id,
    action: 'LABELING_SYMBOL_VARIANT_CREATE',
    payload: { variantId: created.id, label: input.label },
  })

  revalidatePath(`/assets/labeling-symbols/${sym.id}`)
  return { ok: true, data: { id: created.id } }
}

export async function updateLabelingSymbolVariant(input: LblVariantInput & { id: string }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }
  const existing = await prisma.labelingSymbolVariant.findUnique({
    where: { id: input.id },
    select: { labelingSymbolId: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }

  await prisma.labelingSymbolVariant.update({
    where: { id: input.id },
    data: {
      label: input.label.trim(),
      minWidthMm: input.minWidthMm ?? null,
      maxWidthMm: input.maxWidthMm ?? null,
      approvedColorSpec: clean(input.approvedColorSpec),
      clearSpaceFactor: input.clearSpaceFactor ?? null,
      brandGuidelinesUrl: clean(input.brandGuidelinesUrl),
      notes: clean(input.notes),
    },
  })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: existing.labelingSymbolId,
    action: 'LABELING_SYMBOL_VARIANT_UPDATE',
    payload: { variantId: input.id, label: input.label },
  })

  revalidatePath(`/assets/labeling-symbols/${existing.labelingSymbolId}`)
  return { ok: true }
}

export async function deleteLabelingSymbolVariant(id: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const existing = await prisma.labelingSymbolVariant.findUnique({
    where: { id },
    select: { labelingSymbolId: true, label: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }
  await prisma.labelingSymbolVariant.delete({ where: { id } })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: existing.labelingSymbolId,
    action: 'LABELING_SYMBOL_VARIANT_DELETE',
    payload: { variantId: id, label: existing.label },
  })

  revalidatePath(`/assets/labeling-symbols/${existing.labelingSymbolId}`)
  return { ok: true }
}

// The vector slot accepts SVG *or* PDF (both print-ready); the raster slot takes
// PNG/WebP. Asset.mimeType records which format was actually uploaded.
const ACCEPT: Record<'SVG' | 'PNG', string[]> = {
  SVG: ['image/svg+xml', 'application/pdf'],
  PNG: ['image/png', 'image/webp'],
}

export async function uploadLabelingVariantAsset(formData: FormData, kind: 'SVG' | 'PNG'): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const variantId = String(formData.get('variantId') ?? '')
  const file = formData.get('file')
  if (!variantId) return { ok: false, error: 'Missing variant id.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file provided.' }
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'File too large (max 5 MB).' }
  const name = file.name.toLowerCase()
  const looksRight =
    ACCEPT[kind].includes(file.type) ||
    (kind === 'SVG' && (name.endsWith('.svg') || name.endsWith('.pdf')))
  if (!looksRight) {
    return { ok: false, error: `Wrong file type — upload ${kind === 'SVG' ? 'an SVG or PDF' : 'a PNG'} file.` }
  }

  const variant = await prisma.labelingSymbolVariant.findUnique({
    where: { id: variantId },
    select: { id: true, labelingSymbolId: true, labelingSymbol: { select: { slug: true } } },
  })
  if (!variant) return { ok: false, error: 'Variant not found.' }

  const contentType =
    file.type ||
    (kind === 'PNG' ? 'image/png' : name.endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml')
  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: certificateThumbnailKey({
        slug: `lbl-${variant.labelingSymbol.slug}-variant-${variant.id}`,
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

  await prisma.labelingSymbolVariant.update({
    where: { id: variantId },
    data: kind === 'SVG' ? { svgFileId: asset.id } : { pngFileId: asset.id },
  })

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: variant.labelingSymbolId,
    action: kind === 'SVG' ? 'LABELING_SYMBOL_VARIANT_SVG_UPLOAD' : 'LABELING_SYMBOL_VARIANT_PNG_UPLOAD',
    payload: { variantId, kind },
  })

  revalidatePath(`/assets/labeling-symbols/${variant.labelingSymbolId}`)
  return { ok: true }
}

export async function uploadLabelingVariantSvg(formData: FormData): Promise<Result> {
  return uploadLabelingVariantAsset(formData, 'SVG')
}
export async function uploadLabelingVariantPng(formData: FormData): Promise<Result> {
  return uploadLabelingVariantAsset(formData, 'PNG')
}
