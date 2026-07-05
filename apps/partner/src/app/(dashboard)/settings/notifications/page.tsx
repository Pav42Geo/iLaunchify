// Partner notification preferences — group × channel matrix + quiet hours
// (docs/EMAIL_NOTIFICATION_CENTER.md). Replaced the legacy per-event list
// 2026-07-05: partners opt out of notification GROUPS, matching the one-click
// unsubscribe in every email footer.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getPreferenceMatrixView } from '@ilaunchify/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { CategoryPreferencesForm } from './CategoryPreferencesForm'
import { rolePrefix } from '@/lib/role-skins'
import { serviceOwnedBy } from '@/lib/partner-context'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences — Partner' }

export default async function NotificationPreferencesPage() {
  const user = await requireUser()
  const [{ categories, cells }, userRow, services] = await Promise.all([
    getPreferenceMatrixView(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { quietHoursStartUtc: true, quietHoursEndUtc: true },
    }),
    prisma.partnerService.findMany({
      where: { AND: [serviceOwnedBy(user.id)] },
      select: { type: true },
    }),
  ])
  const serviceTypes = services.map((s) => s.type as string)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          {rolePrefix(serviceTypes)} · Settings · Notifications
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Notification preferences
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Notifications are grouped — turning a group off silences every event in it, on that
          channel. Unsubscribing from an email&apos;s footer does the same thing for its group.
          Required groups (account, billing, cancellation outcomes) can&apos;t be turned off.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours (email)</CardTitle>
          <CardDescription>
            Times are in UTC. Emails skipped during this window won&apos;t be re-sent later
            (you&apos;ll see them in the bell when you check next).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryPreferencesForm
            categories={categories}
            cells={cells}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
