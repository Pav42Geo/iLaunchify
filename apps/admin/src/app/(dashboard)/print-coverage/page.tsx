// Admin Print Coverage dashboard — v2 admin surface (docs/PRINT_PROVIDER_SELECTION.md
// §10.4, PS-8d). Visibility into the automatic RFQ loop: uncovered templates,
// open requests, in-flight claims, time-to-coverage. The admin's jobs are minimal
// (re-broadcast / extend); everything else — detection, shortlist, broadcast,
// re-broadcast, unpark — runs automatically.

import Link from 'next/link'
import { AlertTriangle, Megaphone, Handshake, ShieldAlert, Timer } from 'lucide-react'
import { KpiWidget } from '@ilaunchify/ui'
import { getOrderSettings } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadCoverageDashboard, type CoverageRequestStatus } from './data'
import { CoverageRowActions } from './CoverageRowActions'
import { RfqSettingsForm } from './RfqSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Print coverage — Admin' }

const STATUS_PILL: Record<CoverageRequestStatus, { label: string; cls: string }> = {
  OPEN: { label: 'Open', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  CLAIMED: { label: 'Claimed', cls: 'border-info-200 bg-info-50 text-info-800' },
  FULFILLED: { label: 'Fulfilled', cls: 'border-success-200 bg-success-50 text-success-800' },
  EXPIRED: { label: 'Expired', cls: 'border-danger-200 bg-danger-50 text-danger-800' },
}

function ageDays(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  return d <= 0 ? 'today' : `${d}d`
}

export default async function PrintCoveragePage() {
  await requireCapability('reviews:write')
  const [{ kpis, rows }, settings] = await Promise.all([
    loadCoverageDashboard(),
    getOrderSettings(),
  ])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Marketplace supply"
        title="Print coverage"
        description="Templates with no active printer, the capability requests broadcast to fix that, and the claims coming back. Detection, shortlisting, re-broadcast, and un-pausing are automatic — you only ever nudge or verify."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiWidget
          label="Uncovered templates"
          value={kpis.uncoveredTemplates}
          tone={kpis.uncoveredTemplates > 0 ? 'warning' : 'success'}
          icon={AlertTriangle}
          sublabel="have an open request"
        />
        <KpiWidget
          label="Fragile (coverage 1)"
          value={kpis.fragile}
          tone={kpis.fragile > 0 ? 'warning' : 'success'}
          icon={ShieldAlert}
          sublabel="one printer away from a gap"
        />
        <KpiWidget label="Open RFQs" value={kpis.openRfqs} tone="ink" icon={Megaphone} />
        <KpiWidget
          label="Claims awaiting"
          value={kpis.claimsAwaiting}
          tone={kpis.claimsAwaiting > 0 ? 'info' : 'ink'}
          icon={Handshake}
          sublabel="printer finishing an offering"
        />
        <KpiWidget
          label="Median time to coverage"
          value={kpis.medianDaysToCoverage == null ? '—' : `${kpis.medianDaysToCoverage}d`}
          tone="ink"
          icon={Timer}
        />
      </div>

      <RfqSettingsForm
        initial={{
          rfqShortlistSize: settings.rfqShortlistSize,
          rfqExpiryDays: settings.rfqExpiryDays,
          rfqRebroadcastDays: settings.rfqRebroadcastDays,
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Capability requests</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-500">
            No capability requests — every published template is covered. 🎉
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-5 py-2.5 font-semibold">Template</th>
                <th className="px-3 py-2.5 font-semibold">Packaging</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Claims</th>
                <th className="px-3 py-2.5 font-semibold">Notified</th>
                <th className="px-3 py-2.5 font-semibold">Region</th>
                <th className="px-3 py-2.5 font-semibold">Age</th>
                <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = STATUS_PILL[r.status]
                return (
                  <tr key={r.requestId} className="border-b border-ink-50 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/products/${r.templateId}`}
                        className="font-medium text-ink-900 hover:text-pink-700 hover:underline"
                      >
                        {r.templateName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">{r.packagingLabel}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-[1px] text-[10.5px] font-semibold ${pill.cls}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-700">{r.claimCount}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-700">{r.notifiedCount}</td>
                    <td className="px-3 py-2.5 text-ink-600">{r.region ?? '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-600">{ageDays(r.createdAt)}</td>
                    <td className="px-5 py-2.5">
                      <CoverageRowActions
                        requestId={r.requestId}
                        templateId={r.templateId}
                        status={r.status}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
