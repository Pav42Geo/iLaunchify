'use server'

// Admin mockup-template curation (docs/MOCKUP_STRATEGY.md, Slice 1).
// A MockupTemplate is a white-label product photo + a print-area quad the
// creator's artwork is composited into. Owned by a PackagingType so every
// product on that container inherits it.
//
// MockupTemplate + AssetType.MOCKUP_TEMPLATE ship with a pending migration, so
// all reads/writes of those go through cast-guards.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }
type Pt = { x: number; y: number }

const PATH = '/asset-management/product-mockups'
// Default print area: a centered inset rectangle (TL, TR, BR, BL) in 0..1 coords.
const DEFAULT_QUAD: Pt[] = [
  { x: 0.25, y: 0.28 },
  { x: 0.75, y: 0.28 },
  { x: 0.75, y: 0.72 },
  { x: 0.25, y: 0.72 },
]

/* cast-guarded model accessors (pending migration) */
function mockupModel() {
  return (prisma as unknown as {
    mockupTemplate: {
      create: (a: unknown) => Promise<{ id: string }>
      update: (a: unknown) => Promise<unknown>
      delete: (a: unknown) => Promise<unknown>
      findUnique: (a: unknown) => Promise<{ id: string; packagingTypeId: string; baseImageAssetId: string } | null>
    }
  }).mockupTemplate
}
function assetCreate() {
  return (prisma as unknown as {
    asset: { create: (a: unknown) => Promise<{ id: string }> }
  }).asset
}

/** Clamp a 4-point quad to [0,1] and ensure exactly 4 points. */
function sanitizeQuad(raw: unknown): Pt[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n)))
  const out = raw.map((p) => {
    const o = p as { x?: unknown; y?: unknown }
    const x = clamp(o.x)
    const y = clamp(o.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  })
  return out.every(Boolean) ? (out as Pt[]) : null
}

// -----------------------------------------------------------------------------
// CREATE — upload a base photo + create a DRAFT mockup with a default print area.
// -----------------------------------------------------------------------------
export async function uploadMockupTemplate(formData: FormData): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const packagingTypeId = String(formData.get('packagingTypeId') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const surfaceKey = String(formData.get('surfaceKey') ?? '').trim() || null
  const file = formData.get('file')

  if (!packagingTypeId) return { ok: false, error: 'Missing packaging type.' }
  if (!label) return { ok: false, error: 'Add a label (e.g. “16oz jar — front”).' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No image provided.' }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'Image too large (max 8 MB).' }
  const okMimes = ['image/png', 'image/jpeg', 'image/webp']
  const contentType = file.type || 'image/png'
  if (!okMimes.includes(contentType)) return { ok: false, error: 'Upload a PNG, JPG, or WEBP.' }

  const pt = await prisma.packagingType.findUnique({
    where: { id: packagingTypeId },
    select: { id: true, slug: true },
  })
  if (!pt) return { ok: false, error: 'Packaging type not found.' }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `mockups/${pt.slug}/${Date.now()}-${safe}`
  const buffer = Buffer.from(await file.arrayBuffer())
  let upload
  try {
    upload = await uploadFile({
      key,
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

  const asset = await assetCreate().create({
    data: {
      ownerType: 'PLATFORM',
      ownerId: null,
      type: 'MOCKUP_TEMPLATE',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      publicUrl,
      mimeType: contentType,
      sizeBytes: upload.sizeBytes,
      isPublic: true,
      uploadedByUserId: admin.id,
    },
  })

  await mockupModel().create({
    data: {
      packagingTypeId,
      label,
      surfaceKey,
      baseImageAssetId: asset.id,
      printAreaQuad: DEFAULT_QUAD,
      status: 'DRAFT',
    },
  })

  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: packagingTypeId,
    action: 'MOCKUP_TEMPLATE_CREATE',
    payload: { label, surfaceKey, mimeType: contentType },
  })
  revalidatePath(PATH)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PRINT AREA — save the 4-corner quad after the admin drags the handles.
// -----------------------------------------------------------------------------
export async function setMockupPrintArea(id: string, quad: Pt[]): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const clean = sanitizeQuad(quad)
  if (!clean) return { ok: false, error: 'Print area must be 4 points in 0–1 range.' }
  const m = await mockupModel().findUnique({ where: { id }, select: { id: true, packagingTypeId: true } })
  if (!m) return { ok: false, error: 'Mockup not found.' }
  await mockupModel().update({ where: { id }, data: { printAreaQuad: clean } })
  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: m.packagingTypeId,
    action: 'MOCKUP_TEMPLATE_UPDATE',
    payload: { mockupId: id, kind: 'print-area' },
  })
  revalidatePath(PATH)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// STATUS — DRAFT → ACTIVE → ARCHIVED. Only ACTIVE mockups reach the studio.
// -----------------------------------------------------------------------------
export async function setMockupStatus(
  id: string,
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) return { ok: false, error: 'Invalid status.' }
  const m = await mockupModel().findUnique({ where: { id }, select: { id: true, packagingTypeId: true } })
  if (!m) return { ok: false, error: 'Mockup not found.' }
  await mockupModel().update({ where: { id }, data: { status } })
  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: m.packagingTypeId,
    action: 'MOCKUP_TEMPLATE_STATUS',
    toValue: status,
    payload: { mockupId: id },
  })
  revalidatePath(PATH)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// DELETE — remove the mockup row (the underlying Asset is left in R2/library).
// -----------------------------------------------------------------------------
export async function deleteMockupTemplate(id: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const m = await mockupModel().findUnique({ where: { id }, select: { id: true, packagingTypeId: true } })
  if (!m) return { ok: false, error: 'Mockup not found.' }
  await mockupModel().delete({ where: { id } })
  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: m.packagingTypeId,
    action: 'MOCKUP_TEMPLATE_DELETE',
    payload: { mockupId: id },
  })
  revalidatePath(PATH)
  return { ok: true }
}
