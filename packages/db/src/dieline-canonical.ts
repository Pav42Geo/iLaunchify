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
