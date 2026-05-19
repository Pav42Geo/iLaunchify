// Partner-facing Payments page.
// Earnings KPI tiles + payouts list + refunds/clawbacks list. All read-only.
// Data sources:
//   - Earnings = sum of Transfer.amountCents WHERE destinationUserId = user.id
//                AND status in (PENDING, IN_TRANSIT, PAID)
//   - Payouts = same rows, listed
//   - Refunds/clawbacks = PartnerClawback rows
//
// Stripe Connect Express handles the actual money movement; this page is the
// partner's view of "what's owed / paid to me by iLaunchify."

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { DollarSign, ArrowDownToLine, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payments — Partner' }

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default async function PaymentsPage() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return null

  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return null

  // 30-day window
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Pull all transfers + clawbacks in parallel
  const [transfers, clawbacks, transfers30d] = await Promise.all([
    prisma.transfer.findMany({
      where: { destinationUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        charge: { select: { orderId: true } },
      },
    }),
    prisma.partnerClawback.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { refund: true, dispute: true },
    }),
    prisma.transfer.findMany({
      where: {
        destinationUserId: user.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { amountCents: true, status: true },
    }),
  ])

  // KPIs
  const lifetimeEarnedCents = transfers
    .filter((t) => t.status !== 'CANCELED')
    .reduce((acc, t) => acc + t.amountCents, 0)
  const earned30dCents = transfers30d
    .filter((t) => t.status !== 'CANCELED')
    .reduce((acc, t) => acc + t.amountCents, 0)
  const pendingCents = transfers
    .filter((t) => t.status === 'PENDING')
    .reduce((acc, t) => acc + t.amountCents, 0)
  const clawedBackCents = clawbacks.reduce((acc, c) => acc + c.amountCents, 0)

  const stripeConnected =
    user.role === 'PARTNER' &&
    (await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeAccountId: true, stripeAccountStatus: true },
    }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your earnings, payouts, and refund debits. Money moves through Stripe Connect.
        </p>
      </div>

      {(!stripeConnected?.stripeAccountId || stripeConnected.stripeAccountStatus !== 'ACTIVE') && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Stripe Connect not active</CardTitle>
            <CardDescription className="text-amber-800">
              You won&apos;t receive payouts until your Stripe Connect account is fully onboarded.
              Status: <span className="font-medium">{stripeConnected?.stripeAccountStatus ?? 'NONE'}</span>.
              Finish onboarding in Settings.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard label="Earned (30 days)" value={fmtCents(earned30dCents)} icon={DollarSign} />
        <KpiCard label="Lifetime earned" value={fmtCents(lifetimeEarnedCents)} icon={DollarSign} />
        <KpiCard label="Pending payout" value={fmtCents(pendingCents)} icon={ArrowDownToLine} />
        <KpiCard label="Clawbacks (refunds)" value={fmtCents(clawedBackCents)} icon={AlertCircle} tone={clawedBackCents > 0 ? 'warn' : 'neutral'} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Payouts</h2>
        <Card className="overflow-hidden">
          {transfers.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              No payouts yet. They&apos;ll appear here as you ship dispatches.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      #{t.charge.orderId.slice(-8)}
                    </td>
                    <td className="px-4 py-3 text-xs uppercase text-zinc-500">
                      {t.reason.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3">
                      <TransferStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{fmtCents(t.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Refund debits
        </h2>
        <Card className="overflow-hidden">
          {clawbacks.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No refund clawbacks.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {clawbacks.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{c.reason}</td>
                    <td className="px-4 py-3 text-xs uppercase text-zinc-600">{c.status}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-700">
                      −{fmtCents(c.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  icon: typeof DollarSign
  tone?: 'neutral' | 'warn'
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {label}
            </div>
            <div
              className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'}`}
            >
              {value}
            </div>
          </div>
          <Icon
            className={`h-8 w-8 ${tone === 'warn' ? 'text-amber-400' : 'text-zinc-300'}`}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TransferStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'PAID'
      ? 'bg-green-50 text-green-700'
      : status === 'PENDING'
      ? 'bg-amber-50 text-amber-700'
      : status === 'IN_TRANSIT'
      ? 'bg-blue-50 text-blue-700'
      : status === 'FAILED' || status === 'CANCELED'
      ? 'bg-red-50 text-red-700'
      : 'bg-zinc-100 text-zinc-700'
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${cls}`}>
      {status.toLowerCase()}
    </span>
  )
}
