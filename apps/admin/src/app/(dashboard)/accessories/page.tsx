// =============================================================================
// Admin Accessory verification queue — v2 admin surface (Track C / C7.k)
// =============================================================================
//
// Layout follows the locked admin surface pattern (cream hero band + 5-card
// KPI strip + URL-driven status chips + category chips + sortable wide table
// + RowActionsMenu + Prev/Next paginator). See memory:
// ilaunchify-admin-surface-pattern.md
//
// Query params (parsed in accessories-data.ts):
//   ?status=PENDING_REVIEW | ACTIVE | ARCHIVED   — primary bucket
//   ?category=SPOON | RIBBON | …                 — AccessoryCategory chip
//   ?q=ribbon                                    — search name / description
//   ?sort=createdAt|name|moq|leadTimeDays|status (default createdAt)
//   ?dir=asc|desc                                (default desc)
//   ?page=2                                       — pagination (50 / page)

import Link from 'next/link'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import {
  Gift,
  Clock4,
  CheckCircle2,
  Archive,
  Building2,
  Search,
  ArrowDown,
  ArrowUp,
  Calendar,
  ImageOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccessoryCategory, OfferingStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AccessoryRowActions } from './AccessoryRowActions'
import {
  buildAccessoriesHref,
  loadAccessoriesData,
  ACCESSORY_STATUS_ORDER,
  ACCESSORY_STATUS_LABEL,
  ACCESSORY_CATEGORY_ORDER,
  ACCESSORY_CATEGORY_LABEL,
  type AccessoriesKpis,
  type AccessoriesSortKey,
  type AccessoryRow,
  type AccessoryStatusBucket,
  type ParsedFilters,
  type SortDir,
} from './accessories-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accessories — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const STATUS_TONE: Record<
  OfferingStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  DRAFT: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400', label: 'Draft' },
  PENDING_REVIEW: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500', label: 'Pending review' },
  ACTIVE: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500', label: 'Active' },
  ARCHIVED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400', label: 'Archived' },
}

