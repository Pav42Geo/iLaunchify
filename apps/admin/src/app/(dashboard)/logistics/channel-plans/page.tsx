// =============================================================================
// Admin channel-inbound plans list — v2 surface (Phase L3b)
// =============================================================================
//
// ChannelInboundPlan rows: factory→channel-FC inbound plans (Amazon FBA /
// Walmart WFS / TikTok FBT) — docs/LOGISTICS_AND_FULFILLMENT.md §7 + §9.
// Layout follows the locked admin surface pattern (hero band + KPI strip +
// URL chip filters + sortable table + RowActionsMenu + 50/page paginator).
// See memory: ilaunchify-admin-surface-pattern.md · canonical: /partners.
//
// Query params (parsed in plan-data.ts):
//   ?q=ILF-2607        — search order ref / creator / channel / external plan id
//   ?status=DRAFT      — ChannelInboundPlanStatus chip
//   ?channel=amazon    — Channel.code chip
//   ?sort=order|creator|channel|appointment|status|createdAt   (default createdAt)
//   ?dir=asc|desc      (default desc)
//   ?page=2            — pagination (50 / page)

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileClock,
  PackageCheck,
  PlaneTakeoff,
  Search,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ChannelInboundPlanStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { PlanRowActions } from './PlanRowActions'
import {
  buildPlanHref,
  formatCents,
  loadPlanData,
  placementLabel,
  PLAN_STATUS_LABEL,
  PLAN_STATUS_ORDER,
  type ParsedPlanFilters,
  type PlanRow,
  type PlanSortKey,
  type SortDir,
} from './plan-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel inbound plans — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

type StatusPillTone = { bg: string; text: string; border: string; dot: string }

