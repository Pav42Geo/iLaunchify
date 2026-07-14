// Partner → Settings → Billing details (docs/BILLING_AND_ACCOUNTING.md slice 1).
// Canva-style invoice/tax contact surface. Payout setup lives on the Account /
// Stripe Connect surface; this is the inbound-billing contact data.
// Restyled 2026-07-12 to the settings-hub prototype "Payments & plans" panel
// (panel-kit PanelCard/LRow/StPill/Fieldset) — form + action unchanged.

import { CreditCard, FileText } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma, getBillingProfile } from '@ilaunchify/db'
import { BillingDetailsForm } from '@ilaunchify/ui'
import { Fieldset, LRow, PanelCard, StPill } from '@/components/panel-kit'
import { saveBillingDetails } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing — iLaunchify' }

export default async function PartnerBillingPage() {
  const user = await requireUser()
  const [profile, dbUser] = await Promise.all([
    getBillingProfile(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { stripeAccountId: true } }),
  ])
  const payoutsConnected = Boolean(dbUser?.stripeAccountId)

  return (
    <div className="space-y-6">
      {/* Slim header — prototype panel chrome, no hero (Pavel 2026-07-13) */}
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Billing
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          The contact and tax details that appear on your invoices. Payout bank
          details are managed securely in Stripe — never stored here.
        </p>
      </div>

      <PanelCard>
        <LRow
          className="mb-[18px]"
          icon={<CreditCard />}
          iconClassName={payoutsConnected ? 'bg-success-50 text-success-600' : undefined}
          title="Payouts · Stripe Connect"
          sub={
            payoutsConnected
              ? 'Connected — bank and payout details are managed securely in Stripe.'
              : 'Not connected yet — set up payouts to get paid for dispatches.'
          }
          right={
            <>
              <StPill tone={payoutsConnected ? 'ok' : 'muted'}>
                {payoutsConnected ? 'Connected' : 'Not set up'}
              </StPill>
              <a
                href="/payments"
                className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
              >
                Manage →
              </a>
            </>
          }
        />

        <Fieldset icon={<FileText />} title="Billing details" hint="Shown on your invoices">
          <BillingDetailsForm initial={profile} action={saveBillingDetails} />
        </Fieldset>
      </PanelCard>
    </div>
  )
}
