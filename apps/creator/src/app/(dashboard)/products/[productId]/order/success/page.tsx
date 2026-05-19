// Landing page after Stripe Checkout success.
// At this point Stripe has redirected back with a session_id, but our
// payment_intent.succeeded webhook may not have fired yet. We show a friendly
// "we got your order" message and let the user click through to track it.

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Order placed — iLaunchify' }

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const user = await requireUser()
  const { productId } = await params
  await searchParams // we don't currently use session_id (webhook handles state), but accept it

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: { brand: true },
  })
  if (!product) notFound()

  // Find the most recent order for this product, this creator (likely the one
  // they just paid for, regardless of webhook timing)
  const latestOrder = await prisma.order.findFirst({
    where: {
      creatorUserId: user.id,
      items: { some: { productId: product.id } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-green-600" />
          <div>
            <CardTitle>Production order placed</CardTitle>
            <CardDescription>
              Stripe has confirmed your payment. We're routing to a manufacturer + print partner
              now. You'll get an email when each partner accepts.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            <span className="font-medium">{product.name}</span> for {product.brand.name}
            {latestOrder && (
              <>
                {' '}— order <span className="font-mono">#{latestOrder.id.slice(-8)}</span>
              </>
            )}
          </p>
          <p className="text-zinc-500">
            Production typically takes 4–6 weeks. We'll update you at each milestone. After
            delivery, you can push the finished SKU to your sales channels.
          </p>
          <div className="flex flex-wrap gap-2">
            {latestOrder && (
              <Button asChild>
                <Link href={`/orders/${latestOrder.id}`}>Track this order →</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/products/${product.id}`}>Back to product</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
