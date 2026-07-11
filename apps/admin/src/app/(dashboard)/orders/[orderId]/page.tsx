// =============================================================================
// Admin Order detail (#574) — locked admin surface pattern
// =============================================================================
//
// Counterpart to /admin/orders (list). Renders the full operational picture for
// a single production order so an admin can answer:
//   • Where is the money? (charge + transfers + refunds)
//   • Where is the production? (per-dispatch FSM + manifest version)
//   • Where is it going? (ship-to + brand handle)
//   • What happened so far? (right-rail timeline)
//
// Layout: cream header band w/ KPI strip, main column with detail cards, sticky
// right-rail with Quick Actions / Timeline / Meta. Every Prisma include from
// the previous version is preserved — this is purely a chrome rebuild.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ShoppingBag,
  Package,
  Truck,
  CheckCircle2,
  ExternalLink,
  Mail,
  Store,
  FileText,
  Clock,
  CreditCard,
  Building2,
  User,
  DollarSign,
  AlertTriangle,
  PackageOpen,
  StickyNote,
  Calendar,
  Hash,
  ArrowRightLeft,
  Route,
  Warehouse,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { ResolveDisputeControls } from './ResolveDisputeControls'
import { cn, ProductionManifestView, RolePacketView, formatCents } from '@ilaunchify/ui'
import type { ProductionManifest } from '@ilaunchify/orders'
import { computeStorageAccrual, type StorageFeeSnapshot } from '@ilaunchify/shipping'
import { rankWarehousesForOrder, type FcRankingContext } from './logistics-data'
import { FcOverrideControls, type FcOverrideOption } from './FcOverrideControls'
import { CloseStorageAgreementControls } from './CloseStorageAgreementControls'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Tone maps (mirror /admin/orders list page conventions)
// -----------------------------------------------------------------------------

const STATUS_TONE: Record<
  string,
  { bg: string; dot: string; label: string; bar: string }
> = {
  PENDING_PAYMENT: {
    bg: 'bg-warning-50 text-warning-800 border-warning-200',
    dot: 'bg-warning-500',
    bar: 'bg-warning-500',
    label: 'Pending payment',
  },
  PAID: {
    bg: 'bg-pink-50 text-pink-700 border-pink-200',
    dot: 'bg-pink-500',
    bar: 'bg-pink-500',
    label: 'Paid',
  },
  ROUTING: {
    bg: 'bg-info-50 text-info-800 border-info-200',
    dot: 'bg-info-500',
    bar: 'bg-info-500',
    label: 'Routing',
  },
  IN_FULFILLMENT: {
    bg: 'bg-pink-50 text-pink-700 border-pink-200',
    dot: 'bg-pink-500',
    bar: 'bg-pink-500',
    label: 'In fulfillment',
  },
  READY_TO_SHIP: {
    bg: 'bg-info-50 text-info-800 border-info-200',
    dot: 'bg-info-500',
    bar: 'bg-info-500',
    label: 'Ready to ship',
  },
  SHIPPED: {
    bg: 'bg-info-50 text-info-800 border-info-200',
    dot: 'bg-info-500',
    bar: 'bg-info-500',
    label: 'Shipped',
  },
  IN_TRANSIT: {
    bg: 'bg-info-50 text-info-800 border-info-200',
    dot: 'bg-info-500',
    bar: 'bg-info-500',
    label: 'In transit',
  },
  DELIVERED: {
    bg: 'bg-success-50 text-success-700 border-success-200',
    dot: 'bg-success-500',
    bar: 'bg-success-500',
    label: 'Delivered',
  },
  COMPLETED: {
    bg: 'bg-success-50 text-success-700 border-success-200',
    dot: 'bg-success-500',
    bar: 'bg-success-500',
    label: 'Completed',
  },
  CANCELLED: {
    bg: 'bg-ink-100 text-ink-700 border-ink-200',
    dot: 'bg-ink-400',
    bar: 'bg-ink-400',
    label: 'Cancelled',
  },
  REFUNDED: {
    bg: 'bg-danger-50 text-danger-700 border-danger-200',
    dot: 'bg-danger-500',
    bar: 'bg-danger-500',
    label: 'Refunded',
  },
  ON_HOLD: {
    bg: 'bg-warning-50 text-warning-800 border-warning-200',
    dot: 'bg-warning-500',
    bar: 'bg-warning-500',
    label: 'On hold',
  },
  DISPUTED: {
    bg: 'bg-danger-50 text-danger-700 border-danger-200',
    dot: 'bg-danger-500',
    bar: 'bg-danger-500',
    label: 'Disputed',
  },
}

const DISPATCH_TONE: Record<
  string,
  { bg: string; dot: string; bar: string; label: string }
> = {
  PENDING_ACCEPT: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', bar: 'bg-warning-500', label: 'Pending accept' },
  ACCEPTED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', bar: 'bg-info-500', label: 'Accepted' },
  CHANGES_REQUESTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', bar: 'bg-danger-500', label: 'Changes requested' },
  PRODUCING: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', bar: 'bg-pink-500', label: 'Producing' },
  QUALITY_CHECK: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', bar: 'bg-pink-500', label: 'Quality check' },
  FAILED_QC: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', bar: 'bg-danger-500', label: 'Failed QC' },
  READY: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', bar: 'bg-info-500', label: 'Ready' },
  SHIPPED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', bar: 'bg-info-500', label: 'Shipped' },
  IN_TRANSIT: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', bar: 'bg-info-500', label: 'In transit' },
  DELIVERED: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', bar: 'bg-success-500', label: 'Delivered' },
  DECLINED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', bar: 'bg-danger-500', label: 'Declined' },
  TIMED_OUT: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', bar: 'bg-ink-400', label: 'Timed out' },
  WITHDRAWN: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', bar: 'bg-danger-500', label: 'Withdrawn' },
}

