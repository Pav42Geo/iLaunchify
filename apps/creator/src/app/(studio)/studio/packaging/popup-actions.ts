'use server'

// Admin Packaging Studio popup actions (master plan M1, 2026-08-03).
// ONE popup creates or edits a container WITH its die-lines, single 3D model,
// and 2D photo mockups. Everything catalog:write-gated + audited.
//
// Schema notes (gate on the next db:push + db:generate, house convention):
//   - PackagingDieline.partnerServiceId is now NULLABLE (admin-authored
//     catalog die-lines have no partner). Cast-guarded below until pushed.
//   - PackagingDieline.adminFileKey (R2 key) records the admin-uploaded
//     original file; backdrop reads adminFileKey ?? partnerFile.r2Key.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

export type PopupResult = { ok: true; id?: string } | { ok: false; error: string }

const TOPOLOGIES = [
  'SINGLE_CONTAINER', 'MULTI_CONTAINER_BOX', 'STICK_PACK', 'SACHET', 'CASE',
  'CAPSULE_JAR', 'POUCH_STAND_UP', 'POUCH_FLAT', 'TUBE', 'OTHER',
] as const

const STUDIO_PATHS = ['/studio/packaging'] as const
function revalidateStudio() { for (const p of STUDIO_PATHS) revalidatePath(p) }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'container'
}

// Loose delegate: pending-migration columns make typed access unreliable until
// the gate runs. Same pattern as admin packaging-studio/actions.ts.
type LooseDelegate = {
  create: (a: unknown) => Promise<{ id: string } | null>
  update: (a: unknown) => Promise<unknown>
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
}
const pt = () => (prisma as unknown as { packagingType: LooseDelegate }).packagingType
const dl = () => (prisma as unknown as { packagingDieline: LooseDelegate }).packagingDieline

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let i = 2
  for (let tries = 0; tries < 25; tries++) {
    const hit = await pt().findUnique({ where: { slug }, select: { id: true } }).catch(() => null)
    if (!hit) return slug
    slug = `${base}-${i++}`
  }
  return `${base}-${Date.now()}`
}

export interface ContainerInput {
  displayName: string
  topology: string
  containerCategory?: string | null
  dims?: { lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null } | null
}

function normalizeInput(input: ContainerInput) {
  const name = input.displayName.trim().slice(0, 120)
  const topology = (TOPOLOGIES as readonly string[]).includes(input.topology) ? input.topology : 'SINGLE_CONTAINER'
  const dims = input.dims && (input.dims.lengthMm || input.dims.widthMm || input.dims.heightMm)
    ? { lengthMm: input.dims.lengthMm ?? null, widthMm: input.dims.widthMm ?? null, heightMm: input.dims.heightMm ?? null }
    : null
  return { name, topology, dims }
}

/** Popup "Create container": details only; die-lines/mockups attach right after via their own actions. */
export async function createContainerFromStudio(input: ContainerInput): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const { name, topology, dims } = normalizeInput(input)
  if (!name) return { ok: false, error: 'Name is required.' }
  const slug = await uniqueSlug(slugify(name))
  const created = await pt().create({
    data: {
      slug,
      displayName: name,
      defaultTopology: topology,
      ...(input.containerCategory ? { containerCategory: input.containerCategory } : {}),
      ...(dims ? { defaultDimensions: dims } : {}),
      model3dSource: 'PARAMETRIC',
      defaultSurfaces: [],
    },
    select: { id: true },
  }).catch(() => null)
  if (!created) return { ok: false, error: 'Could not create the container (is the schema pushed?).' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: created.id, action: 'packaging-model.created', payload: { slug, topology, via: 'studio-popup' } })
  revalidateStudio()
  return { ok: true, id: created.id }
}

