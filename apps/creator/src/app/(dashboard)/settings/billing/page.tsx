// Creator → Settings → Billing details (docs/BILLING_AND_ACCOUNTING.md slice 1).
// Canva-style invoice/tax contact surface. Payment-method + invoices come in
// later slices (Stripe Elements / invoice mirror).

import { requireUser } from '@ilaunchify/auth'
import { getBillingProfile } from '@ilaunchify/db'
import { BillingDetailsForm } from '@ilaunchify/ui'
import { saveBillingDetails } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing — iLaunchify' }

export default async function CreatorBillingPage() {
  const user = await requireUser()
  const profile = await getBillingProfile(user.id)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Creator · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Billing
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Manage the contact and tax details that appear on your invoices.
        </p>
      </div>

      <BillingDetailsForm initial={profile} action={saveBillingDetails} />
    </div>
  )
}