const STATUS_PILL: Record<ChannelInboundPlanStatus, StatusPillTone> = {
  DRAFT: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  CONFIRMED: { bg: 'bg-info-100', text: 'text-info-800', border: 'border-info-200', dot: 'bg-info-500' },
  SHIPPED: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200', dot: 'bg-pink-500' },
  CHECKED_IN: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  RECONCILED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  CANCELLED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    channel?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function ChannelPlansPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadPlanData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Channel inbound"
        title="Channel inbound plans"
        description="Factory→channel-FC inbound plans across creators (Amazon FBA, Walmart WFS, TikTok FBT) — placement choices, appointments and check-in reconciliation. Plans confirm via SP-API once Amazon developer approval lands."
      />

      <PlanKpiStrip kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        channelOrder={data.channelOrder}
        channelNames={data.channelNames}
        channelCounts={data.channelCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={Boolean(data.filters.q || data.filters.status || data.filters.channel)} />
      ) : (
        <PlanTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function PlanKpiStrip({
  kpis,
}: {
  kpis: {
    total: number
    draftCount: number
    inFlightCount: number
    checkedIn7d: number
    reconDiffCount: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href="/logistics/channel-plans"
        label="Total plans"
        value={kpis.total}
        icon={ClipboardList}
        active
        subline={kpis.total > 0 ? 'All channels' : undefined}
      />
      <KpiCard
        href={buildDefaultHref({ status: 'DRAFT' })}
        label="Draft"
        value={kpis.draftCount}
        icon={FileClock}
        tone="amber"
        subline="Awaiting SP-API confirm"
      />
      <KpiCard
        href={buildDefaultHref({ status: 'CONFIRMED' })}
        label="In flight"
        value={kpis.inFlightCount}
        icon={Truck}
        tone="sky"
        subline="Confirmed + shipped"
      />
      <KpiCard
        href={buildDefaultHref({ status: 'CHECKED_IN' })}
        label="Checked in (7d)"
        value={kpis.checkedIn7d}
        icon={PackageCheck}
        tone="emerald"
      />
      <KpiCard
        href={buildDefaultHref({ status: 'RECONCILED' })}
        label="Reconciliation diffs"
        value={kpis.reconDiffCount}
        icon={AlertTriangle}
        tone="rose"
        subline="Received ≠ expected"
      />
    </div>
  )
}

/** Href builder for KPI cards (fresh filter set, one override). */
function buildDefaultHref(overrides: { status?: string; channel?: string }): string {
  const params = new URLSearchParams()
  if (overrides.status) params.set('status', overrides.status)
  if (overrides.channel) params.set('channel', overrides.channel)
  const qs = params.toString()
  return qs ? `/logistics/channel-plans?${qs}` : '/logistics/channel-plans'
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'pink'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-warning-300/60',
    emerald: 'group-hover:ring-success-300/60',
    sky: 'group-hover:ring-info-300/60',
    rose: 'group-hover:ring-danger-300/60',
    pink: 'group-hover:ring-pink-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
    rose: 'bg-danger-100 text-danger-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// FilterBar — search + status chips + channel chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  channelOrder,
  channelNames,
  channelCounts,
  totalFiltered,
}: {
  filters: ParsedPlanFilters
  statusCounts: Record<ChannelInboundPlanStatus, number>
  channelOrder: string[]
  channelNames: Record<string, string>
  channelCounts: Record<string, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.channel)

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search order, creator, channel, or plan id…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.channel && <input type="hidden" name="channel" value={filters.channel} />}
        {filters.sort !== 'createdAt' && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir !== 'desc' && <input type="hidden" name="dir" value={filters.dir} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {hasAnyFilter && (
          <Link
            href="/logistics/channel-plans"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{totalFiltered.toLocaleString()} results</span>
        </div>
      </form>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip
          href={buildPlanHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {PLAN_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            href={buildPlanHref(filters, { status, page: 1 })}
            active={filters.status === status}
            label={PLAN_STATUS_LABEL[status]}
            count={statusCounts[status]}
            tone={STATUS_PILL[status]}
          />
        ))}
      </div>

      {/* Channel chips (codes present across all plans) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Channel
        </span>
        <FilterChip
          href={buildPlanHref(filters, { channel: '', page: 1 })}
          active={!filters.channel}
          label="All"
          count={null}
        />
        {channelOrder.map((code) => (
          <FilterChip
            key={code}
            href={buildPlanHref(filters, { channel: code, page: 1 })}
            active={filters.channel === code}
            label={channelNames[code] ?? code}
            count={channelCounts[code] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  tone?: StatusPillTone
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : tone
            ? `${tone.bg} ${tone.text} ${tone.border} hover:bg-white`
            : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {tone && !active && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {label}
      {count !== null && (
        <span
          className={cn(
            'text-[10.5px] tabular-nums',
            active ? 'text-white/70' : 'text-ink-500',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

// =============================================================================
// Table
// =============================================================================

function PlanTable({ rows, filters }: { rows: PlanRow[]; filters: ParsedPlanFilters }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="order" filters={filters}>
              Order
            </SortableTh>
            <SortableTh sortKey="creator" filters={filters}>
              Creator
            </SortableTh>
            <SortableTh sortKey="channel" filters={filters}>
              Channel
            </SortableTh>
            <Th>External plan</Th>
            <Th>Placement · est. fees</Th>
            <SortableTh sortKey="appointment" filters={filters}>
              Appointment
            </SortableTh>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <SortableTh sortKey="createdAt" filters={filters} className="text-right">
              Created
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const tone = STATUS_PILL[r.status]
            const placement = placementLabel(r.placementChoice)
            return (
              <tr key={r.planId} className="transition-colors hover:bg-pink-50/20">
                {/* Order ref */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/orders/${r.orderId}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.orderRef}
                  </Link>
                </td>

                {/* Creator */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/creators/${r.creatorId}`}
                    className="text-ink-700 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.creatorLabel}
                  </Link>
                </td>

                {/* Channel */}
                <td className="px-3 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-ink-800">{r.channelName}</span>
                    <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium uppercase text-ink-600">
                      {r.channelCode}
                    </span>
                  </span>
                </td>

                {/* External plan id */}
                <td className="px-3 py-3 align-top">
                  <span className="font-mono text-[11px] text-ink-600" title={r.externalPlanId}>
                    {r.externalPlanId.length > 22
                      ? `${r.externalPlanId.slice(0, 22)}…`
                      : r.externalPlanId}
                  </span>
                </td>

                {/* Placement + est fees */}
                <td className="px-3 py-3 align-top">
                  {placement ? (
                    <div>
                      <span className="text-ink-800">{placement}</span>
                      {r.chosenFeeCents !== null && (
                        <p className="mt-0.5 text-[11px] tabular-nums text-ink-500">
                          est. {formatCents(r.chosenFeeCents)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Appointment */}
                <td className="px-3 py-3 align-top">
                  {r.appointmentAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                      title={r.appointmentAt.toLocaleString()}
                    >
                      <CalendarClock className="h-3 w-3 text-ink-400" />
                      {formatDate(r.appointmentAt)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Status pill (+ reconciliation-diff flag) */}
                <td className="px-3 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                        tone.bg,
                        tone.text,
                        tone.border,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                      {PLAN_STATUS_LABEL[r.status]}
                    </span>
                    {r.hasReconDiff && (
                      <span
                        className="text-danger-600"
                        title="Reconciliation mismatch — received differs from expected"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                </td>

                {/* Created */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={r.createdAt.toLocaleString()}
                  >
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatRelative(r.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <PlanRowActions
                    planId={r.planId}
                    orderId={r.orderId}
                    creatorId={r.creatorId}
                    orderRef={r.orderRef}
                    externalPlanId={r.externalPlanId}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function SortableTh({
  sortKey,
  filters,
  children,
  className,
}: {
  sortKey: PlanSortKey
  filters: ParsedPlanFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  // Clicking an already-active column flips direction; a new column defaults to
  // desc (createdAt/appointment) or asc (order/creator/channel/status).
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'createdAt' || sortKey === 'appointment'
      ? 'desc'
      : 'asc'
  const href = buildPlanHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
  const ArrowIcon = isActive ? (filters.dir === 'asc' ? ArrowUp : ArrowDown) : null
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
        )}
      >
        {children}
        {ArrowIcon && <ArrowIcon className="h-3 w-3" />}
      </Link>
    </th>
  )
}

// =============================================================================
// Pagination
// =============================================================================

function Pagination({
  filters,
  totalPages,
}: {
  filters: ParsedPlanFilters
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {filters.page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 && (
          <Link
            href={buildPlanHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildPlanHref(filters, { page: filters.page + 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <PlaneTakeoff className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No inbound plans match' : 'No channel inbound plans yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Plans appear when a creator routes an order into a connected sales channel (FBA / WFS / FBT). SP-API confirmation is pending Amazon developer approval.'}
      </p>
      {filtered && (
        <Link
          href="/logistics/channel-plans"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      )}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w ago`
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))}mo ago`
  return `${Math.floor(diff / (365 * 86400))}y ago`
}
