// FC settings — receiving spec + blackout dates (Partner Role Accounts P1,
// docs/PARTNER_ROLE_ACCOUNTS.md §3.1.E). WAREHOUSE services only; one editor
// per service (multi-facility partners see one card each).

import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser, requirePartnerAdminAccess } from '@ilaunchify/auth'
import { FulfillmentSettingsForm, type BlackoutRow } from './FulfillmentSettingsForm'
import type { ReceivingSpecInput } from './actions'
import { PageTabs } from '@/components/PageTabs'

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
    // Prototype #p-fulfillment styling — no page hero (Pavel 2026-07-13);
    // the per-service panel cards open the page directly.
    <div className="space-y-6">
      <PageTabs group="logistics" />
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

      <p className="text-[12px] leading-relaxed text-ink-400">
        Your receiving requirements travel with every inbound dispatch; blackout windows pause new
        routing to your facility for the dates you set. Storage you offer at your own plant is
        configured on your <a href="/services" className="underline">Services</a> page — this page
        is facility receiving &amp; availability.
      </p>
    </div>
  )
}
