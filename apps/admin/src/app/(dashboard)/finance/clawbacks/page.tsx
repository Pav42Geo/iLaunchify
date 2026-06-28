// Admin → Finance → Clawbacks (docs/PAYMENTS.md — refund recoupment ledger).
//
// Makes the PartnerClawback obligation VISIBLE + actionable. A clawback is created
// PENDING_APPROVAL when a refund recoups a partner's payout; the common-case money
// is already pulled at refund time via the Stripe reversal, so this is the decision
// + audit ledger for the residual (already-paid-out balances, the transfer/refund
// race). Lifecycle: approve → mark executed (how it was recouped) → or waive.
// Gated on refunds:approve; marking executed needs refunds:execute.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ClawbackRowActions } from './ClawbackRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Clawbacks — Admin' }

type StatusTab = 'all' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'WAIVED'

const TABS: StatusTab[] = ['all', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'WAIVED']
const TAB_LABEL: Record<StatusTab, string> = {
  all: 'All',
  PENDING_APPROVAL: 'Pending',
  APPROVED: 'Approved',
  EXECUTED: 'Executed',
  WAIVED: 'Waived',
}
const STATUS_PILL: Record<string, string> = {
  PENDING_APPROVAL: 'border-warning-200 bg-warning-50 text-warning-800',
  APPROVED: 'border-info-200 bg-info-50 text-info-700',
  EXECUTED: 'border-success-200 bg-success-50 text-success-800',
  WAIVED: 'border-ink-200 bg-ink-100 text-ink-600',
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function FinanceClawbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireCapability('refunds:approve')
  const sp = await searchParams
  const tab: StatusTab = (TABS as string[]).includes(sp.tab ?? '') ? (sp.tab as StatusTab) : 'all'

  const clawbacks = await prisma.partnerClawback.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      partner: { select: { companyName: true } },
      refund: { select: { orderId: true } },
    },
  })

  const sumBy = (...st: string[]) =>
    clawbacks.filter((c) => st.includes(c.status)).reduce((a, c) => a + c.amountCents, 0)
  const owedCents = sumBy('PENDING_APPROVAL', 'APPROVED')
  const executedCents = sumBy('EXECUTED')
  const pendingCount = clawbacks.filter((c) => c.status === 'PENDING_APPROVAL').length

  const countFor = (st: StatusTab) =>
    st === 'all' ? clawbacks.length : clawbacks.filter((c) => c.status === st).length

  const visible = tab === 'all' ? clawbacks : clawbacks.filter((c) => c.status === tab)

  function tabHref(t: StatusTab) {
    return t === 'all' ? '/finance/clawbacks' : `/finance/clawbacks?tab=${t}`
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Finance"
        title="Clawbacks"
        description="Partner payout recoupments from refunds. The funds are usually pulled back automatically at refund time — review, then mark how each residual was recouped, or waive it."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Owed (open)" value={fmtCents(owedCents)} tone={owedCents > 0 ? 'amber' : 'ink'} />
        <Kpi label="Pending approval" value={String(pendingCount)} tone={pendingCount > 0 ? 'amber' : 'ink'} />
        <Kpi label="Executed" value={fmtCents(executedCents)} tone="pink" />
        <Kpi label="Records" value={String(clawbacks.length)} />
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
            Clawback ledger
          </h2>
        </header>
        {clawbacks.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            No clawbacks. Records appear here when a refund recoups a partner payout.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Partner</th>
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
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
                {visible.map((c) => {
                  const pill = STATUS_PILL[c.status] ?? 'border-ink-200 bg-ink-100 text-ink-600'
                  return (
                    <tr key={c.id} className="hover:bg-ink-50/40">
                      <td className="px-4 py-2.5 text-ink-700">{fmtDate(c.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium text-ink-900">{c.partner?.companyName ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {c.refund?.orderId ? (
                          <Link href={`/orders/${c.refund.orderId}`} className="font-mono text-[11.5px] text-pink-700 hover:text-pink-800">
                            #{c.refund.orderId.slice(-8)}
                          </Link>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ink-600">{c.reason}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill}`}>
                          {c.status.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-danger-700">
                        −{fmtCents(c.amountCents)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ClawbackRowActions id={c.id} status={c.status as 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'WAIVED'} />
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
        The refund itself already pulls partner funds back via Stripe at refund time. This ledger
        tracks recoupment that needs an explicit decision (e.g. the balance was already paid out).
      </p>
    </div>
  )
}

function Kpi({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'pink' | 'amber' }) {
  const toneCls = { ink: 'text-ink-900', pink: 'text-pink-700', amber: 'text-warning-700' }[tone]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
