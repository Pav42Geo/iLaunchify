// =============================================================================
// Admin Rooms — co-creation oversight list (spec §10/§16 P0, 2026-07-10)
// =============================================================================
//
// READ-ONLY oversight over CoCreationRooms. Follows the LOCKED v2 admin
// surface pattern (memory: ilaunchify-admin-surface-pattern): hero band +
// 5-card KPI strip + URL-driven filter chips + sortable plain table +
// RowActionsMenu (deep-links only — NO mutations anywhere) + 50/page.
// Privacy posture: metadata yes, chat message bodies no.
//
// Query params (parsed in rooms-data.ts):
//   ?q=matcha          — search on the room's brief title
//   ?status=ACTIVE     — RoomStatus chip
//   ?sort=createdAt|title   (default createdAt)
//   ?dir=asc|desc      (default desc)
//   ?page=2            — pagination (50 / page)

import Link from 'next/link'
import {
  DoorOpen,
  Eye,
  MessageSquareWarning,
  Landmark,
  Trophy,
  Search,
  ArrowDown,
  ArrowUp,
  Calendar,
  FileSignature,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RoomStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { RoomRowActions } from './RoomRowActions'
import {
  ROOM_STATUS_LABEL,
  ROOM_STATUS_ORDER,
  ROOM_STATUS_PILL,
  buildRoomsHref,
  loadRoomsData,
  type ParsedRoomFilters,
  type RoomRow,
  type RoomsSortKey,
  type SortDir,
} from './rooms-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rooms — Admin' }

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function RoomsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadRoomsData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Marketplace · Co-creation"
        title="Collaboration rooms"
        description="Creator × maker rooms — build objects, milestone escrow, NDA state, and the decision log. Read-only oversight; message bodies are never shown, only metadata."
      />

      <RoomsKpiStrip kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={Boolean(data.filters.q || data.filters.status)} />
      ) : (
        <RoomsTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function RoomsKpiStrip({
  kpis,
}: {
  kpis: {
    activeRooms: number
    objectsAwaitingReview: number
    changesRequested: number
    milestonesReleased: number
    closedWon: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href="/rooms?status=ACTIVE"
        label="Active rooms"
        value={kpis.activeRooms}
        icon={DoorOpen}
        active
      />
      <KpiCard
        href="/rooms?status=ACTIVE"
        label="Awaiting review"
        value={kpis.objectsAwaitingReview}
        icon={Eye}
        tone="sky"
        subline="Build objects in review"
      />
      <KpiCard
        href="/rooms?status=ACTIVE"
        label="Changes requested"
        value={kpis.changesRequested}
        icon={MessageSquareWarning}
        tone="amber"
        subline="Build objects sent back"
      />
      <KpiCard
        href="/rooms"
        label="Milestones released"
        value={kpis.milestonesReleased}
        icon={Landmark}
        tone="emerald"
        subline="All time"
      />
      <KpiCard
        href="/rooms?status=CLOSED_WON"
        label="Closed won"
        value={kpis.closedWon}
        icon={Trophy}
        tone="pink"
        subline="Brief → production"
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
// FilterBar — search + status chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  totalFiltered,
}: {
  filters: ParsedRoomFilters
  statusCounts: Record<RoomStatus, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status)

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
            placeholder="Search by brief title…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
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
            href="/rooms"
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
          href={buildRoomsHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {ROOM_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            href={buildRoomsHref(filters, { status, page: 1 })}
            active={filters.status === status}
            label={ROOM_STATUS_LABEL[status]}
            count={statusCounts[status]}
            tone={ROOM_STATUS_PILL[status]}
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

function RoomsTable({
  rows,
  filters,
}: {
  rows: RoomRow[]
  filters: ParsedRoomFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="title" filters={filters}>
              Room
            </SortableTh>
            <Th>Status</Th>
            <Th className="text-right">In review</Th>
            <Th className="text-right">Milestones</Th>
            <Th>NDA</Th>
            <SortableTh sortKey="createdAt" filters={filters} className="text-right">
              Created
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const tone = ROOM_STATUS_PILL[r.status]
            return (
              <tr key={r.id} className="transition-colors hover:bg-pink-50/20">
                {/* Room: brief title + creator × partner */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/rooms/${r.id}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.briefTitle}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {r.creatorName}
                    <span className="mx-1 text-ink-300">×</span>
                    {r.partnerName}
                  </p>
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
                    {ROOM_STATUS_LABEL[r.status]}
                  </span>
                </td>

                {/* Objects in review */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span
                    className={
                      r.objectsInReview > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'
                    }
                  >
                    {r.objectsInReview}
                  </span>
                </td>

                {/* Milestones released n/m */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  {r.milestonesTotal === 0 ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <span className="text-ink-700">
                      <span className="font-semibold text-ink-900">{r.milestonesReleased}</span>
                      /{r.milestonesTotal}
                    </span>
                  )}
                </td>

                {/* NDA */}
                <td className="px-3 py-3 align-top">
                  {r.ndaSignedAt ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-100 px-2 py-0.5 text-[10.5px] font-medium text-success-800"
                      title={r.ndaSignedAt.toLocaleString()}
                    >
                      <FileSignature className="h-3 w-3" />
                      Signed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-100 px-2 py-0.5 text-[10.5px] font-medium text-warning-800">
                      <FileSignature className="h-3 w-3" />
                      Pending
                    </span>
                  )}
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

                {/* Actions — deep-links ONLY (read-only oversight) */}
                <td className="px-3 py-3 text-right align-top">
                  <RoomRowActions
                    roomId={r.id}
                    briefTitle={r.briefTitle}
                    briefId={r.briefId}
                    creatorId={r.creatorId}
                    partnerId={r.partnerId}
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
  sortKey: RoomsSortKey
  filters: ParsedRoomFilters
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
  const href = buildRoomsHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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
  filters: ParsedRoomFilters
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
            href={buildRoomsHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildRoomsHref(filters, { page: filters.page + 1 })}
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
      <DoorOpen className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No rooms match' : 'No rooms yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Rooms open the moment a creator selects a maker on a posted brief.'}
      </p>
      {filtered && (
        <Link
          href="/rooms"
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
