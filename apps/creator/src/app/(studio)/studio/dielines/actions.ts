'use server'

// Design Studio — Die-line Curation actions. Curation is a canvas concern: load a die-line's
// geometry for the shared DielineFrameEditor, persist frames, and set curation status
// (mark ADMIN_VERIFIED / ACTIVE / ARCHIVED). catalog:write + audited.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import type { FrameLayout, NormBox } from '@ilaunchify/ui'

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
  backdropUrl: string | null
}

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
  return { id: row.id, frames: (row.frames as FrameLayout | null) ?? null, trim: box(row.trimBox), safe: box(row.safeAreaBox), backdropUrl: null }
}

export async function saveDielineFrames(dielineId: string, geom: { layout: FrameLayout; trim: NormBox; safe: NormBox }): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingDieline: { update: (a: unknown) => Promise<unknown> } }
  ).packagingDieline
    .update({ where: { id: dielineId }, data: { frames: geom.layout, trimBox: geom.trim, safeAreaBox: geom.safe, framesUpdatedAt: new Date() } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not save the die-line.' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: dielineId, action: 'dieline.frames-curated', payload: {} })
  return { ok: true }
}

/** Mark a die-line admin-verified (spot-checked). Sets adminVerifiedAt + verifier + status. */
export async function markDielineVerified(dielineId: string): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingDieline: { update: (a: unknown) => Promise<unknown> } }
  ).packagingDieline
    .update({ where: { id: dielineId }, data: { adminVerifiedAt: new Date(), adminVerifiedById: admin.id, status: 'ADMIN_VERIFIED' } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not mark verified.' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: dielineId, action: 'dieline.admin-verified', payload: {} })
  return { ok: true }
}

/** Set die-line curation status (ACTIVE / ARCHIVED). */
export async function setDielineStatus(dielineId: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  const done = await (
    prisma as unknown as { packagingDieline: { update: (a: unknown) => Promise<unknown> } }
  ).packagingDieline
    .update({ where: { id: dielineId }, data: { status } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not update status.' }
  await logAuditAs(admin, { entityType: 'PackagingDieline', entityId: dielineId, action: 'dieline.status-changed', payload: { status } })
  return { ok: true }
}
