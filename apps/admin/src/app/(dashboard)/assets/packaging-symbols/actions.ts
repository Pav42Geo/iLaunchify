'use server'

// C7 — admin CRUD for the PackagingSymbol catalog (resin codes, recycling marks,
// compostability, disposal) + per-symbol variants with SVG/PNG assets.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { uploadFile, certificateThumbnailKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { PackagingSymbolFamily, SymbolRequirement, AssetCatalogStatus } from '@ilaunchify/db'

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
  family: PackagingSymbolFamily
  applicableSubstrates?: string | null
  applicableMaterials?: string | null
  applicableMarkets?: string | null
  requirement: SymbolRequirement
  requiredWhen?: string | null
}

export async function createPackagingSymbol(input: SymbolInput): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' }
  const slug = input.slug.trim().toLowerCase()
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: 'Slug must be lowercase letters, numbers, and dashes (2-42 chars).' }
  }
  const dup = await prisma.packagingSymbol.findUnique({ where: { slug } })
  if (dup) return { ok: false, error: `Slug "${slug}" is already taken.` }

  const created = await prisma.packagingSymbol.create({
    data: {
      name: input.name.trim(),
      slug,
      description: clean(input.description),
      family: input.family,
      applicableSubstrates: csv(input.applicableSubstrates),
      applicableMaterials: csv(input.applicableMaterials),
      applicableMarkets: csv(input.applicableMarkets),
      requirement: input.requirement,
      requiredWhen: clean(input.requiredWhen),
      status: 'ACTIVE',
    },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: created.id,
    action: 'PACKAGING_SYMBOL_CREATE',
    payload: { slug, name: input.name, family: input.family },
  })

  revalidatePath('/assets/packaging-symbols')
  return { ok: true, data: { id: created.id } }
}

export async function updatePackagingSymbol(input: SymbolInput & { id: string }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' }

  const existing = await prisma.packagingSymbol.findUnique({ where: { id: input.id }, select: { id: true } })
  if (!existing) return { ok: false, error: 'Symbol not found.' }

  await prisma.packagingSymbol.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      description: clean(input.description),
      family: input.family,
      applicableSubstrates: csv(input.applicableSubstrates),
      applicableMaterials: csv(input.applicableMaterials),
      applicableMarkets: csv(input.applicableMarkets),
      requirement: input.requirement,
      requiredWhen: clean(input.requiredWhen),
    },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: input.id,
    action: 'PACKAGING_SYMBOL_UPDATE',
    payload: { name: input.name, family: input.family },
  })

  revalidatePath('/assets/packaging-symbols')
  revalidatePath(`/assets/packaging-symbols/${input.id}`)
  return { ok: true }
}

export async function setPackagingSymbolStatus(id: string, status: AssetCatalogStatus): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const sym = await prisma.packagingSymbol.findUnique({ where: { id }, select: { slug: true, status: true } })
  if (!sym) return { ok: false, error: 'Symbol not found.' }

  await prisma.packagingSymbol.update({ where: { id }, data: { status } })

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: id,
    action: status === 'ACTIVE' ? 'PACKAGING_SYMBOL_REACTIVATE' : 'PACKAGING_SYMBOL_DEPRECATE',
    fromValue: sym.status,
    toValue: status,
    payload: { slug: sym.slug },
  })

  revalidatePath('/assets/packaging-symbols')
  revalidatePath(`/assets/packaging-symbols/${id}`)
  return { ok: true }
}

// ---- Variants --------------------------------------------------------------

export interface PkgVariantInput {
  packagingSymbolId: string
  label: string
  minWidthMm?: number | null
  maxWidthMm?: number | null
  approvedColorSpec?: string | null
  clearSpaceFactor?: number | null
  brandGuidelinesUrl?: string | null
  notes?: string | null
}

