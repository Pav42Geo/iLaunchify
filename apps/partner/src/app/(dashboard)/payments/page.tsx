// Partner-facing Payments page.
// Earnings KPI tiles + payouts table (filterable + sortable) + refunds list.
//
// Partner-v2 surface (Pavel 2026-06-05): same interface family as /products —
// cream hero + KPI strip + URL-driven status filter chips + sortable columns
// on the payouts table. Data sources + math unchanged.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import Link from 'next/link'
import { DollarSign, ArrowDownToLine, AlertCircle, ArrowUpDown, type LucideIcon } from 'lucide-react'
import { PaymentRowActions } from './PaymentRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payments — Partner' }

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

const PAYOUT_TABS = ['all', 'PAID', 'PENDING', 'IN_TRANSIT', 'FAILED'] as const
type PayoutTab = (typeof PAYOUT_TABS)[number]
const TAB_LABEL: Record<PayoutTab, string> = {
  all: 'All',
  PAID: 'Paid',
  PENDING: 'Pending',
  IN_TRANSIT: 'In transit',
  FAILED: 'Failed',
}
type SortKey = 'date' | 'amount'

function buildHref(p: { tab?: PayoutTab; sort?: SortKey; dir?: 'asc' | 'desc' }): string {
  const q = new URLSearchParams()
  if (p.tab && p.tab !== 'all') q.set('tab', p.tab)
  if (p.sort && p.sort !== 'date') q.set('sort', p.sort)
  if (p.dir && p.dir !== 'desc') q.set('dir', p.dir)
  const s = q.toString()
  return s ? `/payments?${s}` : '/payments'
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>
}) {
  const sp = await searchParams
  const tab: PayoutTab = (PAYOUT_TABS as readonly string[]).includes(sp.tab ?? '')
    ? (sp.tab as PayoutTab)
    : 'all'
  const sort: SortKey = sp.sort === 'amount' ? 'amount' : 'date'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const user = await requireUser()
  if (user.role !== 'PARTNER') return null
  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [transfers, clawbacks, transfers30d] = await Promise.all([
    prisma.transfer.findMany({
      where: { destinationUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { charge: { select: { orderId: true } } },
    }),
    prisma.partnerClawback.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { refund: true, dispute: true },
    }),
    prisma.transfer.findMany({
      where: { destinationUserId: user.id, createdAt: { gte: thirtyDaysAgo } },
      select: { amountCents: true, status: true },
    }),
  ])

  const lifetimeEarnedCents = transfers.filter((t) => t.status !== 'CANCELED').reduce((a, t) => a + t.amountCents, 0)
  const earned30dCents = transfers30d.filter((t) => t.status !== 'CANCELED').reduce((a, t) => a + t.amountCents, 0)
  const pendingCents = transfers.filter((t) => t.status === 'PENDING').reduce((a, t) => a + t.amountCents, 0)
  const clawedBackCents = clawbacks.reduce((a, c) => a + c.amountCents, 0)

  const stripeConnected = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  })
  const stripeActive = !!stripeConnected?.stripeAccountId && stripeConnected.stripeAccountStatus === 'ACTIVE'

  const countFor = (st: string) => transfers.filter((t) => t.status === st).length
  const visibleTransfers = (tab === 'all' ? transfers : transfers.filter((t) => t.status === tab)).slice()
  visibleTransfers.sort((a, b) => {
    const flip = dir === 'asc' ? 1 : -1
    if (sort === 'amount') return (a.amountCents - b.amountCents) * flip
    return (a.createdAt.getTime() - b.createdAt.getTime()) * flip
  })

  return (
    <div className="space-y-6">
      {/* Cream hero + KPI strip */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Manufacturing · Payments
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Payments
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Your earnings, payouts, and refund debits. Money moves through Stripe Connect.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Earned · 30 days" value={fmtCents(earned30dCents)} icon={DollarSign} tone="pink" />
          <Kpi label="Lifetime earned" value={fmtCents(lifetimeEarnedCents)} icon={DollarSign} tone="ink" />
          <Kpi label="Pending payout" value={fmtCents(pendingCents)} icon={ArrowDownToLine} tone="sky" />
          <Kpi label="Clawbacks" value={fmtCents(clawedBackCents)} icon={AlertCircle} tone={clawedBackCents > 0 ? 'amber' : 'ink'} />
        </div>
      </div>

      {!stripeActive && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <p className="font-semibold">Stripe Connect not active</p>
          <p className="mt-0.5 text-amber-800">
            You won&apos;t receive payouts until your Stripe Connect account is fully onboarded.
            Status: <span className="font-medium">{stripeConnected?.stripeAccountStatus ?? 'NONE'}</span>.
            Finish onboarding in Settings.
          </p>
        </div>
      )}

      {/* Payout status filter chips */}
      {transfers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {PAYOUT_TABS.map((t) => {
            const c = t === 'all' ? transfers.length : countFor(t)
            if (t !== 'all' && c === 0 && tab !== t) return null
            return (
              <Link
                key={t}
                href={buildHref({ tab: t, sort, dir })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  tab === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {TAB_LABEL[t]}
                <span className={cn('tabular-nums', tab === t ? 'text-white/70' : 'text-ink-400')}>{c}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Payouts table */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-cream px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">Payouts</h2>
        </header>
        {transfers.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-ink-500">
            No payouts yet. They&apos;ll appear here as you ship dispatches.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
                  <SortTh label="Date" k="date" sort={sort} dir={dir} tab={tab} className="px-4" />
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <SortTh label="Amount" k="amount" sort={sort} dir={dir} tab={tab} align="right" />
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visibleTransfers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[12px] text-ink-500">Nothing in “{TAB_LABEL[tab]}”.</td></tr>
                )}
                {visibleTransfers.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 font-mono text-[11.5px]">#{t.charge.orderId.slice(-8)}</td>
                    <td className="px-4 py-2.5 text-[11.5px] uppercase text-ink-500">{t.reason.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="px-4 py-2.5"><TransferStatusBadge status={t.status} /></td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtCents(t.amountCents)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end">
                        <PaymentRowActions transferId={t.id} orderId={t.charge.orderId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Refund debits */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-cream px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">Refund debits</h2>
        </header>
        {clawbacks.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-ink-500">No refund clawbacks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {clawbacks.map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-ink-700">{c.reason}</td>
                    <td className="px-4 py-2.5 text-[11.5px] uppercase text-ink-600">{c.status}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-rose-700">−{fmtCents(c.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: 'ink' | 'sky' | 'pink' | 'amber'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-sky-100 text-sky-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
          <p className="font-display text-[20px] font-bold leading-none tabular-nums text-ink-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function SortTh({
  label,
  k,
  sort,
  dir,
  tab,
  align,
  className,
}: {
  label: string
  k: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  tab: PayoutTab
  align?: 'right'
  className?: string
}) {
  const isActive = sort === k
  const nextDir = isActive && dir === 'desc' ? 'asc' : 'desc'
  return (
    <th className={cn('px-4 py-2.5 font-semibold', align === 'right' && 'text-right', className)}>
      <Link
        href={buildHref({ tab, sort: k, dir: nextDir })}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          isActive ? 'text-ink-900' : 'hover:text-ink-700',
        )}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', isActive ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
      </Link>
    </th>
  )
}

const TRANSFER_PILL: Record<string, string> = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  IN_TRANSIT: 'border-sky-200 bg-sky-50 text-sky-800',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  CANCELED: 'border-rose-200 bg-rose-50 text-rose-800',
}

function TransferStatusBadge({ status }: { status: string }) {
  const cls = TRANSFER_PILL[status] ?? 'border-ink-200 bg-ink-100 text-ink-700'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', cls)}>
      {status.toLowerCase()}
    </span>
  )
}
