// Admin generated-templates pool (AI_PACKAGING_GENERATOR §8). Lists EVERY creator
// AI generation (READY) across the platform so admins can browse, shortlist
// ("feature"), and promote the best into the Starter (premium) gallery. Read side
// only; mutations live in actions.ts. Cast-guarded so it degrades before db:push.

import { prisma } from '@ilaunchify/db'

export interface PoolItem {
  id: string
  title: string
  creatorName: string
  domain: string
  containerCategory: string | null
  aspectBucket: string | null
  favorited: boolean
  featured: boolean
  promoted: boolean // already saved as a premium template
  thumbnailUrl?: string
  createdAtIso: string
}

export interface PoolKpis {
  total: number
  thisWeek: number
  favorited: number
  featured: number
  promoted: number
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
  favorited: boolean | null
  featured: boolean | null
  savedTemplateId: string | null
  containerCategory: string | null
  aspectBucket: string | null
  createdAt: Date
  authorUserId: string
}

/** All READY creator generations, newest first (capped), + KPI roll-ups. */
export async function loadGenerationPool(): Promise<PoolData> {
  const rows = (await (
    prisma as unknown as { aiDesignGeneration: { findMany: (a: unknown) => Promise<Row[]> } }
  ).aiDesignGeneration
    .findMany({
      where: { scope: 'CREATOR', status: 'READY' },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        title: true,
        promptJson: true,
        favorited: true,
        featured: true,
        savedTemplateId: true,
        containerCategory: true,
        aspectBucket: true,
        createdAt: true,
        authorUserId: true,
      },
    })
    .catch(() => [])) as Row[]

  // Resolve author display names in one query.
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
      aspectBucket: r.aspectBucket,
      favorited: Boolean(r.favorited),
      featured: Boolean(r.featured),
      promoted: Boolean(r.savedTemplateId),
      thumbnailUrl: undefined, // R2 variation image (fills in with persistence)
      createdAtIso: r.createdAt.toISOString(),
    }
  })

  const kpis: PoolKpis = {
    total: items.length,
    thisWeek: items.filter((i) => Date.parse(i.createdAtIso) >= weekAgo).length,
    favorited: items.filter((i) => i.favorited).length,
    featured: items.filter((i) => i.featured).length,
    promoted: items.filter((i) => i.promoted).length,
  }
  const domains = Array.from(new Set(items.map((i) => i.domain)))
  return { items, kpis, domains }
}