export async function createPackagingSymbolVariant(input: PkgVariantInput): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }
  const sym = await prisma.packagingSymbol.findUnique({ where: { id: input.packagingSymbolId }, select: { id: true } })
  if (!sym) return { ok: false, error: 'Symbol not found.' }

  const count = await prisma.packagingSymbolVariant.count({ where: { packagingSymbolId: sym.id } })
  const created = await prisma.packagingSymbolVariant.create({
    data: {
      packagingSymbolId: sym.id,
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
    entityType: 'PackagingSymbol',
    entityId: sym.id,
    action: 'PACKAGING_SYMBOL_VARIANT_CREATE',
    payload: { variantId: created.id, label: input.label },
  })

  revalidatePath(`/assets/packaging-symbols/${sym.id}`)
  return { ok: true, data: { id: created.id } }
}

export async function updatePackagingSymbolVariant(input: PkgVariantInput & { id: string }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.label.trim()) return { ok: false, error: 'Variant label is required.' }
  const existing = await prisma.packagingSymbolVariant.findUnique({
    where: { id: input.id },
    select: { packagingSymbolId: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }

  await prisma.packagingSymbolVariant.update({
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
    entityType: 'PackagingSymbol',
    entityId: existing.packagingSymbolId,
    action: 'PACKAGING_SYMBOL_VARIANT_UPDATE',
    payload: { variantId: input.id, label: input.label },
  })

  revalidatePath(`/assets/packaging-symbols/${existing.packagingSymbolId}`)
  return { ok: true }
}

export async function deletePackagingSymbolVariant(id: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const existing = await prisma.packagingSymbolVariant.findUnique({
    where: { id },
    select: { packagingSymbolId: true, label: true },
  })
  if (!existing) return { ok: false, error: 'Variant not found.' }
  await prisma.packagingSymbolVariant.delete({ where: { id } })

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: existing.packagingSymbolId,
    action: 'PACKAGING_SYMBOL_VARIANT_DELETE',
    payload: { variantId: id, label: existing.label },
  })

  revalidatePath(`/assets/packaging-symbols/${existing.packagingSymbolId}`)
  return { ok: true }
}

const ACCEPT: Record<'SVG' | 'PNG', string[]> = {
  SVG: ['image/svg+xml'],
  PNG: ['image/png', 'image/webp'],
}

export async function uploadPackagingVariantAsset(formData: FormData, kind: 'SVG' | 'PNG'): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const variantId = String(formData.get('variantId') ?? '')
  const file = formData.get('file')
  if (!variantId) return { ok: false, error: 'Missing variant id.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file provided.' }
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'File too large (max 5 MB).' }
  const looksRight =
    ACCEPT[kind].includes(file.type) || (kind === 'SVG' && file.name.toLowerCase().endsWith('.svg'))
  if (!looksRight) return { ok: false, error: `Wrong file type — upload a ${kind} file.` }

  const variant = await prisma.packagingSymbolVariant.findUnique({
    where: { id: variantId },
    select: { id: true, packagingSymbolId: true, packagingSymbol: { select: { slug: true } } },
  })
  if (!variant) return { ok: false, error: 'Variant not found.' }

  const contentType = file.type || (kind === 'SVG' ? 'image/svg+xml' : 'image/png')
  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key: certificateThumbnailKey({
        slug: `pkg-${variant.packagingSymbol.slug}-variant-${variant.id}`,
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

  await prisma.packagingSymbolVariant.update({
    where: { id: variantId },
    data: kind === 'SVG' ? { svgFileId: asset.id } : { pngFileId: asset.id },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: variant.packagingSymbolId,
    action: kind === 'SVG' ? 'PACKAGING_SYMBOL_VARIANT_SVG_UPLOAD' : 'PACKAGING_SYMBOL_VARIANT_PNG_UPLOAD',
    payload: { variantId, kind },
  })

  revalidatePath(`/assets/packaging-symbols/${variant.packagingSymbolId}`)
  return { ok: true }
}

export async function uploadPackagingVariantSvg(formData: FormData): Promise<Result> {
  return uploadPackagingVariantAsset(formData, 'SVG')
}
export async function uploadPackagingVariantPng(formData: FormData): Promise<Result> {
  return uploadPackagingVariantAsset(formData, 'PNG')
}
