import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getEffectivePreferences } from '@ilaunchify/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { PreferencesForm } from './PreferencesForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences — Admin' }

// Admin-relevant events only — partners get partner-specific ones in their own UI.
const ADMIN_EVENTS = [
  { value: 'PARTNER_APPLIED', label: 'New partner application', help: 'Someone submitted the public apply form.' },
  { value: 'PARTNER_SUBMITTED', label: 'Partner ready for review', help: 'Partner finished onboarding and submitted for verification.' },
  { value: 'ORDER_NEEDS_ATTENTION', label: 'Order needs attention', help: 'An order moved to ON_HOLD / DISPUTED / EXCEPTION.' },
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
          Choose which admin notifications you receive and on which channel. Quiet hours
          apply to email only — in-app notifications always appear in your bell.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours (email)</CardTitle>
          <CardDescription>Times are in UTC.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            preferences={prefs}
            events={[...ADMIN_EVENTS]}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
