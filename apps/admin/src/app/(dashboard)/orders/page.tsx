// =============================================================================
// Admin Orders — advanced list (Pavel 2026-06-01)
// =============================================================================
//
// Replaces the plain Card-list with the locked admin pattern:
//   • Cream header band with 5 KPI chips (Total / Paid / Production / Shipped /
//     Revenue 30d).
//   • URL-driven status filter chips matching the order FSM. Independent
//     counts so toggling doesn't reshuffle the badges.
//   • "Needs attention" callout panel for ON_HOLD / DISPUTED / ROUTING.
//   • Sortable table — order #, brand, creator email, status pill, dispatches
//     pill, aggregate-approval pill, total, created date.
//   • Row links to /orders/[id]. Hover state.
//   • Empty + filtered-empty states with iLaunchify chrome.
//
// No mutations — read-only list. Existing /orders/[id] detail page handles
// the actions.

import Link from 'next/link'
import {
  ShoppingBag,
  DollarSign,
  PackageOpen,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Building2,
  User,
  Calendar,
  ArrowRight,
  ArrowDownUp,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { OrderRowActions } from './OrderRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ROUTING'
  | 'IN_FULFILLMENT'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'ON_HOLD'
  | 'DISPUTED'

const STATUS_LIST: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'ROUTING',
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'ON_HOLD',
  'DISPUTED',
]

const PAID_STATUSES: OrderStatus[] = [
  'PAID',
  'ROUTING',
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
]

const PRODUCTION_STATUSES: OrderStatus[] = [
  'PAID',
  'ROUTING',
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
]

const SHIPPED_STATUSES: OrderStatus[] = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']

const URGENT_STATUSES: OrderStatus[] = ['ON_HOLD', 'DISPUTED', 'ROUTING']

const STATUS_TONE: Record<OrderStatus, { bg: string; dot: string; label: string }> = {
  PENDING_PAYMENT: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Pending payment' },
  PAID: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'Paid' },
  ROUTING: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Routing' },
  IN_FULFILLMENT: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'In fulfillment' },
  READY_TO_SHIP: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Ready to ship' },
  SHIPPED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Shipped' },
  IN_TRANSIT: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'In transit' },
  DELIVERED: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Delivered' },
  COMPLETED: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Completed' },
  CANCELLED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Cancelled' },
  REFUNDED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Refunded' },
  ON_HOLD: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'On hold' },
  DISPUTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Disputed' },
}

const APPROVAL_TONE: Record<string, { bg: string; label: string }> = {
  AWAITING_PARTNERS: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Awaiting' },
  PARTIALLY_ACCEPTED: { bg: 'bg-info-50 text-info-800 border-info-200', label: 'Partial' },
  CHANGES_REQUESTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', label: 'Changes' },
  FULLY_ACCEPTED: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Accepted' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

type OrderTypeFilter = 'PRODUCTION' | 'SAMPLE'

interface PageProps {
  searchParams: Promise<{ status?: string; sort?: string; type?: string }>
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status: statusParam, sort: sortParam, type: typeParam } = await searchParams
  const status =
    statusParam && (STATUS_LIST as string[]).includes(statusParam)
      ? (statusParam as OrderStatus)
      : null
  const sort = sortParam === 'oldest' ? 'oldest' : 'newest'
  const typeFilter: OrderTypeFilter | null =
    typeParam === 'SAMPLE' ? 'SAMPLE' : typeParam === 'PRODUCTION' ? 'PRODUCTION' : null
  // orderType is cast-guarded (post-dates the generated client until migration).
  const rowWhere = { ...(status ? { status } : {}), ...(typeFilter ? { orderType: typeFilter } : {}) }

  // Run KPI aggregates + filtered fetch + per-status counts in parallel.
  const last30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const [
    totalCount,
    paidCount,
    productionCount,
    shippedCount,
    revenue30,
    urgentCount,
    statusCounts,
    sampleCount,
    rows,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: PAID_STATUSES } } }),
    prisma.order.count({ where: { status: { in: PRODUCTION_STATUSES } } }),
    prisma.order.count({ where: { status: { in: SHIPPED_STATUSES } } }),
    prisma.order.aggregate({
      where: { paidAt: { gte: last30 } },
      _sum: { totalCents: true },
    }),
    prisma.order.count({ where: { status: { in: URGENT_STATUSES } } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    (prisma as unknown as { order: { count: (a: unknown) => Promise<number> } }).order
      .count({ where: { orderType: 'SAMPLE' } as never })
      .catch(() => 0),
    prisma.order.findMany({
      where: rowWhere as never,
      include: {
        brand: { select: { name: true, handle: true } },
        creator: { select: { email: true, name: true } },
        items: { select: { id: true } },
        dispatches: { select: { id: true, status: true } },
        charge: { select: { status: true, stripeChargeId: true } },
      },
      orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
      take: 200,
    }),
  ])

  const statusCountMap = new Map(statusCounts.map((c) => [c.status, c._count._all]))
  const revenue30Cents = revenue30._sum.totalCents ?? 0

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <Header
        totalCount={totalCount}
        paidCount={paidCount}
        productionCount={productionCount}
        shippedCount={shippedCount}
        revenue30Cents={revenue30Cents}
      />

      {/* URGENT CALLOUT */}
      {urgentCount > 0 && (
        <Link
          href="/orders?status=ON_HOLD"
          className="flex items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50/60 px-5 py-3 transition-colors hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-danger-100 text-danger-700">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-danger-900">
              {urgentCount} order{urgentCount === 1 ? '' : 's'} need attention
            </p>
            <p className="text-[11.5px] text-danger-700">
              ON_HOLD, DISPUTED, or stuck in ROUTING — review and resolve.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-danger-700" />
        </Link>
      )}

      {/* TYPE FILTER — production vs sample orders */}
      <TypeChips active={typeFilter} status={status} sort={sort} totalCount={totalCount} sampleCount={sampleCount} />

      {/* FILTER CHIPS */}
      <FilterChips
        active={status}
        totalCount={totalCount}
        statusCountMap={statusCountMap}
        currentSort={sort}
        typeFilter={typeFilter}
      />

      {/* TABLE */}
      {rows.length === 0 ? (
        <EmptyState filtered={status !== null || typeFilter !== null} />
      ) : (
        <OrdersTable rows={rows} currentSort={sort} activeStatus={status} />
      )}
    </div>
  )
}

