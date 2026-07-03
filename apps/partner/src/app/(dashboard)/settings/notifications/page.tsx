// Per-event, per-channel notification preference editor + quiet hours.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { getEffectivePreferences } from '@ilaunchify/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { PreferencesForm } from './PreferencesForm'
import { rolePrefix } from '@/lib/role-skins'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification preferences — Partner' }

const PARTNER_EVENTS = [
  { value: 'SECTION_VERIFIED', label: 'Verification section approved', help: 'An admin approves one of your application sections.' },
  { value: 'SECTION_NEEDS_CHANGES', label: 'Section needs changes', help: 'An admin asks you to update a section.' },
  { value: 'PARTNER_ACTIVATED', label: 'Account activated', help: 'Your partner account is fully approved.' },
  { value: 'DISPATCH_RECEIVED', label: 'New dispatch received', help: 'A creator order is routed to you and awaits acceptance.' },
  { value: 'DISPATCH_ACCEPT_REMINDER', label: 'Accept deadline reminder', help: 'A pending dispatch is close to its accept deadline.' },
  { value: 'DISPATCH_SLA_AT_RISK', label: 'Acceptance at risk', help: 'A pending dispatch has consumed half its acceptance window.' },
  { value: 'DOC_EXPIRING_SOON', label: 'Document expiring soon', help: 'A compliance document (COI, certificate) is inside its renewal window.' },
  { value: 'DOC_EXPIRED', label: 'Document expired', help: 'A lapsed document paused the capability it backs.' },
] as const

// FC (WAREHOUSE service) events — appended only for partners who receive
// inbound shipments (docs/PARTNER_ROLE_ACCOUNTS.md §6.2).
const FC_EVENTS = [
  { value: 'INBOUND_DELIVERED_UNCONFIRMED', label: 'Inbound awaiting confirmation', help: 'A delivered shipment has not been received into your facility yet.' },
  { value: 'RECEIVING_DISCREPANCY_OPENED', label: 'Receiving discrepancy filed', help: 'A short/over/damaged report was filed on an inbound shipment.' },
  { value: 'RECEIVING_DISCREPANCY_RESOLVED', label: 'Receiving discrepancy resolved', help: 'iLaunchify resolved a receiving discrepancy on one of your receipts.' },
] as const

export default async function NotificationPreferencesPage() {
  const user = await requireUser()
  const [prefs, userRow, services] = await Promise.all([
    getEffectivePreferences(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { quietHoursStartUtc: true, quietHoursEndUtc: true },
    }),
    prisma.partnerService.findMany({
      where: { partner: { userId: user.id } },
      select: { type: true },
    }),
  ])
  const serviceTypes = services.map((s) => s.type as string)
  // Cast until `pnpm db:generate` picks up the P0 NotificationEvent additions
  // (docs/PARTNER_ROLE_ACCOUNTS.md §6.2) — post-regen this is a no-op.
  const events = (
    serviceTypes.includes('WAREHOUSE') ? [...PARTNER_EVENTS, ...FC_EVENTS] : [...PARTNER_EVENTS]
  ) as Array<{ value: NotificationEvent; label: string; help: string }>


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
            events={events}
            quietHoursStartUtc={userRow?.quietHoursStartUtc ?? null}
            quietHoursEndUtc={userRow?.quietHoursEndUtc ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
