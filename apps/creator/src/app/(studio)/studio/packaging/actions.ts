'use server'

// Admin Packaging Studio — surface authoring save (ADMIN_PACKAGING_STUDIO.md P2).
// Persists the typed surfaces back to PackagingType.defaultSurfaces (JSON-first, no
// migration). catalog:write-gated + audited. The three.js hotspot canvas (draw the
// clickable border) is the next slice; this save already carries the hotspot shape.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, packagingModelAssetKey } from '@ilaunchify/storage'
import { serializePackagingSurfaces, resolvePackagingSurfaces, type PackagingSurface, type FrameLayout, type NormBox } from '@ilaunchify/ui'

export type SaveResult = { ok: true } | { ok: false; error: string }

// Import a 3D model (glTF/glb) + optional thumbnail for a packaging model, persist the
// R2 keys on PackagingType (model3dKey / model3dThumbKey / model3dSource = UPLOAD). This
// is the "import 3D mockup and assign it to a package" flow. catalog:write + audited.
const MODEL_MAX_BYTES = 40 * 1024 * 1024 // 40MB — glb models are typically 1–15MB
const THUMB_MAX_BYTES = 4 * 1024 * 1024

// A Next.js redirect() (used by requireCapability on a forbidden/unauthed admin) throws
// an error whose `digest` starts with NEXT_REDIRECT. The client's `.catch(() => null)`
// would otherwise swallow it into a generic "Upload failed." — surface the real reason.
function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null | undefined)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

function describeError(err: unknown, action: string): string {
  if (isRedirectError(err)) {
    return `You don't have permission to ${action} — this needs the "catalog:write" capability. Ask a super admin to set your account's role (Admin → Users & Roles).`
  }
  const msg = err instanceof Error ? err.message : String(err)
  return `Upload failed: ${msg} — check R2 configuration if this persists.`
}

export async function attachPackagingModel3d(packagingTypeId: string, form: FormData): Promise<SaveResult> {
  let admin: Awaited<ReturnType<typeof requireCapability>>
  try {
    admin = await requireCapability('catalog:write')
  } catch (err) {
    return { ok: false, error: describeError(err, 'import 3D packaging models') }
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No 3D model file provided.' }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) return { ok: false, error: 'Model must be a .glb or .gltf file.' }
  if (file.size > MODEL_MAX_BYTES) return { ok: false, error: 'Model is too large (40MB max).' }

  const modelKey = packagingModelAssetKey({ packagingTypeId, kind: 'model3d', filename: file.name })
  let up: Awaited<ReturnType<typeof uploadFile>>
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    up = await uploadFile({
      key: modelKey,
      body: buf,
      contentType: name.endsWith('.glb') ? 'model/gltf-binary' : 'model/gltf+json',
    })
  } catch (err) {
    return { ok: false, error: describeError(err, 'import 3D packaging models') }
  }

  // Optional thumbnail (any image) — best-effort, never blocks the model import.
  let thumbKey: string | undefined
  const thumb = form.get('thumb')
  if (thumb instanceof File && thumb.size > 0 && thumb.size <= THUMB_MAX_BYTES && thumb.type.startsWith('image/')) {
    const tk = packagingModelAssetKey({ packagingTypeId, kind: 'thumb', filename: thumb.name })
    const ok = await uploadFile({ key: tk, body: Buffer.from(await thumb.arrayBuffer()), contentType: thumb.type }).catch(() => null)
    if (ok) thumbKey = tk
  }

  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({
      where: { id: packagingTypeId },
      data: { model3dKey: modelKey, model3dSource: 'UPLOAD', ...(thumbKey ? { model3dThumbKey: thumbKey } : {}) },
    })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Uploaded, but could not attach it to this packaging type.' }

  try {
    await logAuditAs(admin, {
      entityType: 'PackagingType',
      entityId: packagingTypeId,
      action: 'packaging-model.3d-imported',
      payload: { modelKey, thumb: Boolean(thumbKey), bytes: up.sizeBytes },
    })
  } catch {
    /* audit is non-fatal — the model is already attached */
  }
  return { ok: true }
}

