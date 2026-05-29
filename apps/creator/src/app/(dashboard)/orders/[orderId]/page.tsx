// Phase H3 — creator-side order detail with per-dispatch timeline.
//
// The "what's happening" view. Aggregate approval status pill at top
// answers the most-asked question ("did they approve yet?"), then one
// card per OrderDispatch with status / ETA / partner / a expand-able
// audit log.
//
// When any dispatch is CHANGES_REQUESTED, a prominent banner appears
// with the flagged fields + partner note + an Adjust button that loops
// back into the wizard so the creator can resubmit.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { AlertOctagon, Building2, CheckCircle2, Clock, Truck, Warehouse } from 'lucide-react'

export const dynamic = 'force-dynamic'

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  ROUTING: 'Routing',
  IN_FULFILLMENT: 'In production',
  READY_TO_SHIP: 'Ready to ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ON_HOLD: 'On hold (admin review)',
}

const DISPATCH_STATUS_LABEL: Record<string, string> = {
  PENDING_ACCEPT: 'Awaiting partner',
  ACCEPTED: 'Accepted',
  CHANGES_REQUESTED: 'Needs your adjustment',
  PRODUCING: 'In production',
  QUALITY_CHECK: 'QC',
  READY: 'Ready to ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  DECLINED: 'Partner declined',
  TIMED_OUT: 'Partner timed out',
  WITHDRAWN: 'Partner withdrew',
  CANCELLED: 'Cancelled',
  FAILED_QC: 'QC failed',
}

const TYPE_LABEL: Record<string, { label: string; icon: typeof Building2 }> = {
  PRODUCT: { label: 'Manufacturer', icon: Building2 },
  LABEL: { label: 'Print provider', icon: Truck },
  ACCESSORY: { label: 'Accessory partner', icon: Building2 },
}

const AGGREGATE_TONE: Record<string, string> = {
  AWAITING_PARTNERS: 'amber',
  PARTIALLY_ACCEPTED: 'amber',
  CHANGES_REQUESTED: 'red',
  FULLY_ACCEPTED: 'emerald',
  CANCELLED: 'zinc',
}

const AGGREGATE_LABEL: Record<string, string> = {
  AWAITING_PARTNERS: 'Awaiting partner approval',
  PARTIALLY_ACCEPTED: 'Some partners accepted',
  CHANGES_REQUESTED: 'Needs your attention',
  FULLY_ACCEPTED: 'All partners approved · production starting',
  CANCELLED: 'Cancelled',
}

const POST_ACCEPTED = new Set([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
])