/** Popup "Save changes": rename / regroup / retopology / redimension in place (audit G1). */
export async function updateContainerFromStudio(id: string, input: ContainerInput): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const { name, topology, dims } = normalizeInput(input)
  if (!name) return { ok: false, error: 'Name is required.' }
  const before = await pt().findUnique({ where: { id }, select: { displayName: true, containerCategory: true, defaultTopology: true } }).catch(() => null)
  if (!before) return { ok: false, error: 'Container not found.' }
  const done = await pt().update({
    where: { id },
    data: {
      displayName: name,
      defaultTopology: topology,
      containerCategory: input.containerCategory ?? null,
      ...(dims !== null ? { defaultDimensions: dims } : {}),
    },
  }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not update the container.' }
  await logAuditAs(admin, {
    entityType: 'PackagingType', entityId: id, action: 'packaging-model.updated',
    fromValue: String(before.displayName ?? ''), toValue: name,
    payload: { containerCategory: input.containerCategory ?? null, topology },
  })
  revalidateStudio()
  return { ok: true, id }
}

/** Card menu "Duplicate": copies details + surfaces + the 3D model reference (NOT die-lines/mockups). */
export async function duplicateContainerFromStudio(id: string): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const src = await pt().findUnique({
    where: { id },
    select: {
      displayName: true, defaultTopology: true, containerCategory: true,
      defaultDimensions: true, defaultSurfaces: true, model3dKey: true,
      model3dSource: true, model3dThumbKey: true, applicableLabelingTypes: true, fragilityClass: true,
    },
  }).catch(() => null)
  if (!src) return { ok: false, error: 'Container not found.' }
  const name = `${String(src.displayName ?? 'Container')} copy`.slice(0, 120)
  const slug = await uniqueSlug(slugify(name))
  // NOTE: model3dKey/model3dThumbKey are SHARED R2 references. Removing the 3D
  // model from one twin must not delete the object; remove actions only clear
  // the column (they already do).
  const created = await pt().create({
    data: { ...src, displayName: name, slug, status: 'ACTIVE' },
    select: { id: true },
  }).catch(() => null)
  if (!created) return { ok: false, error: 'Could not duplicate the container.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: created.id, action: 'packaging-model.duplicated', payload: { from: id } })
  revalidateStudio()
  return { ok: true, id: created.id }
}

/** Card menu "Deprecate": hides from Library + partner pickers; reversible in data. */
export async function deprecateContainerFromStudio(id: string): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const done = await pt().update({ where: { id }, data: { status: 'DEPRECATED' } }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not deprecate the container.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging-model.deprecated', payload: {} })
  revalidateStudio()
  return { ok: true, id }
}

// -----------------------------------------------------------------------------
// DIE-LINES: belong to the container (surface = die-line).
// -----------------------------------------------------------------------------

export interface DielineDimsInput {
  label: string
  placement: 'body' | 'top' | 'bottom' | 'front' | 'back'
  widthMm: number
  heightMm: number
  bleedMm?: number
}

/** "Generate" a clean rectangular die-line from dimensions: trim + bleed + safe boxes, no file. */
export async function addDielineFromDims(packagingTypeId: string, input: DielineDimsInput): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const label = input.label.trim().slice(0, 80) || 'Die-line'
  const w = Math.max(1, Math.round(input.widthMm * 1000) / 1000)
  const h = Math.max(1, Math.round(input.heightMm * 1000) / 1000)
  const bleed = Math.max(0, input.bleedMm ?? 3)
  const created = await dl().create({
    data: {
      packagingTypeId,
      // partnerServiceId omitted: NULL = admin-authored (schema loosened, gates on push)
      decorationMethod: 'DIRECT_PRINT',
      widthMm: w, heightMm: h, bleedMm: bleed,
      trimBox: { x: 0, y: 0, w, h },
      safeAreaBox: { x: bleed, y: bleed, w: Math.max(1, w - bleed * 2), h: Math.max(1, h - bleed * 2) },
      surfaces: [{ name: input.placement, trimBox: { x: 0, y: 0, w, h } }],
      status: 'UPLOADED',
    } as never,
    select: { id: true },
  }).catch(() => null)
  if (!created) return { ok: false, error: 'Could not create the die-line (is the schema pushed?).' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: created.id, action: 'DIELINE_ADMIN_GENERATED', payload: { packagingTypeId, label, placement: input.placement, w, h, bleed } })
  revalidateStudio()
  return { ok: true, id: created.id }
}