// =============================================================================
// Header — title + KPI chips
// =============================================================================

function Header({
  totalCount,
  paidCount,
  productionCount,
  shippedCount,
  revenue30Cents,
}: {
  totalCount: number
  paidCount: number
  productionCount: number
  shippedCount: number
  revenue30Cents: number
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Operate"
        title="Orders"
        description="Every production order across the platform. Click a row to open the dispatch detail + Stripe transfers."
      />
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="grid grid-cols-2 divide-x divide-ink-100 sm:grid-cols-5">
          <Kpi icon={ShoppingBag} label="Total" value={totalCount} tone="ink" />
          <Kpi icon={DollarSign} label="Paid" value={paidCount} tone="pink" />
          <Kpi icon={PackageOpen} label="In production" value={productionCount} tone="info" />
          <Kpi icon={Truck} label="Shipped+" value={shippedCount} tone="success" />
          <Kpi
            icon={DollarSign}
            label="Revenue · 30d"
            value={formatRevenue(revenue30Cents)}
            tone="success"
          />
        </div>
      </div>
    </>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShoppingBag
  label: string
  value: number | string
  tone: 'ink' | 'pink' | 'info' | 'success'
}) {
  const numeralTone = {
    ink: 'text-ink-900',
    pink: 'text-pink-700',
    info: 'text-info-700',
    success: 'text-success-700',
  }[tone]
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-display text-[22px] font-semibold tabular-nums leading-none tracking-tight',
          numeralTone,
        )}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// =============================================================================
// Filter chips
// =============================================================================

function FilterChips({
  active,
  totalCount,
  statusCountMap,
  currentSort,
  typeFilter,
}: {
  active: OrderStatus | null
  totalCount: number
  statusCountMap: Map<string, number>
  currentSort: 'newest' | 'oldest'
  typeFilter: OrderTypeFilter | null
}) {
  const filters: Array<{ value: OrderStatus | null; label: string; count: number }> = [
    { value: null, label: 'All', count: totalCount },
    ...STATUS_LIST.map((s) => ({
      value: s,
      label: STATUS_TONE[s].label,
      count: statusCountMap.get(s) ?? 0,
    })).filter((f) => f.count > 0 || f.value === active),
  ]

  const sortHref = (sort: 'newest' | 'oldest') => {
    const params = new URLSearchParams()
    if (active) params.set('status', active)
    if (sort !== 'newest') params.set('sort', sort)
    if (typeFilter) params.set('type', typeFilter)
    const q = params.toString()
    return q ? `/orders?${q}` : '/orders'
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by status" className="flex flex-1 flex-wrap gap-2">
        {filters.map((f) => {
          const isActive = active === f.value
          const params = new URLSearchParams()
          if (f.value) params.set('status', f.value)
          if (currentSort !== 'newest') params.set('sort', currentSort)
          if (typeFilter) params.set('type', typeFilter)
          const q = params.toString()
          const href = q ? `/orders?${q}` : '/orders'
          return (
            <Link
              key={f.label}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                isActive
                  ? 'border-success-500 bg-success-50 text-success-800'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700',
                )}
              >
                {f.count}
              </span>
            </Link>
          )
        })}
      </nav>
      <Link
        href={sortHref(currentSort === 'newest' ? 'oldest' : 'newest')}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <ArrowDownUp className="h-3.5 w-3.5" />
        {currentSort === 'newest' ? 'Newest first' : 'Oldest first'}
      </Link>
    </div>
  )
}

// =============================================================================
// Type chips — production vs sample
// =============================================================================

