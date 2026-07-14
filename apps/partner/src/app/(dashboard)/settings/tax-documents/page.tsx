// Partner → Settings → Tax documents (docs/BILLING_AND_ACCOUNTING.md — 1099s).
//
// Shows the annual earnings basis (gross paid out to this partner) + pointers to
// 1099 forms issued through Stripe Connect Tax Forms, plus a deep-link into the
// partner's Stripe Express dashboard where the actual forms + tax info (W-9) live.
// We never store the TIN or form content — Stripe is the filer of record.
// Restyled 2026-07-12 to the settings-hub prototype "Payments & plans" panel
// (panel-kit PanelCard/Fieldset/KpiStrip/LRow/StPill/InfoBanner) — data + links unchanged.

import Link from 'next/link'
import { AlertTriangle, DollarSign, FileText, Info } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma, getPartnerAnnualEarnings, listTaxDocuments } from '@ilaunchify/db'
import {
  Fieldset,
  InfoBanner,
  KpiStrip,
  LRow,
  PanelCard,
  StPill,
  type PillTone,
} from '@/components/panel-kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tax documents — Partner' }

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_LABEL: Record<string, string> = {
  FORM_1099K: '1099-K',
  FORM_1099NEC: '1099-NEC',
}
const STATUS_PILL: Record<string, { label: string; tone: PillTone }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  AVAILABLE: { label: 'Available', tone: 'ok' },
  DELIVERED: { label: 'Delivered', tone: 'ok' },
  CORRECTED: { label: 'Corrected', tone: 'muted' },
  VOID: { label: 'Void', tone: 'muted' },
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
      {/* Slim header — prototype panel chrome, no hero (Pavel 2026-07-13) */}
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Tax documents
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          Your annual earnings and 1099 tax forms. Forms are issued and filed through
          Stripe — view and download them in your Stripe dashboard.
        </p>
      </div>

      <PanelCard>
        {dashboardError && (
          <InfoBanner tone="warn" icon={<AlertTriangle />}>
            We couldn’t open your Stripe dashboard. Finish connecting payouts first, then try again.
          </InfoBanner>
        )}

        {/* Annual earnings summary */}
        <Fieldset icon={<DollarSign />} title="Annual earnings" hint="Basis for 1099 reporting">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {years.map((y) => {
              const active = y === selectedYear
              return (
                <Link
                  key={y}
                  href={`/settings/tax-documents?year=${y}`}
                  className={`inline-flex items-center rounded-full border px-2.5 py-[5px] text-[12px] font-medium transition-colors ${
                    active
                      ? 'border-pink-100 bg-pink-50 text-pink-700'
                      : 'border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  {y}
                </Link>
              )
            })}
          </div>
          <KpiStrip
            className="mb-3"
            items={[
              { v: fmtCents(earnings.grossCents), l: `Gross paid out · ${selectedYear}` },
              {
                v: earnings.payoutCount,
                l: `Completed payout${earnings.payoutCount === 1 ? '' : 's'} · ${selectedYear}`,
              },
            ]}
          />
          <p className="text-[12px] leading-relaxed text-ink-600">
            This is the gross amount iLaunchify paid you in {selectedYear}, before any of
            your own business expenses. It’s the basis used for 1099 reporting — the
            official form, if you qualify, is issued by Stripe.
          </p>
        </Fieldset>

        {/* Tax forms list */}
        <Fieldset icon={<FileText />} title="1099 forms" hint="Issued and filed by Stripe">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-ink-500">
              View or download the actual form in your Stripe dashboard.
            </p>
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
            <div className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center">
              <p className="text-[13px] text-ink-600">No tax forms yet.</p>
              <p className="mt-1 text-[12px] text-ink-500">
                If you qualify, your 1099 will appear here and in your Stripe dashboard after the
                tax year ends (recipient copies are sent by January 31).
              </p>
            </div>
          ) : (
            docs.map((d) => {
              const pill = STATUS_PILL[d.status] ?? { label: d.status, tone: 'muted' as PillTone }
              return (
                <LRow
                  key={d.id}
                  icon={<FileText />}
                  title={`${TYPE_LABEL[d.type] ?? d.type} · ${d.taxYear}`}
                  sub={
                    d.deliveredAt
                      ? `Delivered ${new Date(d.deliveredAt).toLocaleDateString('en-US')}`
                      : undefined
                  }
                  right={
                    <>
                      <StPill tone={pill.tone}>{pill.label}</StPill>
                      {dashboardConnected && (
                        <a
                          href="/settings/tax-documents/dashboard"
                          className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                        >
                          View in Stripe
                        </a>
                      )}
                    </>
                  }
                />
              )
            })
          )}
        </Fieldset>

        {/* Threshold explainer */}
        <InfoBanner tone="info" icon={<Info />} className="mb-0">
          <strong>When you get a 1099:</strong> federal 1099-K reporting
          applies once your gross payouts exceed $20,000 and 200 transactions in a year, and 1099-NEC
          at $2,000. Some states have lower thresholds (often $600). Stripe tracks the rules and issues
          the right form — you don’t need to do anything except keep your tax info current in your
          Stripe dashboard. This is general information, not tax advice.
        </InfoBanner>
      </PanelCard>
    </div>
  )
}
