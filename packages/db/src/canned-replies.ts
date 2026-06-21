// Admin-curated support canned/macro replies (W2-SUP). Agents insert these into
// the ticket reply box. Cast-guarded: the model lands on the generated client
// only after the migration, and a missing model falls back to an empty list — so
// reads are always safe to call.

import { prisma } from './index'

export interface CannedReplyRow {
  id: string
  title: string
  body: string
  categoryId: string | null
  isActive: boolean
  sortOrder: number
}

/**
 * List canned replies. `activeOnly` restricts to active rows; `categoryId`, when
 * provided, returns global replies (categoryId null) PLUS that category's
 * replies — i.e. everything relevant to a ticket in that category.
 */
export async function getCannedReplies(opts: {
  activeOnly?: boolean
  categoryId?: string | null
} = {}): Promise<CannedReplyRow[]> {
  try {
    const where: Record<string, unknown> = {}
    if (opts.activeOnly) where.isActive = true
    if (opts.categoryId) where.OR = [{ categoryId: null }, { categoryId: opts.categoryId }]

    const rows = await (
      prisma as unknown as {
        supportCannedReply: { findMany: (a: unknown) => Promise<CannedReplyRow[]> }
      }
    ).supportCannedReply
      .findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: {
          id: true,
          title: true,
          body: true,
          categoryId: true,
          isActive: true,
          sortOrder: true,
        },
      })
      .catch(() => [] as CannedReplyRow[])
    return rows
  } catch {
    return []
  }
}
