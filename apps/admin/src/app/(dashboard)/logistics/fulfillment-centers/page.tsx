// =============================================================================
// Admin Fulfillment-center network list — v2 surface (Phase L1c)
// =============================================================================
//
// FC nodes are PartnerService rows of type WAREHOUSE (docs/LOGISTICS_AND_
// FULFILLMENT.md §3 — V1 FCs are admin-onboarded WAREHOUSE partners).
// Layout follows the locked admin surface pattern (hero band + KPI strip +
// URL chip filters + sortable table + RowActionsMenu + 50/page paginator).
// See memory: ilaunchify-admin-surface-pattern.md · canonical: /partners.
//
// Query params (parsed in fc-data.ts):
//   ?q=shipbob        — search partner name / city / state
//   ?status=ACTIVE    — ServiceStatus chip (ACTIVE / DRAFT / PAUSED)
//   ?class=AMBIENT    — storage-class chip
//   ?sort=partner|location|capacity|status|createdAt   (default createdAt)
//   ?dir=asc|desc     (default desc)
//   ?page=2           — pagination (50 / page)

import Link from 'next/link'
import {
  Warehouse,
  CheckCircle2,
  Package,
  Snowflake,
  Map as MapIcon,
  Search,
  ArrowDown,
  ArrowUp,
  MapPin,
  Calendar,
  BadgeCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ServiceStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { FcRowActions } from './FcRowActions'
import {
  buildFcHref,
  loadFcData,
  FC_STATUS_LABEL,
  FC_STATUS_ORDER,
  STORAGE_CLASS_LABEL,
  STORAGE_CLASS_ORDER,
  type FcRow,
  type FcSortKey,
  type ParsedFcFilters,
  type SortDir,
  type StorageClassKey,
} from './fc-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fulfillment centers — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const STATUS_PILL: Record<
  ServiceStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  DRAFT: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  PAUSED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

const CLASS_CHIP_TONE: Record<StorageClassKey, string> = {
  AMBIENT: 'bg-ink-100 text-ink-700',
  PROTECT_HEAT: 'bg-warning-100 text-warning-800',
  CHILLED: 'bg-info-100 text-info-800',
  FROZEN: 'bg-info-100 text-info-800',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    class?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function FulfillmentCentersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadFcData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Network"
        title="Fulfillment centers"
        description="WAREHOUSE partner services that hold creator inventory after production — capabilities, capacity and coverage across the network. Joining is a separately contracted program (never partner self-serve)."
        actions={
          <Link
            href="/logistics/fulfillment-centers/contract"
            className="inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Contract new FC
          </Link>
        }
      />

      <FcKpiStrip kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        classCounts={data.classCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={Boolean(data.filters.q || data.filters.status || data.filters.class)} />
      ) : (
        <FcTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function FcKpiStrip({
  kpis,
}: {
  kpis: {
    total: number
    activeCount: number
    ambientCount: number
    heatProtectCount: number
    coldCount: number
    statesCovered: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href="/logistics/fulfillment-centers"
        label="Total FCs"
        value={kpis.total}
        icon={Warehouse}
        active
        subline={kpis.total > 0 ? 'WAREHOUSE services' : undefined}
      />
      <KpiCard
        href={buildDefaultHref({ status: 'ACTIVE' })}
        label="Active"
        value={kpis.activeCount}
        icon={CheckCircle2}
        tone="emerald"
      />
      <KpiCard
        href={buildDefaultHref({ class: 'AMBIENT' })}
        label="Ambient"
        value={kpis.ambientCount}
        icon={Package}
        tone="amber"
        subline={`${kpis.heatProtectCount.toLocaleString()} protect-heat`}
      />
      <KpiCard
        href={buildDefaultHref({ class: 'CHILLED' })}
        label="Cold-capable"
        value={kpis.coldCount}
        icon={Snowflake}
        tone="sky"
        subline="Chilled or frozen"
      />
      <KpiCard
        href="/logistics/fulfillment-centers"
        label="States covered"
        value={kpis.statesCovered}
        icon={MapIcon}
        tone="pink"
      />
    </div>
  )
}

/** Href builder for KPI cards (fresh filter set, one override). */
function buildDefaultHref(overrides: { status?: string; class?: string }): string {
  const params = new URLSearchParams()
  if (overrides.status) params.set('status', overrides.status)
  if (overrides.class) params.set('class', overrides.class)
  const qs = params.toString()
  return qs ? `/logistics/fulfillment-centers?${qs}` : '/logistics/fulfillment-centers'
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
// FilterBar — search + status chips + storage-class chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  classCounts,
  totalFiltered,
}: {
  filters: ParsedFcFilters
  statusCounts: Record<ServiceStatus, number>
  classCounts: Record<StorageClassKey, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.class)

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
            placeholder="Search partner, city, or state…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.class && <input type="hidden" name="class" value={filters.class} />}
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
            href="/logistics/fulfillment-centers"
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
          href={buildFcHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {FC_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            href={buildFcHref(filters, { status, page: 1 })}
            active={filters.status === status}
            label={FC_STATUS_LABEL[status]}
            count={statusCounts[status]}
            tone={STATUS_PILL[status]}
          />
        ))}
      </div>

      {/* Storage-class chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Storage class
        </span>
        <FilterChip
          href={buildFcHref(filters, { class: '', page: 1 })}
          active={!filters.class}
          label="All"
          count={null}
        />
        {STORAGE_CLASS_ORDER.map((cls) => (
          <FilterChip
            key={cls}
            href={buildFcHref(filters, { class: cls, page: 1 })}
            active={filters.class === cls}
            label={STORAGE_CLASS_LABEL[cls]}
            count={classCounts[cls]}
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

function FcTable({ rows, filters }: { rows: FcRow[]; filters: ParsedFcFilters }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="partner" filters={filters}>
              Partner
            </SortableTh>
            <SortableTh sortKey="location" filters={filters}>
              City / State
            </SortableTh>
            <Th>Storage classes</Th>
            <Th>Certifications</Th>
            <SortableTh sortKey="capacity" filters={filters} className="text-right">
              Weekly pallets
            </SortableTh>
            <Th className="text-center">Coords</Th>
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
            return (
              <tr key={r.serviceId} className="transition-colors hover:bg-pink-50/20">
                {/* Partner */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/partners/${r.partnerId}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.companyName}
                  </Link>
                </td>

                {/* Location */}
                <td className="px-3 py-3 align-top">
                  {r.city || r.region ? (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600">
                      <MapPin className="h-3 w-3 text-ink-400" />
                      {[r.city, r.region].filter(Boolean).join(', ')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Storage classes */}
                <td className="px-3 py-3 align-top">
                  {r.storageClasses.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {STORAGE_CLASS_ORDER.filter((c) => r.storageClasses.includes(c)).map((c) => (
                        <span
                          key={c}
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                            CLASS_CHIP_TONE[c],
                          )}
                        >
                          {STORAGE_CLASS_LABEL[c]}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Certifications */}
                <td className="px-3 py-3 align-top">
                  {r.certifications.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.certifications.map((cert) => (
                        <span
                          key={cert}
                          className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700"
                        >
                          <BadgeCheck className="h-3 w-3" />
                          {cert.replaceAll('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Capacity */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  {r.weeklyPalletCapacity !== null ? (
                    <span className="font-semibold text-ink-900">
                      {r.weeklyPalletCapacity.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>

                {/* Coords present */}
                <td className="px-3 py-3 text-center align-top">
                  {r.hasCoords ? (
                    <span className="text-success-700" title="Facility coordinates set (feeds nearest-eligible selection)">
                      ✓
                    </span>
                  ) : (
                    <span className="text-ink-400" title="No coordinates — set them on the partner service for FC selection">
                      —
                    </span>
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
                    {FC_STATUS_LABEL[r.status]}
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
                  <FcRowActions
                    serviceId={r.serviceId}
                    partnerId={r.partnerId}
                    companyName={r.companyName}
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
  sortKey: FcSortKey
  filters: ParsedFcFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  // Clicking an already-active column flips direction; a new column defaults to
  // desc (createdAt/capacity) or asc (partner/location/status).
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'partner' || sortKey === 'location' || sortKey === 'status'
      ? 'asc'
      : 'desc'
  const href = buildFcHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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
  filters: ParsedFcFilters
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
            href={buildFcHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildFcHref(filters, { page: filters.page + 1 })}
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
      <Warehouse className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No fulfillment centers match' : 'No fulfillment centers yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Onboard an FC as a partner with a Warehouse service — it appears here automatically.'}
      </p>
      {filtered ? (
        <Link
          href="/logistics/fulfillment-centers"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      ) : (
        <Link
          href="/partners"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Go to Partner CRM
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