// Import a 2D mockup / preview image for a packaging model. Reuses model3dThumbKey as the
// package's preview image (shown as the thumbnail across the studio picker + admin grid) —
// no migration. Any image type; 4MB cap. catalog:write + audited.
export async function attachPackagingImage(packagingTypeId: string, form: FormData): Promise<SaveResult> {
  let admin: Awaited<ReturnType<typeof requireCapability>>
  try {
    admin = await requireCapability('catalog:write')
  } catch (err) {
    return { ok: false, error: describeError(err, 'import packaging images') }
  }
  const img = form.get('image')
  if (!(img instanceof File) || img.size === 0) return { ok: false, error: 'No image provided.' }
  if (!img.type.startsWith('image/')) return { ok: false, error: 'File must be an image.' }
  if (img.size > THUMB_MAX_BYTES) return { ok: false, error: 'Image is too large (4MB max).' }

  const key = packagingModelAssetKey({ packagingTypeId, kind: 'thumb', filename: img.name })
  let up: Awaited<ReturnType<typeof uploadFile>>
  try {
    up = await uploadFile({ key, body: Buffer.from(await img.arrayBuffer()), contentType: img.type })
  } catch (err) {
    return { ok: false, error: describeError(err, 'import packaging images') }
  }

  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({ where: { id: packagingTypeId }, data: { model3dThumbKey: key } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Uploaded, but could not attach the image.' }

  try {
    await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'packaging-model.image-imported', payload: { key, bytes: up.sizeBytes } })
  } catch {
    /* audit is non-fatal */
  }
  return { ok: true }
}

/** Remove the 2D preview image. */
export async function removePackagingImage(packagingTypeId: string): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({ where: { id: packagingTypeId }, data: { model3dThumbKey: null } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not remove the image.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'packaging-model.image-removed', payload: {} })
  return { ok: true }
}

/** Remove the imported 3D model, reverting the studio to the parametric mesh. */
export async function removePackagingModel3d(packagingTypeId: string): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({ where: { id: packagingTypeId }, data: { model3dKey: null, model3dThumbKey: null, model3dSource: 'PARAMETRIC' } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not remove the 3D model.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'packaging-model.3d-removed', payload: {} })
  return { ok: true }
}

const FULL: NormBox = { x: 0, y: 0, w: 1, h: 1 }
function box(v: unknown): NormBox {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = (k: string, d: number) => (typeof o[k] === 'number' ? (o[k] as number) : d)
    return { x: n('x', 0), y: n('y', 0), w: n('w', 1), h: n('h', 1) }
  }
  return FULL
}

export interface DielineEditorData {
  id: string
  frames: FrameLayout | null
  trim: NormBox
  safe: NormBox
  /** Signed backdrop URL — null for now (renders frames on a blank surface). */
  backdropUrl: string | null
}

/** Load a die-line's geometry for the inline 2D editor. Owner-agnostic (admin). */
export async function getDielineEditorData(dielineId: string): Promise<DielineEditorData | null> {
  await requireCapability('catalog:write')
  const row = (await (
    prisma as unknown as {
      packagingDieline: { findUnique: (a: unknown) => Promise<{ id: string; frames: unknown; trimBox: unknown; safeAreaBox: unknown } | null> }
    }
  ).packagingDieline
    .findUnique({ where: { id: dielineId }, select: { id: true, frames: true, trimBox: true, safeAreaBox: true } })
    .catch(() => null)) as { id: string; frames: unknown; trimBox: unknown; safeAreaBox: unknown } | null
  if (!row) return null
  return {
    id: row.id,
    frames: (row.frames as FrameLayout | null) ?? null,
    trim: box(row.trimBox),
    safe: box(row.safeAreaBox),
    backdropUrl: null,
  }
}

/** Persist frame geometry back to a die-line (the inline 2D editor's onPersist). */
export async function saveDielineFrames(dielineId: string, geom: { layout: FrameLayout; trim: NormBox; safe: NormBox }): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingDieline: { update: (a: unknown) => Promise<unknown> } }
  ).packagingDieline
    .update({ where: { id: dielineId }, data: { frames: geom.layout, trimBox: geom.trim, safeAreaBox: geom.safe, framesUpdatedAt: new Date() } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not save the die-line.' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: dielineId, action: 'packaging-dieline.frames-saved', payload: {} })
  return { ok: true }
}

export async function savePackagingSurfaces(packagingTypeId: string, surfaces: PackagingSurface[]): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  // Normalize through the resolver so a malformed client payload can't corrupt the JSON.
  const clean = serializePackagingSurfaces(resolvePackagingSurfaces(serializePackagingSurfaces(surfaces)))
  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({ where: { id: packagingTypeId }, data: { defaultSurfaces: clean } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not save surfaces (is the schema pushed?).' }
  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: packagingTypeId,
    action: 'packaging-surfaces.saved',
    payload: { count: surfaces.length },
  })
  return { ok: true }
}
