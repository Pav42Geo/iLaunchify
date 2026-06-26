// Admin → Settings → Finance → Overview (docs/BILLING_AND_ACCOUNTING.md §4).
//
// Reconciliation dashboard: what was charged vs paid to partners vs kept as
// platform fee vs refunded. Read-only, `billing:read`-gated. Links into the
// detail ledgers (Invoices / Payouts / Refunds / Tax forms).

import Link from 'next/link'
import { ArrowRight, FileText, Wallet, RotateCcw, Landmark } from 'lucide-react'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Finance overview — Admin' }

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function FinanceOverviewPage() {
  await requireCapability('billing:read')

  const [chargeAgg, transferAgg, refundAgg, pendingAgg] = await Promise.all([
    prisma.charge.aggregate({ _sum: { amountCents: true, applicationFeeCents: true }, _count: { _all: true } }),
    prisma.transfer.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountCents: true } }),
    prisma.refund.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amountCents: true } }),
    prisma.transfer.aggregate({
      where: { status: { in: ['PENDING', 'READY', 'EXECUTING'] } },
      _sum: { amountCents: true },
    }),
  ])

  const grossCharged = chargeAgg._sum.amountCents ?? 0
  const platformFees = chargeAgg._sum.applicationFeeCents ?? 0
  const paidToPartners = transferAgg._sum.amountCents ?? 0
  const refunded = refundAgg._sum.amountCents ?? 0
  const pendingPayouts = pendingAgg._sum.amountCents ?? 0
  const orderCount = chargeAgg._count._all ?? 0
  const netRevenue = platformFees - refunded

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Finance</p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Finance overview
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Lifetime reconciliation across charges, partner payouts, platform fees, and refunds.
          Read-only — Stripe is the system of record.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Gross charged" value={fmtCents(grossCharged)} />
          <Kpi label="Platform fees earned" value={fmtCents(platformFees)} tone="pink" />
          <Kpi label="Paid to partners" value={fmtCents(paidToPartners)} />
          <Kpi label="Refunded" value={fmtCents(refunded)} tone={refunded > 0 ? 'amber' : 'ink'} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Net platform revenue (fees − refunds)" value={fmtCents(netRevenue)} tone={netRevenue >= 0 ? 'pink' : 'red'} />
          <Kpi label="Pending payouts" value={fmtCents(pendingPayouts)} tone={pendingPayouts > 0 ? 'amber' : 'ink'} />
          <Kpi label="Charged orders" value={String(orderCount)} />
        </div>
      </div>

      {/* Reconciliation note */}
      <div className="rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
        <strong className="text-ink-800">Reconciliation:</strong> gross charged should approximate
        platform fees + paid to partners + pending payouts (minus refunds). Material gaps usually mean
        transfers that haven&apos;t executed yet or failed — check Payouts → Failed/Pending.
      </div>

      {/* Detail-ledger links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NavCard icon={<FileText className="h-[18px] w-[18px]" />} title="Invoices" href="/finance/invoices" desc="What creators were billed for production." />
        <NavCard icon={<Wallet className="h-[18px] w-[18px]" />} title="Payouts & transfers" href="/finance/payouts" desc="Partner payout ledger + platform-fee basis." />
        <NavCard icon={<RotateCcw className="h-[18px] w-[18px]" />} title="Refunds" href="/finance/refunds" desc="Refund records and status." />
        <NavCard icon={<Landmark className="h-[18px] w-[18px]" />} title="Tax forms (1099)" href="/finance/tax-forms" desc="Per-partner annual earnings + 1099 outlook." />
      </div>
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

function NavCard({ icon, title, href, desc }: { icon: React.ReactNode; title: string; href: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-white">{icon}</span>
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-semibold text-ink-900">{title}</span>
        <span className="block text-[12px] text-ink-500">{desc}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
