// =============================================================================
// Admin Risk Inbox — v2 surface (Risk Center M2,
// docs/RISK_MANAGEMENT_CENTER.md §7 + RISK_CENTER_IMPLEMENTATION_PLAN.md M2)
// =============================================================================
//
// One inbox for every detector's RiskEvents — the case-management half of the
// decision engine. Detectors write rows (MONITOR logs silently, WARN/GATE/ACT
// escalate); admins triage here. Row actions deep-link to the event detail
// page — never inline-mutate (locked admin surface pattern).
//
// KPI decisions (Pavel 2026-07-05): "$ at risk" = ORDER REVENUE of open
// Order-entity events (creator-pain view); platform fee is the secondary view
// on the detail page.
//
// Query params:
//   ?status=OPEN|ACK|RESOLVED|MUTED|FALSE_POSITIVE   — status chip (default OPEN)
//   ?severity=INFO|WARN|HIGH|CRITICAL                — severity chip
//   ?detector=CAPACITY_OVERCOMMIT                    — detector chip
//   ?page=2                                          — pagination (50 / page)

import Link from 'next/link'
import { AlertTriangle, Flame, ShoppingBag, DollarSign, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { DETECTORS, type DetectorKey } from '@ilaunchify/risk'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Risk Inbox — Admin' }

const PAGE_SIZE = 50

type StatusKey = 'OPEN' | 'ACK' | 'RESOLVED' | 'MUTED' | 'FALSE_POSITIVE'
type SeverityKey = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

const STATUS_LABEL: Record<StatusKey, string> = {
  OPEN: 'Open',
  ACK: 'Acknowledged',
  RESOLVED: 'Resolved',
  MUTED: 'Muted',
  FALSE_POSITIVE: 'False positive',
}

const SEVERITY_PILL: Record<SeverityKey, string> = {
  INFO: 'border-ink-200 bg-ink-50 text-ink-700',
  WARN: 'border-warning-200 bg-warning-50 text-warning-800',
  HIGH: 'border-danger-200 bg-danger-50 text-danger-800',
  CRITICAL: 'border-danger-300 bg-danger-100 text-danger-900',
}

const STATUSES: StatusKey[] = ['OPEN', 'ACK', 'RESOLVED', 'MUTED', 'FALSE_POSITIVE']
const SEVERITIES: SeverityKey[] = ['CRITICAL', 'HIGH', 'WARN', 'INFO']

function detectorTitle(key: string): string {
  return DETECTORS[key as DetectorKey]?.title ?? key
}

function buildHref(params: { status?: string; severity?: string; detector?: string; page?: number }): string {
  const qs = new URLSearchParams()
  if (params.status && params.status !== 'OPEN') qs.set('status', params.status)
  if (params.severity) qs.set('severity', params.severity)
  if (params.detector) qs.set('detector', params.detector)
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  const s = qs.toString()
  return s ? `/risk?${s}` : '/risk'
}

function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'Order') return `/orders/${entityId}`
  if (entityType === 'Partner') return `/partners/${entityId}`
  return null
}

