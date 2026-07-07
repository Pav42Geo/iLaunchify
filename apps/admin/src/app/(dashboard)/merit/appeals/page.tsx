// Rating appeals inbox — v2 admin surface (MM-4b, docs/MANUFACTURER_MERIT_ENGINE.md §5).
// Where a manufacturer's dispute over an unfair rating gets adjudicated. Upholding
// leaves the rating; excluding/re-attributing drops it from the aggregate through
// the single recompute writer. An OPEN appeal freezes the manufacturer's demotion.

import { Scale, Inbox, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { KpiWidget } from '@ilaunchify/ui'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadAppealInbox, type AppealRow } from './data'
import { AppealRowActions } from './AppealRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rating appeals — Admin' }

const STATUS_PILL: Record<string, string> = {
  SUBMITTED: 'border-warning-200 bg-warning-50 text-warning-800',
  UNDER_REVIEW: 'border-info-200 bg-info-50 text-info-800',
  UPHELD: 'border-ink-200 bg-ink-100 text-ink-600',
  EXCLUDED: 'border-pink-200 bg-pink-50 text-pink-800',
  REATTRIBUTED: 'border-info-200 bg-info-50 text-info-700',
}
const SLA_PILL: Record<string, string> = {
  ON_TIME: 'text-ink-400',
  ACK_OVERDUE: 'text-warning-700',
  RESOLVE_OVERDUE: 'text-red-600',
}
const SLA_LABEL: Record<string, string> = { ON_TIME: 'On time', ACK_OVERDUE: 'Ack overdue', RESOLVE_OVERDUE: 'Resolve overdue' }

export default async function AppealsPage() {
  await requireCapability('reviews:write')
  const inbox = await loadAppealInbox()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Manufacturer standing"
        title="Rating appeals"
        description="A manufacturer can contest a rating they believe is unfair or misattributed. While an appeal is open, their standing is frozen against demotion. Upholding keeps the rating; excluding or re-attributing removes it from their aggregate and recomputes standing — every outcome is audited."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <KpiWidget span={3} label="Open" value={inbox.open} tone={inbox.open > 0 ? 'info' : 'ink'} icon={Inbox} sublabel="awaiting adjudication" />
        <KpiWidget span={3} label="Ack overdue" value={inbox.ackOverdue} tone={inbox.ackOverdue > 0 ? 'warning' : 'success'} icon={Clock} sublabel="past 2-day acknowledge SLA" />
        <KpiWidget span={3} label="Resolve overdue" value={inbox.resolveOverdue} tone={inbox.resolveOverdue > 0 ? 'warning' : 'success'} icon={AlertTriangle} sublabel="past 7-day resolve SLA" />
        <KpiWidget span={3} label="Resolved" value={inbox.resolved} tone="ink" icon={CheckCircle2} sublabel="closed all-time" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="flex items-center gap-2 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
          <Scale className="h-4 w-4 text-ink-500" />
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Appeals queue</h2>
        </div>
        {inbox.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-500">No appeals filed. Manufacturers contest a rating from their standing dashboard.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-5 py-2.5 font-semibold">Manufacturer</th>
                <th className="px-3 py-2.5 font-semibold">Rating</th>
                <th className="px-3 py-2.5 font-semibold">Reason</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">SLA</th>
                <th className="px-3 py-2.5 font-semibold">Age</th>
                <th className="px-5 py-2.5 font-semibold">Adjudicate</th>
              </tr>
            </thead>
            <tbody>
              {inbox.rows.map((r: AppealRow) => (
                <tr key={r.id} className="border-b border-ink-50 align-top last:border-0">
                  <td className="px-5 py-3 font-medium text-ink-900">
                    {r.companyName}
                    <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-ink-400">{r.ratingRole}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-ink-800">{r.ratingOverall == null ? '—' : `${r.ratingOverall.toFixed(1)}★`}</td>
                  <td className="px-3 py-3 max-w-[280px] text-[12px] text-ink-600">{r.reason}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-[1px] text-[10.5px] font-semibold ${STATUS_PILL[r.status] ?? STATUS_PILL.SUBMITTED}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-[11px] font-semibold ${SLA_PILL[r.sla] ?? SLA_PILL.ON_TIME}`}>{SLA_LABEL[r.sla] ?? r.sla}</td>
                  <td className="px-3 py-3 tabular-nums text-ink-500">{r.ageDays}d</td>
                  <td className="px-5 py-3"><AppealRowActions appealId={r.id} status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
