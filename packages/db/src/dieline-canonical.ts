// Die-line ↔ canonical shape mapping (docs/DIELINE_MANAGEMENT_UX.md P2).
//
// Links a partner-submitted PackagingDieline to a house-standard DieCutTemplate so
// the admin normalizes a shape once and propagates conventions. The new columns
// (canonicalShapeId / matchConfidence / clusterKey) land only after the additive
// db push, so writes/reads of them are cast-guarded and degrade gracefully until
// then (getCanonicalShapeOptions reads only existing DieCutTemplate columns).

import { prisma } from './index'

export interface CanonicalShapeOption {
  id: string
  name: string
  category: string
  widthMm: number
  heightMm: number
}

/** Active canonical shapes the admin can map a die-line to. Existing columns only. */
export async function getCanonicalShapeOptions(): Promise<CanonicalShapeOption[]> {
  const rows = await prisma.dieCutTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true, widthMm: true, heightMm: true },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: String(r.category),
    widthMm: r.widthMm,
    heightMm: r.heightMm,
  }))
}

interface DielineDelegate {
  update: (a: unknown) => Promise<unknown>
  findMany: (a: unknown) => Promise<
    Array<{ id: string; canonicalShapeId: string | null; canonicalShape: { name: string } | null }>
  >
}
function delegate(): DielineDelegate | null {
  return (prisma as unknown as { packagingDieline?: DielineDelegate }).packagingDieline ?? null
}

export async function setDielineCanonicalShape(
  dielineId: string,
  shapeId: string | null,
  opts: { matchConfidence?: number | null; clusterKey?: string | null } = {},
): Promise<void> {
  const d = delegate()
  if (!d) return
  await d.update({
    where: { id: dielineId },
    data: {
      canonicalShapeId: shapeId,
      matchConfidence: opts.matchConfidence ?? null,
      ...(opts.clusterKey !== undefined ? { clusterKey: opts.clusterKey } : {}),
    },
  })
}

/**
 * Propagate one die-line's frame layout to its CLUSTER — every other die-line
 * mapped to the same canonical shape that doesn't have frames yet. The "place
 * mandatory frames once, apply across all partners of that shape" leverage move
 * (DIELINE_MANAGEMENT_UX P3). Returns how many siblings were updated.
 */
export async function propagateDielineFrames(sourceId: string): Promise<number> {
  const p = prisma as unknown as {
    packagingDieline?: {
      findUnique: (a: unknown) => Promise<{ frames: unknown; canonicalShapeId: string | null } | null>
      findMany: (a: unknown) => Promise<Array<{ id: string }>>
      update: (a: unknown) => Promise<unknown>
    }
  }
  const d = p.packagingDieline
  if (!d) return 0
  try {
    const src = await d.findUnique({ where: { id: sourceId }, select: { frames: true, canonicalShapeId: true } })
    if (!src || !src.canonicalShapeId || src.frames == null) return 0
    const siblings = await d.findMany({
      where: { canonicalShapeId: src.canonicalShapeId, id: { not: sourceId }, frames: { equals: null } },
      select: { id: true },
    })
    for (const s of siblings) {
      await d.update({ where: { id: s.id }, data: { frames: src.frames as never, framesUpdatedAt: new Date() } })
    }
    return siblings.length
  } catch {
    return 0
  }
}

export interface DielineCanonicalLink {
  id: string
  canonicalShapeId: string | null
  canonicalShapeName: string | null
}

/** Map a set of die-line ids → their canonical shape (for ops-list badges).
 *  Returns [] if the additive columns aren't pushed yet (no crash). */
export async function listDielineCanonicalLinks(ids: string[]): Promise<DielineCanonicalLink[]> {
  const d = delegate()
  if (!d || ids.length === 0) return []
  try {
    const rows = await d.findMany({
      where: { id: { in: ids } },
      select: { id: true, canonicalShapeId: true, canonicalShape: { select: { name: true } } },
    })
    return rows.map((r) => ({
      id: r.id,
      canonicalShapeId: r.canonicalShapeId,
      canonicalShapeName: r.canonicalShape?.name ?? null,
    }))
  } catch {
    return []
  }
}
