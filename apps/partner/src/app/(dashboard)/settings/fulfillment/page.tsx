// FC settings — receiving spec + blackout dates (Partner Role Accounts P1,
// docs/PARTNER_ROLE_ACCOUNTS.md §3.1.E). WAREHOUSE services only; one editor
// per service (multi-facility partners see one card each).

import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser, requirePartnerAdminAccess } from '@ilaunchify/auth'
import { FulfillmentSettingsForm, type BlackoutRow } from './FulfillmentSettingsForm'
import type { ReceivingSpecInput } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fulfillment settings — Partners' }

export default async function FulfillmentSettingsPage() {
  const user = await requireUser()
  // P3 §2: facility config is org-admin only.
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) redirect('/settings')
  // P2 — blackout windows apply to every service; the receiving-spec editor
  // renders only for WAREHOUSE services (the form hides it otherwise).
  const services = await prisma.partnerService.findMany({
    where: { partnerId: access.partnerId },
    orderBy: { type: 'asc' },
    select: {
      id: true,
      type: true,
      receivingSpecJson: true,
      blackoutDates: {
        where: { endsOn: { gte: new Date() } },
        orderBy: { startsOn: 'asc' },
        select: { id: true, startsOn: true, endsOn: true, reason: true },
      },
    },
  })
  if (services.length === 0) redirect('/settings')

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Fulfillment Center · Settings · Facility
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Receiving & availability
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your receiving requirements travel with every inbound dispatch; blackout windows pause
          new routing to your facility.
        </p>
      </div>

      {services.map((s) => {
        const spec =
          typeof s.receivingSpecJson === 'object' && s.receivingSpecJson !== null && !Array.isArray(s.receivingSpecJson)
            ? (s.receivingSpecJson as Partial<ReceivingSpecInput>)
            : {}
        const blackouts: BlackoutRow[] = s.blackoutDates.map((b) => ({
          id: b.id,
          startsOn: b.startsOn.toISOString(),
          endsOn: b.endsOn.toISOString(),
          reason: b.reason,
        }))
        return (
          <FulfillmentSettingsForm
            key={s.id}
            serviceId={s.id}
            serviceType={s.type as string}
            initialSpec={spec}
            blackouts={blackouts}
          />
        )
      })}
    </div>
  )
}
