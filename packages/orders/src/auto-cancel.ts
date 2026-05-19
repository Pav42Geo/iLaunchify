// Auto-cancel dispatches that partners didn't accept in time.
//
// Pattern: a scheduled job (Vercel Cron or external scheduler) hits
// /api/cron/auto-cancel-dispatches once per minute. That route calls
// runAutoCancel() which:
//   1. Finds OrderDispatch rows where status=PENDING_ACCEPT and
//      acceptDeadlineAt < now()
//   2. Updates them to TIMED_OUT in a single transaction per row
//   3. Writes a SYSTEM-actor audit log entry for each
//
// We process one row at a time (small transactions) so a single bad row
// doesn't block the entire batch. The result tells the caller how many
// dispatches were affected and whether any failed.
//
// V1.5+: when a dispatch times out, we should re-route to the next-best
// partner. For V1 we just mark it timed out and let admin handle manually.

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'

export interface AutoCancelResult {
  scanned: number
  cancelled: number
  failed: number
  failures: Array<{ dispatchId: string; error: string }>
}

export async function runAutoCancel(): Promise<AutoCancelResult> {
  const now = new Date()
  const candidates = await prisma.orderDispatch.findMany({
    where: {
      status: 'PENDING_ACCEPT',
      acceptDeadlineAt: { lt: now },
    },
    select: { id: true, orderId: true, acceptDeadlineAt: true, partnerServiceId: true },
    take: 200, // safety cap; if there's ever a backlog larger than this, alert
  })

  const result: AutoCancelResult = {
    scanned: candidates.length,
    cancelled: 0,
    failed: 0,
    failures: [],
  }

  for (const d of candidates) {
    try {
      // Concurrency guard: re-check status inside the update so we don't
      // flip a row a partner accepted between findMany and update.
      const update = await prisma.orderDispatch.updateMany({
        where: { id: d.id, status: 'PENDING_ACCEPT' },
        data: { status: 'TIMED_OUT' },
      })
      if (update.count === 0) {
        // A partner accepted in the gap. Not a failure.
        continue
      }

      await logSystemAudit({
        entityType: 'OrderDispatch',
        entityId: d.id,
        action: 'DISPATCH_AUTO_CANCEL',
        fromValue: 'PENDING_ACCEPT',
        toValue: 'TIMED_OUT',
        payload: {
          orderId: d.orderId,
          partnerServiceId: d.partnerServiceId,
          acceptDeadlineAt: d.acceptDeadlineAt?.toISOString() ?? null,
          cancelledAt: now.toISOString(),
        },
      })

      result.cancelled++
    } catch (err) {
      result.failed++
      result.failures.push({
        dispatchId: d.id,
        error: (err as Error).message,
      })
    }
  }

  return result
}
