// Accept-window reminder — warns a partner before their dispatch acceptance deadline
// passes (the dispatch otherwise TIMES_OUT via runAutoCancel). Cron-driven, mirrors
// runAutoCancel. Dedupe via OrderDispatch.acceptReminderSentAt so a partner is reminded
// at most once per dispatch.
//
// This stamps the reminder + returns who to notify; the cron route owns dispatching
// (keeps @ilaunchify/notifications out of this lower-level package). `acceptReminderSentAt`
// ships with a pending migration → the orderDispatch access is cast-guarded until it lands.

import { prisma } from '@ilaunchify/db'

/** Default lead time: remind when this many hours (or fewer) remain. Admin-tunable later. */
export const ACCEPT_REMINDER_LEAD_HOURS = 6

export interface AcceptReminder {
  userId: string
  dispatchId: string
  hoursRemaining: number
}

export interface AcceptReminderResult {
  scanned: number
  reminders: AcceptReminder[]
}

interface ReminderDispatch {
  id: string
  acceptDeadlineAt: Date
  partnerService: { partner: { userId: string } | null } | null
}

export async function runAcceptReminders(
  leadHours: number = ACCEPT_REMINDER_LEAD_HOURS,
): Promise<AcceptReminderResult> {
  const now = new Date()
  const cutoff = new Date(now.getTime() + leadHours * 60 * 60 * 1000)

  const dispatchModel = prisma as unknown as {
    orderDispatch: {
      findMany: (a: unknown) => Promise<ReminderDispatch[]>
      updateMany: (a: unknown) => Promise<{ count: number }>
    }
  }

  // PENDING_ACCEPT, not in a delay-proposal, deadline still in the future but within the
  // lead window, and not yet reminded.
  const candidates = await dispatchModel.orderDispatch.findMany({
    where: {
      status: 'PENDING_ACCEPT',
      delayProposedAt: null,
      acceptReminderSentAt: null,
      acceptDeadlineAt: { gt: now, lte: cutoff },
    },
    select: {
      id: true,
      acceptDeadlineAt: true,
      partnerService: { select: { partner: { select: { userId: true } } } },
    },
    take: 200,
  })

  const reminders: AcceptReminder[] = []
  for (const d of candidates) {
    // Stamp first (guarded on still-null) so a concurrent cron run can't double-send.
    const stamp = await dispatchModel.orderDispatch.updateMany({
      where: { id: d.id, acceptReminderSentAt: null, status: 'PENDING_ACCEPT' },
      data: { acceptReminderSentAt: now },
    })
    if (stamp.count === 0) continue // another run claimed it, or it was accepted

    const userId = d.partnerService?.partner?.userId
    if (!userId) continue

    const hoursRemaining = Math.max(
      1,
      Math.ceil((d.acceptDeadlineAt.getTime() - now.getTime()) / (60 * 60 * 1000)),
    )
    reminders.push({ userId, dispatchId: d.id, hoursRemaining })
  }

  return { scanned: candidates.length, reminders }
}
