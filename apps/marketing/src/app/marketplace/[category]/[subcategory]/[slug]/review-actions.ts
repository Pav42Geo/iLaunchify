'use server'

// Creator-review helpfulness vote (docs/FEEDBACK_MODULE.md §6.2) — real
// one-vote-per-user, backed by the ReviewVote table (unique userId×reviewId).
//   • first click        → records the vote, bumps the matching counter
//   • same direction     → removes the vote (toggle off), decrements
//   • opposite direction → moves the count (−1 old, +1 new)
// The aggregate counters (helpfulCount / notHelpfulCount) live on ProductReview
// for cheap display; this action keeps them and the vote row consistent in one
// transaction. Cast-guarded so it compiles before `prisma generate` picks up the
// ReviewVote model + the counter columns.

import { prisma } from '@ilaunchify/db'
import { getMarketingSession } from '@/lib/session'

type Dir = 'up' | 'down'

export interface VoteResult {
  ok: boolean
  requiresAuth?: boolean
  helpfulCount?: number
  notHelpfulCount?: number
  myVote?: Dir | null
}

const toEnum = (d: Dir): 'UP' | 'DOWN' => (d === 'up' ? 'UP' : 'DOWN')
const toDir = (e: string | null | undefined): Dir | null =>
  e === 'UP' ? 'up' : e === 'DOWN' ? 'down' : null

// Minimal structural view of the (pre-generate) client used inside the tx.
type VoteTx = {
  reviewVote: {
    findUnique: (a: unknown) => Promise<{ direction: string } | null>
    create: (a: unknown) => Promise<unknown>
    update: (a: unknown) => Promise<unknown>
    delete: (a: unknown) => Promise<unknown>
  }
  productReview: {
    update: (a: unknown) => Promise<{ helpfulCount: number; notHelpfulCount: number }>
  }
}

export async function voteReview(reviewId: string, direction: Dir): Promise<VoteResult> {
  try {
    const session = await getMarketingSession()
    const userId = session?.user?.id
    if (!userId) return { ok: false, requiresAuth: true }

    const db = prisma as unknown as {
      $transaction: <T>(fn: (tx: VoteTx) => Promise<T>) => Promise<T>
    }

    const { updated, myVote } = await db.$transaction(async (tx) => {
      const existing = await tx.reviewVote.findUnique({
        where: { userId_reviewId: { userId, reviewId } },
        select: { direction: true },
      })
      const prev = toDir(existing?.direction)

      let helpfulDelta = 0
      let notHelpfulDelta = 0
      let next: Dir | null = direction

      if (prev == null) {
        // New vote.
        if (direction === 'up') helpfulDelta = 1
        else notHelpfulDelta = 1
        await tx.reviewVote.create({ data: { userId, reviewId, direction: toEnum(direction) } })
      } else if (prev === direction) {
        // Toggle off.
        if (direction === 'up') helpfulDelta = -1
        else notHelpfulDelta = -1
        next = null
        await tx.reviewVote.delete({ where: { userId_reviewId: { userId, reviewId } } })
      } else {
        // Switch direction.
        if (direction === 'up') {
          helpfulDelta = 1
          notHelpfulDelta = -1
        } else {
          helpfulDelta = -1
          notHelpfulDelta = 1
        }
        await tx.reviewVote.update({
          where: { userId_reviewId: { userId, reviewId } },
          data: { direction: toEnum(direction) },
        })
      }

      const row = await tx.productReview.update({
        where: { id: reviewId },
        data: {
          helpfulCount: { increment: helpfulDelta },
          notHelpfulCount: { increment: notHelpfulDelta },
        },
        select: { helpfulCount: true, notHelpfulCount: true },
      })
      return { updated: row, myVote: next }
    })

    return {
      ok: true,
      helpfulCount: updated.helpfulCount,
      notHelpfulCount: updated.notHelpfulCount,
      myVote,
    }
  } catch {
    return { ok: false }
  }
}
