// Creator notification preferences — per-event IN_APP/EMAIL toggles + quiet hours.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { getEffectivePreferences } from '@ilaunchify/notifications'
import { PreferencesForm, type EventDef } from './PreferencesForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences' }

// Some of these events (CREATOR_ORDER_CANCELLED, CREATOR_ORDER_DISPUTE_RESOLVED,
// SUPPORT_TICKET_*) are additive on the NotificationEvent enum and only land on
// the generated client after the pending db push. Cast the literals so the list
// compiles now; they become togglable once the migration runs (same migration
// the support feature needs). Drop the cast post-generate.
const evt = (s: string): NotificationEvent => s as NotificationEvent

const CREATOR_EVENTS: EventDef[] = [
  { value: evt('CREATOR_ORDER_FULLY_ACCEPTED'), label: 'Production starting', help: 'All partners accepted your order — production is beginning.' },
  { value: evt('CREATOR_DISPATCH_ACCEPTED'), label: 'Partner accepted', help: 'A partner accepted one of your order’s dispatches.' },
  { value: evt('CREATOR_DISPATCH_CHANGES_REQUESTED'), label: 'Changes requested', help: 'A partner asked for changes before they can proceed.' },
  { value: evt('CREATOR_DISPATCH_DECLINED'), label: 'Partner declined', help: 'A partner declined; we’re rerouting where possible.' },
  { value: evt('CREATOR_DISPATCH_WITHDRAWN'), label: 'Partner withdrew', help: 'A partner withdrew after previously accepting.' },
  { value: evt('CREATOR_ORDER_CANCELLED_BY_MANUFACTURER'), label: 'Order cancelled (manufacturer)', help: 'The manufacturer rejected the order, so it was cancelled.' },
  { value: evt('CREATOR_ORDER_CANCELLED'), label: 'Order cancelled', help: 'Your order was cancelled (e.g. an approved cancellation request).' },
  { value: evt('CREATOR_ORDER_DISPUTE_RESOLVED'), label: 'Dispute resolved', help: 'We resolved a dispute you opened on an order.' },
  { value: evt('SUPPORT_TICKET_REPLIED'), label: 'Support replied', help: 'Our team replied to one of your support tickets.' },
  { value: evt('SUPPORT_TICKET_RESOLVED'), label: 'Support ticket resolved', help: 'A support ticket you filed was marked resolved.' },
]

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
      <Link
        href="/notifications"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to notifications
      </Link>

      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Settings · Notifications
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Notification preferences
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Choose which notifications you receive and on which channel. Quiet hours apply to email
          only — in-app notifications always appear in your bell.
        </p>
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-base font-semibold text-ink-900">Quiet hours (email)</h2>
        <p className="mt-1 text-[13px] text-ink-600">
          Times are in UTC. Emails skipped during this window aren’t re-sent later — you’ll still
          see them in your bell.
        </p>
        <div className="mt-4">
          <PreferencesForm
            preferences={prefs}
            events={CREATOR_EVENTS}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </div>
      </section>
    </div>
  )
}
