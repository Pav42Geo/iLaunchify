// Admin generated-templates pool (AI_PACKAGING_GENERATOR §8). Lists EVERY creator
// AI generation (READY) so admins can BROWSE for reference and pull a design's STYLE
// (its brief) into their own generator for inspiration.
//
// Creator generations are the creator's work: the admin pool is strictly READ-ONLY.
// No featuring, promoting, publishing, or downloading of creators' actual designs.
// Cast-guarded so it degrades before db:push.

import { prisma } from '@ilaunchify/db'

/** The reusable brief carried into the admin generator for "use as inspiration". */
export interface PoolBrief {
  descriptor?: string
  styleTags: string[]
  colorTags: string[]
  elementTags: string[]
}

export interface PoolItem {
  id: string
  title: string
  creatorName: string
  domain: string
  containerCategory: string | null
  createdAtIso: string
  thumbnailUrl?: string
  brief: PoolBrief
}

export interface PoolKpis {
  total: number
  thisWeek: number
  creators: number
}

export interface PoolData {
  items: PoolItem[]
  kpis: PoolKpis
  domains: string[]
}

type Row = {
  id: string
  title: string | null
  promptJson: unknown
  containerCategory: string | null
  createdAt: Date
  authorUserId: string
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** All READY creator generations, newest first (capped), + KPI roll-ups. Read-only. */
export async function loadGenerationPool(): Promise<PoolData> {
  const rows = (await (
    prisma as unknown as { aiDesignGeneration: { findMany: (a: unknown) => Promise<Row[]> } }
  ).aiDesignGeneration
    .findMany({
      where: { scope: 'CREATOR', status: 'READY' },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { id: true, title: true, promptJson: true, containerCategory: true, createdAt: true, authorUserId: true },
    })
    .catch(() => [])) as Row[]

  const userIds = Array.from(new Set(rows.map((r) => r.authorUserId)))
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }).catch(() => [])
    : []
  const nameById = new Map(users.map((u) => [u.id, u.name || u.email || 'Creator']))

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const items: PoolItem[] = rows.map((r) => {
    const p = (r.promptJson && typeof r.promptJson === 'object' ? (r.promptJson as Record<string, unknown>) : {}) as Record<string, unknown>
    const brief = (p.brief && typeof p.brief === 'object' ? (p.brief as Record<string, unknown>) : {}) as Record<string, unknown>
    return {
      id: r.id,
      title: r.title ?? (typeof brief.descriptor === 'string' ? brief.descriptor : 'Concept'),
      creatorName: nameById.get(r.authorUserId) ?? 'Creator',
      domain: typeof p.domain === 'string' ? p.domain : 'FOOD',
      containerCategory: r.containerCategory,
      createdAtIso: r.createdAt.toISOString(),
      thumbnailUrl: undefined, // view-only reference (fills in with R2)
      brief: {
        descriptor: typeof brief.descriptor === 'string' ? brief.descriptor : undefined,
        styleTags: strArr(brief.styleTags),
        colorTags: strArr(brief.colorTags),
        elementTags: strArr(brief.elementTags),
      },
    }
  })

  const kpis: PoolKpis = {
    total: items.length,
    thisWeek: items.filter((i) => Date.parse(i.createdAtIso) >= weekAgo).length,
    creators: userIds.length,
  }
  return { items, kpis, domains: Array.from(new Set(items.map((i) => i.domain))) }
}
