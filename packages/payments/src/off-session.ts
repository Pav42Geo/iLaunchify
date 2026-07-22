// C2.2 auto-billing: charge a creator's SAVED payment method off-session for a
// channel-origin production order (CHANNEL_MANAGEMENT_SPEC §3.5 + LOCKED
// decision #1). The consumer paid on the channel; iLaunchify bills PRODUCTION
// only, per consumer order, against the card saved via payment-methods.ts
// (Stripe-hosted setup, PCI SAQ-A).
//
// ─── WHY THE METADATA DELIBERATELY OMITS `ilaunchify_order_id` ───────────────
// webhook-handlers.ts `onPaymentSucceeded` keys on that field and then runs the
// FULL post-payment rail: Charge row + PAID flip + `createDispatches`, which
// builds the multi-partner dispatch graph. An on-demand channel order is
// SINGLE-DISPATCH BY LAW (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md §0),
// so the C2.2 router owns the whole post-charge flow synchronously: it records
// the Charge row, flips the order PAID, and creates the ONE manufacturer
// dispatch itself. Putting `ilaunchify_order_id` here would race the webhook
// into fanning the order out. Refund lookups are unaffected: `onChargeRefunded`
// falls back to the Charge row by stripeChargeId / stripePaymentIntentId, and
// the router writes that row before returning.
//
// ─── FEE ─────────────────────────────────────────────────────────────────────
// No `application_fee_amount` (see checkout.ts header: separate charges +
// transfers; the platform fee is what we never transfer out). The intended cut
// rides in metadata for dashboard reconciliation and lands on
// Charge.applicationFeeCents via the router.

import { stripe } from './client'
import { getOrCreateCreatorCustomer } from './subscriptions'

export interface OffSessionChargeInput {
  /** The production Order being funded (metadata only; see header). */
  orderId: string
  /** The ChannelOrder that triggered the charge (metadata + idempotency). */
  channelOrderId: string
  creator: { userId: string; email: string; name: string | null }
  /** The saved method to charge (PaymentMethodRef.stripePaymentMethodId). */
  stripePaymentMethodId: string
  amountCents: number
  /** The platform's intended cut, recorded for reconciliation (not sent as a fee). */
  platformFeeCents: number
  /** Statement-descriptor suffix source (22-char sanitized like checkout.ts). */
  brandName: string
}

export type OffSessionChargeResult =
  | { ok: true; paymentIntentId: string; stripeChargeId: string }
  | {
      ok: false
      /** AUTH_REQUIRED / DECLINED are card problems the creator must fix;
       *  STRIPE_ERROR covers config/network and may self-heal next cycle. */
      code: 'AUTH_REQUIRED' | 'DECLINED' | 'STRIPE_ERROR'
      message: string
    }

export async function chargeSavedMethodOffSession(input: OffSessionChargeInput): Promise<OffSessionChargeResult> {
  try {
    const customerId = await getOrCreateCreatorCustomer({
      userId: input.creator.userId,
      email: input.creator.email,
      name: input.creator.name,
    })

    const pi = await stripe.paymentIntents.create(
      {
        amount: Math.max(1, Math.round(input.amountCents)),
        currency: 'usd',
        customer: customerId,
        payment_method: input.stripePaymentMethodId,
        // The cardholder is NOT present: consumer orders arrive while the
        // creator sleeps. Stripe applies the saved mandate; issuers may still
        // demand SCA, which surfaces as AUTH_REQUIRED below and parks the order.
        off_session: true,
        confirm: true,
        statement_descriptor_suffix: sanitizeDescriptor(input.brandName),
        metadata: {
          // Deliberately NOT ilaunchify_order_id: see the file header.
          ilaunchify_kind: 'channel_auto_billing',
          ilaunchify_channel_order_id: input.channelOrderId,
          ilaunchify_channel_production_order_id: input.orderId,
          ilaunchify_creator_id: input.creator.userId,
          ilaunchify_platform_fee_cents: String(Math.round(input.platformFeeCents)),
        },
      },
      {
        // One charge per (channelOrder, productionOrder) pair, ever: a router
        // retry or a double-fired cron reuses the SAME PaymentIntent instead of
        // billing twice.
        idempotencyKey: `c22-${input.channelOrderId}-${input.orderId}`,
      },
    )

    if (pi.status === 'succeeded') {
      return {
        ok: true,
        paymentIntentId: pi.id,
        stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.id,
      }
    }
    if (pi.status === 'requires_action') {
      return {
        ok: false,
        code: 'AUTH_REQUIRED',
        message: 'The saved card requires authentication. Open Billing to re-save the card, then the order retries automatically.',
      }
    }
    return { ok: false, code: 'STRIPE_ERROR', message: `Charge did not complete (status ${pi.status}).` }
  } catch (err) {
    const e = err as { code?: string; type?: string; message?: string; decline_code?: string }
    if (e.code === 'authentication_required') {
      return {
        ok: false,
        code: 'AUTH_REQUIRED',
        message: 'The saved card requires authentication. Open Billing to re-save the card, then the order retries automatically.',
      }
    }
    if (e.type === 'StripeCardError') {
      return {
        ok: false,
        code: 'DECLINED',
        message: `The saved card was declined${e.decline_code ? ` (${e.decline_code})` : ''}. Update your payment method in Billing.`,
      }
    }
    return { ok: false, code: 'STRIPE_ERROR', message: e.message ?? 'Stripe charge failed.' }
  }
}

/** 22-char limit, ASCII-printable only (mirrors checkout.ts). */
function sanitizeDescriptor(input: string): string {
  return input
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 22)
}
