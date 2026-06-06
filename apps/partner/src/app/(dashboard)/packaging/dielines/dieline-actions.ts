'use server'

// Slice C9 Phase 1 — partner packaging-dieline CRUD server actions.
// Spec: docs/builds/_V1_DIELINE_NORMALIZATION.md + task #37.
//
// A PackagingDieline is the partner's prepress source-of-truth for one
// (container type × decoration method): the original artwork file (AI/PDF/SVG/DXF
// streamed to R2 via a PartnerFile row) plus a structured dimensional spec
// (width/height/depth/bleed in mm). Phase 1 ships the entity + file + dimensions;
// trim/safe-area/fold/surface boxes stay optional (a full prepress editor is later).
//
// AUTH: actor resolved via requirePartnerActor() (packages/auth — Tier 1.1,
// threat #1 tenant isolation). Every read/mutate is scoped to the partner's own
// PartnerService ids; we never trust a client-supplied partnerServiceId or row id
// for ownership — all queries carry `partnerServiceId: { in: serviceIds }`.

import { prisma, Prisma } from '@ilaunchify/db'
import type { DecorationMethod, DielineStatus } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, partnerFileKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'
import { dielineFormatFromFilename } from './constants'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const MAX_DIELINE_BYTES = 20 * 1024 * 1024 // 20 MB — mirrors uploadDieLine()

// -----------------------------------------------------------------------------
// Helper: resolve the authorized partner + their owned PartnerService ids.
// Identical pattern to offering-actions.ts requireServiceContext() so dielines
// stay tenant-scoped the same way offerings are.
// -----------------------------------------------------------------------------

const PARTNER_ACTOR_ERRORS: Record<string, string> = {
  NOT_A_PARTNER: 'Only partners can manage packaging dielines.',
  PARTNER_NOT_FOUND: 'Partner profile not found.',
}

async function requireServiceContext() {
  const actor = await requirePartnerActor()
  if (!actor.ok) {
    return { ok: false as const, error: PARTNER_ACTOR_ERRORS[actor.error] ?? actor.error }
  }
  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true },
  })
  return {
    ok: true as const,
    user: actor.user,
    partnerId: actor.partnerId,
    serviceIds: services.map((s) => s.id),
  }
}

// Validate a numeric mm dimension (positive, finite). Returns cents-free Decimal-
// safe number or an error. allowZeroOptional => undefined/empty stays unset.
function parseDimension(
  raw: number | null | undefined,
  field: string,
  { required }: { required: boolean },
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'number' && Number.isNaN(raw))) {
    if (required) return { ok: false, error: `${field} is required.` }
    return { ok: true, value: null }
  }
  if (!Number.isFinite(raw) || raw <= 0) {
    return { ok: false, error: `${field} must be a number greater than 0.` }
  }
  if (raw > 100000) return { ok: false, error: `${field} looks too large.` }
  return { ok: true, value: raw }
}

// Decoration must be compatible with the chosen container type's category, same
// rule the offering form enforces (admin-curated PackagingDecorationCompatibility).
async function assertTypeAndDecoration(
  packagingTypeId: string,
  decorationMethod: DecorationMethod,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const type = await prisma.packagingType.findFirst({
    where: { id: packagingTypeId, status: 'ACTIVE' },
    select: { containerCategory: true },
  })
  if (!type) return { ok: false, error: 'Pick an active container type.' }
  if (decorationMethod === 'NONE') return { ok: true } // blank / stock; no matrix row needed
  if (!type.containerCategory) {
    return { ok: false, error: 'This container type has no category set yet — pick another.' }
  }
  const compat = await prisma.packagingDecorationCompatibility.findFirst({
    where: { containerCategory: type.containerCategory, decorationMethod, isActive: true },
    select: { containerCategory: true },
  })
  if (!compat) return { ok: false, error: 'That decoration method is not available for this container type.' }
  return { ok: true }
}

// -----------------------------------------------------------------------------
// CREATE — multipart: type + decoration + dimensions + (optional) original file.
// The file streams to R2 via uploadFile + a PartnerFile row exactly like
// uploadDieLine() in packaging/actions.ts. New rows start UPLOADED.
// -----------------------------------------------------------------------------

