// Creator notification preferences — group × channel matrix + quiet hours
// (docs/EMAIL_NOTIFICATION_CENTER.md). Replaced the legacy per-event list
// 2026-07-05: users opt out of notification GROUPS, matching the one-click
// unsubscribe in every email footer.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getPreferenceMatrixView } from '@ilaunchify/notifications'
import { CategoryPreferencesForm } from './CategoryPreferencesForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences' }

export default async function NotificationPreferencesPage() {
  const user = await requireUser()
  const [{ categories, cells }, userRow] = await Promise.all([
    getPreferenceMatrixView(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { quietHoursStartUtc: true, quietHoursEndUtc: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <Link
        href="/notifications"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to notifications
      </Link>

      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Settings · Notifications
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Notification preferences
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Notifications are grouped — turning a group off silences every event in it, on that
          channel. Unsubscribing from an email's footer does the same thing for its group. Required
          groups (account, billing, cancellation outcomes) can't be turned off.
        </p>
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-base font-semibold text-ink-900">Quiet hours (email)</h2>
        <p className="mt-1 text-[13px] text-ink-600">
          Times are in UTC. Emails skipped during this window aren’t re-sent later — you’ll still
          see them in your bell.
        </p>
        <div className="mt-4">
          <CategoryPreferencesForm
            categories={categories}
            cells={cells}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </div>
      </section>
    </div>
  )
}
