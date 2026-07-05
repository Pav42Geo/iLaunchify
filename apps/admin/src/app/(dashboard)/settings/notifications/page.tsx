// Admin PERSONAL notification preferences — group × channel matrix + quiet
// hours (docs/EMAIL_NOTIFICATION_CENTER.md). Replaced the legacy 3-event list
// 2026-07-05. Platform-wide template/branding/deliverability control lives in
// the sidebar under Settings → Notifications (the Center), not here.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getPreferenceMatrixView } from '@ilaunchify/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { CategoryPreferencesForm } from './CategoryPreferencesForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences — Admin' }

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
      <div>
        <h1 className="text-ui-title">Notification preferences</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Your personal notification groups and quiet hours. Looking for the platform email
          templates, branding, or deliverability? That&apos;s the{' '}
          <Link href="/notifications-center/templates" className="font-medium text-pink-700 underline underline-offset-2">
            Notification Center
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours (email)</CardTitle>
          <CardDescription>Times are in UTC.</CardDescription>
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
