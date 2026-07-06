// Rate your partners + review your product (docs/FEEDBACK_MODULE.md §5/§6).
// One page, one ask: a card per DELIVERED dispatch (role-scoped star rows,
// Amazon-modal style) + the product review step. Reachable from the
// delivery+3d email CTA and the delivered-order nudge; editable 30 days.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { RATING_DIMENSIONS, ratedRoleForDispatchType, type DimensionScores } from '@ilaunchify/orders'
import { RateOrderClient } from './RateOrderClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rate your partners' }

const ROLE_LABEL: Record<string, string> = {
  MANUFACTURER: 'Manufacturer',
  PRINTER: 'Print provider',
  COPACKER: 'Co-packer',
  WAREHOUSE: 'Fulfillment center',
}

export default async function RateOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const user = await requireUser()
  const { orderId } = await params

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      items: { include: { product: { select: { id: true, name: true } } }, take: 1 },
      dispatches: {
        where: { status: 'DELIVERED' },
        include: {
          partnerService: {
            include: { partner: { select: { companyName: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order) notFound()

  const product = order.items[0]?.product
  const [existingRatings, existingReview] = await Promise.all([
    prisma.partnerRating.findMany({
      where: { creatorUserId: user.id, orderId: order.id },
    }),
    product
      ? prisma.productReview.findUnique({
          where: { creatorUserId_productId: { creatorUserId: user.id, productId: product.id } },
        })
      : null,
  ])
  const ratingByDispatch = new Map(existingRatings.map((r) => [r.dispatchId, r]))

  const cards = order.dispatches.map((d) => {
    const role = ratedRoleForDispatchType(d.type)
    const existing = ratingByDispatch.get(d.id)
    return {
      dispatchId: d.id,
      partnerName: d.partnerService.partner.companyName,
      role,
      roleLabel: ROLE_LABEL[role] ?? role,
      dimensions: RATING_DIMENSIONS[role].map((dim) => ({ ...dim })),
      existing: existing
        ? {
            dimensions: existing.dimensions as DimensionScores,
            comment: existing.comment,
            editable: existing.editableUntil.getTime() > Date.now(),
          }
        : null,
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/orders/${order.id}`}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to order
      </Link>

      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Order #{order.id.slice(-8)}
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          How did your partners do{product ? ` on ${product.name}` : ''}?
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your ratings decide which partners win more work — and they're the quality signal every
          other creator relies on. Takes under a minute; you can edit for 30 days.
        </p>
      </div>

      {cards.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/40 p-8 text-center text-sm text-ink-500">
          Nothing to rate yet — partners become ratable as their part of the order is delivered.
        </section>
      ) : (
        <RateOrderClient
          orderId={order.id}
          cards={cards}
          review={
            product
              ? {
                  productId: product.id,
                  productName: product.name,
                  existing: existingReview
                    ? {
                        rating: existingReview.rating,
                        title: existingReview.title,
                        body: existingReview.body,
                        photoCount: existingReview.photoAssetIds.length,
                        editable: existingReview.editableUntil.getTime() > Date.now(),
                      }
                    : null,
                }
              : null
          }
        />
      )}
    </div>
  )
}
