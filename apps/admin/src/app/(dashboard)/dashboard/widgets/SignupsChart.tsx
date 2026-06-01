// Admin Dashboard — last-30-days signups chart (creators vs partners).
//
// Pure SVG dual-line chart with subtle area fills, axis labels, and totals
// summary above. No chart library — keeps the admin app's bundle slim and
// gives us full design control over the locked tokens.
//
// Hover affordance is intentionally minimal (the chart is a glance widget,
// not an analytical surface). Clicking the card title or summary CTA jumps
// to the bare /tiers and /partners surfaces.

import { Users } from 'lucide-react'
import { DashboardCard, EmptyState } from './OrdersByStatusChart'
import type { SignupsTimeseriesPoint } from '../dashboard-data'

const W = 640
const H = 180
const PAD_L = 30
const PAD_R = 14
const PAD_T = 14
const PAD_B = 22

export function SignupsChart({ data }: { data: SignupsTimeseriesPoint[] }) {
  const totalCreators = data.reduce((acc, p) => acc + p.creators, 0)
  const totalPartners = data.reduce((acc, p) => acc + p.partners, 0)
  const maxY = Math.max(
    1,
    ...data.map((p) => Math.max(p.creators, p.partners)),
  )

  const xStep = data.length > 1 ? (W - PAD_L - PAD_R) / (data.length - 1) : 0
  const yRange = H - PAD_T - PAD_B
  const yFor = (n: number) => H - PAD_B - (n / maxY) * yRange
  const xFor = (i: number) => PAD_L + i * xStep

  const creatorsPath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.creators)}`)
    .join(' ')
  const partnersPath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.partners)}`)
    .join(' ')
  const creatorsArea = `${creatorsPath} L ${xFor(data.length - 1)} ${H - PAD_B} L ${xFor(0)} ${H - PAD_B} Z`
  const partnersArea = `${partnersPath} L ${xFor(data.length - 1)} ${H - PAD_B} L ${xFor(0)} ${H - PAD_B} Z`

  // Y-axis tick lines (3 lines: bottom, mid, top).
  const yTicks = [0, Math.ceil(maxY / 2), maxY]
  const firstLabel = formatDateLabel(data[0]?.date)
  const lastLabel = formatDateLabel(data[data.length - 1]?.date)

  return (
    <DashboardCard
      title="Signups · last 30 days"
      subtitle={`${totalCreators} creators · ${totalPartners} partners`}
      icon={Users}
      href="/tiers"
      ctaLabel="Open Tiers"
    >
      {totalCreators === 0 && totalPartners === 0 ? (
        <EmptyState label="No signups in the last 30 days." />
      ) : (
        <div className="space-y-3">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-600">
            <LegendDot tone="pink" label="Creators" total={totalCreators} />
            <LegendDot tone="ink" label="Partners" total={totalPartners} />
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Daily signups for the last 30 days"
            className="w-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yFor(t)}
                  y2={yFor(t)}
                  stroke="#EEEFF1"
                  strokeWidth="1"
                />
                <text
                  x={PAD_L - 6}
                  y={yFor(t) + 3}
                  fontSize="9"
                  textAnchor="end"
                  fill="#9A9CA6"
                  className="tabular-nums"
                >
                  {t}
                </text>
              </g>
            ))}

            {/* Partners area + line (back layer) */}
            <path d={partnersArea} fill="#18181A" fillOpacity="0.06" />
            <path
              d={partnersPath}
              fill="none"
              stroke="#18181A"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Creators area + line (front layer) */}
            <path d={creatorsArea} fill="#FF2E63" fillOpacity="0.1" />
            <path
              d={creatorsPath}
              fill="none"
              stroke="#FF2E63"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* X-axis labels: first & last only */}
            <text x={PAD_L} y={H - 6} fontSize="9.5" fill="#9A9CA6">
              {firstLabel}
            </text>
            <text
              x={W - PAD_R}
              y={H - 6}
              fontSize="9.5"
              fill="#9A9CA6"
              textAnchor="end"
            >
              {lastLabel}
            </text>
          </svg>
        </div>
      )}
    </DashboardCard>
  )
}

function LegendDot({
  tone,
  label,
  total,
}: {
  tone: 'pink' | 'ink'
  label: string
  total: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={
          'inline-block h-2 w-2 rounded-full ' +
          (tone === 'pink' ? 'bg-pink-500' : 'bg-ink-900')
        }
      />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-ink-500">· {total}</span>
    </span>
  )
}

function formatDateLabel(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
