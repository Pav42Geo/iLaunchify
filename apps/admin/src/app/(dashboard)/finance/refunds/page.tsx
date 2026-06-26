// Admin → Settings → Finance → Refunds (docs/BILLING_AND_ACCOUNTING.md §4).
//
// Platform-wide, read-only ledger of refund RECORDS — distinct from the Inbox
// action queues (Refund requests / Cancellation requests / Disputes), which is
// where refunds are proposed/approved. This is the money/reporting lens. Gated on
// `refunds:approve`; actual refund execution stays behind refunds:execute +
// STRIPE_REFUNDS_ENABLED. v2 admin surface.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Refunds — Admin' }

type StatusTab = 'all' | 'SUCCEEDED' | 'PENDING' | 'FAILED'
type SortKey = 'date' | 'amount'

const TABS: StatusTab[] = ['all', 'SUCCEEDED', 'PENDING', 'FAILED']
const TAB_LABEL: Record<StatusTab, string> = {
  all: 'All',
  SUCCEEDED: 'Refunded',
  PENDING: 'Pending',
  FAILED: 'Failed',
}
const STATUS_PILL: Record<string, string> = {
  SUCCEEDED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  FAILED: 'border-red-200 bg-red-50 text-red-700',
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function FinanceRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>
}) {
  await requireCapability('refunds:approve')
  const sp = await searchParams
  const tab: StatusTab = (TABS as string[]).includes(sp.tab ?? '') ? (sp.tab as StatusTab) : 'all'
  const sort: SortKey = sp.sort === 'amount' ? 'amount' : 'date'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const refunds = await prisma.refund.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      order: { select: { id: true, brand: { select: { name: true } } } },
      initiatedByUser: { select: { email: true } },
    },
  })

  const sumBy = (st: string) =>
    refunds.filter((r) => r.status === st).reduce((a, r) => a + r.amountCents, 0)
  const refundedCents = sumBy('SUCCEEDED')
  const pendingCents = sumBy('PENDING')
  const failedCount = refunds.filter((r) => r.status === 'FAILED').length

  const countFor = (st: StatusTab) =>
    st === 'all' ? refunds.length : refunds.filter((r) => r.status === st).length

  const visible = (tab === 'all' ? refunds : refunds.filter((r) => r.status === tab)).slice()
  visible.sort((a, b) => {
    const flip = dir === 'asc' ? 1 : -1
    if (sort === 'amount') return (a.amountCents - b.amountCents) * flip
    return (a.createdAt.getTime() - b.createdAt.getTime()) * flip
  })

  function sortHref(k: SortKey) {
    const nextDir = sort === k && dir === 'desc' ? 'asc' : 'desc'
    const q = new URLSearchParams()
    if (tab !== 'all') q.set('tab', tab)
    q.set('sort', k)
    q.set('dir', nextDir)
    return `/finance/refunds?${q.toString()}`
  }
  function tabHref(t: StatusTab) {
    const q = new URLSearchParams()
    if (t !== 'all') q.set('tab', t)
    if (sort !== 'date') q.set('sort', sort)
    if (dir !== 'desc') q.set('dir', dir)
    const s = q.toString()
    return s ? `/finance/refunds?${s}` : '/finance/refunds'
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Finance"
        title="Refunds"
        description="Read-only ledger of refund records. To approve or action a refund, use the Inbox (Refund requests / Cancellation requests / Disputes). Execution runs through Stripe."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Refunded (recent)" value={fmtCents(refundedCents)} tone="pink" />
        <Kpi label="Pending" value={fmtCents(pendingCents)} tone={pendingCents > 0 ? 'amber' : 'ink'} />
        <Kpi label="Failed" value={String(failedCount)} tone={failedCount > 0 ? 'red' : 'ink'} />
        <Kpi label="Records" value={String(refunds.length)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const c = countFor(t)
          if (t !== 'all' && c === 0 && tab !== t) return null
          return (
            <Link
              key={t}
              href={tabHref(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                tab === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
              }`}
            >
              {TAB_LABEL[t]}
              <span className={`tabular-nums ${tab === t ? 'text-white/70' : 'text-ink-400'}`}>{c}</span>
            </Link>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Refund records
          </h2>
        </header>
        {refunds.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            No refunds yet. Records will appear here when refunds are issued.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">
                    <Link href={sortHref('date')} className="hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                      Date {sort === 'date' ? (dir === 'desc' ? '↓' : '↑') : ''}
                    </Link>
                  </th>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Brand</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Initiated by</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    <Link href={sortHref('amount')} className="hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                      Amount {sort === 'amount' ? (dir === 'desc' ? '↓' : '↑') : ''}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[12px] text-ink-500">
                      Nothing in “{TAB_LABEL[tab]}”.
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const pill = STATUS_PILL[r.status] ?? 'border-ink-200 bg-ink-100 text-ink-600'
                  return (
                    <tr key={r.id} className="hover:bg-ink-50/40">
                      <td className="px-4 py-2.5 text-ink-700">{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/orders/${r.orderId}`} className="font-mono text-[11.5px] text-pink-700 hover:text-pink-800">
                          #{r.orderId.slice(-8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink-900">{r.order?.brand?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-ink-600">{r.reason.toLowerCase().replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 text-ink-600">{r.initiatedByUser?.email ?? 'System'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill}`}>
                          {r.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink-900">
                        {fmtCents(r.amountCents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[12px] text-ink-500">
        Showing the {refunds.length} most recent refund records.
      </p>
    </div>
  )
}

function Kpi({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'pink' | 'amber' | 'red' }) {
  const toneCls = { ink: 'text-ink-900', pink: 'text-pink-700', amber: 'text-amber-700', red: 'text-red-700' }[tone]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
