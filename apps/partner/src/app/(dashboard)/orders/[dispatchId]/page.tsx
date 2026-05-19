import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'
import { DispatchActions } from './DispatchActions'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  PENDING_ACCEPT: 'Waiting for you to accept',
  ACCEPTED: 'Accepted',
  PRODUCING: 'In production',
  READY: 'Ready to ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  DECLINED: 'Declined (rerouted)',
  TIMED_OUT: 'Auto-declined (timed out)',
  CANCELLED: 'Cancelled',
}

export default async function DispatchDetailPage({
  params,
}: {
  params: Promise<{ dispatchId: string }>
}) {
  const user = await requireUser()

  const dispatch = await prisma.orderDispatch.findFirst({
    where: {
      id: (await params).dispatchId,
      partnerService: { partner: { userId: user.id } },
    },
    include: {
      order: {
        include: {
          brand: true,
          items: { include: { product: { include: { recipe: true } } } },
        },
      },
      partnerService: true,
    },
  })
  if (!dispatch) notFound()

  const item = dispatch.order.items[0]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dispatch.type === 'PRODUCT' ? 'Production' : 'Label print'} dispatch
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Order #{dispatch.order.id.slice(-8)} · Brand: {dispatch.order.brand.name}
          </p>
        </div>
        <Link href="/orders" className="text-sm text-zinc-500 underline">
          ← All orders
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Name" value={item?.product.name} />
              <Row label="Category" value={item?.product.category} />
              <Row label="Quantity" value={String(item?.quantity)} />
              <Row
                label="Unit price"
                value={item ? `$${(item.unitPriceCents / 100).toFixed(2)}` : '—'}
              />
              <Row
                label="Your cost"
                value={`$${(dispatch.costCents / 100).toFixed(2)} (transferred on ship confirmation)`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Created" value={new Date(dispatch.createdAt).toLocaleString()} />
              <Row
                label="Accept deadline"
                value={
                  dispatch.status === 'PENDING_ACCEPT'
                    ? new Date(dispatch.acceptDeadlineAt).toLocaleString()
                    : '—'
                }
              />
              <Row
                label="Shipped"
                value={dispatch.shippedAt ? new Date(dispatch.shippedAt).toLocaleString() : '—'}
              />
              <Row
                label="Delivered"
                value={dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleString() : '—'}
              />
              <Row label="Status" value={STATUS_LABELS[dispatch.status] ?? dispatch.status} />
            </CardContent>
          </Card>

          {dispatch.type === 'LABEL' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Print spec</CardTitle>
                <CardDescription>
                  PDF/X-1a + your ICC profile delivered as part of the order packet. Download
                  available after acceptance.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>

        <div>
          <DispatchActions
            dispatchId={dispatch.id}
            status={dispatch.status}
            type={dispatch.type}
          />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
