// /products/[productId]/publish — push the finished SKU to connected channels.
//
// V1 ships this page in stub mode: lists the channels admin has enabled,
// shows their OAuth-ready state, but the actual "Connect" + "Push" actions
// are V1.1+. Surface is live so creators see what's coming and what they'll
// be able to do once their production order is delivered.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { ArrowLeft, Truck, Plug, ExternalLink, CheckCircle2 } from 'lucide-react'

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

  const [latestOrder, channels, existingLinks] = await Promise.all([
    prisma.order.findFirst({
      where: {
        creatorUserId: user.id,
        items: { some: { productId: product.id } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.channel.findMany({
      where: { enabled: true },
      orderBy: { displayName: 'asc' },
    }),
    prisma.channelProductLink.findMany({
      where: { productId: product.id },
      include: { channel: true },
    }),
  ])

  const linkedChannelIds = new Set(existingLinks.map((l) => l.channelId))
  const isDelivered = latestOrder?.status === 'DELIVERED'

  return (
    <div className="space-y-6">
      <Link
        href={`/products/${productId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to product
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Push to channels</h1>
        <p className="mt-1 text-sm text-zinc-500">
          List {product.name} on your external sales channels. iLaunchify pushes the listing —
          consumer purchases happen on the channel.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Truck className="h-8 w-8 shrink-0 text-zinc-400" />
          <div>
            <CardTitle className="text-base">Production order status</CardTitle>
            <CardDescription>
              {latestOrder ? (
                <>
                  Order <span className="font-mono">#{latestOrder.id.slice(-8)}</span> ·{' '}
                  <span className="font-medium">{latestOrder.status}</span>
                  {isDelivered
                    ? '. Goods at your warehouse — ready to list.'
                    : '. Push-to-channel unlocks at DELIVERED.'}
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

      {channels.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No channels available</CardTitle>
            <CardDescription>
              Admin hasn't enabled any channels yet. Check back later.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Available channels
          </h2>
          {channels.map((c) => {
            const isLinked = linkedChannelIds.has(c.id)
            const canConnect = c.oauthConfigured
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <Plug className="h-5 w-5 shrink-0 text-zinc-400" />
                    <div>
                      <CardTitle className="text-base">{c.displayName}</CardTitle>
                      <CardDescription>
                        {isLinked
                          ? 'Listed'
                          : canConnect
                          ? 'Ready to connect'
                          : 'OAuth credentials not configured yet'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLinked && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" aria-label="Listed" />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title={
                        !isDelivered
                          ? 'Available once your production order is delivered'
                          : !canConnect
                          ? 'Admin needs to configure OAuth credentials for this channel'
                          : 'V1.1 — OAuth flow lands soon'
                      }
                    >
                      {isLinked ? 'Update listing' : 'Connect'}{' '}
                      <ExternalLink className="ml-1 inline h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
          <p className="text-xs text-zinc-500">
            All connect / push actions become live in V1.1 once each channel's OAuth credentials
            are wired up by admin. The listing model + admin enable/disable is live now so
            creators can plan their channel strategy.
          </p>
        </div>
      )}
    </div>
  )
}