interface ChangeRequest {
  flaggedFields: string[]
  partnerNote: string
  suggestedAlternatives?: Record<string, string>
  requestedAt: string
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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const user = await requireUser()

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      brand: { select: { name: true } },
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
      dispatches: {
        include: {
          partnerService: { include: { partner: { select: { companyName: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order) notFound()

  const product = order.items[0]?.product
  const aggregate = order.aggregateApprovalStatus ?? 'AWAITING_PARTNERS'
  const changeRequestedDispatches = order.dispatches.filter(
    (d) => d.status === 'CHANGES_REQUESTED',
  )

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/orders"
            className="text-xs text-zinc-500 underline hover:text-zinc-700"
          >
            ← All orders
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {product?.name ?? 'Order'}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {order.brand.name} · Order #{order.id.slice(-8)} ·{' '}
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <AggregateBanner status={aggregate} />
      </header>

      {/* Action-required banner when any dispatch needs creator attention */}
      {changeRequestedDispatches.length > 0 && product && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-red-900">
                {changeRequestedDispatches.length === 1
                  ? 'A partner needs you to adjust this order'
                  : `${changeRequestedDispatches.length} partners need you to adjust this order`}
              </h2>
              <p className="mt-1 text-sm text-red-800">
                The partner can&apos;t accept the spec as-is. Review the flagged
                fields below, then click Adjust to resubmit.
              </p>
              {changeRequestedDispatches.map((d) => {
                const cr = d.changeRequest as unknown as ChangeRequest | null
                if (!cr) return null
                return (
                  <div
                    key={d.id}
                    className="mt-3 rounded border border-red-200 bg-white p-3"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-red-700">
                      {TYPE_LABEL[d.type]?.label ?? d.type} ·{' '}
                      {d.partnerService.partner.companyName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cr.flaggedFields.map((f) => (
                        <span
                          key={f}
                          className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-800"
                        >
                          {FIELD_LABEL[f] ?? f}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 rounded bg-zinc-50 p-2 text-[12.5px] leading-snug text-zinc-700">
                      &ldquo;{cr.partnerNote}&rdquo;
                    </p>
                  </div>
                )
              })}
              <Link
                href={`/products/${product.id}/checkout`}
                className="mt-4 inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-black"
              >
                Adjust order
              </Link>
              <p className="mt-2 text-[10.5px] text-red-700">
                {/* H3 forward-marker — full adjust flow with wizard pre-fill +
                    manifest-version-aware acceptance revoke lands when the
                    wizard supports an 'adjust existing order' mode. */}
                V1: opens the checkout wizard. Full re-acceptance flow with
                manifest versioning ships next.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Per-dispatch timeline */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Partner gates</h2>
        {order.dispatches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-6 text-sm text-zinc-500">
            Dispatches will appear here once payment processes and routing
            finds your partners.
          </div>
        ) : (
          order.dispatches.map((d) => (
            <DispatchRow key={d.id} dispatch={d} />
          ))
        )}
      </section>

      {/* Summary */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Order summary
        </h2>
        <dl className="space-y-1">
          <SummaryRow label="Order status" value={ORDER_STATUS_LABEL[order.status] ?? order.status} />
          <SummaryRow label="Subtotal" value={`$${(order.subtotalCents / 100).toFixed(2)}`} />
          <SummaryRow label="Shipping" value={`$${(order.shippingCents / 100).toFixed(2)}`} />
          <SummaryRow label="Tax" value={`$${(order.taxCents / 100).toFixed(2)}`} />
          <SummaryRow
            label="Total paid"
            value={
              <span className="font-bold tabular-nums">
                ${(order.totalCents / 100).toFixed(2)}
              </span>
            }
          />
        </dl>
      </section>
    </div>
  )
}

// =============================================================================
// Aggregate banner
// =============================================================================

function AggregateBanner({ status }: { status: string }) {
  const tone = AGGREGATE_TONE[status] ?? 'amber'
  const label = AGGREGATE_LABEL[status] ?? status
  const classes: Record<string, string> = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    red: 'border-red-300 bg-red-50 text-red-900',
    zinc: 'border-zinc-300 bg-zinc-50 text-zinc-700',
  }
  const Icon = tone === 'emerald' ? CheckCircle2 : tone === 'red' ? AlertOctagon : Clock
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        classes[tone] ?? classes.amber
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}

// =============================================================================
// Per-dispatch row
// =============================================================================

interface DispatchLike {
  id: string
  type: string
  status: string
  costCents: number
  acceptDeadlineAt: Date
  acceptedAt: Date | null
  partnerService: { partner: { companyName: string } }
}

function DispatchRow({ dispatch: d }: { dispatch: DispatchLike }) {
  const type = TYPE_LABEL[d.type] ?? { label: d.type, icon: Building2 }
  const Icon = type.icon
  const isAccepted = POST_ACCEPTED.has(d.status)
  const isPending = d.status === 'PENDING_ACCEPT'
  const isFailure = ['DECLINED', 'TIMED_OUT', 'WITHDRAWN', 'FAILED_QC'].includes(d.status)

  const tone = isAccepted
    ? 'emerald'
    : isFailure
      ? 'red'
      : d.status === 'CHANGES_REQUESTED'
        ? 'red'
        : 'amber'

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-700">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
                {type.label}
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {d.partnerService.partner.companyName}
              </p>
            </div>
          </div>
          {isPending && (
            <p className="mt-2 text-xs text-zinc-500">
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
            <p className="mt-2 text-xs text-emerald-700">
              Accepted{' '}
              {new Date(d.acceptedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <StatusChip tone={tone} label={DISPATCH_STATUS_LABEL[d.status] ?? d.status} />
      </div>
    </div>
  )
}

function StatusChip({ tone, label }: { tone: string; label: string }) {
  const classes: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    zinc: 'bg-zinc-100 text-zinc-700',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
        classes[tone] ?? classes.zinc
      }`}
    >
      {label}
    </span>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-zinc-700">
      <dt className="text-xs uppercase text-zinc-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
