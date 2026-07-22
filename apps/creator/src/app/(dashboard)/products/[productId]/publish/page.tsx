// /products/[productId]/publish — push the finished SKU to connected channels.
//
// V1 ships this page in stub mode: lists the channels admin has enabled,
// shows their OAuth-ready state, but the actual "Connect" + "Push" actions
// are V1.1+. Surface is live so creators see what's coming and what they'll
// be able to do once their production order is delivered.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { loadSellData } from './actions'
import { SellChannels } from './SellChannels'

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

  const [latestOrder, sellData] = await Promise.all([
    prisma.order.findFirst({
      where: {
        creatorUserId: user.id,
        items: { some: { productId: product.id } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    loadSellData(product.id),
  ])

  const isDelivered = latestOrder?.status === 'DELIVERED'

  return (
    <div className="space-y-6">
      <Link
        href={`/products/${productId}`}
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to product
      </Link>

      <div>
        <h1 className="font-display text-ui-title">Push to channels</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          List {product.name} on your external sales channels. iLaunchify pushes the listing —
          consumer purchases happen on the channel.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Truck className="h-8 w-8 shrink-0 text-ink-400" />
          <div>
            <CardTitle className="text-base">Production order status</CardTitle>
            <CardDescription>
              {latestOrder ? (
                <>
                  Order <span className="font-mono">#{latestOrder.id.slice(-8)}</span> ·{' '}
                  <span className="font-medium">{latestOrder.status}</span>
                  {isDelivered
                    ? '. Goods delivered — from-stock listings can go live.'
                    : '. From-stock listings go live at DELIVERED; on-demand listings can push right away.'}
                </>
              ) : (
                <>
                  No production order placed yet. Open the Design Studio
                  and use its <em>Next</em> button to start checkout.{' '}
                  <Link
                    href={`/products/${product.id}/design/canvas`}
                    className="underline"
                  >
                    Open Studio
                  </Link>{' '}
                  to begin.
                </>
              )}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {/* Sell section (CHANNEL_MANAGEMENT_SPEC §3.4, C0): mode + price + push per
          CONNECTED channel. Mode rules (on-demand enablement, bulk go-live gate)
          are enforced at order time (C2); the cards explain them inline. */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-700">Sell on your channels</h2>
        <SellChannels
          productId={product.id}
          initial={
            sellData ?? {
              productName: product.name,
              unitCostCents: product.priceCents,
              flavors: [],
              channels: [],
              onDemand: {
                status: 'NONE',
                hasManufacturer: false,
                partnerNote: null,
                // Fallback state fails closed: no pinned manufacturer resolved.
                eligible: false,
                blockers: ['This product has no pinned manufacturer yet.'],
              },
              stock: { onHand: 0, reserved: 0, available: 0 },
            }
          }
        />
      </div>
    </div>
  )
}
