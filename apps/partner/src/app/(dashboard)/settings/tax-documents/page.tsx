// Partner → Settings → Tax documents (docs/BILLING_AND_ACCOUNTING.md — 1099s).
//
// Shows the annual earnings basis (gross paid out to this partner) + pointers to
// 1099 forms issued through Stripe Connect Tax Forms, plus a deep-link into the
// partner's Stripe Express dashboard where the actual forms + tax info (W-9) live.
// We never store the TIN or form content — Stripe is the filer of record.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { prisma, getPartnerAnnualEarnings, listTaxDocuments } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tax documents — Partner' }

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_LABEL: Record<string, string> = {
  FORM_1099K: '1099-K',
  FORM_1099NEC: '1099-NEC',
}
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  AVAILABLE: { label: 'Available', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  DELIVERED: { label: 'Delivered', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CORRECTED: { label: 'Corrected', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  VOID: { label: 'Void', cls: 'border-ink-200 bg-ink-100 text-ink-500' },
}

export default async function TaxDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; tax?: string }>
}) {
  const sp = await searchParams
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true },
  })

  const currentYear = new Date().getUTCFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]
  const selectedYear = years.includes(Number(sp.year)) ? Number(sp.year) : currentYear

  const [earnings, docs] = await Promise.all([
    getPartnerAnnualEarnings(user.id, selectedYear),
    listTaxDocuments(user.id),
  ])

  const dashboardConnected = Boolean(dbUser?.stripeAccountId)
  const dashboardError = sp.tax === 'dashboard_unavailable'

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Manufacturing · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Tax documents
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your annual earnings and 1099 tax forms. Forms are issued and filed through
          Stripe — view and download them in your Stripe dashboard.
        </p>
      </div>

      {dashboardError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          We couldn’t open your Stripe dashboard. Finish connecting payouts first, then try again.
        </div>
      )}

      {/* Annual earnings summary */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
            Annual earnings
          </h2>
          <div className="flex flex-wrap gap-2">
            {years.map((y) => {
              const active = y === selectedYear
              return (
                <Link
                  key={y}
                  href={`/settings/tax-documents?year=${y}`}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                    active
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {y}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
            <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
              Gross paid out · {selectedYear}
            </div>
            <div className="mt-1 font-display text-[26px] font-bold text-ink-900">
              {fmtCents(earnings.grossCents)}
            </div>
            <div className="mt-1 text-[12px] text-ink-500">
              {earnings.payoutCount} completed payout{earnings.payoutCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="rounded-xl border border-ink-200 p-4 text-[12px] leading-relaxed text-ink-600">
            This is the gross amount iLaunchify paid you in {selectedYear}, before any of
            your own business expenses. It’s the basis used for 1099 reporting — the
            official form, if you qualify, is issued by Stripe.
          </div>
        </div>
      </section>

      {/* Tax forms list */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
              1099 forms
            </h2>
            <p className="mt-1 text-[12px] text-ink-500">
              Issued and filed by Stripe. View or download the actual form in your Stripe dashboard.
            </p>
          </div>
          {dashboardConnected ? (
            <a
              href="/settings/tax-documents/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700"
            >
              Open Stripe dashboard
            </a>
          ) : (
            <Link
              href="/payments"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 hover:bg-ink-50"
            >
              Connect payouts first
            </Link>
          )}
        </div>

        {docs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center">
            <p className="text-[13px] text-ink-600">No tax forms yet.</p>
            <p className="mt-1 text-[12px] text-ink-500">
              If you qualify, your 1099 will appear here and in your Stripe dashboard after the
              tax year ends (recipient copies are sent by January 31).
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {docs.map((d) => {
              const pill = STATUS_PILL[d.status] ?? { label: d.status, cls: 'border-ink-200 bg-ink-100 text-ink-600' }
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink-900">
                      {TYPE_LABEL[d.type] ?? d.type} · {d.taxYear}
                    </div>
                    {d.deliveredAt && (
                      <div className="text-[12px] text-ink-500">
                        Delivered {new Date(d.deliveredAt).toLocaleDateString('en-US')}
                      </div>
                    )}
                  </div>
                  <span
                    className={`ml-auto inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill.cls}`}
                  >
                    {pill.label}
                  </span>
                  {dashboardConnected && (
                    <a
                      href="/settings/tax-documents/dashboard"
                      className="text-[12px] font-semibold text-pink-700 hover:text-pink-800"
                    >
                      View in Stripe
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Threshold explainer */}
      <div className="rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
        <strong className="text-ink-800">When you get a 1099:</strong> federal 1099-K reporting
        applies once your gross payouts exceed $20,000 and 200 transactions in a year, and 1099-NEC
        at $2,000. Some states have lower thresholds (often $600). Stripe tracks the rules and issues
        the right form — you don’t need to do anything except keep your tax info current in your
        Stripe dashboard. This is general information, not tax advice.
      </div>
    </div>
  )
}
