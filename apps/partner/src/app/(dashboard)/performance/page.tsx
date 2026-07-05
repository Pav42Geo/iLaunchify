// Partner Performance — the partner-visible Reliability Score (Risk Center M3,
// docs/RISK_MANAGEMENT_CENTER.md §3; Pavel 2026-07-05: FULL breakdown, not
// badge-only — transparency is the self-correction mechanism, per Amazon's
// Account Health model).
//
// Read-only: shows the latest nightly PartnerRiskFeature snapshot per service.
// The score consumes nothing punitive automatically — hard gates (compliance)
// live elsewhere; this page tells the partner exactly what to improve.

import { Gauge } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { serviceOwnedBy } from '@/lib/partner-context'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Performance — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment Center',
}

const BAND_STYLE: Record<string, { label: string; pill: string; bar: string }> = {
  HEALTHY: { label: 'Healthy', pill: 'border-success-200 bg-success-50 text-success-800', bar: 'bg-success-500' },
  AT_RISK: { label: 'At risk', pill: 'border-warning-200 bg-warning-50 text-warning-800', bar: 'bg-warning-500' },
  CRITICAL: { label: 'Critical', pill: 'border-danger-200 bg-danger-50 text-danger-800', bar: 'bg-danger-500' },
}

const COMPONENT_META: { key: string; label: string; hint: string; weight: number }[] = [
  { key: 'otifPct', label: 'On-time, in-full delivery', hint: 'Delivered by the promised date, complete. Industry target ≥95%.', weight: 30 },
  { key: 'acceptRatePct', label: 'Order accept rate', hint: 'Accepted vs. declined or timed-out order dispatches.', weight: 15 },
  { key: 'qualityPct', label: 'Quality', hint: 'Free of QC failures, reprints, damage reports and disputes.', weight: 20 },
  { key: 'discrepancyCleanPct', label: 'Receiving accuracy', hint: 'Shipments arriving without short/over/damaged reports.', weight: 10 },
  { key: 'capacityHonestyPct', label: 'Capacity accuracy', hint: 'How closely real monthly throughput matches your declared capacity.', weight: 10 },
  { key: 'leadTimeConsistencyPct', label: 'Lead-time consistency', hint: 'Predictability — a tight delivery window scores higher than a fast-but-erratic one.', weight: 10 },
]

interface Features {
  prs?: number | null
  prsBand?: string | null
  prsComponents?: Record<string, number | null> & { penaltyPoints?: number }
  deliveredCount?: number
  activeStrikes?: number
  computedNote?: string
}

export default async function PerformancePage() {
  const user = await requireUser()

  const services = await prisma.partnerService.findMany({
    where: { AND: [serviceOwnedBy(user.id)] },
    select: { id: true, type: true, status: true },
    orderBy: { type: 'asc' },
  })
  if (services.length === 0) return null

  const latest = await Promise.all(
    services.map(async (s) => ({
      service: s,
      feature: await prisma.partnerRiskFeature.findFirst({
        where: { partnerServiceId: s.id },
        orderBy: { computedAt: 'desc' },
      }),
    })),
  )

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Partner · Performance
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Reliability score
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          Recomputed nightly from your real delivery history. Nothing here penalizes you automatically —
          it shows exactly what buyers experience, and exactly where to improve. New services start
          neutral; thin history never lowers a score.
        </p>
      </div>

      {latest.map(({ service, feature }) => {
        const f = (feature?.featuresJson ?? {}) as Features
        const score = f.prs ?? null
        const band = score !== null ? BAND_STYLE[f.prsBand ?? ''] : null
        const components = f.prsComponents ?? {}
        const penalty = components.penaltyPoints ?? 0

        return (
          <section key={service.id} className="rounded-2xl border border-ink-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Gauge className="h-5 w-5 text-ink-500" aria-hidden="true" />
              <h2 className="font-display text-[17px] font-semibold text-ink-900">
                {SERVICE_LABEL[service.type as string] ?? service.type}
              </h2>
              {score !== null && band ? (
                <>
                  <span className="font-display text-[28px] font-bold tabular-nums leading-none text-ink-900">
                    {Math.round(score)}
                  </span>
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider', band.pill)}>
                    {band.label}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                  Building history — neutral standing
                </span>
              )}
              {typeof f.deliveredCount === 'number' && (
                <span className="ml-auto text-[12px] text-ink-500">
                  based on {f.deliveredCount} delivered job{f.deliveredCount === 1 ? '' : 's'} (90 days)
                </span>
              )}
            </div>

            {score === null ? (
              <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-600">
                Your score appears after your first completed orders. Until then you hold neutral
                standing — history you haven't had the chance to build never counts against you.
              </p>
            ) : (
              <div className="mt-5 space-y-3.5">
                {COMPONENT_META.map((c) => {
                  const v = components[c.key]
                  return (
                    <div key={c.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13px] font-medium text-ink-900">
                          {c.label}
                          <span className="ml-2 text-[11px] font-normal text-ink-400">weight {c.weight}%</span>
                        </p>
                        <p className="text-[13px] font-semibold tabular-nums text-ink-900">
                          {typeof v === 'number' ? `${Math.round(v)}%` : 'no data yet'}
                        </p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                        {typeof v === 'number' && (
                          <div
                            className={cn('h-full rounded-full', v >= 90 ? 'bg-success-500' : v >= 70 ? 'bg-warning-500' : 'bg-danger-500')}
                            style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] text-ink-500">{c.hint}</p>
                    </div>
                  )
                })}
                {penalty > 0 && (
                  <p className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] leading-relaxed text-danger-800">
                    −{penalty} point{penalty === 1 ? '' : 's'} from active strikes or unresolved clawbacks.
                    These expire or clear when resolved — ask support if anything looks wrong.
                  </p>
                )}
              </div>
            )}
          </section>
        )
      })}

      <p className="text-[12px] leading-relaxed text-ink-400">
        Scores use only components with real data (missing history is excluded, never counted as zero).
        Weights are platform-wide and identical for every partner. Questions or corrections — contact
        support with your order references.
      </p>
    </div>
  )
}