/** Upload a die-line file (PDF/AI/SVG/DXF) for this container. Stored under an admin R2 key. */
export async function addDielineUpload(packagingTypeId: string, form: FormData): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const file = form.get('file')
  const label = String(form.get('label') ?? '').trim().slice(0, 80) || 'Die-line'
  const placement = String(form.get('placement') ?? 'body')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No die-line file provided.' }
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'Die-line file too large (25 MB max).' }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const FORMAT: Record<string, string> = { pdf: 'PDF', ai: 'AI', svg: 'SVG', dxf: 'DXF' }
  if (!FORMAT[ext]) return { ok: false, error: 'Die-line must be PDF, AI, SVG or DXF.' }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `dielines/admin/${packagingTypeId}/${Date.now()}-${safe}`
  try {
    await uploadFile({ key, body: Buffer.from(await file.arrayBuffer()), contentType: file.type || 'application/octet-stream' })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }
  const created = await dl().create({
    data: {
      packagingTypeId,
      decorationMethod: 'DIRECT_PRINT',
      adminFileKey: key,
      originalFileFormat: FORMAT[ext],
      surfaces: [{ name: placement }],
      status: 'UPLOADED',
    } as never,
    select: { id: true },
  }).catch(() => null)
  if (!created) return { ok: false, error: 'Uploaded, but could not attach the die-line (is the schema pushed?).' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: created.id, action: 'DIELINE_ADMIN_UPLOADED', payload: { packagingTypeId, label, placement, key, format: FORMAT[ext] } })
  revalidateStudio()
  return { ok: true, id: created.id }
}

// -----------------------------------------------------------------------------
// 2D PHOTO MOCKUPS: per container, many per container (MockupTemplate).
// Mirrors apps/admin/.../product-mockups/actions.ts but catalog:write-gated so
// the studio popup + 2D Mockups rail own the whole lifecycle in one place.
// -----------------------------------------------------------------------------

import { getSignedReadUrl } from '@ilaunchify/storage'

type Pt2 = { x: number; y: number }
const DEFAULT_QUAD: Pt2[] = [
  { x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 },
]

type MockupDelegate = {
  create: (a: unknown) => Promise<{ id: string } | null>
  update: (a: unknown) => Promise<unknown>
  delete: (a: unknown) => Promise<unknown>
  findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
}
const mock = () => (prisma as unknown as { mockupTemplate: MockupDelegate }).mockupTemplate
const assetD = () => (prisma as unknown as { asset: { create: (a: unknown) => Promise<{ id: string }>; findMany: (a: unknown) => Promise<Array<Record<string, unknown>>> } }).asset

export interface StudioMockup {
  id: string
  label: string
  status: string
  quad: Pt2[]
  imageUrl: string | null
}

/** All 2D mockups for ONE container (per-container library, Pavel 2026-08-03). */
export async function listTypeMockups(packagingTypeId: string): Promise<StudioMockup[]> {
  await requireCapability('catalog:write')
  const rows = await mock().findMany({
    where: { packagingTypeId },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, status: true, printAreaQuad: true, baseImageAssetId: true },
  }).catch(() => [] as Array<Record<string, unknown>>)
  if (rows.length === 0) return []
  const assetIds = rows.map((r) => String(r.baseImageAssetId))
  const assets = await assetD().findMany({
    where: { id: { in: assetIds } },
    select: { id: true, storageKey: true, publicUrl: true },
  }).catch(() => [] as Array<Record<string, unknown>>)
  const byId = new Map(assets.map((a) => [String(a.id), a]))
  return Promise.all(rows.map(async (r) => {
    const a = byId.get(String(r.baseImageAssetId))
    let imageUrl: string | null = (a?.publicUrl as string | null) ?? null
    if (!imageUrl && a?.storageKey) imageUrl = await getSignedReadUrl(String(a.storageKey), { expiresInSeconds: 3600 }).catch(() => null)
    return {
      id: String(r.id),
      label: String(r.label ?? ''),
      status: String(r.status ?? 'DRAFT'),
      quad: (r.printAreaQuad as Pt2[] | null) ?? DEFAULT_QUAD,
      imageUrl,
    }
  }))
}

