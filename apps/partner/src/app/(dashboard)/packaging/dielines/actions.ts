'use server'

// =============================================================================
// Partner die-line authoring actions — upload + confirm flow for the die-line
// frame editor. docs/DIELINE_FRAME_EDITOR_SPEC.md §3.
// =============================================================================
//
// A die-line is partnerService + packagingType + decorationMethod scoped and
// reused across products. Partner uploads a file (PDF/AI), confirms the
// structured geometry + places frames on top, then confirms it.
//
// `frames` / `framesUpdatedAt` are new columns + PartnerFileKind.DIELINE is a
// new enum value — both may be ungenerated on a given machine until the
// migration runs, so those writes go through a cast and fail soft.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, getSignedReadUrl, partnerFileKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { FrameLayout } from '@ilaunchify/ui'

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

const UPLOAD_MAX_BYTES = 50 * 1024 * 1024 // 50 MB — die-lines can be large vector files
const FORMAT_BY_MIME: Record<string, 'PDF' | 'AI' | 'SVG' | 'DXF'> = {
  'application/pdf': 'PDF',
  'application/postscript': 'AI', // .ai is often application/postscript
  'application/illustrator': 'AI',
  'image/svg+xml': 'SVG',
  'image/vnd.dxf': 'DXF',
  'application/dxf': 'DXF',
}

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'Not a partner account.' as const }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { user, partner: null as null, error: 'Partner not found.' as const }
  return { user, partner, error: null as null }
}

/** Verify a die-line belongs to the current partner; returns it or null. */
async function ownDieline(dielineId: string, partnerId: string) {
  const dl = await prisma.packagingDieline.findUnique({
    where: { id: dielineId },
    select: {
      id: true,
      status: true,
      partnerService: { select: { partnerId: true } },
    },
  })
  if (!dl || dl.partnerService.partnerId !== partnerId) return null
  return dl
}

// -----------------------------------------------------------------------------
// LIST — the partner's die-lines.
// -----------------------------------------------------------------------------

export async function listDielines(): Promise<Result<Array<{
  id: string
  packagingTypeId: string
  decorationMethod: string
  status: string
  hasFile: boolean
  updatedAt: Date
}>>> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const rows = await prisma.packagingDieline.findMany({
    where: { partnerService: { partnerId: partner.id } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      packagingTypeId: true,
      decorationMethod: true,
      status: true,
      partnerFileId: true,
      updatedAt: true,
    },
  })
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      packagingTypeId: r.packagingTypeId,
      decorationMethod: r.decorationMethod,
      status: r.status,
      hasFile: Boolean(r.partnerFileId),
      updatedAt: r.updatedAt,
    })),
  }
}

// -----------------------------------------------------------------------------
// LOAD — geometry + frames + a signed URL for the uploaded backdrop.
// -----------------------------------------------------------------------------

export interface DielineEditorData {
  id: string
  status: string
  widthMm: number | null
  heightMm: number | null
  bleedMm: number
  trimBox: unknown
  safeAreaBox: unknown
  foldLines: unknown
  surfaces: unknown
  frames: FrameLayout | null
  fileUrl: string | null
  originalFileFormat: string | null
}

export async function loadDieline(dielineId: string): Promise<Result<DielineEditorData>> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }
  if (!(await ownDieline(dielineId, partner.id))) return { ok: false, error: 'Die-line not found.' }

  const dl = (await prisma.packagingDieline.findUnique({
    where: { id: dielineId },
    select: {
      id: true,
      status: true,
      widthMm: true,
      heightMm: true,
      bleedMm: true,
      trimBox: true,
      safeAreaBox: true,
      foldLines: true,
      surfaces: true,
      originalFileFormat: true,
      partnerFile: { select: { r2Key: true } },
      // frames is a new column — read via cast.
      ...({ frames: true } as object),
    } as never,
  })) as unknown as {
    id: string
    status: string
    widthMm: unknown
    heightMm: unknown
    bleedMm: unknown
    trimBox: unknown
    safeAreaBox: unknown
    foldLines: unknown
    surfaces: unknown
    originalFileFormat: string | null
    partnerFile: { r2Key: string } | null
    frames: FrameLayout | null
  }

  const fileUrl = dl.partnerFile?.r2Key ? await getSignedReadUrl(dl.partnerFile.r2Key).catch(() => null) : null

  return {
    ok: true,
    data: {
      id: dl.id,
      status: dl.status,
      widthMm: dl.widthMm == null ? null : Number(dl.widthMm),
      heightMm: dl.heightMm == null ? null : Number(dl.heightMm),
      bleedMm: dl.bleedMm == null ? 3 : Number(dl.bleedMm),
      trimBox: dl.trimBox,
      safeAreaBox: dl.safeAreaBox,
      foldLines: dl.foldLines,
      surfaces: dl.surfaces,
      frames: dl.frames ?? null,
      fileUrl,
      originalFileFormat: dl.originalFileFormat,
    },
  }
}

