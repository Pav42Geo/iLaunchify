// =============================================================================
// Admin Shipments list — v2 surface (Phase L1.1c)
// =============================================================================
//
// All shipping-relevant OrderDispatch rows (docs/LOGISTICS_AND_FULFILLMENT.md
// §9 admin surfaces). Layout follows the locked admin surface pattern (hero
// band + KPI strip + URL chip filters + sortable table + RowActionsMenu +
// 50/page paginator). See memory: ilaunchify-admin-surface-pattern.md ·
// canonical: /partners.
//
// Query params (parsed in shipments-data.ts):
//   ?q=ILF-260701      — search order number / partner name / tracking number
//   ?status=IN_TRANSIT — dispatch status chip (READY/SHIPPED/IN_TRANSIT/DELIVERED)
//   ?shipTo=WAREHOUSE_PARTNER — destination-type chip (4 OrderShipToType values)
//   ?mode=LTL          — shipment mode chip (dispatches with a leg of that mode)
//   ?sort=shippedAt|deliveredAt|status|createdAt   (default shippedAt)
//   ?dir=asc|desc      (default desc)
//   ?page=2            — pagination (50 / page)

import Link from 'next/link'
import {
  Truck,
  PackageCheck,
  FileWarning,
  AlertTriangle,
  Archive,
  Search,
  ArrowDown,
  ArrowUp,
  MapPin,
  Calendar,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ShipmentRowActions } from './ShipmentRowActions'
import {
  buildShipmentsHref,
  loadShipmentsData,
  MODE_LABEL,
  MODE_ORDER,
  SHIP_TO_LABEL,
  SHIP_TO_ORDER,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_ORDER,
  type ModeKey,
  type ParsedShipmentFilters,
  type ShipmentRow,
  type ShipmentsSortKey,
  type ShipmentStatusKey,
  type ShipToKey,
  type SortDir,
} from './shipments-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shipments — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const STATUS_PILL: Record<
  ShipmentStatusKey,
  { bg: string; text: string; border: string; dot: string }
> = {
  READY: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  SHIPPED: { bg: 'bg-info-100', text: 'text-info-800', border: 'border-info-200', dot: 'bg-info-500' },
  IN_TRANSIT: { bg: 'bg-info-100', text: 'text-info-800', border: 'border-info-200', dot: 'bg-info-500' },
  DELIVERED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
}

