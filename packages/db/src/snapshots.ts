// EditSnapshot db helpers — version history for the two editor surfaces (partner
// product-builder draft + creator Design Studio canvas). The PURE retention logic
// lives in ./snapshots-engine; this file is the Prisma-facing layer.
//
// Cast-guarded: EditSnapshot ships with a pending migration so the generated
// client may not type it yet (Mac: prisma db push + generate). Ownership is
// enforced by the per-app server actions BEFORE these are called — the helpers
// trust (entityType, entityId).

import { prisma } from './index'
import {
  SNAPSHOT_RING_SIZE,
  coalesceTarget,
  isPinnedKind,
  snapshotsToPrune,
  type SnapshotEntity,
  type SnapshotKind,
  type SnapshotRow,
} from './snapshots-engine'

export {
  SNAPSHOT_RING_SIZE,
  COALESCE_WINDOW_MS,
  snapshotsToPrune,
  coalesceTarget,
  isPinnedKind,
  type SnapshotEntity,
  type SnapshotKind,
  type SnapshotRow,
} from './snapshots-engine'

/** Metadata for the Version History drawer — never includes the heavy snapshot JSON. */
export interface SnapshotMeta {
  id: string
  kind: SnapshotKind
  label: string | null
  pinned: boolean
  createdAt: Date
}

interface EditSnapshotDelegate {
  findMany: (a: unknown) => Promise<unknown[]>
  create: (a: unknown) => Promise<{ id: string }>
  update: (a: unknown) => Promise<unknown>
  deleteMany: (a: unknown) => Promise<unknown>
  findFirst: (a: unknown) => Promise<{ snapshot: unknown } | null>
}

function es(): EditSnapshotDelegate {
  return (prisma as unknown as { editSnapshot: EditSnapshotDelegate }).editSnapshot
}

interface CreateSnapshotInput {
  entityType: SnapshotEntity
  entityId: string
  snapshot: unknown
  kind?: SnapshotKind
  /** Milestone/manual label, e.g. "Submitted for review". */
  label?: string | null
  createdById?: string | null
}

/**
 * Record a snapshot, applying coalesce + ring-buffer prune in one pass.
 * - AUTO snaps inside the coalesce window UPDATE the latest non-pinned row.
 * - MILESTONE/MANUAL are pinned (kept forever).
 * - After insert, prune non-pinned rows beyond SNAPSHOT_RING_SIZE.
 * Returns the row id + whether it coalesced. Never throws on prune.
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<{ id: string; coalesced: boolean }> {
  const kind: SnapshotKind = input.kind ?? 'AUTO'
  const pinned = isPinnedKind(kind)
  const where = { entityType: input.entityType, entityId: input.entityId }

  const raw = await es().findMany({
    where,
    select: { id: true, kind: true, pinned: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const rows = raw as Array<{ id: string; kind: SnapshotKind; pinned: boolean; createdAt: Date }>
  const existing: SnapshotRow[] = rows.map((r) => ({ id: r.id, kind: r.kind, pinned: r.pinned, createdAt: new Date(r.createdAt) }))

  const now = new Date()

  // Coalesce a burst of AUTO edits into the most recent non-pinned row.
  if (kind === 'AUTO') {
    const targetId = coalesceTarget(existing, now)
    if (targetId) {
      await es().update({ where: { id: targetId }, data: { snapshot: input.snapshot as never, createdAt: now } })
      return { id: targetId, coalesced: true }
    }
  }

  const created = await es().create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      kind,
      label: input.label ?? null,
      snapshot: input.snapshot as never,
      pinned,
      createdById: input.createdById ?? null,
    },
  })

  // Prune non-pinned rows beyond the ring size.
  const after: SnapshotRow[] = [...existing, { id: created.id, kind, pinned, createdAt: now }]
  const toDelete = snapshotsToPrune(after)
  if (toDelete.length > 0) {
    await es().deleteMany({ where: { id: { in: toDelete } } }).catch(() => undefined)
  }

  return { id: created.id, coalesced: false }
}

/** List snapshot METADATA (no JSON) newest-first for the Version History drawer. */
export async function listSnapshots(entityType: SnapshotEntity, entityId: string, take = 30): Promise<SnapshotMeta[]> {
  const raw = await es().findMany({
    where: { entityType, entityId },
    select: { id: true, kind: true, label: true, pinned: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take,
  })
  const rows = raw as Array<{ id: string; kind: SnapshotKind; label: string | null; pinned: boolean; createdAt: Date }>
  return rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, pinned: r.pinned, createdAt: new Date(r.createdAt) }))
}

/** Fetch one snapshot's JSON payload (scoped to its entity) for restore/preview. */
export async function getSnapshotJson(id: string, entityType: SnapshotEntity, entityId: string): Promise<unknown | null> {
  const row = await es().findFirst({ where: { id, entityType, entityId }, select: { snapshot: true } })
  return row?.snapshot ?? null
}