export async function createDieline(formData: FormData): Promise<Result<{ id: string }>> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const partnerServiceId = String(formData.get('partnerServiceId') ?? '')
  const packagingTypeId = String(formData.get('packagingTypeId') ?? '')
  const decorationMethod = String(formData.get('decorationMethod') ?? '') as DecorationMethod
  const surfaceName = String(formData.get('surfaceName') ?? '').trim()

  if (!ctx.serviceIds.includes(partnerServiceId)) {
    return { ok: false, error: 'That service is not yours.' }
  }
  if (!packagingTypeId) return { ok: false, error: 'Pick a container type.' }
  if (!decorationMethod) return { ok: false, error: 'Pick a decoration method.' }

  const compat = await assertTypeAndDecoration(packagingTypeId, decorationMethod)
  if (!compat.ok) return { ok: false, error: compat.error }

  const width = parseDimension(numField(formData, 'widthMm'), 'Width (mm)', { required: false })
  if (!width.ok) return { ok: false, error: width.error }
  const height = parseDimension(numField(formData, 'heightMm'), 'Height (mm)', { required: false })
  if (!height.ok) return { ok: false, error: height.error }
  const depth = parseDimension(numField(formData, 'depthMm'), 'Depth (mm)', { required: false })
  if (!depth.ok) return { ok: false, error: depth.error }
  const bleedRaw = numField(formData, 'bleedMm')
  const bleed = parseDimension(bleedRaw ?? 3.0, 'Bleed (mm)', { required: true })
  if (!bleed.ok) return { ok: false, error: bleed.error }

  // Optional original artwork file → R2 + PartnerFile.
  let partnerFileId: string | null = null
  let originalFileFormat: ReturnType<typeof dielineFormatFromFilename> = null
  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    const uploaded = await streamDielineFile(ctx.user.id, ctx.partnerId, file)
    if (!uploaded.ok) return { ok: false, error: uploaded.error }
    partnerFileId = uploaded.partnerFileId
    originalFileFormat = uploaded.format
  }

  const dieline = await prisma.packagingDieline.create({
    data: {
      partnerServiceId,
      packagingTypeId,
      decorationMethod,
      partnerFileId,
      originalFileFormat,
      widthMm: width.value as unknown as Prisma.Decimal | null,
      heightMm: height.value as unknown as Prisma.Decimal | null,
      depthMm: depth.value as unknown as Prisma.Decimal | null,
      bleedMm: bleed.value as unknown as Prisma.Decimal,
      surfaces: surfaceName ? ([{ name: surfaceName }] as unknown as Prisma.InputJsonValue) : undefined,
      status: 'UPLOADED',
    },
    select: { id: true },
  })

  await logAuditAs(ctx.user, {
    entityType: 'PackagingDieline',
    entityId: dieline.id,
    action: 'PARTNER_DIELINE_CREATED',
    toValue: 'UPLOADED',
    payload: {
      partnerId: ctx.partnerId,
      partnerServiceId,
      packagingTypeId,
      decorationMethod,
      hasFile: partnerFileId !== null,
    },
  })

  revalidatePath('/packaging/dielines')
  return { ok: true, data: { id: dieline.id } }
}

// -----------------------------------------------------------------------------
// UPDATE — dimensions + optional surface name, and (optionally) a replacement
// original file. Type + decoration are immutable here (they scope eligibility).
// -----------------------------------------------------------------------------

export async function updateDieline(id: string, formData: FormData): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true },
  })
  if (!existing) return { ok: false, error: 'Dieline not found.' }

  const width = parseDimension(numField(formData, 'widthMm'), 'Width (mm)', { required: false })
  if (!width.ok) return { ok: false, error: width.error }
  const height = parseDimension(numField(formData, 'heightMm'), 'Height (mm)', { required: false })
  if (!height.ok) return { ok: false, error: height.error }
  const depth = parseDimension(numField(formData, 'depthMm'), 'Depth (mm)', { required: false })
  if (!depth.ok) return { ok: false, error: depth.error }
  const bleed = parseDimension(numField(formData, 'bleedMm') ?? 3.0, 'Bleed (mm)', { required: true })
  if (!bleed.ok) return { ok: false, error: bleed.error }
  const surfaceName = String(formData.get('surfaceName') ?? '').trim()

  const data: Prisma.PackagingDielineUpdateInput = {
    widthMm: width.value as unknown as Prisma.Decimal | null,
    heightMm: height.value as unknown as Prisma.Decimal | null,
    depthMm: depth.value as unknown as Prisma.Decimal | null,
    bleedMm: bleed.value as unknown as Prisma.Decimal,
    surfaces: surfaceName
      ? ([{ name: surfaceName }] as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  }

  // Optional replacement file.
  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    const uploaded = await streamDielineFile(ctx.user.id, ctx.partnerId, file)
    if (!uploaded.ok) return { ok: false, error: uploaded.error }
    data.partnerFile = { connect: { id: uploaded.partnerFileId } }
    data.originalFileFormat = uploaded.format
  }

  await prisma.packagingDieline.update({ where: { id }, data })

  await logAuditAs(ctx.user, {
    entityType: 'PackagingDieline',
    entityId: id,
    action: 'PARTNER_DIELINE_UPDATED',
    toValue: existing.status,
    payload: { partnerId: ctx.partnerId, fields: Object.keys(data) },
  })

  revalidatePath('/packaging/dielines')
  revalidatePath(`/packaging/dielines/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// CONFIRM — UPLOADED → PARTNER_CONFIRMED. Requires width + height set (the
// minimum spec needed for downstream prepress). Stamps partnerConfirmedAt.
// -----------------------------------------------------------------------------

export async function confirmDieline(id: string): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true, widthMm: true, heightMm: true },
  })
  if (!existing) return { ok: false, error: 'Dieline not found.' }
  if (existing.status !== 'UPLOADED' && existing.status !== 'PARSED') {
    return { ok: false, error: 'Only an uploaded dieline can be confirmed.' }
  }
  if (existing.widthMm === null || existing.heightMm === null) {
    return { ok: false, error: 'Set width and height before confirming the spec.' }
  }

  await prisma.packagingDieline.update({
    where: { id },
    data: { status: 'PARTNER_CONFIRMED', partnerConfirmedAt: new Date() },
  })

  await logAuditAs(ctx.user, {
    entityType: 'PackagingDieline',
    entityId: id,
    action: 'PARTNER_DIELINE_CONFIRMED',
    fromValue: existing.status,
    toValue: 'PARTNER_CONFIRMED',
    payload: { partnerId: ctx.partnerId },
  })

  revalidatePath('/packaging/dielines')
  revalidatePath(`/packaging/dielines/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// ACTIVATE — PARTNER_CONFIRMED → ACTIVE (available for offering selection).
// -----------------------------------------------------------------------------

export async function activateDieline(id: string): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true },
  })
  if (!existing) return { ok: false, error: 'Dieline not found.' }
  if (existing.status !== 'PARTNER_CONFIRMED' && existing.status !== 'ADMIN_VERIFIED') {
    return { ok: false, error: 'Confirm the dieline spec before activating it.' }
  }

  return transition(ctx.user, ctx.partnerId, id, existing.status, 'ACTIVE')
}

