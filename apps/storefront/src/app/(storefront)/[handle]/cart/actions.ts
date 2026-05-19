'use server'

import { prisma } from '@ilaunchify/db'
import { computeApplicationFee, createCheckoutSession } from '@ilaunchify/payments'
import { getCurrentCart } from '@/lib/cart'
import { getBrandOrNotFound } from '@/lib/brand'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export async function startCheckout({ brandHandle }: { brandHandle: string }) {
  const brand = await getBrandOrNotFound(brandHandle)
  const cart = await getCurrentCart(brand.id)
  if (!cart || cart.items.length === 0) {
    return { ok: false as const, error: 'Cart is empty' }
  }

  // V1 = single-product per checkout. If cart has multiple line items,
  // we send each as a separate line item to Stripe but they all belong
  // to one Order with dispatches routed for the first product. Real
  // multi-product order splitting is V1.5+.
  // For now: support multiple line items as long as they're all from the
  // same brand (already enforced by single-brand-per-cart).

  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + item.priceAtAddCents * item.quantity,
    0,
  )
  const applicationFeeCents = computeApplicationFee({
    subtotalCents,
    rateBp: brand.creatorProfile.feeRateOverrideBp ?? undefined,
  })

  // Create Order in PENDING_PAYMENT
  const order = await prisma.order.create({
    data: {
      brandId: brand.id,
      consumerEmail: '',                   // captured on Stripe Checkout, filled by webhook
      status: 'PENDING_PAYMENT',
      subtotalCents,
      shippingCents: 0,
      taxCents: 0,
      totalCents: subtotalCents,
      items: {
        create: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.priceAtAddCents,
          totalCents: item.priceAtAddCents * item.quantity,
        })),
      },
    },
    include: { items: { include: { product: true } } },
  })

  try {
    const { url } = await createCheckoutSession({
      orderId: order.id,
      brandId: brand.id,
      creatorId: brand.creatorProfileId,
      brandName: brand.name,
      successUrl: `${APP_URL}/${brand.handle}/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/${brand.handle}/cart?cancelled=1`,
      lineItems: order.items.map((it) => ({
        productName: it.product.name,
        unitAmountCents: it.unitPriceCents,
        quantity: it.quantity,
      })),
      applicationFeeCents,
    })

    if (!url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    // Mark the cart as CHECKING_OUT so it's not modified mid-checkout
    await prisma.cart.update({
      where: { id: cart.id },
      data: { status: 'CHECKING_OUT' },
    })

    return { ok: true as const, url }
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', internalNotes: `Checkout failed: ${(err as Error).message}` },
    })
    return { ok: false as const, error: (err as Error).message }
  }
}
