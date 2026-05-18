import { prisma } from '@ilaunchify/db'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  PAID: 'bg-blue-100 text-blue-900',
  ROUTING: 'bg-amber-100 text-amber-900',
  IN_FULFILLMENT: 'bg-blue-100 text-blue-900',
  READY_TO_SHIP: 'bg-purple-100 text-purple-900',
  SHIPPED: 'bg-indigo-100 text-indigo-900',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-900',
  DELIVERED: 'bg-green-100 text-green-900',
  COMPLETED: 'bg-green-100 text-green-900',
  CANCELLED: 'bg-zinc-100 text-zinc-700',
  REFUNDED: 'bg-zinc-100 text-zinc-700',
  ON_HOLD: 'bg-red-100 text-red-900',
  DISPUTED: 'bg-red-100 text-red-900',
}

export default async function AdminOrderDetail({ params }: { params: { orderId: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      brand: { include: { creatorProfile: { include: { user: true } } } },
      items: { include: { product: true } },
      dispatches: {
        include: {
          partnerService: { include: { partner: { include: { user: true } } } },
        },
      },
      charge: { include: { transfers: { include: { user: true } } } },
      refunds: true,
    },
  })
  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order #{order.id.slice(-8)}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {order.brand.name} · {order.consumerEmail || 'guest'} ·{' '}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-md px-3 py-1 text-sm font-medium ${STATUS_COLORS[order.status] ?? 'bg-zinc-100 text-zinc-900'}`}
        >
          {order.status}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between border-b border-zinc-100 pb-1">
                <span>
                  {i.product.name} × {i.quantity}
                </span>
                <span className="font-mono">${(i.totalCents / 100).toFixed(2)}</span>
              </li>
            ))}
            <li className="flex justify-between pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono">${(order.totalCents / 100).toFixed(2)}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {order.charge && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Charge</CardTitle>
            <CardDescription>{order.charge.stripeChargeId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Status" value={order.charge.status} />
            <Row label="Amount" value={`$${(order.charge.amountCents / 100).toFixed(2)}`} />
            <Row label="Application fee" value={`$${(order.charge.applicationFeeCents / 100).toFixed(2)}`} />
            <Row label="Statement descriptor" value={order.charge.statementDescriptor} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.dispatches.length === 0 ? (
            <p className="text-sm text-zinc-500">Not yet routed.</p>
          ) : (
            order.dispatches.map((d) => (
              <div key={d.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">
                    {d.type} → {d.partnerService.partner.companyName}
                  </span>
                  <span className="text-zinc-500">{d.status}</span>
                </div>
                <Row label="Service type" value={d.partnerService.type} />
                <Row label="Cost" value={`$${(d.costCents / 100).toFixed(2)}`} />
                <Row label="Accept deadline" value={new Date(d.acceptDeadlineAt).toLocaleString()} />
                {d.shippedAt && <Row label="Shipped" value={new Date(d.shippedAt).toLocaleString()} />}
                {d.declineReason && (
                  <Row label="Decline reason" value={`${d.declineReason}${d.declineNotes ? ` — ${d.declineNotes}` : ''}`} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {order.charge && order.charge.transfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.charge.transfers.map((t) => (
              <div key={t.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {t.destinationType} ({t.reason}) · {t.user.email}
                  </span>
                  <span className="font-mono">${(t.amountCents / 100).toFixed(2)}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  {t.status}
                  {t.executedAt && ` · executed ${new Date(t.executedAt).toLocaleString()}`}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.internalNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.internalNotes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[160px,1fr] items-baseline gap-2">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