// -----------------------------------------------------------------------------
// CREATE + UPLOAD — new die-line from an uploaded file.
// -----------------------------------------------------------------------------

export async function createDielineUpload(formData: FormData): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const partnerServiceId = String(formData.get('partnerServiceId') ?? '')
  const packagingTypeId = String(formData.get('packagingTypeId') ?? '')
  const decorationMethod = String(formData.get('decorationMethod') ?? '')
  const file = formData.get('file')

  if (!partnerServiceId || !packagingTypeId || !decorationMethod) {
    return { ok: false, error: 'Pick a service, packaging type, and decoration method.' }
  }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Upload a die-line file.' }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: 'File too large (max 50 MB).' }

  // Ownership: the service must belong to this partner.
  const svc = await prisma.partnerService.findFirst({
    where: { id: partnerServiceId, partnerId: partner.id },
    select: { id: true },
  })
  if (!svc) return { ok: false, error: 'That service isn’t yours.' }

  const format = FORMAT_BY_MIME[file.type] ?? (file.name.toLowerCase().endsWith('.ai') ? 'AI' : 'PDF')

  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: partnerFileKey({ partnerId: partner.id, section: 'documents', filename: file.name }),
      body: buffer,
      contentType: file.type || 'application/pdf',
    })
  } catch (e) {
    return { ok: false, error: `Upload failed: ${(e as Error).message}` }
  }

  const partnerFile = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType: 'DOCUMENTS',
      // PartnerFileKind.DIELINE is a new enum value — cast until generated.
      kind: 'DIELINE' as never,
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type || 'application/pdf',
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  const dieline = await prisma.packagingDieline.create({
    data: {
      partnerServiceId,
      packagingTypeId,
      decorationMethod: decorationMethod as never,
      partnerFileId: partnerFile.id,
      originalFileFormat: format as never,
      status: 'UPLOADED',
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'PackagingDieline',
    entityId: dieline.id,
    action: 'dieline.uploaded',
    payload: { format, packagingTypeId, decorationMethod },
  })

  revalidatePath('/packaging/dielines')
  return { ok: true, data: { id: dieline.id } }
}

// -----------------------------------------------------------------------------
// SAVE geometry (boxes) — autosaved from the editor.
// -----------------------------------------------------------------------------

export interface DielineGeometry {
  widthMm?: number | null
  heightMm?: number | null
  bleedMm?: number | null
  trimBox?: unknown
  safeAreaBox?: unknown
  foldLines?: unknown
  surfaces?: unknown
}

export async function saveDielineGeometry(dielineId: string, geom: DielineGeometry): Promise<Result<null>> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }
  if (!(await ownDieline(dielineId, partner.id))) return { ok: false, error: 'Die-line not found.' }

  await prisma.packagingDieline.update({
    where: { id: dielineId },
    data: {
      widthMm: geom.widthMm ?? undefined,
      heightMm: geom.heightMm ?? undefined,
      bleedMm: geom.bleedMm ?? undefined,
      trimBox: (geom.trimBox ?? undefined) as never,
      safeAreaBox: (geom.safeAreaBox ?? undefined) as never,
      foldLines: (geom.foldLines ?? undefined) as never,
      surfaces: (geom.surfaces ?? undefined) as never,
    },
  })
  return { ok: true, data: null }
}

// -----------------------------------------------------------------------------
// SAVE frames — the mandatory-element + packaging-mark slot layout.
// -----------------------------------------------------------------------------

export async function saveDielineFrames(dielineId: string, layout: FrameLayout): Promise<Result<null>> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }
  if (!(await ownDieline(dielineId, partner.id))) return { ok: false, error: 'Die-line not found.' }

  await prisma.packagingDieline.update({
    where: { id: dielineId },
    // frames + framesUpdatedAt are new columns — cast until generated.
    data: { frames: layout as never, framesUpdatedAt: new Date() } as never,
  })
  return { ok: true, data: null }
}

// -----------------------------------------------------------------------------
// CONFIRM — partner signs off the structured spec.
// -----------------------------------------------------------------------------

export async function confirmDieline(dielineId: string): Promise<Result<null>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }
  const dl = await ownDieline(dielineId, partner.id)
  if (!dl) return { ok: false, error: 'Die-line not found.' }

  await prisma.packagingDieline.update({
    where: { id: dielineId },
    data: { status: 'PARTNER_CONFIRMED', partnerConfirmedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: 'dieline.confirmed',
    fromValue: dl.status,
    toValue: 'PARTNER_CONFIRMED',
  })

  revalidatePath('/packaging/dielines')
  revalidatePath(`/packaging/dielines/${dielineId}`)
  return { ok: true, data: null }
}
