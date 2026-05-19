// /products/[productId]/publish — V1.1 placeholder.
//
// The old "publish to hosted storefront" flow was retired with the model
// correction (2026-05-19). The V1.1 version of this page will let creators
// push the finished SKU to their connected external channels (Shopify, Amazon,
// Etsy, WooCommerce, Walmart, TikTok). Until then this page is a friendly
// stub explaining the change.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Truck } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Publish — iLaunchify' }

export default async function PublishStubPage({
  params,
}: { params: Promise<{ productId: string }> }) {
  const user = await requireUser()
  const { productId } = await params

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: { brand: true },
  })
  if (!product) notFound()

  // Find the most recent production order for this product
  const latestOrder = await prisma.order.findFirst({
    where: {
      creatorUserId: user.id,
      items: { some: { productId: product.id } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const isDelivered = latestOrder?.status === 'DELIVERED'

  return (
    <div className="space-y-6">
      <Link
        href={`/products/${productId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to product
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Push to your channels — coming in V1.1</CardTitle>
          <CardDescription>
            iLaunchify is a B2B production platform — we don't host consumer storefronts.
            Once your production order is delivered, you'll sell on your own external
            channels (Shopify, Amazon, Etsy, WooCommerce, Walmart, TikTok).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-1 font-medium">What this page will do in V1.1:</div>
            <ul className="list-inside list-disc space-y-1 text-zinc-600">
              <li>Connect each of your sales channels via OAuth (admin enables which channels)</li>
              <li>Push the finished SKU as a listing on each connected channel with one click</li>
              <li>Pull inventory levels back from channels so you know when to reorder</li>
            </ul>
          </div>

          <div className="rounded-md border border-zinc-200 p-3">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <Truck className="h-4 w-4" /> Current order status
            </div>
            {latestOrder ? (
              <p className="text-zinc-600">
                Order <span className="font-mono">#{latestOrder.id.slice(-8)}</span> ·{' '}
                <span className="font-medium">{latestOrder.status}</span>
                {isDelivered
                  ? '. Goods are at your warehouse — list them on your own channels for now.'
                  : ". We'll surface the push-to-channel options here once it lands DELIVERED."}
              </p>
            ) : (
              <p className="text-zinc-600">
                No production order placed yet.{' '}
                <Link href={`/products/${product.id}/order`} className="underline">
                  Place one
                </Link>{' '}
                first.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {latestOrder ? (
              <Button asChild>
                <Link href={`/orders/${latestOrder.id}`}>Track this order →</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/products/${product.id}/order`}>Place production order</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <a href="https://docs.shopify.com" target="_blank" rel="noopener noreferrer">
                Shopify docs <ExternalLink className="ml-1 inline h-3 w-3" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
