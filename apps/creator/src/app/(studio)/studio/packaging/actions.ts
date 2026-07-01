'use server'

// Admin Packaging Studio — surface authoring save (ADMIN_PACKAGING_STUDIO.md P2).
// Persists the typed surfaces back to PackagingType.defaultSurfaces (JSON-first, no
// migration). catalog:write-gated + audited. The three.js hotspot canvas (draw the
// clickable border) is the next slice; this save already carries the hotspot shape.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { serializePackagingSurfaces, resolvePackagingSurfaces, type PackagingSurface, type FrameLayout, type NormBox } from '@ilaunchify/ui'

export type SaveResult = { ok: true } | { ok: false; error: string }

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
