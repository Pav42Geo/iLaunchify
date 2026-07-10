// =============================================================================
// Admin Briefs — co-creation oversight list (spec §10/§16 P0, 2026-07-10)
// =============================================================================
//
// READ-ONLY oversight over creator-originated ProductBriefs. Follows the
// LOCKED v2 admin surface pattern (memory: ilaunchify-admin-surface-pattern):
// hero band + 5-card KPI strip + URL-driven filter chips + sortable plain
// table + RowActionsMenu (deep-links only — NO mutations anywhere) + 50/page.
//
// Query params (parsed in briefs-data.ts):
//   ?q=matcha          — search on title
//   ?status=POSTED     — BriefStatus chip
//   ?niche=wellness    — niche dropdown (Layer-1 slug)
//   ?sort=createdAt|title|interests   (default createdAt)
//   ?dir=asc|desc      (default desc)
//   ?page=2            — pagination (50 / page)

import Link from 'next/link'
import {
  Lightbulb,
  Radar,
  DoorOpen,
  Handshake,
  TrendingUp,
  Search,
  ArrowDown,
  ArrowUp,
  Calendar,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BriefStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { BriefRowActions } from './BriefRowActions'
import {
  BRIEF_STATUS_LABEL,
  BRIEF_STATUS_ORDER,
  BRIEF_STATUS_PILL,
  buildBriefsHref,
  loadBriefsData,
  type BriefRow,
  type BriefsSortKey,
  type NicheOption,
  type ParsedBriefFilters,
  type SortDir,
} from './briefs-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Briefs — Admin' }

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    niche?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function BriefsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadBriefsData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Marketplace · Co-creation"
        title="Product briefs"
        description="Creator-originated product briefs across the co-creation funnel — pool activity, interest volume, and brief→room conversion. Read-only oversight; every action deep-links."
      />

      <BriefsKpiStrip kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        niches={data.niches}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState
          filtered={Boolean(data.filters.q || data.filters.status || data.filters.niche)}
        />
      ) : (
        <BriefsTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function BriefsKpiStrip({
  kpis,
}: {
  kpis: {
    total: number
    openInPool: number
    inRooms: number
    interests7d: number
    conversionPct: number
    nonDraft: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href="/briefs"
        label="Total briefs"
        value={kpis.total}
        icon={Lightbulb}
        active
      />
      <KpiCard
        href="/briefs?status=INTEREST_OPEN"
        label="Open in pool"
        value={kpis.openInPool}
        icon={Radar}
        tone="pink"
        subline="Interest open + shortlisting"
      />
      <KpiCard
        href="/briefs?status=IN_ROOM"
        label="In rooms"
        value={kpis.inRooms}
        icon={DoorOpen}
        tone="emerald"
        subline="Matched + in room"
      />
      <KpiCard
        href="/briefs?sort=interests&dir=desc"
        label="Interests · 7d"
        value={kpis.interests7d}
        icon={Handshake}
        tone="sky"
        subline="Express-Interest submissions"
      />
      <KpiCard
        href="/briefs?status=COMPLETED"
        label="Conversion"
        value={`${kpis.conversionPct}%`}
        icon={TrendingUp}
        tone="amber"
        subline={`Room+ of ${kpis.nonDraft.toLocaleString()} posted`}
      />
    </div>
  )
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
  value: number | string
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
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// FilterBar — search + niche dropdown + status chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  niches,
  totalFiltered,
}: {
  filters: ParsedBriefFilters
  statusCounts: Record<BriefStatus, number>
  niches: NicheOption[]
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.niche)

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search + niche row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search brief title…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Niche
          <select
            name="niche"
            defaultValue={filters.niche ?? ''}
            className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] font-normal normal-case tracking-normal text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          >
            <option value="">All niches</option>
            {niches.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        {/* Preserve other filters across submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
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
            href="/briefs"
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
          href={buildBriefsHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {BRIEF_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            href={buildBriefsHref(filters, { status, page: 1 })}
            active={filters.status === status}
            label={BRIEF_STATUS_LABEL[status]}
            count={statusCounts[status]}
            tone={BRIEF_STATUS_PILL[status]}
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
  tone?: { bg: string; text: string; border: string; dot: string }
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

function BriefsTable({
  rows,
  filters,
}: {
  rows: BriefRow[]
  filters: ParsedBriefFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="title" filters={filters}>
              Brief
            </SortableTh>
            <Th>Niche</Th>
            <Th>Category</Th>
            <Th>Status</Th>
            <SortableTh sortKey="interests" filters={filters} className="text-right">
              Interests
            </SortableTh>
            <SortableTh sortKey="createdAt" filters={filters} className="text-right">
              Created
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((b) => {
            const tone = BRIEF_STATUS_PILL[b.status]
            return (
              <tr key={b.id} className="transition-colors hover:bg-pink-50/20">
                {/* Brief */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/briefs/${b.id}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {b.title}
                  </Link>
                  <Link
                    href={`/creators/${b.creatorId}`}
                    className="mt-0.5 block text-[11px] text-ink-500 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {b.creatorName}
                  </Link>
                </td>

                {/* Niche */}
                <td className="px-3 py-3 align-top">
                  <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700">
                    {b.nicheSlug}
                  </span>
                </td>

                {/* Category */}
                <td className="px-3 py-3 align-top text-[11.5px] text-ink-600">
                  {b.categoryName}
                </td>

                {/* Status pill */}
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      tone.bg,
                      tone.text,
                      tone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {BRIEF_STATUS_LABEL[b.status]}
                  </span>
                </td>

                {/* Interests */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span
                    className={
                      b.interestsCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'
                    }
                  >
                    {b.interestsCount}
                  </span>
                </td>

                {/* Created */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={b.createdAt.toLocaleString()}
                  >
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatRelative(b.createdAt)}
                  </span>
                </td>

                {/* Actions — deep-links ONLY (read-only oversight) */}
                <td className="px-3 py-3 text-right align-top">
                  <BriefRowActions
                    briefId={b.id}
                    title={b.title}
                    creatorId={b.creatorId}
                    roomId={b.roomId}
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
  sortKey: BriefsSortKey
  filters: ParsedBriefFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'title'
      ? 'asc'
      : 'desc'
  const href = buildBriefsHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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
  filters: ParsedBriefFilters
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
            href={buildBriefsHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildBriefsHref(filters, { page: filters.page + 1 })}
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
      <Lightbulb className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No briefs match' : 'No briefs yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Briefs surface here as creators post them from the Brief Builder.'}
      </p>
      {filtered && (
        <Link
          href="/briefs"
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
