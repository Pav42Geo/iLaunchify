'use server'

// Admin die-line review — verify a partner-confirmed die-line into ACTIVE (or
// send it back). docs/DIELINE_FRAME_EDITOR_SPEC.md §3/Phase D.

import { prisma, setDielineCanonicalShape } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, dielineNormalizedKey } from '@ilaunchify/storage'
import {
  dielineSvgFromSpec,
  aspectBucketFor,
  type DielineFold,
  type DielineSurface,
  type FrameLayout,
  type NormBox,
} from '@ilaunchify/ui'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function verifyDieline(dielineId: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true, status: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  if (dl.status !== 'PARTNER_CONFIRMED') return { ok: false, error: `Cannot verify from ${dl.status}.` }

  await prisma.packagingDieline.update({
    where: { id: dielineId },
    data: { status: 'ACTIVE', adminVerifiedAt: new Date(), adminVerifiedById: admin.id },
  })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: 'dieline.verified',
    fromValue: dl.status,
    toValue: 'ACTIVE',
  })
  revalidatePath('/dielines')
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Die-line Curator (Slice C9.g) — admin normalizes a partner-confirmed die-line.
//
// The admin NEVER edits the partner's original file (PackagingDieline.partnerFile
// stays immutable). Instead the admin corrects the structured prepress spec
// (trim dimensions + bleed + safe inset) to the house standard; we regenerate a
// clean NORMALIZED SVG from that spec and store it under normalizedSvgKey — the
// uniform representation every creator's Studio renders. Saving stamps the
// die-line ADMIN_VERIFIED + ACTIVE.
// -----------------------------------------------------------------------------

export interface CurateDielineInput {
  dielineId: string
  widthMm: number
  heightMm: number
  bleedMm: number
  /** Safe-area inset from trim, mm. */
  safeAreaMm: number
}