const APPROVAL_TONE: Record<string, { bg: string; label: string }> = {
  AWAITING_PARTNERS: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Awaiting partners' },
  PARTIALLY_ACCEPTED: { bg: 'bg-info-50 text-info-800 border-info-200', label: 'Partially accepted' },
  CHANGES_REQUESTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', label: 'Changes requested' },
  FULLY_ACCEPTED: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Fully accepted' },
  CANCELLED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', label: 'Cancelled' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ orderId: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { orderId } = await params
  return { title: `Order #${orderId.slice(-8)} — Admin` }
}

export default async function AdminOrderDetail({ params }: PageProps) {
  const { orderId } = await params
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      brand: true,
      creator: true,
      shipToPartnerService: { include: { partner: true } },
      items: { include: { product: true } },
      dispatches: {
        include: {
          partnerService: { include: { partner: { include: { user: true } } } },
        },
      },
      charge: { include: { transfers: { include: { destinationUser: true } } } },
      refunds: true,
    },
  })
  if (!order) notFound()

  // Open creator dispute, if any (cast-guarded + .catch so the page is safe before
  // the OrderDispute migration lands).
  const openDispute = await (
    prisma as unknown as {
      orderDispute: {
        findFirst: (a: unknown) => Promise<{
          id: string
          category: string
          description: string
          status: string
          createdAt: Date
          partnerResponse: string | null
          openedBy: { email: string | null } | null
        } | null>
      }
    }
  ).orderDispute
    .findFirst({
      where: { orderId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        createdAt: true,
        partnerResponse: true,
        openedBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => null)

  // L1.2b — logistics panels (docs/LOGISTICS_AND_FULFILLMENT.md §5/§9/L8).
  // Fulfillment routing recomputes live eligibility for the override select;
  // storage agreements carry their frozen fee snapshot for the accrual math.
  const isWarehouseOrder = order.shipToType === 'WAREHOUSE_PARTNER'
  const isHoldOrder = order.shipToType === 'HOLD_AT_MANUFACTURER'
  const [fcAwardLog, fcRanking, storageAgreements] = await Promise.all([
    isWarehouseOrder
      ? prisma.fcAwardLog.findFirst({
          where: { orderId },
          orderBy: { awardedAt: 'desc' },
          select: { id: true, partnerServiceId: true, scoreJson: true, awardedAt: true },
        })
      : Promise.resolve(null),
    isWarehouseOrder ? rankWarehousesForOrder(orderId) : Promise.resolve(null),
    isHoldOrder
      ? prisma.storageAgreement.findMany({
          where: { orderId },
          include: {
            partnerService: { include: { partner: true } },
            releases: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ])
  const goodsMoving = order.dispatches.some((d) =>
    ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(d.status),
  )

  const statusTone =
    STATUS_TONE[order.status] ?? STATUS_TONE.CANCELLED ?? {
      bg: 'bg-ink-100 text-ink-700 border-ink-200',
      dot: 'bg-ink-400',
      bar: 'bg-ink-400',
      label: order.status,
    }
  const approvalTone = APPROVAL_TONE[order.aggregateApprovalStatus]

  // Right-rail timeline values
  const firstShippedAt = order.dispatches
    .map((d) => d.shippedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const firstDeliveredAt =
    order.deliveredAt ??
    order.dispatches
      .map((d) => d.deliveredAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0]

  return (
    <div className="space-y-6">
      {/* OPEN DISPUTE — creator-reported issue awaiting resolution */}
      {openDispute && (
        <section className="rounded-2xl border border-warning-300 bg-warning-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-warning-900">
              Open dispute · {String(openDispute.category).replace(/_/g, ' ').toLowerCase()}
            </p>
            <span className="text-[11px] text-warning-700">
              {openDispute.openedBy?.email ?? 'creator'} ·{' '}
              {new Date(openDispute.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-ink-800">{openDispute.description}</p>
          {openDispute.partnerResponse ? (
            <div className="mt-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12.5px] text-ink-700">
              <span className="font-semibold text-ink-800">Partner&apos;s response:</span>{' '}
              {openDispute.partnerResponse}
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] italic text-warning-700">
              Awaiting the partner&apos;s response — they&apos;ve been notified.
            </p>
          )}
          <ResolveDisputeControls
            disputeId={openDispute.id}
            orderTotalCents={order.totalCents}
            labelDispatches={order.dispatches
              .filter((d) => d.type === 'LABEL')
              .map((d) => ({
                id: d.id,
                label: `${d.partnerService.partner.companyName ?? 'Printer'} · v${d.manifestVersion} · ${String(d.status).replace(/_/g, ' ').toLowerCase()}`,
              }))}
          />
        </section>
      )}

      {/* HEADER */}
      <AdminDetailHeader
        backHref="/orders"
        backLabel="All orders"
        eyebrow="Orders · Detail"
        title={(order as { orderNumber?: string | null }).orderNumber ?? `Order #${order.id.slice(-8)}`}
        meta={
          <>
            <span className="inline-flex items-center gap-1 font-medium text-ink-900">
              <Building2 className="h-3 w-3 text-ink-400" aria-hidden="true" />
              {order.brand.name}
            </span>
            <span className="text-ink-400">·</span>
            <a
              href={`mailto:${order.creator.email}`}
              className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
            >
              <User className="h-3 w-3" aria-hidden="true" />
              {order.creator.email}
            </a>
            <span className="text-ink-400">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 text-ink-400" aria-hidden="true" />
              {new Date(order.createdAt).toLocaleString()}
            </span>
          </>
        }
        status={
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-wider',
              statusTone.bg,
            )}
          >
            <span className={cn('inline-block h-2 w-2 rounded-full', statusTone.dot)} />
            {statusTone.label}
          </span>
        }
      >
        {/* KPI strip */}
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
          <Kpi
            icon={DollarSign}
            label="Total"
            value={formatCents(order.totalCents)}
            tone="pink"
          />
          <Kpi
            icon={ShoppingBag}
            label="Items"
            value={order.items.length}
            tone="ink"
          />
          <Kpi
            icon={PackageOpen}
            label="Dispatches"
            value={order.dispatches.length}
            tone="info"
          />
          <Kpi
            icon={CheckCircle2}
            label="Approval"
            value={approvalTone?.label ?? '—'}
            tone="success"
          />
        </div>
      </AdminDetailHeader>

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,360px]">
        {/* LEFT — Main */}
        <div className="space-y-6">
          <ItemsCard items={order.items} totalCents={order.totalCents} />
          <DispatchesCard dispatches={order.dispatches} />
          {order.charge && <ChargeCard charge={order.charge} />}
          {order.charge && order.charge.transfers.length > 0 && (
            <TransfersCard transfers={order.charge.transfers} />
          )}
          {order.refunds.length > 0 && <RefundsCard refunds={order.refunds} />}
          <ShipToCard order={order} />
          {isWarehouseOrder && fcRanking && (
            <FulfillmentRoutingCard
              orderId={order.id}
              currentPartnerServiceId={order.shipToPartnerServiceId}
              currentPartnerName={order.shipToPartnerService?.partner.companyName ?? null}
              currentCity={order.shipToCity}
              currentState={order.shipToState}
              awardLog={fcAwardLog}
              ranking={fcRanking}
              goodsMoving={goodsMoving}
            />
          )}
          {isHoldOrder && (
            <StorageAgreementCard orderId={order.id} agreements={storageAgreements} />
          )}
          {order.internalNotes && (
            <NotesCard notes={order.internalNotes} />
          )}
        </div>

        {/* RIGHT — Sticky rail */}
        <aside className="space-y-6 md:sticky md:top-6 md:self-start">
          <QuickActionsCard
            orderId={order.id}
            creatorEmail={order.creator.email}
            brandHandle={order.brand.handle}
            stripeChargeId={order.charge?.stripeChargeId ?? null}
          />
          <TimelineCard
            createdAt={order.createdAt}
            paidAt={order.paidAt}
            shippedAt={firstShippedAt ?? null}
            deliveredAt={firstDeliveredAt ?? null}
          />
          <MetaCard
            orderId={order.id}
            brandHandle={order.brand.handle}
            creatorUserId={order.creatorUserId}
            shipToType={order.shipToType}
            manifestVersionMax={Math.max(
              1,
              ...order.dispatches.map((d) => d.manifestVersion ?? 1),
            )}
          />
        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// LEFT COLUMN CARDS
// =============================================================================

function ItemsCard({
  items,
  totalCents,
}: {
  items: Array<{
    id: string
    quantity: number
    unitPriceCents: number
    totalCents: number
    product: { id: string; name: string }
  }>
  totalCents: number
}) {
  return (
    <Card
      icon={ShoppingBag}
      title="Line items"
      subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`}
    >
      {items.length === 0 ? (
        <Empty label="No line items on this order." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-100">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Product</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Unit</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-400"
                      >
                        <Package className="h-3.5 w-3.5" />
                      </span>
                      <p className="font-medium text-ink-900">{i.product.name}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-ink-700">
                    {i.quantity.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-ink-600">
                    {formatCents(i.unitPriceCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums font-semibold text-ink-900">
                    {formatCents(i.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-50/70">
              <tr>
                <td className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-ink-700" colSpan={3}>
                  Order total
                </td>
                <td className="px-3 py-2.5 text-right text-[13.5px] font-semibold tabular-nums text-ink-900">
                  {formatCents(totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

function DispatchesCard({
  dispatches,
}: {
  dispatches: Array<{
    id: string
    type: string
    status: string
    costCents: number
    acceptDeadlineAt: Date
    shippedAt: Date | null
    declineReason: string | null
    declineNotes: string | null
    manifestVersion: number
    acceptedManifestVersion: number | null
    finishManifestJson: unknown
    bundleStatus: string
    partnerService: {
      type: string
      partner: { companyName: string }
    }
  }>
}) {
  return (
    <Card
      icon={PackageOpen}
      title="Dispatches"
      subtitle={
        dispatches.length === 0
          ? 'Not yet routed'
          : `${dispatches.length} partner${dispatches.length === 1 ? '' : 's'} engaged`
      }
    >
      {dispatches.length === 0 ? (
        <Empty label="No dispatches yet — order has not been routed." />
      ) : (
        <ul className="space-y-3">
          {dispatches.map((d) => {
            const tone =
              DISPATCH_TONE[d.status] ??
              DISPATCH_TONE.PENDING_ACCEPT ?? {
                bg: 'bg-ink-100 text-ink-700 border-ink-200',
                dot: 'bg-ink-400',
                bar: 'bg-ink-400',
                label: d.status,
              }
            const reReview =
              d.acceptedManifestVersion !== null &&
              d.acceptedManifestVersion !== d.manifestVersion
            return (
              <li
                key={d.id}
                className="overflow-hidden rounded-xl border border-ink-200 bg-white"
              >
                <div className="flex">
                  <span
                    aria-hidden="true"
                    className={cn('w-1 shrink-0', tone.bar)}
                  />
                  <div className="flex-1 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
                          <Hash className="h-3 w-3" aria-hidden="true" />
                          {d.type}
                          <span className="text-ink-300">·</span>
                          {d.partnerService.type}
                        </p>
                        <p className="mt-0.5 font-display text-[15px] font-semibold text-ink-900">
                          {d.partnerService.partner.companyName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                          tone.bg,
                        )}
                      >
                        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
                        {tone.label}
                      </span>
                    </div>
                    {reReview && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-2 py-1 text-[11px] font-medium text-warning-800">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Manifest v{d.manifestVersion} — partner accepted v{d.acceptedManifestVersion}, re-review pending
                      </div>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                      <DispatchRow label="Cost" value={formatCents(d.costCents)} />
                      <DispatchRow
                        label="Accept by"
                        value={new Date(d.acceptDeadlineAt).toLocaleString()}
                      />
                      {d.shippedAt && (
                        <DispatchRow
                          label="Shipped"
                          value={new Date(d.shippedAt).toLocaleString()}
                        />
                      )}
                      {d.declineReason && (
                        <DispatchRow
                          label="Decline reason"
                          value={`${d.declineReason}${d.declineNotes ? ` — ${d.declineNotes}` : ''}`}
                          wide
                          tone="rose"
                        />
                      )}
                    </dl>

                    {/* Production manifest — same view the partner sees, with a
                        downloadable manifest. Collapsed to keep the list scannable. */}
                    <details className="group mt-3">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700 [&::-webkit-details-marker]:hidden">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        Production manifest
                        <span className="font-normal text-ink-400 group-open:hidden">· show</span>
                      </summary>
                      <div className="mt-2">
                        {d.finishManifestJson &&
                        typeof d.finishManifestJson === 'object' &&
                        'role' in (d.finishManifestJson as object) ? (
                          <RolePacketView
                            packet={d.finishManifestJson as unknown as Parameters<typeof RolePacketView>[0]['packet']}
                          />
                        ) : (
                          <ProductionManifestView
                            manifest={(d.finishManifestJson as unknown as ProductionManifest | null) ?? null}
                            status={d.bundleStatus as 'PENDING_GENERATION' | 'READY' | 'FAILED'}
                            manifestDownloadHref={`/api/manifest/${d.id}`}
                          />
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function DispatchRow({
  label,
  value,
  wide = false,
  tone = 'default',
}: {
  label: string
  value: string
  wide?: boolean
  tone?: 'default' | 'rose'
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 text-[12px]',
          tone === 'rose' ? 'text-danger-700' : 'text-ink-900',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ChargeCard({
  charge,
}: {
  charge: {
    stripeChargeId: string
    status: string
    amountCents: number
    applicationFeeCents: number
    statementDescriptor: string | null
  }
}) {
  return (
    <Card
      icon={CreditCard}
      title="Charge"
      subtitle={charge.stripeChargeId}
    >
      <dl className="divide-y divide-ink-100">
        <Row label="Status">
          <span className="font-medium text-ink-900">{charge.status}</span>
        </Row>
        <Row label="Amount">
          <span className="tabular-nums">{formatCents(charge.amountCents)}</span>
        </Row>
        <Row label="Application fee">
          <span className="tabular-nums text-success-700">
            {formatCents(charge.applicationFeeCents)}
          </span>
        </Row>
        {charge.statementDescriptor && (
          <Row label="Statement descriptor">
            <span className="font-mono text-[11.5px]">{charge.statementDescriptor}</span>
          </Row>
        )}
      </dl>
    </Card>
  )
}

function TransfersCard({
  transfers,
}: {
  transfers: Array<{
    id: string
    destinationType: string
    reason: string
    amountCents: number
    status: string
    executedAt: Date | null
    destinationUser: { email: string }
  }>
}) {
  return (
    <Card
      icon={ArrowRightLeft}
      title="Transfers"
      subtitle={`${transfers.length} outbound payout${transfers.length === 1 ? '' : 's'}`}
    >
      <ul className="space-y-2">
        {transfers.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-ink-900">
                {t.destinationType}{' '}
                <span className="text-[11px] font-normal text-ink-500">
                  · {t.reason.toLowerCase()}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-ink-600">{t.destinationUser.email}</p>
              <p className="mt-1 text-[12px] uppercase tracking-wider text-ink-700">
                {t.status}
                {t.executedAt && ` · ${new Date(t.executedAt).toLocaleDateString()}`}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-ink-900">
              {formatCents(t.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RefundsCard({
  refunds,
}: {
  refunds: Array<{
    id: string
    amountCents: number
    stripeRefundId: string
  }>
}) {
  return (
    <Card
      icon={ArrowRightLeft}
      title="Refunds"
      subtitle={`${refunds.length} refund${refunds.length === 1 ? '' : 's'}`}
    >
      <ul className="space-y-2">
        {refunds.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-danger-100 bg-danger-50/40 p-3"
          >
            <p className="truncate font-mono text-[11px] text-ink-600">{r.stripeRefundId}</p>
            <span className="font-mono text-[12.5px] font-semibold tabular-nums text-danger-700">
              −{formatCents(r.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ShipToCard({
  order,
}: {
  order: {
    shipToType: string
    shipToContactName: string
    shipToContactPhone: string | null
    shipToAddressLine1: string
    shipToAddressLine2: string | null
    shipToCity: string
    shipToState: string | null
    shipToPostalCode: string
    shipToCountry: string
    shipToPartnerService: { partner: { companyName: string } } | null
  }
}) {
  const isWarehouse = order.shipToType === 'WAREHOUSE_PARTNER'
  return (
    <Card
      icon={Truck}
      title="Ship to"
      subtitle={
        isWarehouse
          ? `Warehouse partner · ${order.shipToPartnerService?.partner.companyName ?? 'unknown'}`
          : "Creator's own address"
      }
    >
      <dl className="divide-y divide-ink-100">
        <Row label="Recipient">{order.shipToContactName || '—'}</Row>
        <Row label="Phone">{order.shipToContactPhone || '—'}</Row>
        <Row label="Address">
          <span className="text-right">
            {order.shipToAddressLine1}
            {order.shipToAddressLine2 && (
              <>
                <br />
                {order.shipToAddressLine2}
              </>
            )}
            <br />
            {[order.shipToCity, order.shipToState, order.shipToPostalCode]
              .filter(Boolean)
              .join(', ')}
            <br />
            <span className="text-[12px] uppercase tracking-wider text-ink-700">
              {order.shipToCountry}
            </span>
          </span>
        </Row>
      </dl>
    </Card>
  )
}

function NotesCard({ notes }: { notes: string }) {
  return (
    <Card icon={StickyNote} title="Internal notes" subtitle="Admin-only">
      <p className="whitespace-pre-wrap rounded-lg border border-warning-100 bg-warning-50/60 p-3 text-[12.5px] text-ink-800">
        {notes}
      </p>
    </Card>
  )
}

// =============================================================================
// L1.2b — LOGISTICS CARDS (docs/LOGISTICS_AND_FULFILLMENT.md §5 + §9 + L8)
// =============================================================================

/** FcAwardLog.scoreJson, parsed defensively (shape owned by buildAwardLogPayload;
 *  override rows add {override, reason, adminId}). Legacy/foreign JSON → null. */
interface AwardScore {
  algorithm: string | null
  winner: string | null
  override: boolean
  reason: string | null
  candidates: Array<{
    partnerServiceId: string
    eligible: boolean
    exclusionReason: string | null
    distanceMiles: number | null
  }>
}

function parseAwardScore(json: unknown): AwardScore | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  if (!Array.isArray(o.candidates)) return null
  const candidates: AwardScore['candidates'] = []
  for (const raw of o.candidates) {
    if (typeof raw !== 'object' || raw === null) continue
    const c = raw as Record<string, unknown>
    if (typeof c.partnerServiceId !== 'string') continue
    candidates.push({
      partnerServiceId: c.partnerServiceId,
      eligible: c.eligible === true,
      exclusionReason: typeof c.exclusionReason === 'string' ? c.exclusionReason : null,
      distanceMiles: typeof c.distanceMiles === 'number' ? c.distanceMiles : null,
    })
  }
  return {
    algorithm: typeof o.algorithm === 'string' ? o.algorithm : null,
    winner: typeof o.winner === 'string' ? o.winner : null,
    override: o.override === true,
    reason: typeof o.reason === 'string' ? o.reason : null,
    candidates,
  }
}

function FulfillmentRoutingCard({
  orderId,
  currentPartnerServiceId,
  currentPartnerName,
  currentCity,
  currentState,
  awardLog,
  ranking,
  goodsMoving,
}: {
  orderId: string
  currentPartnerServiceId: string | null
  currentPartnerName: string | null
  currentCity: string
  currentState: string | null
  awardLog: { id: string; partnerServiceId: string; scoreJson: unknown; awardedAt: Date } | null
  ranking: FcRankingContext
  goodsMoving: boolean
}) {
  const score = awardLog ? parseAwardScore(awardLog.scoreJson) : null
  // FC display names: live ranked candidates first; fall back to the id for
  // nodes that have since been deactivated (award-log history outlives them).
  const nameById = new Map<string, string>()
  for (const r of ranking.ranked) {
    const where = [r.candidate.city, r.candidate.state].filter(Boolean).join(', ')
    nameById.set(
      r.candidate.partnerServiceId,
      where ? `${r.candidate.partnerName} — ${where}` : r.candidate.partnerName,
    )
  }
  if (currentPartnerServiceId && currentPartnerName && !nameById.has(currentPartnerServiceId)) {
    nameById.set(currentPartnerServiceId, currentPartnerName)
  }
  const fcName = (id: string) => nameById.get(id) ?? `${id.slice(0, 10)}…`

  const options: FcOverrideOption[] = ranking.ranked.map((r) => ({
    partnerServiceId: r.candidate.partnerServiceId,
    label: fcName(r.candidate.partnerServiceId),
    eligible: r.eligible,
    exclusionReason: r.exclusionReason,
    distanceMiles: r.distanceMiles,
  }))

  return (
    <Card
      icon={Route}
      title="Fulfillment routing"
      subtitle={
        currentPartnerName
          ? `Current FC · ${currentPartnerName}`
          : 'No fulfillment center assigned'
      }
    >
      <dl className="divide-y divide-ink-100">
        <Row label="Fulfillment center">
          <span className="font-medium">{currentPartnerName ?? '—'}</span>
        </Row>
        <Row label="Location">
          {[currentCity, currentState].filter(Boolean).join(', ') || '—'}
        </Row>
        <Row label="Eligibility basis">
          <span className="text-[11px] uppercase tracking-wider text-ink-700">
            {ranking.input.storageClass} · hazmat {ranking.input.hazmatClass}
            {!ranking.hasTemplate && ' · defaults (no template binding)'}
          </span>
        </Row>
      </dl>

      {/* Decision rationale — the latest FcAwardLog rendered candidate-by-candidate. */}
      <div className="mt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
          <FileText className="h-3 w-3" aria-hidden="true" />
          Decision rationale
        </p>
        {awardLog && score ? (
          <div className="mt-2">
            <p className="text-[11.5px] text-ink-600">
              {score.override ? 'Admin override' : (score.algorithm ?? 'Awarded').replace(/_/g, ' ').toLowerCase()}
              {' · '}
              {new Date(awardLog.awardedAt).toLocaleString()}
              {score.winner && (
                <>
                  {' · winner: '}
                  <span className="font-medium text-ink-900">{fcName(score.winner)}</span>
                </>
              )}
            </p>
            {score.reason && (
              <p className="mt-1 rounded-lg border border-warning-100 bg-warning-50/60 px-2.5 py-1.5 text-[12px] text-ink-800">
                Reason: {score.reason}
              </p>
            )}
            {score.candidates.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-ink-100">
                <table className="w-full text-[12px]">
                  <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Candidate</th>
                      <th className="px-3 py-2 text-left font-semibold">Eligible</th>
                      <th className="px-3 py-2 text-right font-semibold">Distance</th>
                      <th className="px-3 py-2 text-left font-semibold">Exclusion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {score.candidates.map((c) => (
                      <tr key={c.partnerServiceId} className={c.partnerServiceId === score.winner ? 'bg-pink-50/40' : undefined}>
                        <td className="px-3 py-2 font-medium text-ink-900">
                          {fcName(c.partnerServiceId)}
                          {c.partnerServiceId === score.winner && (
                            <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-pink-700">winner</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {c.eligible ? (
                            <span className="text-success-700">Yes</span>
                          ) : (
                            <span className="text-danger-700">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                          {c.distanceMiles !== null ? `${c.distanceMiles.toLocaleString()} mi` : '—'}
                        </td>
                        <td className="px-3 py-2 text-ink-600">{c.exclusionReason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-3 text-[12.5px] text-ink-500">
            No award log for this order — the fulfillment center was selected before award
            logging existed, or was a legacy fallback pick.
          </p>
        )}
      </div>

      {/* L8 — admin hard-pin. Live eligibility annotated per node; the server
          action re-validates and blocks once goods are moving. */}
      <div className="mt-4 border-t border-ink-100 pt-3">
        {options.length === 0 ? (
          <Empty label="No ACTIVE warehouse partners to pin." />
        ) : (
          <FcOverrideControls
            orderId={orderId}
            currentPartnerServiceId={currentPartnerServiceId}
            goodsMoving={goodsMoving}
            options={options}
          />
        )}
      </div>
    </Card>
  )
}

const STORAGE_TONE: Record<string, { bg: string; dot: string; label: string }> = {
  ACTIVE: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Active' },
  RELEASING: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Releasing' },
  CLOSED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Closed' },
}

const RELEASE_TONE: Record<string, { bg: string; label: string }> = {
  REQUESTED: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Requested' },
  PICKING: { bg: 'bg-pink-50 text-pink-700 border-pink-200', label: 'Picking' },
  SHIPPED: { bg: 'bg-info-50 text-info-800 border-info-200', label: 'Shipped' },
  DELIVERED: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Delivered' },
  CANCELLED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', label: 'Cancelled' },
}

/** StorageAgreement.feeSnapshotJson → StorageFeeSnapshot, defensively. The
 *  snapshot was frozen at agreement time (legal reproducibility); missing or
 *  malformed JSON renders an "accrual unavailable" note instead of throwing. */
function parseFeeSnapshot(json: unknown): StorageFeeSnapshot | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const rateCents = num(o.rateCents)
  if (rateCents === null) return null
  return {
    billingUnit: o.billingUnit === 'CUFT_MONTH' ? 'CUFT_MONTH' : 'PALLET_MONTH',
    rateCents,
    graceDays: num(o.graceDays) ?? 0,
    minMonthlyCents: num(o.minMonthlyCents) ?? 0,
    pickFeeCents: num(o.pickFeeCents) ?? 0,
    packFeeCents: num(o.packFeeCents) ?? 0,
    referralFeeBps: num(o.referralFeeBps) ?? 0,
  }
}

function StorageAgreementCard({
  orderId,
  agreements,
}: {
  orderId: string
  agreements: Array<{
    id: string
    mode: string
    status: string
    unitsRemaining: number
    palletsRemaining: number | null
    startedAt: Date
    endedAt: Date | null
    feeSnapshotJson: unknown
    partnerService: { partner: { companyName: string } }
    releases: Array<{
      id: string
      destinationType: string
      quantity: number
      status: string
      createdAt: Date
    }>
  }>
}) {
  return (
    <Card
      icon={Warehouse}
      title="Storage agreement"
      subtitle={
        agreements.length === 0
          ? 'Hold at manufacturer'
          : `Hold at manufacturer · ${agreements[0]?.partnerService.partner.companyName ?? ''}`
      }
    >
      {agreements.length === 0 ? (
        <Empty label="No storage agreement recorded for this hold-at-manufacturer order." />
      ) : (
        <div className="space-y-4">
          {agreements.map((a) => {
            const tone =
              STORAGE_TONE[a.status] ?? {
                bg: 'bg-ink-100 text-ink-700 border-ink-200',
                dot: 'bg-ink-400',
                label: a.status,
              }
            const snapshot = parseFeeSnapshot(a.feeSnapshotJson)
            // Billable units: pallets on hand when tracked; the V1 floor is one
            // billing unit (per-unit granularity lands with the release flow —
            // minMonthly dominates small holds anyway).
            const billableUnits = a.palletsRemaining ?? 1
            // Picks (ON_DEMAND) accrue pick+pack fees once the parcel leaves.
            const pickCount =
              a.mode === 'ON_DEMAND'
                ? a.releases.filter((r) => r.status === 'SHIPPED' || r.status === 'DELIVERED').length
                : 0
            const accrual = snapshot
              ? computeStorageAccrual({
                  snapshot,
                  startedAt: a.startedAt,
                  asOf: a.endedAt ?? new Date(),
                  billableUnits,
                  pickCount,
                })
              : null
            return (
              <div key={a.id} className="rounded-xl border border-ink-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-display text-[15px] font-semibold text-ink-900">
                    {a.partnerService.partner.companyName}
                  </p>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                      tone.bg,
                    )}
                  >
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {tone.label}
                  </span>
                </div>

                <dl className="mt-2 divide-y divide-ink-100">
                  <Row label="Mode">
                    {a.mode === 'ON_DEMAND' ? 'On-demand pick/pack' : 'Stock release'}
                  </Row>
                  <Row label="Units remaining">
                    <span className="tabular-nums">{a.unitsRemaining.toLocaleString()}</span>
                  </Row>
                  {a.palletsRemaining !== null && (
                    <Row label="Pallets remaining">
                      <span className="tabular-nums">{a.palletsRemaining.toLocaleString()}</span>
                    </Row>
                  )}
                  <Row label="Started">{new Date(a.startedAt).toLocaleDateString()}</Row>
                  {accrual && (
                    <Row label="Grace ends">
                      {accrual.graceEndsOn.toLocaleDateString()}
                    </Row>
                  )}
                  {a.endedAt && <Row label="Ended">{new Date(a.endedAt).toLocaleDateString()}</Row>}
                </dl>

                {/* Accrued charges — pure math off the frozen fee snapshot. */}
                <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
                    Accrued charges
                  </p>
                  {accrual ? (
                    <>
                      <dl className="mt-1 divide-y divide-ink-100">
                        <Row label="Months accrued">
                          <span className="tabular-nums">{accrual.monthsAccrued}</span>
                        </Row>
                        <Row label="Storage">
                          <span className="tabular-nums">{formatCents(accrual.storageCents)}</span>
                        </Row>
                        {accrual.pickPackCents > 0 && (
                          <Row label={`Pick/pack (${pickCount})`}>
                            <span className="tabular-nums">{formatCents(accrual.pickPackCents)}</span>
                          </Row>
                        )}
                        <Row label="Total">
                          <span className="font-semibold tabular-nums">{formatCents(accrual.totalCents)}</span>
                        </Row>
                        <Row label="Platform fee">
                          <span className="tabular-nums text-success-700">
                            {formatCents(accrual.platformFeeCents)}
                          </span>
                        </Row>
                      </dl>
                      <p className="mt-1.5 text-[11px] italic text-ink-500">
                        estimated — billing execution pending payments verification
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[12px] text-ink-500">
                      Fee snapshot missing or unreadable — accrual unavailable.
                    </p>
                  )}
                </div>

                {/* Release history */}
                <div className="mt-3">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
                    Releases
                  </p>
                  {a.releases.length === 0 ? (
                    <p className="mt-1 text-[12px] text-ink-500">No releases yet.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {a.releases.map((r) => {
                        const rTone =
                          RELEASE_TONE[r.status] ?? {
                            bg: 'bg-ink-100 text-ink-700 border-ink-200',
                            label: r.status,
                          }
                        return (
                          <li
                            key={r.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-[12.5px] font-medium text-ink-900">
                                {r.quantity.toLocaleString()} units ·{' '}
                                <span className="text-[11.5px] font-normal text-ink-600">
                                  {r.destinationType.replace(/_/g, ' ').toLowerCase()}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[10.5px] tabular-nums text-ink-500">
                                {new Date(r.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                                rTone.bg,
                              )}
                            >
                              {rTone.label}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {a.status !== 'CLOSED' && (
                  <CloseStorageAgreementControls
                    orderId={orderId}
                    agreementId={a.id}
                    unitsRemaining={a.unitsRemaining}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// =============================================================================
// RIGHT RAIL CARDS
// =============================================================================

function QuickActionsCard({
  orderId,
  creatorEmail,
  brandHandle,
  stripeChargeId,
}: {
  orderId: string
  creatorEmail: string
  brandHandle: string
  stripeChargeId: string | null
}) {
  return (
    <Card icon={ExternalLink} title="Quick actions" compact>
      <div className="flex flex-col gap-2">
        {stripeChargeId && (
          <a
            href={`https://dashboard.stripe.com/payments/${stripeChargeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Stripe
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        <Link
          href={`/audit?entityType=Order&entityId=${orderId}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          View audit log
        </Link>
        <a
          href={`mailto:${creatorEmail}?subject=Order%20%23${orderId.slice(-8)}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Email creator
        </a>
        {brandHandle && (
          <Link
            href={`/brands?handle=${brandHandle}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            View brand
          </Link>
        )}
      </div>
    </Card>
  )
}

function TimelineCard({
  createdAt,
  paidAt,
  shippedAt,
  deliveredAt,
}: {
  createdAt: Date
  paidAt: Date | null
  shippedAt: Date | null
  deliveredAt: Date | null
}) {
  const events: Array<{ label: string; at: Date | null; tone: 'done' | 'pending' }> = [
    { label: 'Created', at: createdAt, tone: 'done' },
    { label: 'Paid', at: paidAt, tone: paidAt ? 'done' : 'pending' },
    { label: 'Shipped', at: shippedAt, tone: shippedAt ? 'done' : 'pending' },
    { label: 'Delivered', at: deliveredAt, tone: deliveredAt ? 'done' : 'pending' },
  ]
  return (
    <Card icon={Clock} title="Timeline" compact>
      <ol className="relative">
        {events.map((e, i) => (
          <li key={e.label} className="flex gap-3 pb-3 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-4',
                  e.tone === 'done'
                    ? 'bg-pink-500 ring-pink-100'
                    : 'bg-ink-200 ring-ink-50',
                )}
              />
              {i < events.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1 w-px flex-1',
                    e.tone === 'done' ? 'bg-pink-200' : 'bg-ink-200',
                  )}
                />
              )}
            </div>
            <div className="-mt-0.5 min-w-0 flex-1 pb-1">
              <p
                className={cn(
                  'text-[12px] font-semibold',
                  e.tone === 'done' ? 'text-ink-900' : 'text-ink-500',
                )}
              >
                {e.label}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[10.5px] tabular-nums',
                  e.tone === 'done' ? 'text-ink-600' : 'text-ink-400',
                )}
              >
                {e.at
                  ? e.at.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : '—'}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function MetaCard({
  orderId,
  brandHandle,
  creatorUserId,
  shipToType,
  manifestVersionMax,
}: {
  orderId: string
  brandHandle: string
  creatorUserId: string
  shipToType: string
  manifestVersionMax: number
}) {
  return (
    <Card icon={Hash} title="Meta" compact>
      <dl className="divide-y divide-ink-100">
        <Row label="Order ID">
          <span className="font-mono text-[10.5px] text-ink-700" title={orderId}>
            {orderId.slice(0, 10)}…
          </span>
        </Row>
        <Row label="Brand handle">
          <span className="font-mono text-[11px] text-pink-700">@{brandHandle}</span>
        </Row>
        <Row label="Creator user">
          <span className="font-mono text-[10.5px] text-ink-700" title={creatorUserId}>
            {creatorUserId.slice(0, 10)}…
          </span>
        </Row>
        <Row label="Ship-to">
          <span className="text-[11px] uppercase tracking-wider text-ink-700">
            {shipToType.replace(/_/g, ' ').toLowerCase()}
          </span>
        </Row>
        <Row label="Manifest version">
          <span className="font-mono text-[11px] tabular-nums text-ink-700">
            v{manifestVersionMax}
          </span>
        </Row>
      </dl>
    </Card>
  )
}

// =============================================================================
// Reusable bits
// =============================================================================

function Card({
  icon: Icon,
  title,
  subtitle,
  compact = false,
  children,
}: {
  icon: typeof ShoppingBag
  title: string
  subtitle?: string
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>
            )}
          </div>
        </div>
      </header>
      <div className={compact ? 'p-3' : 'p-4'}>{children}</div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="text-right text-[12.5px] text-ink-900">{children}</dd>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
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
          'mt-1 font-display text-[20px] font-semibold tabular-nums leading-none tracking-tight',
          numeralTone,
        )}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// =============================================================================
// Formatters
// =============================================================================