const FALLBACK_PILL = { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' }

const STORAGE_CLASS_TONE: Record<string, string> = {
  AMBIENT: 'bg-ink-100 text-ink-700',
  PROTECT_HEAT: 'bg-warning-100 text-warning-800',
  CHILLED: 'bg-info-100 text-info-800',
  FROZEN: 'bg-info-100 text-info-800',
}

const STORAGE_CLASS_LABEL: Record<string, string> = {
  AMBIENT: 'Ambient',
  PROTECT_HEAT: 'Protect heat',
  CHILLED: 'Chilled',
  FROZEN: 'Frozen',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    shipTo?: string
    mode?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function ShipmentsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadShipmentsData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Shipments"
        title="Shipments"
        description="Every shipping-relevant dispatch across the network — ready-to-ship, in transit, delivered, plus platform-booked legs, exceptions and HOLD storage."
      />

      <ShipmentsKpiStrip kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        statusCounts={data.statusCounts}
        shipToCounts={data.shipToCounts}
        modeCounts={data.modeCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState
          filtered={Boolean(data.filters.q || data.filters.status || data.filters.shipTo || data.filters.mode)}
        />
      ) : (
        <ShipmentsTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function ShipmentsKpiStrip({
  kpis,
}: {
  kpis: {
    inTransitNow: number
    deliveredLast7d: number
    awaitingDocs: number
    exceptions: number
    holdActive: number
  }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href={buildDefaultHref({ status: 'IN_TRANSIT' })}
        label="In transit now"
        value={kpis.inTransitNow}
        icon={Truck}
        active
        subline="Shipped or in transit"
      />
      <KpiCard
        href={buildDefaultHref({ status: 'DELIVERED' })}
        label="Delivered 7d"
        value={kpis.deliveredLast7d}
        icon={PackageCheck}
        tone="emerald"
      />
      <KpiCard
        href={buildDefaultHref({ status: 'READY' })}
        label="Awaiting docs"
        value={kpis.awaitingDocs}
        icon={FileWarning}
        tone="amber"
        subline="READY dispatches"
      />
      <KpiCard
        href="/logistics/shipments"
        label="Exceptions"
        value={kpis.exceptions}
        icon={AlertTriangle}
        tone="rose"
        subline="Legs in EXCEPTION"
      />
      <KpiCard
        href={buildDefaultHref({ shipTo: 'HOLD_AT_MANUFACTURER' })}
        label="Hold orders"
        value={kpis.holdActive}
        icon={Archive}
        tone="sky"
        subline="Active storage agreements"
      />
    </div>
  )
}

/** Href builder for KPI cards (fresh filter set, one override). */
function buildDefaultHref(overrides: { status?: string; shipTo?: string }): string {
  const params = new URLSearchParams()
  if (overrides.status) params.set('status', overrides.status)
  if (overrides.shipTo) params.set('shipTo', overrides.shipTo)
  const qs = params.toString()
  return qs ? `/logistics/shipments?${qs}` : '/logistics/shipments'
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
// FilterBar — search + status chips + destination chips + mode chips
// =============================================================================

function FilterBar({
  filters,
  statusCounts,
  shipToCounts,
  modeCounts,
  totalFiltered,
}: {
  filters: ParsedShipmentFilters
  statusCounts: Record<ShipmentStatusKey, number>
  shipToCounts: Record<ShipToKey, number>
  modeCounts: Record<ModeKey, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.shipTo || filters.mode)

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
            placeholder="Search order number, partner, or tracking number…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.shipTo && <input type="hidden" name="shipTo" value={filters.shipTo} />}
        {filters.mode && <input type="hidden" name="mode" value={filters.mode} />}
        {filters.sort !== 'shippedAt' && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir !== 'desc' && <input type="hidden" name="dir" value={filters.dir} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {hasAnyFilter && (
          <Link
            href="/logistics/shipments"
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
          href={buildShipmentsHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {SHIPMENT_STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            href={buildShipmentsHref(filters, { status, page: 1 })}
            active={filters.status === status}
            label={SHIPMENT_STATUS_LABEL[status]}
            count={statusCounts[status]}
            tone={STATUS_PILL[status]}
          />
        ))}
      </div>

      {/* Destination chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Destination
        </span>
        <FilterChip
          href={buildShipmentsHref(filters, { shipTo: '', page: 1 })}
          active={!filters.shipTo}
          label="All"
          count={null}
        />
        {SHIP_TO_ORDER.map((shipTo) => (
          <FilterChip
            key={shipTo}
            href={buildShipmentsHref(filters, { shipTo, page: 1 })}
            active={filters.shipTo === shipTo}
            label={SHIP_TO_LABEL[shipTo]}
            count={shipToCounts[shipTo]}
          />
        ))}
      </div>

      {/* Mode chips (dispatches with a ShipmentLeg of that mode) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Mode
        </span>
        <FilterChip
          href={buildShipmentsHref(filters, { mode: '', page: 1 })}
          active={!filters.mode}
          label="All"
          count={null}
        />
        {MODE_ORDER.map((mode) => (
          <FilterChip
            key={mode}
            href={buildShipmentsHref(filters, { mode, page: 1 })}
            active={filters.mode === mode}
            label={MODE_LABEL[mode]}
            count={modeCounts[mode]}
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

function ShipmentsTable({
  rows,
  filters,
}: {
  rows: ShipmentRow[]
  filters: ParsedShipmentFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Order</Th>
            <Th>Type</Th>
            <Th>From partner</Th>
            <Th>Destination</Th>
            <Th>Storage</Th>
            <Th>Tracking</Th>
            <SortableTh sortKey="shippedAt" filters={filters} className="text-right">
              Shipped
            </SortableTh>
            <SortableTh sortKey="deliveredAt" filters={filters} className="text-right">
              Delivered
            </SortableTh>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const tone = STATUS_PILL[r.status as ShipmentStatusKey] ?? FALLBACK_PILL
            const statusLabel = SHIPMENT_STATUS_LABEL[r.status as ShipmentStatusKey] ?? r.status
            const location = [r.shipToCity, r.shipToState].filter(Boolean).join(', ')
            return (
              <tr key={r.dispatchId} className="transition-colors hover:bg-pink-50/20">
                {/* Order */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/orders/${r.orderId}`}
                    className="block font-mono text-[11.5px] font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.orderRef}
                  </Link>
                </td>

                {/* Dispatch type */}
                <td className="px-3 py-3 align-top">
                  <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700">
                    {r.dispatchType}
                  </span>
                </td>

                {/* From partner */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/partners/${r.fromPartnerId}`}
                    className="font-medium text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.fromPartnerName}
                  </Link>
                </td>

                {/* Destination */}
                <td className="px-3 py-3 align-top">
                  <span className="block text-[11.5px] font-medium text-ink-800">
                    {SHIP_TO_LABEL[r.shipToType] ?? r.shipToType}
                  </span>
                  {location && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-500">
                      <MapPin className="h-3 w-3 text-ink-400" />
                      {location}
                    </span>
                  )}
                </td>

                {/* Storage class */}
                <td className="px-3 py-3 align-top">
                  {r.storageClass ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                        STORAGE_CLASS_TONE[r.storageClass] ?? 'bg-ink-100 text-ink-700',
                      )}
                    >
                      {STORAGE_CLASS_LABEL[r.storageClass] ?? r.storageClass}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Tracking */}
                <td className="px-3 py-3 align-top">
                  {r.trackingNumber ? (
                    <>
                      {r.trackingCarrier && (
                        <span className="block text-[11px] text-ink-500">{r.trackingCarrier}</span>
                      )}
                      <span className="font-mono text-[11px] text-ink-700">{r.trackingNumber}</span>
                    </>
                  ) : r.legMode ? (
                    <span className="text-[11px] text-ink-500">{MODE_LABEL[r.legMode]} · no tracking yet</span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Shipped */}
                <td className="px-3 py-3 text-right align-top">
                  <DateCell date={r.shippedAt} />
                </td>

                {/* Delivered */}
                <td className="px-3 py-3 text-right align-top">
                  <DateCell date={r.deliveredAt} />
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
                    {statusLabel}
                  </span>
                  {r.legStatus === 'EXCEPTION' && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-danger-200 bg-danger-100 px-2 py-0.5 text-[10px] font-medium text-danger-700">
                      <AlertTriangle className="h-3 w-3" />
                      Leg exception
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <ShipmentRowActions
                    dispatchId={r.dispatchId}
                    orderId={r.orderId}
                    orderRef={r.orderRef}
                    partnerId={r.fromPartnerId}
                    trackingNumber={r.trackingNumber}
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

function DateCell({ date }: { date: Date | null }) {
  if (!date) return <span className="text-[11px] text-ink-400">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
      title={date.toLocaleString()}
    >
      <Calendar className="h-3 w-3 text-ink-400" />
      {formatRelative(date)}
    </span>
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
  sortKey: ShipmentsSortKey
  filters: ParsedShipmentFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  // Clicking an already-active column flips direction; a new column defaults to
  // desc (dates) or asc (status).
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'status'
      ? 'asc'
      : 'desc'
  const href = buildShipmentsHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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
  filters: ParsedShipmentFilters
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
            href={buildShipmentsHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildShipmentsHref(filters, { page: filters.page + 1 })}
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
      <Truck className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No shipments match' : 'No shipments yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Dispatches appear here once they reach READY or get a shipment leg.'}
      </p>
      {filtered && (
        <Link
          href="/logistics/shipments"
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
