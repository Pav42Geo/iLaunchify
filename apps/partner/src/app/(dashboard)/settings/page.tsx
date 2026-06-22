import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return null
  // stripeAccountId lives on User, not the session — query it (same pattern as /payments).
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true },
  })

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Manufacturing · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your account details, payout connection, and notification preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Account</CardTitle>
          <CardDescription>Identity and payout connection for this partner.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100 text-[13px]">
          <Row label="Email" value={user.email} />
          <Row label="Company" value={partner.companyName} />
          <Row
            label="Stripe Connect"
            value={
              userRecord?.stripeAccountId ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                    Connected
                  </span>
                  <span className="font-mono text-[12px] text-ink-500">{userRecord.stripeAccountId}</span>
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-100 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-ink-700">
                  Not connected
                </span>
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Billing</CardTitle>
          <CardDescription>
            Contact and tax details for your invoices. Card and bank numbers are never
            stored here — payouts are managed securely in Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Manage billing details
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Notifications</CardTitle>
          <CardDescription>
            Email when a new dispatch arrives. Tune per-event and per-channel preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/notifications"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Manage notification preferences
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2 py-2.5 first:pt-0 last:pb-0">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</span>
      <span className="text-ink-900">{value || '—'}</span>
    </div>
  )
}
