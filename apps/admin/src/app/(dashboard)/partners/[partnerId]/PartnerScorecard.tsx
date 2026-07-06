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
  // Risk Center M3 — nightly Partner Reliability Score (worst service).
  prs?: number | null
  prsBand?: string | null
  // Feedback module §5.4 — creator ratings rollup (service-scoped; display
  // shows mean + count; the Bayesian score stays internal to ranking).
  ratings?: Array<{ serviceLabel: string; mean: number | null; count: number }>
  lowRatings30d?: number // overall ≤ 2 in the last 30d — the alert signal
}

const PRS_PILL: Record<string, string> = {
  HEALTHY: 'bg-success-50 text-success-800 ring-1 ring-success-200',
  AT_RISK: 'bg-warning-50 text-warning-800 ring-1 ring-warning-200',
  CRITICAL: 'bg-danger-50 text-danger-800 ring-1 ring-danger-200',
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
      {typeof data.prs === 'number' && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2">
          <span className="text-[12px] font-semibold text-ink-700">Reliability score (PRS)</span>
          <span className="flex items-center gap-2">
            <span className="font-display text-[18px] font-bold tabular-nums leading-none text-ink-900">
              {Math.round(data.prs)}
            </span>
            {data.prsBand && (
              <span className={cn('rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', PRS_PILL[data.prsBand] ?? 'bg-ink-100 text-ink-700')}>
                {data.prsBand.replace('_', ' ')}
              </span>
            )}
          </span>
        </div>
      )}
      <dl className="mt-3 space-y-2 text-[12.5px]">
        {/* Feedback module §5.4 — service-scoped creator ratings */}
        {data.ratings
          ?.filter((r) => r.count > 0)
          .map((r) => (
            <Row
              key={r.serviceLabel}
              label={`★ ${r.serviceLabel} rating`}
              value={r.mean != null ? `${r.mean.toFixed(1)} · ${r.count}` : `New · ${r.count}`}
              warn={r.mean != null && r.count >= 3 && r.mean < 3.5}
            />
          ))}
        {(data.lowRatings30d ?? 0) > 0 && (
          <Row label="Low ratings (≤2, 30d)" value={String(data.lowRatings30d)} warn />
        )}
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
