// Pure retention engine for EditSnapshot version history. No Prisma import, so it
// is unit-testable in plain node and safe to reason about in isolation.
//
// Policy (Pavel 2026-06-19): ring buffer of the last N non-pinned AUTO snapshots
// + unlimited pinned milestones/manual saves. Coalesce rapid AUTO snapshots so a
// burst of edits doesn't spawn a row each. Prune on write. See docs/VERSION_HISTORY.md.

export const SNAPSHOT_RING_SIZE = 10 // keep the last N non-pinned (AUTO) snapshots
export const COALESCE_WINDOW_MS = 2 * 60_000 // collapse AUTO snapshots saved <2 min apart

// PROMOTION — auto-pin written to the OUTGOING Active when an alternate is promoted
// (versioning v2 §3.3). Non-AUTO → pinned via isPinnedKind, exempt from pruning.
export type SnapshotKind = 'AUTO' | 'MILESTONE' | 'MANUAL' | 'PROMOTION'
export type SnapshotEntity = 'PRODUCT_TEMPLATE_DRAFT' | 'DESIGN'

export interface SnapshotRow {
  id: string
  kind: SnapshotKind
  pinned: boolean
  createdAt: Date
}

/** Newest-first by createdAt. */
function byNewest(a: SnapshotRow, b: SnapshotRow): number {
  return b.createdAt.getTime() - a.createdAt.getTime()
}

/**
 * Given the full set of existing rows for one entity (any order), return the ids
 * to DELETE to enforce retention: keep every pinned row + the most recent
 * `ringSize` non-pinned rows; everything else is pruned.
 */
export function snapshotsToPrune(rows: SnapshotRow[], ringSize: number = SNAPSHOT_RING_SIZE): string[] {
  const nonPinned = rows.filter((r) => !r.pinned).sort(byNewest)
  return nonPinned.slice(ringSize).map((r) => r.id)
}

/**
 * If the most recent non-pinned AUTO snapshot is within the coalesce window of
 * `now`, return its id so the caller UPDATES it in place instead of inserting a
 * new row. Otherwise null (insert fresh). Filters on kind === 'AUTO' (not just
 * !pinned): since Phase 1 named versions can be UNPINNED by the creator, an
 * unpinned MANUAL/MILESTONE row becomes prunable but must never be silently
 * overwritten by a background autosave.
 */
export function coalesceTarget(rows: SnapshotRow[], now: Date, windowMs: number = COALESCE_WINDOW_MS): string | null {
  const latest = rows.filter((r) => !r.pinned && r.kind === 'AUTO').sort(byNewest)[0]
  if (latest && now.getTime() - latest.createdAt.getTime() < windowMs) return latest.id
  return null
}

/** A kind is pinned (exempt from ring-buffer pruning) unless it is a background AUTO snap. */
export function isPinnedKind(kind: SnapshotKind): boolean {
  return kind !== 'AUTO'
}
