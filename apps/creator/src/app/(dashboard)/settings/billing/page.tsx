// Creator → Settings → Billing (docs/BILLING_AND_ACCOUNTING.md slices 1–2).
// Canva-style surface: payment method (Stripe-hosted) + invoice/tax contact details.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { getBillingProfile, listPaymentMethodRefs } from '@ilaunchify/db'
import { isStripeConfigured } from '@ilaunchify/payments'
import { BillingDetailsForm } from '@ilaunchify/ui'
import { saveBillingDetails } from './actions'
import { PaymentMethodSection } from './PaymentMethodSection'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing — iLaunchify' }

export default async function CreatorBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ pm?: string }>
}) {
  const { pm } = await searchParams
  const user = await requireUser()
  const [profile, cards] = await Promise.all([
    getBillingProfile(user.id),
    listPaymentMethodRefs(user.id),
  ])

  const banner =
    pm === 'added'
      ? { tone: 'good' as const, text: 'Payment method saved.' }
      : pm === 'cancelled'
        ? { tone: 'neutral' as const, text: 'Adding a payment method was cancelled.' }
        : pm === 'error'
          ? { tone: 'error' as const, text: 'We couldn’t save that payment method. Please try again.' }
          : null

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Billing
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Manage your payment method and the contact and tax details that appear on your invoices.
        </p>
        <Link
          href="/settings/billing/invoices"
          className="mt-3 inline-block text-[13px] font-semibold text-pink-700 hover:text-pink-800"
        >
          View orders &amp; invoices →
        </Link>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] ${
            banner.tone === 'good'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : banner.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-ink-200 bg-ink-50 text-ink-700'
          }`}
        >
          {banner.text}
        </div>
      )}

      <PaymentMethodSection cards={cards} configured={isStripeConfigured()} />

      <BillingDetailsForm initial={profile} action={saveBillingDetails} />
    </div>
  )
}