function TypeChips({
  active,
  status,
  sort,
  totalCount,
  sampleCount,
}: {
  active: OrderTypeFilter | null
  status: OrderStatus | null
  sort: 'newest' | 'oldest'
  totalCount: number
  sampleCount: number
}) {
  const href = (type: OrderTypeFilter | null) => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (sort !== 'newest') p.set('sort', sort)
    if (type) p.set('type', type)
    const q = p.toString()
    return q ? `/orders?${q}` : '/orders'
  }
  const items: Array<{ value: OrderTypeFilter | null; label: string; count: number }> = [
    { value: null, label: 'All types', count: totalCount },
    { value: 'PRODUCTION', label: 'Production', count: Math.max(0, totalCount - sampleCount) },
    { value: 'SAMPLE', label: 'Samples', count: sampleCount },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">Type</span>
      {items.map((it) => {
        const isActive = active === it.value
        return (
          <Link
            key={String(it.value)}
            href={href(it.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? 'border-success-500 bg-success-50 text-success-700'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900',
            )}
          >
            {it.label}
            <span className="text-[10.5px] tabular-nums text-ink-400">{it.count}</span>
          </Link>
        )
      })}
    </div>
  )
}

// =============================================================================
// Table
// =============================================================================

type OrderRow = Awaited<ReturnType<typeof loadOrdersStub>>[number]
// Helper type alias kept narrow — actual row shape comes from the Prisma
// findMany above. Renderer accepts the loose row + does light coercion.
declare function loadOrdersStub(): Promise<
  Array<{
    id: string
    status: string
    totalCents: number
    createdAt: Date
    creatorUserId: string
    brand: { name: string; handle: string } | null
    creator: { email: string; name: string | null }
    items: { id: string }[]
    dispatches: { id: string; status: string }[]
    charge: { status: string; stripeChargeId: string | null } | null
    aggregateApprovalStatus: string
  }>
>

function OrdersTable({
  rows,
  currentSort,
  activeStatus,
}: {
  rows: OrderRow[]
  currentSort: 'newest' | 'oldest'
  activeStatus: OrderStatus | null
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Order</Th>
            <Th>Brand</Th>
            <Th>Creator</Th>
            <Th>Status</Th>
            <Th>Approval</Th>
            <Th className="text-right">Items</Th>
            <Th className="text-right">Dispatches</Th>
            <Th className="text-right">Total</Th>
            <Th>Created</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((o) => {
            const tone = STATUS_TONE[o.status as OrderStatus] ?? STATUS_TONE.CANCELLED
            const approval = APPROVAL_TONE[o.aggregateApprovalStatus]
            return (
              <tr key={o.id} className="group hover:bg-ink-50/40">
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-mono text-[11.5px] font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
                  >
                    {(o as { orderNumber?: string | null }).orderNumber ?? `#${o.id.slice(-8)}`}
                  </Link>
                  {(o as { orderType?: string }).orderType === 'SAMPLE' && (
                    <span className="mt-1 inline-flex items-center rounded-full border border-info-200 bg-info-50 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-info-700">
                      Sample{(o as { sampleKind?: string | null }).sampleKind ? ` · ${String((o as { sampleKind?: string | null }).sampleKind).toLowerCase()}` : ''}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="inline-flex items-center gap-1.5 font-medium text-ink-900">
                    <Building2 className="h-3 w-3 text-ink-400" />
                    {o.brand?.name ?? '—'}
                  </p>
                  {o.brand?.handle && (
                    <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-pink-700">
                      @{o.brand.handle}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-[12px] text-ink-700">
                  <p className="inline-flex items-center gap-1.5">
                    <User className="h-3 w-3 text-ink-400" />
                    {o.creator.name ?? o.creator.email}
                  </p>
                  {o.creator.name && (
                    <p className="mt-0.5 truncate text-[10.5px] text-ink-500">
                      {o.creator.email}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                      tone.bg,
                    )}
                  >
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {tone.label}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  {approval && (
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                        approval.bg,
                      )}
                    >
                      {approval.label}
                    </span>
                  )}
                </td>
                <NumCell n={o.items.length} />
                <NumCell n={o.dispatches.length} />
                <td className="px-4 py-3 text-right align-top tabular-nums">
                  <span className="font-semibold text-ink-900">
                    {formatRevenue(o.totalCents)}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatDate(o.createdAt)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <OrderRowActions
                    orderId={o.id}
                    brandName={o.brand?.name ?? null}
                    brandHandle={o.brand?.handle ?? null}
                    creatorUserId={o.creatorUserId}
                    stripeChargeId={o.charge?.stripeChargeId ?? null}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 200 && (
        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-center text-[11.5px] text-ink-500">
          Showing first 200 results. Use status filter to narrow further.
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Local helpers
// =============================================================================

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>
      {children}
    </th>
  )
}

function NumCell({ n }: { n: number }) {
  return (
    <td className="px-4 py-3 text-right align-top tabular-nums">
      <span className={n > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'}>{n}</span>
    </td>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        {filtered ? <PackageOpen className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No orders in this status' : 'No orders yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a different status or clear the filter to see everything.'
          : 'New orders surface here the moment a creator completes checkout.'}
      </p>
    </div>
  )
}

function formatRevenue(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(0)}k`
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(2)}`
}

function formatDate(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
