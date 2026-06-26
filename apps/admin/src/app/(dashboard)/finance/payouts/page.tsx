// Admin → Settings → Finance → Payouts & transfers (docs/BILLING_AND_ACCOUNTING.md §4).
//
// Platform-wide, read-only ledger of every partner payout (Transfer) plus the
// platform-fee reconciliation basis. Gated on `billing:read` (view-only; no money
// is moved here — the Stripe dashboard handles mutations). v2 admin surface:
// cream hero + KPI strip + status filter chips + sortable table.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payouts & transfers — Admin' }

type StatusTab = 'all' | 'COMPLETED' | 'PENDING' | 'FAILED' | 'REVERSED'
type SortKey = 'date' | 'amount'

const TABS: StatusTab[] = ['all', 'COMPLETED', 'PENDING', 'FAILED', 'REVERSED']
const TAB_LABEL: Record<StatusTab, string> = {
  all: 'All',
  COMPLETED: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REVERSED: 'Reversed',
}

const STATUS_PILL: Record<string, string> = {
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  READY: 'border-sky-200 bg-sky-50 text-sky-800',
  EXECUTING: 'border-sky-200 bg-sky-50 text-sky-800',
  FAILED: 'border-red-200 bg-red-50 text-red-700',
  REVERSED: 'border-ink-200 bg-ink-100 text-ink-600',
  CANCELED: 'border-ink-200 bg-ink-100 text-ink-500',
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function FinancePayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>
}) {
  await requireCapability('billing:read')
  const sp = await searchParams
  const tab: StatusTab = (TABS as string[]).includes(sp.tab ?? '') ? (sp.tab as StatusTab) : 'all'
  const sort: SortKey = sp.sort === 'amount' ? 'amount' : 'date'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const [transfers, feeAgg] = await Promise.all([
    prisma.transfer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        charge: { select: { orderId: true } },
        destinationUser: {
          select: { email: true, partner: { select: { companyName: true } } },
        },
      },
    }),
    prisma.charge.aggregate({ _sum: { applicationFeeCents: true } }),
  ])

  const sum = (st: string) =>
    transfers.filter((t) => t.status === st).reduce((a, t) => a + t.amountCents, 0)
  const paidCents = sum('COMPLETED')
  const pendingCents = transfers
    .filter((t) => ['PENDING', 'READY', 'EXECUTING'].includes(t.status))
    .reduce((a, t) => a + t.amountCents, 0)
  const failedCount = transfers.filter((t) => t.status === 'FAILED').length
  const platformFeesCents = feeAgg._sum.applicationFeeCents ?? 0

  const countFor = (st: StatusTab) =>
    st === 'all' ? transfers.length : transfers.filter((t) => t.status === st).length

  const visible = (tab === 'all' ? transfers : transfers.filter((t) => t.status === tab)).slice()
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
    return `/finance/payouts?${q.toString()}`
  }
  function tabHref(t: StatusTab) {
    const q = new URLSearchParams()
    if (t !== 'all') q.set('tab', t)
    if (sort !== 'date') q.set('sort', sort)
    if (dir !== 'desc') q.set('dir', dir)
    const s = q.toString()
    return s ? `/finance/payouts?${s}` : '/finance/payouts'
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Finance
        </p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Payouts &amp; transfers
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Platform-wide partner payout ledger. Read-only — money moves through Stripe Connect;
          use the Stripe dashboard for any adjustment.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Paid out (recent)" value={fmtCents(paidCents)} />
          <Kpi label="Pending payout" value={fmtCents(pendingCents)} tone={pendingCents > 0 ? 'amber' : 'ink'} />
          <Kpi label="Failed transfers" value={String(failedCount)} tone={failedCount > 0 ? 'red' : 'ink'} />
          <Kpi label="Platform fees (lifetime)" value={fmtCents(platformFeesCents)} tone="pink" />
        </div>
      </div>

      {/* Status filter chips */}
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

      {/* Ledger table */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Transfers
          </h2>
        </header>
        {transfers.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            No transfers yet. Partner payouts will appear here as orders ship.
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
                  <th className="px-4 py-2.5 font-semibold">Partner</th>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
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
                    <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-ink-500">
                      Nothing in “{TAB_LABEL[tab]}”.
                    </td>
                  </tr>
                )}
                {visible.map((t) => {
                  const partnerName =
                    t.destinationUser?.partner?.companyName ?? t.destinationUser?.email ?? '—'
                  const pill = STATUS_PILL[t.status] ?? 'border-ink-200 bg-ink-100 text-ink-600'
                  return (
                    <tr key={t.id} className="hover:bg-ink-50/40">
                      <td className="px-4 py-2.5 text-ink-700">{fmtDate(t.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium text-ink-900">{partnerName}</td>
                      <td className="px-4 py-2.5">
                        {t.charge?.orderId ? (
                          <Link
                            href={`/orders/${t.charge.orderId}`}
                            className="font-mono text-[11.5px] text-pink-700 hover:text-pink-800"
                          >
                            #{t.charge.orderId.slice(-8)}
                          </Link>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ink-600">{t.reason.toLowerCase().replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill}`}>
                          {t.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink-900">
                        {fmtCents(t.amountCents)}
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
        Showing the {transfers.length} most recent transfers. Platform fees are the sum of
        application fees withheld at charge time — the reconciliation basis against payouts.
      </p>
    </div>
  )
}

function Kpi({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'pink' | 'amber' | 'red' }) {
  const toneCls = {
    ink: 'text-ink-900',
    pink: 'text-pink-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
