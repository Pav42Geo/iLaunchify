'use server'

// PackagingType hub — inline mutations. Set the container's default die-cut + toggle status.
// catalog:write-gated + audited. Additive; no schema change.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, packagingModelAssetKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

type PtDelegate = { update: (a: unknown) => Promise<unknown> }
const pt = () => (prisma as unknown as { packagingType?: PtDelegate }).packagingType ?? null

// ---- 3D model import (admin-native — mirrors the creator studio action) -------------------
const MODEL_MAX_BYTES = 40 * 1024 * 1024 // 40MB — glb models are typically 1–15MB
const THUMB_MAX_BYTES = 4 * 1024 * 1024

function isRedirectError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null | undefined)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}
function describeError(err: unknown, action: string): string {
  if (isRedirectError(err)) return `You don't have permission to ${action} — this needs the "catalog:write" capability (Admin → Users & Roles).`
  return `Upload failed: ${err instanceof Error ? err.message : String(err)} — check R2 configuration if this persists.`
}

export async function importPackagingModel3d(packagingTypeId: string, form: FormData): Promise<Result> {
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
  try {
    await uploadFile({
      key: modelKey,
      body: Buffer.from(await file.arrayBuffer()),
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

  const done = await pt()
    ?.update({ where: { id: packagingTypeId }, data: { model3dKey: modelKey, model3dSource: 'UPLOAD', ...(thumbKey ? { model3dThumbKey: thumbKey } : {}) } })
    .catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Uploaded, but could not attach it to this container.' }

  await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'packaging-model.3d-imported', payload: { modelKey, thumb: Boolean(thumbKey) } }).catch(() => {})
  revalidatePath(`/packaging-studio/${packagingTypeId}`)
  return { ok: true }
}

export async function removePackagingModel3d(packagingTypeId: string): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id: packagingTypeId }, data: { model3dKey: null, model3dThumbKey: null, model3dSource: 'PARAMETRIC' } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not remove the 3D model.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: packagingTypeId, action: 'packaging-model.3d-removed', payload: {} }).catch(() => {})
  revalidatePath(`/packaging-studio/${packagingTypeId}`)
  return { ok: true }
}

export async function setPackagingTypeDefaultDieCut(id: string, dieCutTemplateId: string | null): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id }, data: { defaultDieCutTemplateId: dieCutTemplateId } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not set the default die-cut.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging.default-die-cut', payload: { dieCutTemplateId } })
  revalidatePath(`/packaging-studio/${id}`)
  return { ok: true }
}

export async function setPackagingTypeStatus(id: string, status: 'ACTIVE' | 'DEPRECATED'): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id }, data: { status } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not update status.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging.status', payload: { status } })
  revalidatePath(`/packaging-studio/${id}`)
  return { ok: true }
}
