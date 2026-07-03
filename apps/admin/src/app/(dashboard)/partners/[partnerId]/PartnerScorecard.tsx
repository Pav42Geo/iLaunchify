// Partner scorecard — P3 (docs/PARTNER_ROLE_ACCOUNTS.md §7.6). Read-only V1:
// informs tier auto-promotion (V1.1) and commodity-leg routing weights (V2),
// but binds to NOTHING yet — partner tiers stay display-only (locked rule).
//
// Server component; the parent page computes the numbers (one query pass) and
// hands them in as plain props.

import { Gauge } from 'lucide-react'
import { cn } from '@ilaunchify/ui'

export interface ScorecardData {
  delivered: number
  acceptRatePct: number | null // accepted / (accepted + declined + timed out)
  qcFailures: number
  discrepancies: number // ReceivingDiscrepancy rows on their producing dispatches
  reprints: number // dispatches reprintOf-linked to their jobs
  avgYieldPct: number | null // ProductionLot unitsProduced / unitsExpected
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', warn ? 'text-warning-700' : 'text-ink-900')}>
        {value}
      </dd>
    </div>
  )
}

export function PartnerScorecard({ data }: { data: ScorecardData }) {
  const discRate = data.delivered > 0 ? (data.discrepancies / data.delivered) * 100 : null
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
        <Gauge className="h-4 w-4 text-ink-500" aria-hidden="true" /> Scorecard
        <span className="ml-auto rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
          Read-only V1
        </span>
      </h2>
      <dl className="mt-3 space-y-2 text-[12.5px]">
        <Row label="Completed dispatches" value={data.delivered.toLocaleString()} />
        <Row
          label="Accept rate"
          value={data.acceptRatePct != null ? `${data.acceptRatePct.toFixed(0)}%` : '—'}
          warn={data.acceptRatePct != null && data.acceptRatePct < 80}
        />
        <Row label="QC failures" value={String(data.qcFailures)} warn={data.qcFailures > 0} />
        <Row
          label="Receiving discrepancies"
          value={
            discRate != null
              ? `${data.discrepancies} (${discRate.toFixed(1)}%)`
              : String(data.discrepancies)
          }
          warn={discRate != null && discRate > 5}
        />
        <Row label="Reprints caused" value={String(data.reprints)} warn={data.reprints > 0} />
        <Row
          label="Avg production yield"
          value={data.avgYieldPct != null ? `${data.avgYieldPct.toFixed(0)}%` : '—'}
          warn={data.avgYieldPct != null && data.avgYieldPct < 95}
        />
      </dl>
      <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] text-ink-400">
        Informational only — feeds tier review and V2 routing weights; no automatic consequences.
      </p>
    </section>
  )
}