export default async function RiskInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; detector?: string; page?: string }>
}) {
  await requireCapability('orders:read')
  const sp = await searchParams
  const status: StatusKey = STATUSES.includes(sp.status as StatusKey) ? (sp.status as StatusKey) : 'OPEN'
  const severity = SEVERITIES.includes(sp.severity as SeverityKey) ? (sp.severity as SeverityKey) : undefined
  const detector = sp.detector
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const where = {
    status,
    ...(severity ? { severity } : {}),
    ...(detector ? { detectorKey: detector } : {}),
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [statusCounts, detectorCounts, total, rows, openHighCritical, openOrderEvents, gatesThisWeek] =
    await Promise.all([
      prisma.riskEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.riskEvent.groupBy({ by: ['detectorKey'], where: { status }, _count: { _all: true } }),
      prisma.riskEvent.count({ where }),
      prisma.riskEvent.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: status === 'OPEN' ? 'asc' : 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          detectorKey: true,
          severity: true,
          entityType: true,
          entityId: true,
          decision: true,
          scoreSnapshotJson: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.riskEvent.count({ where: { status: 'OPEN', severity: { in: ['HIGH', 'CRITICAL'] } } }),
      prisma.riskEvent.findMany({
        where: { status: 'OPEN', entityType: 'Order' },
        select: { entityId: true },
        distinct: ['entityId'],
      }),
      prisma.riskEvent.count({ where: { decision: 'GATED', createdAt: { gte: sevenDaysAgo } } }),
    ])

  // "$ at risk" = order revenue across distinct open Order-entity events.
  const orderIds = openOrderEvents.map((e) => e.entityId)
  const revenueAtRisk =
    orderIds.length > 0
      ? await prisma.order.aggregate({ where: { id: { in: orderIds } }, _sum: { totalCents: true } })
      : null
  const revenueAtRiskCents = revenueAtRisk?._sum.totalCents ?? 0

  const countOf = (s: StatusKey) => statusCounts.find((c) => c.status === s)?._count._all ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Risk Center"
        title="Risk Inbox"
        description="Every detector's events in one queue. MONITOR-mode rows are shadow findings — nothing was blocked; they calibrate thresholds before promotion. Adjudicate on the event page."
        actions={
          <Link
            href="/risk/detectors"
            className="inline-flex items-center rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            Detector settings
          </Link>
        }
      />

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Open events" value={countOf('OPEN')} icon={AlertTriangle} tone={countOf('OPEN') > 0 ? 'warning' : 'ink'} href={buildHref({ status: 'OPEN' })} />
        <Kpi label="High / critical" value={openHighCritical} icon={Flame} tone={openHighCritical > 0 ? 'danger' : 'ink'} href={buildHref({ status: 'OPEN', severity: 'HIGH' })} />
        <Kpi label="Orders at risk" value={orderIds.length} icon={ShoppingBag} tone={orderIds.length > 0 ? 'warning' : 'ink'} href={buildHref({ status: 'OPEN' })} />
        <Kpi label="$ at risk" value={Math.round(revenueAtRiskCents / 100)} icon={DollarSign} tone={revenueAtRiskCents > 0 ? 'danger' : 'ink'} href={buildHref({ status: 'OPEN' })} prefix="$" />
        <Kpi label="Gates (7d)" value={gatesThisWeek} icon={ShieldAlert} tone="ink" href={buildHref({ status: 'OPEN' })} />
      </section>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, severity, detector })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              status === s ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {STATUS_LABEL[s]}
            <span className={cn('tabular-nums', status === s ? 'text-white/70' : 'text-ink-400')}>{countOf(s)}</span>
          </Link>
        ))}
      </div>

      {/* Severity + detector chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SEVERITIES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status, severity: severity === s ? undefined : s, detector })}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              severity === s ? 'border-ink-900 bg-ink-900 text-white' : SEVERITY_PILL[s],
            )}
          >
            {s}
          </Link>
        ))}
        {detectorCounts.length > 0 && <span className="mx-1 h-4 w-px bg-ink-200" aria-hidden="true" />}
        {detectorCounts.map((d) => (
          <Link
            key={d.detectorKey}
            href={buildHref({ status, severity, detector: detector === d.detectorKey ? undefined : d.detectorKey })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              detector === d.detectorKey ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {d.detectorKey}
            <span className={cn('tabular-nums', detector === d.detectorKey ? 'text-white/70' : 'text-ink-400')}>
              {d._count._all}
            </span>
          </Link>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <h2 className="font-display text-[17px] font-semibold text-ink-900">
            No {STATUS_LABEL[status].toLowerCase()} events
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            {status === 'OPEN'
              ? 'When a detector fires (checkout capacity checks, nightly sweeps, webhooks), the event lands here.'
              : 'Nothing in this bucket right now.'}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-5 py-2.5 font-semibold">Detector</th>
                  <th className="px-3 py-2.5 font-semibold">Severity</th>
                  <th className="px-3 py-2.5 font-semibold">Entity</th>
                  <th className="px-3 py-2.5 font-semibold">Decision</th>
                  <th className="px-3 py-2.5 font-semibold">Score</th>
                  <th className="px-3 py-2.5 font-semibold">Created</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = entityHref(r.entityType, r.entityId)
                  const score = (r.scoreSnapshotJson as { score?: number } | null)?.score
                  return (
                    <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-900">{detectorTitle(r.detectorKey)}</p>
                        <p className="font-mono text-[10.5px] text-ink-500">{r.detectorKey}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', SEVERITY_PILL[r.severity as SeverityKey])}>
                          {r.severity}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {href ? (
                          <Link href={href} className="font-mono text-[11.5px] text-ink-700 underline decoration-ink-300 underline-offset-2 hover:text-ink-900">
                            {r.entityType} · {r.entityId.slice(-8)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11.5px] text-ink-700">
                            {r.entityType} · {r.entityId.slice(-8)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-ink-700">{r.decision}</td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-700">{typeof score === 'number' ? score : '—'}</td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">{r.createdAt.toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          <Link
                            href={`/risk/${r.id}`}
                            className="inline-flex items-center rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                          >
                            {r.status === 'OPEN' ? 'Triage' : 'View'}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Paginator */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-ink-600">
          <span>
            Page {page} of {totalPages} · {total} event{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildHref({ status, severity, detector, page: page - 1 })} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium hover:border-ink-400">
                Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildHref({ status, severity, detector, page: page + 1 })} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium hover:border-ink-400">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  href,
  prefix,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'ink' | 'danger' | 'warning'
  href: string
  prefix?: string
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    danger: 'bg-danger-100 text-danger-700',
    warning: 'bg-warning-100 text-warning-700',
  }
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {prefix}
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}
