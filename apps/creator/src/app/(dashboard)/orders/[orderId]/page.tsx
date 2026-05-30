// REBUILD R13.a — creator-side order detail page.
//
// Picks up the R10 timeline + R12 design vocabulary so the per-order page
// feels like a deeper version of the list it sits behind:
//
//   - Cream header band with brand / product title / status pill + meta
//   - Two-column body — dispatch timeline on the left, sticky right rail
//     with order totals + contextual actions (R12 pattern)
//   - CHANGES_REQUESTED → prominent banner inline + Adjust CTA promoted
//     to the top of the right-rail actions card
//   - Per-dispatch wide cards using the same R10 palette (DRAFT /
//     AWAITING_APPROVALS / IN_PRODUCTION / etc.) — manufacturer locked,
//     others get Re-route + Ask partner + View manifest footer rail
//   - Footer-style summary card with breakdown + reorder/help links

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { getCreatorTier, hasTier, requireUser, type TierKey } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import {
  AlertOctagon,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  MessageSquare,
  Package,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react'
import { AdjustOrderButton } from './AdjustOrderButton'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Status vocabulary — mirrors R10 /orders palette so the list ↔ detail pages
// speak the same colour grammar.
// -----------------------------------------------------------------------------

type OrderStatusKey =
  | 'DRAFT'
  | 'AWAITING_APPROVALS'
  | 'CHANGES_REQUESTED'
  | 'REROUTING'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

interface StatusPalette {
  label: string
  bg: string
  fg: string
  border: string
  dot: string
}

const ORDER_STATUS: Record<OrderStatusKey, StatusPalette> = {
  DRAFT:              { label: 'Draft',               bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  AWAITING_APPROVALS: { label: 'Awaiting approvals',  bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  IN_PRODUCTION:      { label: 'In production',       bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  CHANGES_REQUESTED:  { label: 'Changes requested',   bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  REROUTING:          { label: 'Re-routing',          bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  SHIPPED:            { label: 'Shipped',             bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED:          { label: 'Delivered',           bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  CANCELLED:          { label: 'Cancelled',           bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
}

type DispatchStatusKey =
  | 'PENDING_ACCEPT'
  | 'ACCEPTED'
  | 'CHANGES_REQUESTED'
  | 'PRODUCING'
  | 'QUALITY_CHECK'
  | 'READY'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'DECLINED'
  | 'TIMED_OUT'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'FAILED_QC'

const DISPATCH_STATUS: Record<DispatchStatusKey, StatusPalette> = {
  PENDING_ACCEPT:    { label: 'Awaiting partner',   bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  ACCEPTED:          { label: 'Accepted',           bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  CHANGES_REQUESTED: { label: 'Needs your changes', bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  PRODUCING:         { label: 'In production',      bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  QUALITY_CHECK:     { label: 'Quality check',      bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  READY:             { label: 'Ready to ship',      bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  SHIPPED:           { label: 'Shipped',            bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  IN_TRANSIT:        { label: 'In transit',         bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED:         { label: 'Delivered',          bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  DECLINED:          { label: 'Partner declined',   bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
  TIMED_OUT:         { label: 'Partner timed out',  bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
  WITHDRAWN:         { label: 'Partner withdrew',   bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  CANCELLED:         { label: 'Cancelled',          bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  FAILED_QC:         { label: 'Failed QC',          bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
}

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Fulfillment',
  ACCESSORY: 'Accessory partner',
}

const TYPE_ICON: Record<string, typeof Building2> = {
  PRODUCT: Building2,
  LABEL: Package,
  ACCESSORY: Building2,
}

const FIELD_LABEL: Record<string, string> = {
  quantity: 'Quantity',
  substrate: 'Substrate',
  packagingMaterial: 'Packaging material',
  finishes: 'Finishes',
  shipTo: 'Ship-to',
  leadTime: 'Lead time',
  other: 'Other',
}

const POST_ACCEPTED = new Set<DispatchStatusKey>([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
])

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface ChangeRequest {
  flaggedFields: string[]
  partnerNote: string
  suggestedAlternatives?: Record<string, string>
  requestedAt: string
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const user = await requireUser()
  // R14.d — drives the Builder+ gate on the right-rail Get product support link.
  const creatorTier = await getCreatorTier(user.id)

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      brand: { select: { name: true } },
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
      dispatches: {
        include: {
          partnerService: {
            include: { partner: { select: { companyName: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order) notFound()

  const product = order.items[0]?.product
  const status = deriveOrderStatus(order)
  const palette = ORDER_STATUS[status]
  const aggregate = order.aggregateApprovalStatus ?? 'AWAITING_PARTNERS'
  const changeRequestedDispatches = order.dispatches.filter(
    (d) => d.status === 'CHANGES_REQUESTED',
  )
  const needsAdjust = changeRequestedDispatches.length > 0
  const isDelivered = status === 'DELIVERED'

  return (
    <div className="space-y-6">
      {/* Cream header band — mirrors R10 list-card header */}
      <header className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-[#F3EFE8] px-5 py-3 text-[12px] text-zinc-700">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All orders
          </Link>
          <span className="h-3 w-px bg-zinc-300" aria-hidden="true" />
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
            style={{
              background: palette.bg,
              color: palette.fg,
              borderColor: palette.border,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: palette.dot }}
            />
            {palette.label}
          </span>
          <span>
            <span className="text-zinc-500">Order</span> &nbsp;#{order.id.slice(-8)}
          </span>
          <span className="ml-auto text-zinc-500">
            Placed {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr,auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">
              {order.brand.name}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-zinc-900">
              {product?.name ?? 'Order'}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-zinc-600">
              {order.dispatches.length === 0
                ? 'Dispatches will appear once payment processes and routing finds partners.'
                : `${order.dispatches.length} partner ${order.dispatches.length === 1 ? 'gate' : 'gates'} · ${humanAggregate(aggregate)}`}
            </p>
          </div>
        </div>
      </header>

      {/* Action-required banner on top of body when partners need adjustments */}
      {needsAdjust && product && (
        <ChangesRequestedBanner
          dispatches={changeRequestedDispatches.map((d) => ({
            id: d.id,
            type: d.type,
            partnerName: d.partnerService.partner.companyName,
            request: d.changeRequest as unknown as ChangeRequest | null,
          }))}
        />
      )}

      {/* Two-column body — dispatch timeline left, sticky rail right */}
      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Partner gates
          </h2>
          {order.dispatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-6 text-sm text-zinc-500">
              Dispatches will appear here once payment processes and routing
              finds your partners.
            </div>
          ) : (
            order.dispatches.map((d) => (
              <DispatchCard
                key={d.id}
                dispatch={{
                  id: d.id,
                  type: d.type,
                  status: d.status as DispatchStatusKey,
                  costCents: d.costCents,
                  acceptDeadlineAt: d.acceptDeadlineAt,
                  acceptedAt: d.acceptedAt,
                  serviceType: d.partnerService.type,
                  partnerName: d.partnerService.partner.companyName,
                }}
              />
            ))
          )}
        </section>

        {/* Sticky right rail — totals + contextual actions */}
        <aside className="space-y-3 lg:sticky lg:top-[88px] lg:self-start">
          <ActionsCard
            productId={product?.id ?? null}
            orderId={order.id}
            needsAdjust={needsAdjust}
            isDelivered={isDelivered}
            creatorTier={creatorTier}
          />
          <TotalsCard
            order={{
              subtotalCents: order.subtotalCents,
              shippingCents: order.shippingCents,
              taxCents: order.taxCents,
              totalCents: order.totalCents,
              dispatchCount: order.dispatches.length,
            }}
          />
        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// ChangesRequestedBanner — surfaces partner-flagged fields prominently
// =============================================================================

function ChangesRequestedBanner({
  dispatches,
}: {
  dispatches: Array<{
    id: string
    type: string
    partnerName: string
    request: ChangeRequest | null
  }>
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border-2 p-4"
      style={{
        background: '#FAEEDA',
        borderColor: '#BA7517',
      }}
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: '#854F0B' }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold" style={{ color: '#5A3406' }}>
            {dispatches.length === 1
              ? 'A partner needs you to adjust this order'
              : `${dispatches.length} partners need you to adjust this order`}
          </h2>
          <p className="mt-1 text-[12.5px]" style={{ color: '#7C4A0E' }}>
            Open Adjust in the right rail to edit the flagged fields and
            resubmit — only the affected partner gates re-accept.
          </p>
          <div className="mt-3 space-y-2">
            {dispatches.map((d) => {
              if (!d.request) return null
              return (
                <div
                  key={d.id}
                  className="rounded-md border border-[#FAC775] bg-white/80 p-3"
                >
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-600">
                    {SERVICE_LABEL[d.type] ?? d.type} ·{' '}
                    <span className="text-zinc-800">{d.partnerName}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.request.flaggedFields.map((f) => (
                      <span
                        key={f}
                        className="inline-flex rounded-full bg-[#FBEAF0] px-2 py-0.5 text-[10.5px] font-semibold text-[#72243E]"
                      >
                        {FIELD_LABEL[f] ?? f}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 rounded bg-zinc-50 p-2 text-[12px] italic leading-snug text-zinc-700">
                    &ldquo;{d.request.partnerNote}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DispatchCard — one per OrderDispatch, R10-style wide card
// =============================================================================

interface DispatchView {
  id: string
  type: string
  status: DispatchStatusKey
  costCents: number
  acceptDeadlineAt: Date
  acceptedAt: Date | null
  serviceType: string
  partnerName: string
}

function DispatchCard({ dispatch: d }: { dispatch: DispatchView }) {
  const palette = DISPATCH_STATUS[d.status]
  const Icon = TYPE_ICON[d.type] ?? Building2
  const serviceLabel = SERVICE_LABEL[d.serviceType] ?? d.serviceType
  // Manufacturer can't be re-routed — they own the recipe + production line.
  // Any other service (printer, copacker, warehouse) is replaceable.
  const isManufacturer = d.serviceType === 'MANUFACTURING'
  const isAccepted = POST_ACCEPTED.has(d.status)
  const isPending = d.status === 'PENDING_ACCEPT'
  const isFailure = ['DECLINED', 'TIMED_OUT', 'WITHDRAWN', 'FAILED_QC'].includes(d.status)
  const needsChange = d.status === 'CHANGES_REQUESTED'

  return (
    <article
      className={
        'overflow-hidden rounded-xl border bg-white ' +
        (needsChange ? 'border-[#FAC775] ring-1 ring-[#FAC775]/40' : 'border-zinc-200')
      }
    >
      <header
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-zinc-100 px-4 py-2.5 text-[12px] text-zinc-700"
        style={{
          background: needsChange ? '#FDF6E8' : '#FAF8F2',
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{
            background: palette.bg,
            color: palette.fg,
            borderColor: palette.border,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          {palette.label}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
          <Icon className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          {serviceLabel}
        </span>
        {isManufacturer && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500"
            title="The manufacturer is locked to this order — partner is set when production begins"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Locked
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-zinc-400">
          DSP-{d.id.slice(-6)}
        </span>
      </header>

      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Partner
          </p>
          <p className="mt-0.5 truncate text-[14px] font-semibold text-zinc-900">
            {d.partnerName}
          </p>
          {isPending && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-zinc-600">
              <Clock className="h-3 w-3 text-amber-700" aria-hidden="true" />
              Decision needed by{' '}
              {new Date(d.acceptDeadlineAt).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {isAccepted && d.acceptedAt && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-emerald-700">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Accepted{' '}
              {new Date(d.acceptedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {isFailure && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-red-700">
              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
              {palette.label} — re-routing kicked in automatically
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Cost
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-zinc-900">
            ${(d.costCents / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Footer action rail — same idea as R10 cards */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-2.5 text-[11.5px]">
        <button
          type="button"
          disabled
          title="Partner messaging is V1.1+"
          className="inline-flex items-center gap-1 text-zinc-500 disabled:cursor-not-allowed"
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          Ask partner
        </button>
        <Link
          href={`/orders/${d.id}/dispatch/${d.id}/manifest`}
          className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          View manifest
        </Link>
        {!isManufacturer && !isAccepted && (
          <button
            type="button"
            disabled
            title="Manual re-route lands in V1.1 — auto re-route is already running"
            className="inline-flex items-center gap-1 text-zinc-500 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="h-3 w-3" aria-hidden="true" />
            Re-route
          </button>
        )}
      </footer>
    </article>
  )
}

// =============================================================================
// ActionsCard — sticky right-rail contextual actions
// =============================================================================

function ActionsCard({
  productId,
  orderId,
  needsAdjust,
  isDelivered,
  creatorTier,
}: {
  productId: string | null
  orderId: string
  needsAdjust: boolean
  isDelivered: boolean
  creatorTier: TierKey
}) {
  // R14.d — concierge-style "Get product support" is a Builder+ perk
  // (the Maker tier doesn't include human-loop support per PLATFORM_SPEC
  // Tier 1 matrix). Maker sees the row with a Builder lock badge and an
  // upgrade CTA target; Builder/Agency get the real /help link.
  const supportUnlocked = hasTier(creatorTier, 'builder')
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Adjust takes top spot when needed — that's the only action that
          actually moves the order forward in that state. */}
      {needsAdjust && productId ? (
        <div className="space-y-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#854F0B]">
            Needs your attention
          </p>
          <AdjustOrderButton productId={productId} orderId={orderId} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            What you can do
          </p>
          {isDelivered && productId && (
            <Link
              href={`/products/${productId}/checkout`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#B5FF3D] px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-zinc-900 shadow-sm hover:bg-[#A4F127] focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reorder
            </Link>
          )}
        </div>
      )}

      <div className="my-3 h-px bg-zinc-100" />

      <ul className="space-y-2 text-[12.5px]">
        <li>
          <button
            type="button"
            disabled
            title="Partner messaging is V1.1+"
            className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-zinc-500 disabled:cursor-not-allowed"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            Ask a partner
          </button>
        </li>
        <li>
          {supportUnlocked ? (
            <Link
              href="/help"
              className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Get product support
            </Link>
          ) : (
            <Link
              href="/pricing?tier=builder"
              className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-pink-200 bg-pink-50/50 px-2 py-1.5 text-zinc-700 hover:bg-pink-50 hover:text-zinc-900"
              title="Concierge product support is included with Builder + Agency plans"
            >
              <span className="inline-flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Get product support
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                Builder
              </span>
            </Link>
          )}
        </li>
        {productId && (
          <li>
            <Link
              href={`/products/${productId}`}
              className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              View product
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}

// =============================================================================
// TotalsCard — sticky right-rail order totals breakdown
// =============================================================================

function TotalsCard({
  order,
}: {
  order: {
    subtotalCents: number
    shippingCents: number
    taxCents: number
    totalCents: number
    dispatchCount: number
  }
}) {
  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      aria-labelledby="order-totals-heading"
    >
      <h3
        id="order-totals-heading"
        className="mb-3 text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500"
      >
        Order totals
      </h3>
      <dl className="space-y-1.5 text-[13px]">
        <Line label={`Production × ${order.dispatchCount}`} value={order.subtotalCents} />
        <Line label="Shipping" value={order.shippingCents} dimmed={order.shippingCents === 0} />
        <Line label="Tax" value={order.taxCents} dimmed={order.taxCents === 0} />
      </dl>
      <div className="my-3 h-px bg-zinc-100" />
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-zinc-900">Total paid</span>
        <span className="font-display text-[18px] font-bold tabular-nums text-zinc-900">
          ${(order.totalCents / 100).toFixed(2)}
        </span>
      </div>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-zinc-500">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Payment held until every partner accepts the manifest.
      </p>
    </div>
  )
}

function Line({
  label,
  value,
  dimmed,
}: {
  label: string
  value: number
  dimmed?: boolean
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-2 ' +
        (dimmed ? 'text-zinc-400' : 'text-zinc-700')
      }
    >
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums">${(value / 100).toFixed(2)}</dd>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

interface OrderForStatus {
  status: string
  aggregateApprovalStatus: string | null
  dispatches: Array<{
    status: string
    partnerService: { type: string }
  }>
}

function deriveOrderStatus(o: OrderForStatus): OrderStatusKey {
  if (o.status === 'CANCELLED' || o.status === 'REFUNDED') return 'CANCELLED'
  if (o.aggregateApprovalStatus === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED'
  if (
    o.dispatches.some(
      (d) => d.status === 'WITHDRAWN' && d.partnerService.type !== 'MANUFACTURING',
    )
  ) {
    return 'REROUTING'
  }
  if (o.dispatches.length && o.dispatches.every((d) => d.status === 'DELIVERED')) {
    return 'DELIVERED'
  }
  if (o.dispatches.some((d) => ['SHIPPED', 'IN_TRANSIT'].includes(d.status))) {
    return 'SHIPPED'
  }
  if (
    o.dispatches.some((d) =>
      ['PRODUCING', 'QUALITY_CHECK', 'READY', 'ACCEPTED'].includes(d.status),
    )
  ) {
    return 'IN_PRODUCTION'
  }
  if (o.status === 'PENDING_PAYMENT') return 'DRAFT'
  return 'AWAITING_APPROVALS'
}

function humanAggregate(s: string): string {
  switch (s) {
    case 'AWAITING_PARTNERS':
      return 'Awaiting partner approvals'
    case 'PARTIALLY_ACCEPTED':
      return 'Some partners accepted'
    case 'CHANGES_REQUESTED':
      return 'Adjustments needed'
    case 'FULLY_ACCEPTED':
      return 'All partners approved · production starting'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return s
  }
}
