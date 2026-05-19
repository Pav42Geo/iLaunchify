// Stripe Checkout Session creation — used by apps/creator when a creator
// places a production order (the creator pays iLaunchify for the batch).
// Per docs/PAYMENTS.md: separate charges + transfers pattern with platform
// application fee withheld; partner Transfers queued at dispatch ship time.
//
// NOTE 2026-05-19: this file's prior caller (apps/storefront consumer checkout)
// was removed. The fields below still apply (orderId, brand, creator, amount)
// but the semantics now refer to a B2B production order, not a consumer purchase.

import { stripe } from './client'

export async function createCheckoutSession(params: {
  orderId: string
  brandId: string
  creatorId: string
  brandName: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  lineItems: Array<{
    productName: string
    productImage?: string
    unitAmountCents: number
    quantity: number
  }>
  applicationFeeCents: number
}): Promise<{ sessionId: string; url: string | null }> {
  // Statement descriptor: 22 char max, must match what Stripe approved on platform settings.
  const statementSuffix = sanitizeDescriptor(params.brandName)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: params.lineItems.map((item) => ({
      price_data: {
        currency: 'usd',
        unit_amount: item.unitAmountCents,
        product_data: {
          name: item.productName,
          images: item.productImage ? [item.productImage] : undefined,
        },
      },
      quantity: item.quantity,
    })),
    payment_intent_data: {
      application_fee_amount: params.applicationFeeCents,
      statement_descriptor_suffix: statementSuffix,
      metadata: {
        ilaunchify_order_id: params.orderId,
        ilaunchify_brand_id: params.brandId,
        ilaunchify_creator_id: params.creatorId,
      },
    },
    automatic_tax: { enabled: true },
    metadata: {
      ilaunchify_order_id: params.orderId,
      ilaunchify_brand_id: params.brandId,
    },
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  })

  return { sessionId: session.id, url: session.url }
}

/** 22-char limit, ASCII-printable only, no special chars. */
function sanitizeDescriptor(input: string): string {
  return input
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 22)
}
