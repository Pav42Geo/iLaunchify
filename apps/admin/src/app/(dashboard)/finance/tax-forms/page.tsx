// Admin → Settings → Finance → Tax forms (1099) (docs/BILLING_AND_ACCOUNTING.md §4).
//
// Per-partner annual earnings + 1099 filing outlook for a tax year. Read-only,
// `billing:read`-gated. The actual 1099s are issued/filed by Stripe Connect Tax
// Forms; this surface shows who qualifies and tracks status. No TIN here.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tax forms (1099) — Admin' }

// Federal 1099-K (post-OBBBA): gross > $20,000 AND > 200 transactions.
const K_GROSS_CENTS = 20_000_00
const K_TXN_COUNT = 200
// 1099-NEC (2026+): >= $2,000.
const NEC_GROSS_CENTS = 2_000_00

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function FinanceTaxFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  await requireCapability('billing:read')
  const sp = await searchParams
  const currentYear = new Date().getUTCFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : currentYear
  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))

  // Gross paid out per partner this tax year (COMPLETED transfers).
  const grouped = await prisma.transfer.groupBy({
    by: ['destinationUserId'],
    where: { status: 'COMPLETED', executedAt: { gte: start, lt: end } },
    _sum: { amountCents: true },
    _count: { _all: true },
  })

  const userIds = grouped.map((g) => g.destinationUserId)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, partner: { select: { companyName: true } } },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const rows = grouped
    .map((g) => {
      const gross = g._sum.amountCents ?? 0
      const count = g._count._all ?? 0
      const u = userMap.get(g.destinationUserId)
      const meetsK = gross > K_GROSS_CENTS && count > K_TXN_COUNT
      const meetsNec = gross >= NEC_GROSS_CENTS
      return {
        userId: g.destinationUserId,
        name: u?.partner?.companyName ?? u?.email ?? g.destinationUserId.slice(-8),
        gross,
        count,
        outlook: meetsK ? '1099-K' : meetsNec ? '1099-NEC' : '—',
      }
    })
    .sort((a, b) => b.gross - a.gross)

  const totalGross = rows.reduce((a, r) => a + r.gross, 0)
  const qualifying = rows.filter((r) => r.outlook !== '—').length

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Finance</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Tax forms (1099)
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Per-partner earnings and 1099 outlook for {year}. Forms are issued and filed by Stripe
          Connect Tax Forms — enable that in Stripe to generate the actual documents.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {years.map((y) => (
            <Link
              key={y}
              href={`/finance/tax-forms?year=${y}`}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                y === year ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label={`Total paid out · ${year}`} value={fmtCents(totalGross)} tone="pink" />
          <Kpi label="Partners paid" value={String(rows.length)} />
          <Kpi label="Likely 1099 recipients" value={String(qualifying)} tone={qualifying > 0 ? 'amber' : 'ink'} />
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Partner earnings · {year}
          </h2>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-500">
            No completed payouts in {year} yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Partner</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Gross paid</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Payouts</th>
                  <th className="px-4 py-2.5 font-semibold">1099 outlook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-ink-50/40">
                    <td className="px-4 py-2.5 font-medium text-ink-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-900">{fmtCents(r.gross)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-600">{r.count}</td>
                    <td className="px-4 py-2.5">
                      {r.outlook === '—' ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                          {r.outlook}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
        <strong className="text-ink-800">Outlook is an estimate, not the filing.</strong> Federal
        1099-K applies above $20,000 gross and 200 transactions; 1099-NEC at $2,000. Some states
        require $600. Stripe tracks the exact rules per recipient and issues the official forms —
        enable Stripe Connect Tax Forms to generate and file them. Not tax advice.
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