// -----------------------------------------------------------------------------
// ARCHIVE — any status → ARCHIVED (retire; existing offering links stay intact).
// -----------------------------------------------------------------------------

export async function archiveDieline(id: string): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: { id: true, status: true },
  })
  if (!existing) return { ok: false, error: 'Dieline not found.' }
  if (existing.status === 'ARCHIVED') return { ok: true }

  return transition(ctx.user, ctx.partnerId, id, existing.status, 'ARCHIVED')
}

async function transition(
  user: Parameters<typeof logAuditAs>[0],
  partnerId: string,
  id: string,
  from: DielineStatus,
  to: DielineStatus,
): Promise<Result> {
  await prisma.packagingDieline.update({ where: { id }, data: { status: to } })
  await logAuditAs(user, {
    entityType: 'PackagingDieline',
    entityId: id,
    action: 'PARTNER_DIELINE_STATUS_CHANGED',
    fromValue: from,
    toValue: to,
    payload: { partnerId },
  })
  revalidatePath('/packaging/dielines')
  revalidatePath(`/packaging/dielines/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// DELETE — hard delete. Blocked when any offering references the dieline; the
// partner is advised to archive instead so the offering link stays intact.
// -----------------------------------------------------------------------------

export async function deleteDieline(id: string): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const existing = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    select: {
      id: true,
      status: true,
      packagingTypeId: true,
      decorationMethod: true,
      _count: { select: { offerings: true } },
    },
  })
  if (!existing) return { ok: false, error: 'Dieline not found.' }
  if (existing._count.offerings > 0) {
    return {
      ok: false,
      error: 'In use by an offering — archive it instead so existing links stay intact.',
    }
  }

  await prisma.packagingDieline.delete({ where: { id } })

  await logAuditAs(ctx.user, {
    entityType: 'PackagingDieline',
    entityId: id,
    action: 'PARTNER_DIELINE_DELETED',
    fromValue: existing.status,
    payload: {
      partnerId: ctx.partnerId,
      packagingTypeId: existing.packagingTypeId,
      decorationMethod: existing.decorationMethod,
    },
  })

  revalidatePath('/packaging/dielines')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Shared: stream a dieline original file to R2 + create the PartnerFile row.
// Mirrors uploadDieLine() in packaging/actions.ts (20 MB cap, FACILITY/OTHER).
// Validates the extension against DielineFileFormat (AI/PDF/SVG/DXF).
// -----------------------------------------------------------------------------

async function streamDielineFile(
  userId: string,
  partnerId: string,
  file: File,
): Promise<{ ok: true; partnerFileId: string; format: NonNullable<ReturnType<typeof dielineFormatFromFilename>> } | { ok: false; error: string }> {
  if (file.size > MAX_DIELINE_BYTES) {
    return { ok: false, error: 'Dieline file too large (max 20 MB).' }
  }
  const format = dielineFormatFromFilename(file.name)
  if (!format) {
    return { ok: false, error: 'Unsupported file format — upload an AI, PDF, SVG, or DXF.' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = partnerFileKey({ partnerId, section: 'facility', filename: file.name })

  let upload
  try {
    upload = await uploadFile({
      key,
      body: buffer,
      contentType: file.type || 'application/octet-stream',
    })
  } catch (err) {
    return { ok: false, error: `Upload to R2 failed: ${(err as Error).message}` }
  }

  const record = await prisma.partnerFile.create({
    data: {
      partnerId,
      sectionType: 'FACILITY',
      kind: 'OTHER',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: upload.sizeBytes,
      uploadedById: userId,
    },
    select: { id: true },
  })

  return { ok: true, partnerFileId: record.id, format }
}

// Read a numeric form field; '' / missing → null.
function numField(formData: FormData, name: string): number | null {
  const raw = formData.get(name)
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? NaN : n
}
