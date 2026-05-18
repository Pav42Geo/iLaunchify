// POST /api/checkout — consumer-facing entry point to Stripe Checkout.
//
// Creates a draft Order in iLaunchify, then a Stripe Checkout Session with
// the order id embedded in metadata. The webhook handler picks it up on
// payment_intent.succeeded and advances the order to PAID + routes dispatches.
//
// Body: { brandHandle, productSlug, quantity, consumerEmail?, returnPath }
//
// V1: single line item per session. V1.5+: full multi-item cart.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { computeApplicationFee, createCheckoutSession } from '@ilaunchify/payments'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Body = z.object({
  brandHandle: z.string(),
  productSlug: z.string(),
  quantity: z.number().int().positive().max(99),
  consumerEmail: z.string().email().optional(),
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}))
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { brandHandle, productSlug, quantity, consumerEmail } = parsed.data

  const brand = await prisma.brand.findUnique({
    where: { handle: brandHandle },
    include: { creatorProfile: true },
  })
  if (!brand || !brand.isActive) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const product = await prisma.product.findFirst({
    where: { brandId: brand.id, slug: productSlug, status: 'PUBLISHED' },
  })
  if (!product) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 })
  }

  if (product.inventoryAvailable != null && product.inventoryAvailable < quantity) {
    return NextResponse.json({ error: 'Insufficient inventory' }, { status: 409 })
  }

  const subtotalCents = product.priceCents * quantity
  const applicationFeeCents = computeApplicationFee({
    subtotalCents,
    rateBp: brand.creatorProfile.feeRateOverrideBp ?? undefined,
  })

  // Create the Order in PENDING_PAYMENT — webhook flips to PAID
  const order = await prisma.order.create({
    data: {
      brandId: brand.id,
      consumerEmail: consumerEmail ?? '',
      status: 'PENDING_PAYMENT',
      subtotalCents,
      shippingCents: 0,
      taxCents: 0,                    // Stripe Tax updates after session
      totalCents: subtotalCents,      // updated post-payment from PI
      items: {
        create: {
          productId: product.id,
          quantity,
          unitPriceCents: product.priceCents,
          totalCents: subtotalCents,
        },
      },
    },
  })

  try {
    const { url } = await createCheckoutSession({
      orderId: order.id,
      brandId: brand.id,
      creatorId: brand.creatorProfileId,
      brandName: brand.name,
      successUrl: `${APP_URL}/${brandHandle}/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/${brandHandle}/${productSlug}?cancelled=1`,
      customerEmail: consumerEmail,
      lineItems: [
        {
          productName: product.name,
          unitAmountCents: product.priceCents,
          quantity,
        },
      ],
      applicationFeeCents,
    })

    return NextResponse.json({ url, orderId: order.id })
  } catch (err) {
    // If Checkout creation fails, mark the order CANCELLED to avoid orphans
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', internalNotes: `Checkout session failed: ${(err as Error).message}` },
    })
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
