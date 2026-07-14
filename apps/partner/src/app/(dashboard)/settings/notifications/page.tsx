// Partner notification preferences — group × channel matrix + quiet hours
// (docs/EMAIL_NOTIFICATION_CENTER.md). Replaced the legacy per-event list
// 2026-07-05: partners opt out of notification GROUPS, matching the one-click
// unsubscribe in every email footer.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getPreferenceMatrixView } from '@ilaunchify/notifications'
import { PanelCard } from '@/components/panel-kit'
import { CategoryPreferencesForm } from './CategoryPreferencesForm'
import { serviceOwnedBy } from '@/lib/partner-context'
import { PageTabs } from '@/components/PageTabs'

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
      <PageTabs group="preferences" />
      {/* Slim header — prototype panel chrome, no hero (Pavel 2026-07-13) */}
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Notification preferences
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          Notifications are grouped — turning a group off silences every event in it, on that
          channel. Unsubscribing from an email&apos;s footer does the same thing for its group.
          Required groups (account, billing, cancellation outcomes) can&apos;t be turned off.
        </p>
      </div>

      <PanelCard>
        <CategoryPreferencesForm
          categories={categories}
          cells={cells}
          quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
          quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
        />
      </PanelCard>
    </div>
  )
}
