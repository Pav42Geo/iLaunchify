// Partner Performance — the partner-visible Reliability Score (Risk Center M3,
// docs/RISK_MANAGEMENT_CENTER.md §3; Pavel 2026-07-05: FULL breakdown, not
// badge-only — transparency is the self-correction mechanism, per Amazon's
// Account Health model).
//
// Restyled 2026-07-12 1:1 to the "Performance" panel of
// design/partner-profile-prototype-v2.html (perf-rows + KPI strip) using the
// settings panel kit. Read-only: shows the latest nightly PartnerRiskFeature
// snapshot per service. The score consumes nothing punitive automatically —
// hard gates (compliance) live elsewhere; this page tells the partner exactly
// what to improve.

import { Gauge } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { PanelCard, PanelHeader, KpiStrip, StPill, type PillTone } from '@/components/panel-kit'
import { serviceOwnedBy } from '@/lib/partner-context'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Performance — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment Center',
}

const BAND_META: Record<string, { label: string; tone: PillTone }> = {
  HEALTHY: { label: 'Healthy', tone: 'ok' },
  AT_RISK: { label: 'At risk', tone: 'warn' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
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
    // Prototype #p-performance — no page hero (Pavel 2026-07-13); one panel
    // per service, honesty note as the page footer.
    <div className="space-y-6">
      {latest.map(({ service, feature }) => {
        const f = (feature?.featuresJson ?? {}) as Features
        const score = f.prs ?? null
        const band = score !== null ? BAND_META[f.prsBand ?? ''] : null
        const components = f.prsComponents ?? {}
        const penalty = components.penaltyPoints ?? 0

        // Real summary numbers only — an item renders only when the snapshot has it.
        const kpis: { v: React.ReactNode; l: string; vClassName?: string }[] = []
        if (score !== null) kpis.push({ v: Math.round(score), l: 'Reliability score' })
        if (band) {
          kpis.push({
            v: band.label,
            l: 'Health band',
            vClassName: band.tone === 'ok' ? 'text-success-700' : band.tone === 'warn' ? 'text-warning-700' : 'text-danger-700',
          })
        }
        if (typeof f.deliveredCount === 'number') kpis.push({ v: f.deliveredCount.toLocaleString(), l: 'Delivered (90 days)' })
        if (typeof f.activeStrikes === 'number') {
          kpis.push({
            v: f.activeStrikes,
            l: 'Active strikes',
            vClassName: f.activeStrikes > 0 ? 'text-danger-700' : 'text-success-700',
          })
        }

        return (
          <PanelCard key={service.id}>
            <PanelHeader
              title={SERVICE_LABEL[service.type as string] ?? service.type}
              desc={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {score !== null && band ? (
                    <StPill tone={band.tone}>Band: {band.label}</StPill>
                  ) : (
                    <StPill tone="muted">Building history — neutral standing</StPill>
                  )}
                  {typeof f.deliveredCount === 'number' && (
                    <span>
                      based on {f.deliveredCount} delivered job{f.deliveredCount === 1 ? '' : 's'} (90 days)
                    </span>
                  )}
                </span>
              }
              aside={
                score !== null ? (
                  <span className="flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-ink-400" aria-hidden="true" />
                    <span className="font-display text-[28px] font-bold tabular-nums leading-none text-ink-900">
                      {Math.round(score)}
                    </span>
                  </span>
                ) : undefined
              }
            />

            {score === null ? (
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-600">
                Your score appears after your first completed orders. Until then you hold neutral
                standing — history you haven't had the chance to build never counts against you.
              </p>
            ) : (
              <>
                {/* .perf-row: 190px label · flex-1 9px track · w-24 value */}
                <div>
                  {COMPONENT_META.map((c) => {
                    const v = components[c.key]
                    return (
                      <div key={c.key} className="flex items-center gap-3.5 border-b border-ink-100 py-[11px] last:border-b-0">
                        <div className="w-[190px] flex-none">
                          <p className="text-[13px] font-semibold leading-snug text-ink-900">{c.label}</p>
                          <p className="mt-px text-[11px] leading-snug text-ink-500">
                            weight {c.weight}% · {c.hint}
                          </p>
                        </div>
                        <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-ink-100">
                          {typeof v === 'number' && (
                            <div
                              className={cn('h-full rounded-full', v >= 90 ? 'bg-success-500' : v >= 70 ? 'bg-warning-500' : 'bg-danger-500')}
                              style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
                            />
                          )}
                        </div>
                        <div className="w-24 flex-none text-right text-[13px] font-bold tabular-nums text-ink-900">
                          {typeof v === 'number' ? `${Math.round(v)}%` : <span className="font-normal text-ink-400">no data yet</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {penalty > 0 && (
                  <p className="mt-4 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] leading-relaxed text-danger-800">
                    −{penalty} point{penalty === 1 ? '' : 's'} from active strikes or unresolved clawbacks.
                    These expire or clear when resolved — ask support if anything looks wrong.
                  </p>
                )}

                {kpis.length > 0 && <KpiStrip items={kpis} className="mb-0 mt-4" />}
              </>
            )}
          </PanelCard>
        )
      })}

      <p className="text-[12px] leading-relaxed text-ink-400">
        Recomputed nightly from your real delivery history — nothing here penalizes you automatically;
        it shows exactly what buyers experience and where to improve. Scores use only components with
        real data (missing history is excluded, never counted as zero). Weights are platform-wide and
        identical for every partner. Questions or corrections — contact support with your order
        references.
      </p>
    </div>
  )
}
