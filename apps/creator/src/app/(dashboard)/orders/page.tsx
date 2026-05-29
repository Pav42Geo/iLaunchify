// Phase H3 — creator-side orders list.
//
// Shows every production order the creator has placed across all their
// brands. Each row carries the aggregate approval status pill so creators
// can spot 'needs your attention' orders at a glance.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { AlertOctagon } from 'lucide-react'

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
  REFUNDED: 'Refunded',
  ON_HOLD: 'On hold',
  DISPUTED: 'Disputed',
}

const AGGREGATE_LABEL: Record<string, { label: string; tone: string }> = {
  AWAITING_PARTNERS: { label: 'Awaiting partner approval', tone: 'amber' },
  PARTIALLY_ACCEPTED: { label: 'Some partners accepted', tone: 'amber' },
  CHANGES_REQUESTED: { label: 'Needs your attention', tone: 'red' },
  FULLY_ACCEPTED: { label: 'All partners approved', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled', tone: 'zinc' },
}

export default async function OrdersListPage() {
  const user = await requireUser()
  const orders = await prisma.order.findMany({
    where: { creatorUserId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      brand: { select: { name: true } },
      items: {
        include: { product: { select: { name: true } } },
        take: 1,
      },
      dispatches: { select: { type: true, status: true } },
    },
    take: 50,
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Production orders across all your brands. Click an order to see per-
          partner timeline + take action when changes are requested.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-12 text-center">
          <p className="text-sm text-zinc-600">
            No orders yet. Open a product and click <strong>Order production</strong>{' '}
            to place your first batch.
          </p>
          <Link
            href="/products"
            className="mt-3 inline-block text-sm font-medium text-pink-600 underline"
          >
            Go to products →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const product = o.items[0]?.product
            const dispatches = o.dispatches
            const totalDispatches = dispatches.length
            const acceptedCount = dispatches.filter((d) =>
              [
                'ACCEPTED',
                'PRODUCING',
                'QUALITY_CHECK',
                'READY',
                'SHIPPED',
                'IN_TRANSIT',
                'DELIVERED',
              ].includes(d.status),
            ).length
            const aggregate: { label: string; tone: string } =
              AGGREGATE_LABEL[o.aggregateApprovalStatus ?? 'AWAITING_PARTNERS'] ??
              AGGREGATE_LABEL.AWAITING_PARTNERS!
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-900">
                      {product?.name ?? 'Untitled product'}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {o.brand.name} · Order #{o.id.slice(-8)} ·{' '}
                      {new Date(o.createdAt).toLocaleDateString()}
                    </div>
                    {totalDispatches > 0 && (
                      <div className="mt-1.5 text-xs text-zinc-600">
                        {acceptedCount}/{totalDispatches} partner{' '}
                        {totalDispatches === 1 ? 'gate' : 'gates'} accepted
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                      ${(o.totalCents / 100).toFixed(2)}
                    </span>
                    <AggregateChip tone={aggregate.tone} label={aggregate.label} />
                    <span className="text-[10.5px] text-zinc-400">
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                </div>
                {o.aggregateApprovalStatus === 'CHANGES_REQUESTED' && (
                  <div className="mt-3 flex items-center gap-1.5 rounded border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-[12px] text-red-800">
                    <AlertOctagon className="h-3.5 w-3.5" />
                    A partner needs you to adjust this order before they can accept.
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AggregateChip({ tone, label }: { tone: string; label: string }) {
  const classes: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    zinc: 'bg-zinc-100 text-zinc-700',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
        classes[tone] ?? classes.zinc
      }`}
    >
      {label}
    </span>
  )
}
