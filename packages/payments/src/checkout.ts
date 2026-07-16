// Stripe Checkout Session creation — used by apps/creator when a creator
// places a production order (the creator pays iLaunchify for the batch).
//
// ─── HOW THE PLATFORM FEE IS ACTUALLY TAKEN (read before touching this) ──────
// docs/PAYMENTS.md Decision 3 chose **separate charges + transfers**:
//   1. The creator pays the PLATFORM's own Stripe account. 100% lands here.
//   2. We hold it and transfer OUT to the manufacturer / printer / creator at
//      fulfillment milestones (packages/payments/transfer-execute.ts).
//   3. **The platform fee is simply what we never transfer out.**
//
// So there is NOTHING to tell Stripe about the fee, and until 2026-07-16 this
// call did anyway:
//
//     payment_intent_data: { application_fee_amount: params.applicationFeeCents }
//
// `application_fee_amount` is ONLY legal when the charge is made ON BEHALF OF a
// connected account (a Stripe-Account header, transfer_data, or on_behalf_of).
// This session is created on the platform account with none of those, so Stripe
// REJECTED EVERY CHARGE. createCheckoutSession threw, cart-actions.ts caught it,
// flipped the order PENDING_PAYMENT -> CANCELLED, and told the creator
// "Couldn't reach Stripe": so it read as an outage, not a bug. No test covered
// this file, which is why it survived.
//
// The fee is NOT lost by removing it: we record it ourselves on
// `Charge.applicationFeeCents` ("platform's cut, withheld at charge time"), and
// refund-plan.ts reads that. It is our bookkeeping, not Stripe's.
//
// DO NOT "fix" this by adding transfer_data.destination: that converts us to
// DESTINATION charges, which support exactly ONE destination, and our orders pay
// two-to-three parties. That is the documented reason destination charges were
// rejected (PAYMENTS.md Decision 3).
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
      // NO application_fee_amount. See the header: separate charges + transfers
      // means the fee is what we do not transfer out, and setting it here made
      // Stripe reject every charge. params.applicationFeeCents is still recorded
      // on Charge.applicationFeeCents by the caller.
      statement_descriptor_suffix: statementSuffix,
      metadata: {
        ilaunchify_order_id: params.orderId,
        ilaunchify_brand_id: params.brandId,
        ilaunchify_creator_id: params.creatorId,
        // Kept as metadata so the intended platform cut is visible in the Stripe
        // dashboard next to the charge, for reconciliation. Informational only:
        // Stripe does nothing with it.
        ilaunchify_platform_fee_cents: String(params.applicationFeeCents),
      },
    },
    // GATED OFF by default (2026-07-16). Two reasons:
    //   1. It hard-errors unless Stripe Tax is activated with an origin address,
    //      which reads exactly like the application_fee bug above.
    //   2. placeOrder records `taxCents: 0` (tax is G5, unbuilt). If Stripe added
    //      tax at checkout, the creator would pay MORE than order.totalCents —
    //      a fresh quote-vs-charge divergence, which is the bug class this whole
    //      money path was just cleaned up to eliminate.
    // Turn on with STRIPE_AUTOMATIC_TAX=true once tax is computed on our side too.
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
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