const STATUS_CHIP_TONE: Record<AccessoryStatusBucket, { bg: string; text: string; border: string; dot: string }> = {
  PENDING_REVIEW: { bg: 'bg-warning-50', text: 'text-warning-900', border: 'border-warning-200', dot: 'bg-warning-500' },
  ACTIVE: { bg: 'bg-success-50', text: 'text-success-900', border: 'border-success-200', dot: 'bg-success-500' },
  ARCHIVED: { bg: 'bg-ink-50', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    status?: string
    category?: string
    q?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function AccessoriesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadAccessoriesData(sp)

  const filtered = Boolean(data.filters.status || data.filters.category || data.filters.q)

  return (
    <div className="space-y-6">
      <Header kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        categoryCounts={data.categoryCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={filtered} />
      ) : (
        <AccessoriesTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// Header (cream band) + 5-card KPI strip
// =============================================================================

function Header({ kpis }: { kpis: AccessoriesKpis }) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Inbox · Accessory verification"
        title="Accessories"
        description="Verify partner-listed brand add-ons — engraved spoons, ribbons, recipe cards, wax seals — before creators can bundle them onto products at checkout. The listing partner is always the fulfillment partner."
      />

      {/* KPI strip — 5 cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard href="/accessories" label="Total accessories" value={kpis.total} icon={Gift} active />
        <KpiCard
          href="/accessories?status=PENDING_REVIEW"
          label="Pending review"
          value={kpis.pendingReview}
          icon={Clock4}
          tone="amber"
        />
        <KpiCard
          href="/accessories?status=ACTIVE"
          label="Active"
          value={kpis.active}
          icon={CheckCircle2}
          tone="emerald"
        />
        <KpiCard
          href="/accessories?status=ARCHIVED"
          label="Archived"
          value={kpis.archived}
          icon={Archive}
          tone="sky"
        />
        <KpiCard
          href="/partners?kind=PACKAGING"
          label="Distinct partners"
          value={kpis.distinctPartners}
          icon={Building2}
          tone="pink"
          subline="Listing accessories"
        />
      </div>
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
// FilterBar — search + status chips + category chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  categoryCounts,
  totalFiltered,
}: {
  filters: ParsedFilters
  statusCounts: Record<AccessoryStatusBucket, number>
  categoryCounts: Record<AccessoryCategory, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.status || filters.category || filters.q)

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
            placeholder="Search accessory name or description…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
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
            href="/accessories"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{totalFiltered.toLocaleString()} results</span>
        </div>
      </form>

      {/* Status bucket chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip
          href={buildAccessoriesHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {ACCESSORY_STATUS_ORDER.map((bucket) => (
          <FilterChip
            key={bucket}
            href={buildAccessoriesHref(filters, { status: bucket, page: 1 })}
            active={filters.status === bucket}
            label={ACCESSORY_STATUS_LABEL[bucket]}
            count={statusCounts[bucket]}
            tone={STATUS_CHIP_TONE[bucket]}
          />
        ))}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Category
        </span>
        <FilterChip
          href={buildAccessoriesHref(filters, { category: '', page: 1 })}
          active={!filters.category}
          label="All"
          count={null}
        />
        {ACCESSORY_CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            href={buildAccessoriesHref(filters, { category: cat, page: 1 })}
            active={filters.category === cat}
            label={ACCESSORY_CATEGORY_LABEL[cat]}
            count={categoryCounts[cat]}
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

function AccessoriesTable({
  rows,
  filters,
}: {
  rows: AccessoryRow[]
  filters: ParsedFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="name" filters={filters}>
              Accessory
            </SortableTh>
            <Th>Partner</Th>
            <Th>Category</Th>
            <SortableTh sortKey="moq" filters={filters} className="text-right">
              MOQ
            </SortableTh>
            <SortableTh sortKey="leadTimeDays" filters={filters} className="text-right">
              Lead
            </SortableTh>
            <Th className="text-right">Price</Th>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <SortableTh sortKey="createdAt" filters={filters} className="text-right">
              Submitted
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((a) => {
            const tone = STATUS_TONE[a.status]
            return (
              <tr key={a.id} className="transition-colors hover:bg-pink-50/20">
                {/* Accessory — thumb + name */}
                <td className="px-3 py-3 align-top">
                  <div className="flex items-start gap-2.5">
                    {a.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-md border border-ink-200 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-400"
                      >
                        <ImageOff className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{a.name}</p>
                    </div>
                  </div>
                </td>

                {/* Partner */}
                <td className="px-3 py-3 align-top">
                  {a.partnerId ? (
                    <Link
                      href={`/partners/${a.partnerId}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                    >
                      <Building2 className="h-3 w-3 text-ink-400" />
                      <span className="max-w-[140px] truncate">{a.partnerName}</span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-ink-400">{a.partnerName}</span>
                  )}
                </td>

                {/* Category */}
                <td className="px-3 py-3 align-top">
                  <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700">
                    {ACCESSORY_CATEGORY_LABEL[a.category]}
                  </span>
                </td>

                {/* MOQ */}
                <td className="px-3 py-3 text-right align-top tabular-nums text-ink-700">
                  {a.moq.toLocaleString()}
                </td>

                {/* Lead */}
                <td className="px-3 py-3 text-right align-top tabular-nums text-ink-700">
                  {a.leadTimeDays}d
                </td>

                {/* Price */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  {a.firstUnitPrice !== null ? (
                    <span className="font-medium text-ink-900">
                      ${a.firstUnitPrice.toFixed(2)}
                      <span className="text-[10.5px] font-normal text-ink-500">/unit</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
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
                    {tone.label}
                  </span>
                </td>

                {/* Submitted */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={a.createdAt.toLocaleString()}
                  >
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatRelative(a.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <AccessoryRowActions
                    id={a.id}
                    name={a.name}
                    status={a.status}
                    partnerId={a.partnerId}
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
  sortKey: AccessoriesSortKey
  filters: ParsedFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  const isDescDefault = sortKey === 'createdAt'
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : isDescDefault
      ? 'desc'
      : 'asc'
  const href = buildAccessoriesHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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
  filters: ParsedFilters
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
            href={buildAccessoriesHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildAccessoriesHref(filters, { page: filters.page + 1 })}
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
      <Gift className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No accessories match' : 'No accessories yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Once partners list brand add-ons they will surface here for verification.'}
      </p>
      {filtered && (
        <Link
          href="/accessories"
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
