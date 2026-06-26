// =============================================================================
// Admin → Support tickets → Analytics (W2-SUP, ops health)
// =============================================================================
//
// Operational metrics the dashboard's tickets-by-category tile doesn't show:
// SLA-breach rate, avg first-response time, median resolution time, plus
// status / priority / category / requester-role distributions. Pure read
// queries over Ticket — no migration (avoids the pending slaResponseMinutes
// column; breach reads slaBreachedAt, set by the SLA cron).

import Link from 'next/link'
import {
  ArrowLeft,
  LineChart,
  Inbox,
  Flame,
  Timer,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import type { TicketStatus, TicketPriority } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { OPEN_STATUSES } from '@ilaunchify/support'
import { cn } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support analytics — Admin' }

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In progress',
  WAITING_ON_REQUESTER: 'Waiting',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function fmtDuration(minutes: number | null): string {
  if (minutes == null) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = minutes / 60
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export default async function SupportAnalyticsPage() {
  await requireRole('ADMIN')

  const open = [...OPEN_STATUSES] as TicketStatus[]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)

  const [
    total,
    openCount,
    breachedCount,
    resolved7d,
    byStatus,
    byPriority,
    byRole,
    responded,
    resolvedRows,
    categories,
    byCategory,
    breachedByCategory,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: { in: open } } }),
    prisma.ticket.count({ where: { slaBreachedAt: { not: null } } }),
    prisma.ticket.count({ where: { status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgo } } }),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['requesterRole'], _count: { _all: true } }),
    // First-response durations (most recent 1000 responded tickets).
    prisma.ticket.findMany({
      where: { firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    // Resolution durations (most recent 1000 resolved tickets).
    prisma.ticket.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
      orderBy: { resolvedAt: 'desc' },
      take: 1000,
    }),
    prisma.ticketCategory.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.ticket.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['categoryId'], _count: { _all: true }, where: { slaBreachedAt: { not: null } } }),
  ])

  // Derived time metrics (minutes).
  const responseMins = responded
    .map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60000)
    .filter((m) => m >= 0)
  const avgResponse = responseMins.length
    ? responseMins.reduce((a, b) => a + b, 0) / responseMins.length
    : null
  const resolveMins = resolvedRows
    .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000)
    .filter((m) => m >= 0)
  const medianResolve = median(resolveMins)

  const breachRate = total > 0 ? (breachedCount / total) * 100 : 0

  const statusMap = new Map(byStatus.map((r) => [r.status as TicketStatus, r._count._all]))
  const priorityMap = new Map(byPriority.map((r) => [r.priority as TicketPriority, r._count._all]))
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  const catTotal = new Map(byCategory.map((r) => [r.categoryId, r._count._all]))
  const catBreached = new Map(breachedByCategory.map((r) => [r.categoryId, r._count._all]))
  const creatorCount = byRole.find((r) => r.requesterRole === 'CREATOR')?._count._all ?? 0
  const partnerCount = byRole.find((r) => r.requesterRole === 'PARTNER')?._count._all ?? 0

  return (
    <div className="space-y-6">
      <Link href="/support-tickets" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tickets
      </Link>

      <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="bg-[var(--bg-hero)] px-5 py-4">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            <LineChart className="h-5 w-5 text-pink-600" aria-hidden="true" />
            Support analytics
          </h1>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">
            How the support queue is performing — response speed, SLA adherence, and where volume
            concentrates. Time metrics use the most recent 1,000 tickets.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-5">
          <Kpi icon={Inbox} label="Open" value={openCount.toLocaleString()} tone="pink" />
          <Kpi icon={Flame} label="SLA breach rate" value={`${breachRate.toFixed(0)}%`} tone="danger" sub={`${breachedCount} total`} />
          <Kpi icon={Timer} label="Avg first response" value={fmtDuration(avgResponse)} tone="info" />
          <Kpi icon={Clock} label="Median resolution" value={fmtDuration(medianResolve)} tone="ink" />
          <Kpi icon={CheckCircle2} label="Resolved · 7d" value={resolved7d.toLocaleString()} tone="success" />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="By status">
          <BarList
            rows={(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => ({
              label: STATUS_LABEL[s],
              value: statusMap.get(s) ?? 0,
            }))}
            total={total}
            tone="blue"
          />
        </Panel>

        <Panel title="By priority">
          <BarList
            rows={(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as TicketPriority[]).map((p) => ({
              label: PRIORITY_LABEL[p],
              value: priorityMap.get(p) ?? 0,
            }))}
            total={total}
            tone="amber"
          />
        </Panel>

        <Panel title="By requester">
          <BarList
            rows={[
              { label: 'Creators', value: creatorCount },
              { label: 'Partners', value: partnerCount },
            ]}
            total={creatorCount + partnerCount}
            tone="pink"
          />
        </Panel>

        <Panel title="By category">
          {categories.length === 0 ? (
            <p className="text-[12.5px] text-ink-400">No categories.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[12px] uppercase tracking-wider text-ink-700">
                <tr>
                  <th className="pb-1 text-left font-semibold">Category</th>
                  <th className="pb-1 text-right font-semibold">Tickets</th>
                  <th className="pb-1 text-right font-semibold">Breached</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {categories.map((c) => {
                  const tot = catTotal.get(c.id) ?? 0
                  const br = catBreached.get(c.id) ?? 0
                  if (tot === 0) return null
                  return (
                    <tr key={c.id}>
                      <td className="py-1.5 text-ink-800">{catName.get(c.id) ?? c.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-700">{tot}</td>
                      <td className={cn('py-1.5 text-right tabular-nums', br > 0 ? 'font-semibold text-rose-700' : 'text-ink-400')}>{br}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: typeof Inbox
  label: string
  value: string
  tone: 'ink' | 'pink' | 'info' | 'success' | 'danger'
  sub?: string
}) {
  const numeralTone = {
    ink: 'text-ink-900',
    pink: 'text-pink-700',
    info: 'text-blue-700',
    success: 'text-emerald-700',
    danger: 'text-rose-700',
  }[tone]
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className={cn('mt-1 font-display text-[22px] font-semibold tabular-nums leading-none tracking-tight', numeralTone)}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10.5px] text-ink-400">{sub}</p>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-900">{title}</h2>
      {children}
    </section>
  )
}

function BarList({
  rows,
  total,
  tone,
}: {
  rows: { label: string; value: number }[]
  total: number
  tone: 'blue' | 'amber' | 'pink'
}) {
  const barTone = { blue: 'bg-blue-500', amber: 'bg-amber-500', pink: 'bg-pink-500' }[tone]
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
        return (
          <li key={r.label} className="flex items-center gap-3 text-[12.5px]">
            <span className="w-28 flex-none text-ink-700">{r.label}</span>
            <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
              <span
                className={cn('absolute inset-y-0 left-0 rounded-full', barTone)}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </span>
            <span className="w-16 flex-none text-right tabular-nums text-ink-600">
              {r.value} <span className="text-ink-400">· {pct}%</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
