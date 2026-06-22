// Admin → Settings → Finance → Invoices (docs/BILLING_AND_ACCOUNTING.md §4).
//
// Platform-wide, read-only view of what creators were billed — every production
// Order + its Charge. `billing:read`-gated. v2 admin surface. Distinct from the
// Orders surface (fulfillment): this is the financial/invoice lens.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invoices — Admin' }

type StatusTab = 'all' | 'paid' | 'unpaid' | 'refunded'
type SortKey = 'date' | 'amount'

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'refunded', label: 'Refunded' },
]

// Order status → billing bucket + pill.
function billingBucket(status: string): { tab: Exclude<StatusTab, 'all'>; label: string; cls: string } {
  if (status === 'REFUNDED') return { tab: 'refunded', label: 'Refunded', cls: 'border-ink-200 bg-ink-100 text-ink-600' }
  if (status === 'PENDING_PAYMENT') return { tab: 'unpaid', label: 'Unpaid', cls: 'border-amber-200 bg-amber-50 text-amber-800' }
  if (status === 'CANCELLED') return { tab: 'unpaid', label: 'Cancelled', cls: 'border-ink-200 bg-ink-100 text-ink-500' }
  return { tab: 'paid', label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function FinanceInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>
}) {
  await requireCapability('billing:read')
  const sp = await searchParams
  const tab: StatusTab = (TABS.map((t) => t.key) as string[]).includes(sp.tab ?? '')
    ? (sp.tab as StatusTab)
    : 'all'
  const sort: SortKey = sp.sort === 'amount' ? 'amount' : 'date'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      status: true,
      orderType: true,
      totalCents: true,
      createdAt: true,
      paidAt: true,
      brand: { select: { name: true } },
      creator: { select: { email: true } },
      charge: { select: { id: true } },
    },
  })

  const rows = orders.map((o) => ({ ...o, bucket: billingBucket(o.status) }))
  const paidCents = rows.filter((r) => r.bucket.tab === 'paid').reduce((a, r) => a + r.totalCents, 0)
  const unpaidCount = rows.filter((r) => r.bucket.tab === 'unpaid').length
  const refundedCents = rows.filter((r) => r.bucket.tab === 'refunded').reduce((a, r) => a + r.totalCents, 0)

  const countFor = (t: StatusTab) => (t === 'all' ? rows.length : rows.filter((r) => r.bucket.tab === t).length)

  const visible = (tab === 'all' ? rows : rows.filter((r) => r.bucket.tab === tab)).slice()
  visible.sort((a, b) => {
    const flip = dir === 'asc' ? 1 : -1
    if (sort === 'amount') return (a.totalCents - b.totalCents) * flip
    return (a.createdAt.getTime() - b.createdAt.getTime()) * flip
  })

  function sortHref(k: SortKey) {
    const nextDir = sort === k && dir === 'desc' ? 'asc' : 'desc'
    const q = new URLSearchParams()
    if (tab !== 'all') q.set('tab', tab)
    q.set('sort', k)
    q.set('dir', nextDir)
    return `/finance/invoices?${q.toString()}`
  }
  function tabHref(t: StatusTab) {
    const q = new URLSearchParams()
    if (t !== 'all') q.set('tab', t)
    if (sort !== 'date') q.set('sort', sort)
    if (dir !== 'desc') q.set('dir', dir)
    const s = q.toString()
    return s ? `/finance/invoices?${s}` : '/finance/invoices'
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-7 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">Finance</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Invoices
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          What creators were billed for production — every order and its charge. Read-only;
          receipts are hosted by Stripe.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Billed · paid (recent)" value={fmtCents(paidCents)} tone="pink" />
          <Kpi label="Unpaid / cancelled" value={String(unpaidCount)} tone={unpaidCount > 0 ? 'amber' : 'ink'} />
          <Kpi label="Refunded" value={fmtCents(refundedCents)} />
          <Kpi label="Invoices" value={String(rows.length)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, label }) => {
          const c = countFor(key)
          if (key !== 'all' && c === 0 && tab !== key) return null
          return (
            <Link
              key={key}
              href={tabHref(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                tab === key ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
              }`}
            >
              {label}
              <span className={`tabular-nums ${tab === key ? 'text-white/70' : 'text-ink-400'}`}>{c}</span>
            </Link>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[#F3EFE8] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Creator invoices
          </h2>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            No invoices yet. Production orders will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5 font-semibold">
                    <Link href={sortHref('date')} className="hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                      Date {sort === 'date' ? (dir === 'desc' ? '↓' : '↑') : ''}
                    </Link>
                  </th>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Brand</th>
                  <th className="px-4 py-2.5 font-semibold">Creator</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    <Link href={sortHref('amount')} className="hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                      Total {sort === 'amount' ? (dir === 'desc' ? '↓' : '↑') : ''}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-ink-500">
                      Nothing here.
                    </td>
                  </tr>
                )}
                {visible.map((o) => (
                  <tr key={o.id} className="hover:bg-ink-50/40">
                    <td className="px-4 py-2.5 text-ink-700">{fmtDate(o.paidAt ?? o.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/orders/${o.id}`} className="font-mono text-[11.5px] text-pink-700 hover:text-pink-800">
                        {o.orderType === 'SAMPLE' ? 'S' : ''}#{o.id.slice(-8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{o.brand?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-600">{o.creator?.email ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${o.bucket.cls}`}>
                        {o.bucket.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink-900">{fmtCents(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[12px] text-ink-500">Showing the {rows.length} most recent invoices.</p>
    </div>
  )
}

function Kpi({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'pink' | 'amber' | 'red' }) {
  const toneCls = { ink: 'text-ink-900', pink: 'text-pink-700', amber: 'text-amber-700', red: 'text-red-700' }[tone]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
