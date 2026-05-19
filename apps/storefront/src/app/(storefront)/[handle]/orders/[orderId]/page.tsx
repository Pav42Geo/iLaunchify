import { prisma } from '@ilaunchify/db'
import { notFound } from 'next/navigation'
import { getBrandOrNotFound } from '@/lib/brand'
import { formatCents } from '@/lib/cart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { CheckCircle2, Clock, Truck, PackageCheck } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Order confirmation' }

const STAGE_LABELS = [
  { keys: ['PAID', 'ROUTING'], label: 'Order received', icon: CheckCircle2 },
  { keys: ['IN_FULFILLMENT', 'READY_TO_SHIP'], label: 'Preparing', icon: Clock },
  { keys: ['SHIPPED', 'IN_TRANSIT'], label: 'Shipped', icon: Truck },
  { keys: ['DELIVERED', 'COMPLETED'], label: 'Delivered', icon: PackageCheck },
]

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ handle: string; orderId: string }>
}) {
  const brand = await getBrandOrNotFound((await params).handle)
  const order = await prisma.order.findFirst({
    where: { id: (await params).orderId, brandId: brand.id },
    include: {
      items: { include: { product: true } },
      dispatches: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!order) notFound()

  const currentStageIndex = STAGE_LABELS.findIndex((s) => s.keys.includes(order.status as never))

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Thanks for your order</h1>
        <p className="mt-2 text-brand-secondary">
          Order #{order.id.slice(-8)} · We sent a confirmation to{' '}
          {order.consumerEmail || 'your email'}.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex justify-between gap-2">
            {STAGE_LABELS.map((stage, idx) => {
              const Icon = stage.icon
              const isComplete = currentStageIndex >= idx
              const isCurrent = currentStageIndex === idx
              return (
                <li key={stage.label} className="flex-1 text-center">
                  <div
                    className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${
                      isComplete
                        ? 'bg-green-100 text-green-700'
                        : isCurrent
                          ? 'bg-brand-accent/20 text-brand-text'
                          : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className={`mt-2 text-xs ${isComplete ? 'font-medium' : 'text-zinc-500'}`}>
                    {stage.label}
                  </p>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between border-b border-zinc-100 pb-2">
                <span>
                  {i.product.name} × {i.quantity}
                </span>
                <span className="font-mono">{formatCents(i.totalCents)}</span>
              </li>
            ))}
            <li className="flex justify-between pt-1">
              <span>Subtotal</span>
              <span className="font-mono">{formatCents(order.subtotalCents)}</span>
            </li>
            {order.shippingCents > 0 && (
              <li className="flex justify-between">
                <span>Shipping</span>
                <span className="font-mono">{formatCents(order.shippingCents)}</span>
              </li>
            )}
            {order.taxCents > 0 && (
              <li className="flex justify-between">
                <span>Tax</span>
                <span className="font-mono">{formatCents(order.taxCents)}</span>
              </li>
            )}
            <li className="flex justify-between border-t border-zinc-300 pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatCents(order.totalCents)}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {order.dispatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fulfillment</CardTitle>
            <CardDescription>
              We dual-dispatch your order — manufacturer + print provider work in parallel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.dispatches.map((d) => (
              <div key={d.id} className="rounded-brand border border-zinc-200 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {d.type === 'PRODUCT' ? 'Product' : 'Label'}
                  </span>
                  <span className="text-brand-secondary">{d.status}</span>
                </div>
                {d.trackingCarrier && d.trackingNumber && (
                  <div className="mt-1 text-xs text-brand-secondary">
                    {d.trackingCarrier} · {d.trackingNumber}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex justify-center">
        <Link href={`/${brand.handle}`} className="text-sm text-brand-primary underline">
          ← Continue shopping at {brand.name}
        </Link>
      </div>
    </div>
  )
}
