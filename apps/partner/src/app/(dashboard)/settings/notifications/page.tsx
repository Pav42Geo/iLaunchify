// Per-event, per-channel notification preference editor + quiet hours.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getEffectivePreferences } from '@ilaunchify/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { PreferencesForm } from './PreferencesForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences — Partner' }

const PARTNER_EVENTS = [
  { value: 'SECTION_VERIFIED', label: 'Verification section approved', help: 'An admin approves one of your application sections.' },
  { value: 'SECTION_NEEDS_CHANGES', label: 'Section needs changes', help: 'An admin asks you to update a section.' },
  { value: 'PARTNER_ACTIVATED', label: 'Account activated', help: 'Your partner account is fully approved.' },
  { value: 'DISPATCH_RECEIVED', label: 'New dispatch received', help: 'A creator order is routed to you and awaits acceptance.' },
  { value: 'DISPATCH_ACCEPT_REMINDER', label: 'Accept deadline reminder', help: 'A pending dispatch is close to its accept deadline.' },
] as const

export default async function NotificationPreferencesPage() {
  const user = await requireUser()
  const [prefs, userRow] = await Promise.all([
    getEffectivePreferences(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { quietHoursStartUtc: true, quietHoursEndUtc: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notification preferences</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Choose which notifications you receive and on which channel. Quiet hours apply to
          email only — in-app notifications always appear in your bell.
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
          <PreferencesForm
            preferences={prefs}
            events={[...PARTNER_EVENTS]}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
