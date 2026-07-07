'use server'

// Creator-review helpfulness vote (docs/FEEDBACK_MODULE.md §6.2): thumbs up →
// helpfulCount ("N people found this helpful"); thumbs down → notHelpfulCount.
// Cast-guarded: the counters land with the migration; until then this no-ops.

import { prisma } from '@ilaunchify/db'

export async function voteReview(
  reviewId: string,
  direction: 'up' | 'down',
): Promise<{ ok: boolean; helpfulCount?: number; notHelpfulCount?: number }> {
  try {
    const data = direction === 'up' ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } }
    const r = await (
      prisma as unknown as {
        productReview: { update: (a: unknown) => Promise<{ helpfulCount: number; notHelpfulCount: number }> }
      }
    ).productReview.update({
      where: { id: reviewId },
      data,
      select: { helpfulCount: true, notHelpfulCount: true },
    })
    return { ok: true, helpfulCount: r.helpfulCount, notHelpfulCount: r.notHelpfulCount }
  } catch {
    return { ok: false }
  }
}