export async function curateDieline(input: CurateDielineInput): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const width = Number(input.widthMm)
  const height = Number(input.heightMm)
  const bleed = Math.max(0, Number(input.bleedMm))
  const safeInset = Math.max(0, Number(input.safeAreaMm))
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return { ok: false, error: 'Trim width and height must be positive numbers (mm).' }
  }
  if (safeInset * 2 >= width || safeInset * 2 >= height) {
    return { ok: false, error: 'Safe-area inset is too large for these trim dimensions.' }
  }

  const dl = await prisma.packagingDieline.findUnique({
    where: { id: input.dielineId },
    select: {
      id: true,
      status: true,
      foldLines: true,
      surfaces: true,
      partnerService: { select: { partnerId: true } },
    },
  })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  if (dl.status !== 'PARTNER_CONFIRMED' && dl.status !== 'ACTIVE') {
    return { ok: false, error: `Cannot curate from ${dl.status}.` }
  }

  // Carry the real geometry (folds + named surfaces) through untouched; the admin
  // only standardizes trim/bleed/safe here.
  const foldLines = (dl.foldLines as DielineFold[] | null) ?? undefined
  const surfaces = (dl.surfaces as DielineSurface[] | null) ?? undefined

  // Generate the normalized SVG from the standardized spec (trim/safe derived
  // uniformly from dims + bleed + inset).
  const svg = dielineSvgFromSpec({
    widthMm: width,
    heightMm: height,
    bleedMm: bleed,
    safeAreaMm: safeInset,
    foldLines,
    surfaces,
  })

  // Persist the SVG to R2 — the artifact the Studio reads. Original file untouched.
  let normalizedSvgKey: string
  try {
    const key = dielineNormalizedKey({ dielineId: dl.id })
    await uploadFile({
      key,
      body: Buffer.from(svg, 'utf8'),
      contentType: 'image/svg+xml',
      contentDisposition: 'inline',
      cacheControl: 'private, max-age=0',
    })
    normalizedSvgKey = key
  } catch {
    return { ok: false, error: 'Could not store the normalized die-line. Check storage configuration and try again.' }
  }

  // NOTE: trimBox / safeAreaBox columns hold NormBox (0..1) guides owned by the
  // frame editor — we do NOT overwrite them here. Physical geometry is the mm
  // dims (widthMm/heightMm/bleedMm); the safe inset feeds only the generated SVG.
  await prisma.packagingDieline.update({
    where: { id: dl.id },
    data: {
      widthMm: width,
      heightMm: height,
      bleedMm: bleed,
      normalizedSvgKey,
      status: 'ACTIVE',
      adminVerifiedAt: new Date(),
      adminVerifiedById: admin.id,
    },
  })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dl.id,
    action: 'dieline.curated',
    fromValue: dl.status,
    toValue: 'ACTIVE',
  })
  revalidatePath('/dielines')
  revalidatePath(`/dielines/${dl.id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Interactive frame placement (Curator "Frames" mode). The admin drags frame
// slots + trim/safe guides on the normalized die-line; these autosave (debounced)
// exactly like the partner studio. trimBox / safeAreaBox here are NormBox (0..1),
// distinct from the mm dims set in spec mode.
// -----------------------------------------------------------------------------

export interface DielineNormGeometry {
  trimBox: NormBox
  safeAreaBox: NormBox
}

export async function saveAdminDielineFrames(dielineId: string, layout: FrameLayout): Promise<Result> {
  await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  await prisma.packagingDieline.update({
    where: { id: dielineId },
    // frames + framesUpdatedAt — cast to match the generated client shape.
    data: { frames: layout as never, framesUpdatedAt: new Date() } as never,
  })
  return { ok: true }
}

export async function saveAdminDielineGeometry(dielineId: string, geom: DielineNormGeometry): Promise<Result> {
  await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  await prisma.packagingDieline.update({
    where: { id: dielineId },
    data: {
      trimBox: geom.trimBox as never,
      safeAreaBox: geom.safeAreaBox as never,
    },
  })
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Canonical shape mapping (P2). Link a partner die-line to a house-standard
// DieCutTemplate so the admin normalizes a shape once + propagates conventions.
// clusterKey = aspect bucket from the die-line's dims (for grouping/clustering).
// -----------------------------------------------------------------------------

export async function mapDielineToShape(dielineId: string, shapeId: string | null): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({
    where: { id: dielineId },
    select: { id: true, widthMm: true, heightMm: true },
  })
  if (!dl) return { ok: false, error: 'Die-line not found.' }

  const w = Number(dl.widthMm) || 0
  const h = Number(dl.heightMm) || 0
  const clusterKey = w > 0 && h > 0 ? aspectBucketFor(w, h) : null

  // A manual admin map is a confirmed match → confidence 1.0; unmap clears it.
  await setDielineCanonicalShape(dielineId, shapeId, {
    matchConfidence: shapeId ? 1 : null,
    clusterKey,
  })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: shapeId ? 'dieline.shape-mapped' : 'dieline.shape-unmapped',
    toValue: shapeId ?? 'none',
  })
  revalidatePath('/dielines')
  revalidatePath(`/dielines/${dielineId}`)
  return { ok: true }
}

/** Batch map a cluster of submissions to one canonical shape (P3 leverage). */
export async function mapDielinesToShape(dielineIds: string[], shapeId: string | null): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (dielineIds.length === 0) return { ok: true }
  const dls = await prisma.packagingDieline.findMany({
    where: { id: { in: dielineIds } },
    select: { id: true, widthMm: true, heightMm: true },
  })
  for (const dl of dls) {
    const w = Number(dl.widthMm) || 0
    const h = Number(dl.heightMm) || 0
    const clusterKey = w > 0 && h > 0 ? aspectBucketFor(w, h) : null
    await setDielineCanonicalShape(dl.id, shapeId, { matchConfidence: shapeId ? 1 : null, clusterKey })
    await logAuditAs(admin, {
      entityType: 'PackagingDieline',
      entityId: dl.id,
      action: shapeId ? 'dieline.shape-mapped' : 'dieline.shape-unmapped',
      toValue: shapeId ?? 'none',
    })
  }
  revalidatePath('/dielines')
  return { ok: true }
}

export async function sendBackDieline(dielineId: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true, status: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  if (dl.status !== 'PARTNER_CONFIRMED') return { ok: false, error: `Cannot send back from ${dl.status}.` }

  await prisma.packagingDieline.update({ where: { id: dielineId }, data: { status: 'UPLOADED', partnerConfirmedAt: null } })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: 'dieline.sent-back',
    fromValue: dl.status,
    toValue: 'UPLOADED',
  })
  revalidatePath('/dielines')
  return { ok: true }
}