/** Popup "Add photos": one photo → PLATFORM Asset + MockupTemplate DRAFT row. */
export async function uploadTypeMockup(form: FormData): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const packagingTypeId = String(form.get('packagingTypeId') ?? '')
  const label = (String(form.get('label') ?? '').trim() || 'Mockup').slice(0, 80)
  const file = form.get('file')
  if (!packagingTypeId) return { ok: false, error: 'Missing container.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No image provided.' }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'Image too large (max 8 MB).' }
  const contentType = file.type || 'image/png'
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return { ok: false, error: 'Upload a PNG, JPG, or WEBP.' }

  const typ = await pt().findUnique({ where: { id: packagingTypeId }, select: { id: true, slug: true } }).catch(() => null)
  if (!typ) return { ok: false, error: 'Container not found.' }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `mockups/${String(typ.slug)}/${Date.now()}-${safe}`
  let up
  try {
    up = await uploadFile({ key, body: Buffer.from(await file.arrayBuffer()), contentType, cacheControl: 'public, max-age=31536000, immutable', contentDisposition: 'inline' })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }
  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '') || null
  const asset = await assetD().create({
    data: {
      ownerType: 'PLATFORM', ownerId: null, type: 'MOCKUP_TEMPLATE', source: 'USER_UPLOAD',
      storageKey: up.key, publicUrl: publicBase ? `${publicBase}/${up.key}` : null,
      mimeType: contentType, sizeBytes: up.sizeBytes, isPublic: true, uploadedByUserId: admin.id,
    } as never,
  }).catch(() => null)
  if (!asset) return { ok: false, error: 'Uploaded, but could not record the asset (is the schema pushed?).' }
  const created = await mock().create({
    data: { packagingTypeId, label, baseImageAssetId: asset.id, printAreaQuad: DEFAULT_QUAD, status: 'DRAFT' } as never,
    select: { id: true },
  }).catch(() => null)
  if (!created) return { ok: false, error: 'Could not create the mockup row (is the schema pushed?).' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'MOCKUP_TEMPLATE_CREATE', payload: { label, via: 'studio-popup' } })
  revalidateStudio()
  return { ok: true, id: created.id }
}

/** Print-area editor save: 4 corner points, image-relative 0..1, TL TR BR BL. */
export async function setTypeMockupQuad(id: string, quad: Pt2[]): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  if (!Array.isArray(quad) || quad.length !== 4) return { ok: false, error: 'Print area needs 4 corners.' }
  const clean = quad.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }))
  const done = await mock().update({ where: { id }, data: { printAreaQuad: clean } }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not save the print area.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'MOCKUP_TEMPLATE_UPDATE', payload: { mockupTemplateId: id, quad: clean } })
  revalidateStudio()
  return { ok: true, id }
}

/** Draft ⇄ Active toggle (Active = usable by creators). */
export async function setTypeMockupStatus(id: string, status: 'DRAFT' | 'ACTIVE'): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const done = await mock().update({ where: { id }, data: { status } }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not change the mockup status.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'MOCKUP_TEMPLATE_STATUS', toValue: status, payload: { mockupTemplateId: id } })
  revalidateStudio()
  return { ok: true, id }
}

/** Remove a mockup row (the R2 object stays; assets are cheap, history is not). */
export async function deleteTypeMockup(id: string): Promise<PopupResult> {
  const admin = await requireCapability('catalog:write')
  const done = await mock().delete({ where: { id } }).catch(() => null)
  if (done === null) return { ok: false, error: 'Could not delete the mockup.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'MOCKUP_TEMPLATE_DELETE', payload: { mockupTemplateId: id } })
  revalidateStudio()
  return { ok: true, id }
}
