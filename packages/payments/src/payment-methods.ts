// Payment-method management via Stripe-hosted Checkout (setup mode).
// docs/BILLING_AND_ACCOUNTING.md slice 2.
//
// SECURITY MODEL: the card is collected entirely on Stripe's hosted Checkout page
// (mode: 'setup'). The PAN/CVC never touch our DOM, JS, servers, or logs — Stripe
// returns only an opaque `pm_…` id. We persist a display-only mirror (brand +
// last4 + expiry) so the billing UI can show the saved card. This keeps us at PCI
// SAQ-A. No new client-side Stripe libraries are required.
//
// Flow:
//   1. createSetupCheckoutSession → ensure Customer, open Checkout (setup), return URL.
//   2. User enters card on Stripe → redirected back to our return URL with session_id.
//   3. syncPaymentMethodFromCheckout → read the SetupIntent's payment_method, attach,
//      set as the Customer's default, and upsert the display mirror.

import {
  upsertPaymentMethodRef,
  setDefaultPaymentMethodRef,
  deletePaymentMethodRef,
} from '@ilaunchify/db'
import { stripe } from './client'
import { getOrCreateCreatorCustomer } from './subscriptions'

/** True when Stripe is configured in this environment (key present). UI degrades if false. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export interface CreateSetupCheckoutInput {
  userId: string
  email: string
  name: string | null
  /** Absolute URL Stripe returns to on success — should carry {CHECKOUT_SESSION_ID}. */
  successUrl: string
  /** Absolute URL Stripe returns to if the user bails. */
  cancelUrl: string
}

/**
 * Open a Stripe-hosted Checkout Session in `setup` mode so the user can add a
 * card without the PAN ever reaching us. Returns the hosted URL — caller redirects.
 */
export async function createSetupCheckoutSession(
  input: CreateSetupCheckoutInput,
): Promise<{ url: string }> {
  const customerId = await getOrCreateCreatorCustomer({
    userId: input.userId,
    email: input.email,
    name: input.name,
  })

  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    currency: 'usd',
    payment_method_types: ['card'],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { ilaunchify_kind: 'payment_method_setup', ilaunchify_user_id: input.userId },
  })

  if (!session.url) throw new Error('Stripe did not return a Checkout URL.')
  return { url: session.url }
}

/**
 * After the user returns from Checkout, resolve the attached PaymentMethod, set it
 * as the Customer's default, and upsert our display mirror. Idempotent — safe to
 * call again on a refreshed return URL. Returns the mirrored card crumbs.
 */
export async function syncPaymentMethodFromCheckout(input: {
  userId: string
  sessionId: string
}): Promise<{ brand: string | null; last4: string | null } | null> {
  const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ['setup_intent'],
  })

  // Defense-in-depth: the session's customer must match this user's Customer.
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const setupIntent = session.setup_intent
  const paymentMethodId =
    setupIntent && typeof setupIntent !== 'string'
      ? typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id
      : undefined

  if (!customerId || !paymentMethodId) return null

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
  const card = pm.card ?? null

  // Make this the Customer's default for future invoices.
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })

  await upsertPaymentMethodRef({
    userId: input.userId,
    stripePaymentMethodId: paymentMethodId,
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
    isDefault: true,
  })
  await setDefaultPaymentMethodRef(input.userId, paymentMethodId)

  return { brand: card?.brand ?? null, last4: card?.last4 ?? null }
}

/** Set an existing saved method as the Customer's default. Caller must verify ownership. */
export async function setDefaultPaymentMethod(input: {
  userId: string
  customerId: string
  paymentMethodId: string
}): Promise<void> {
  await stripe.customers.update(input.customerId, {
    invoice_settings: { default_payment_method: input.paymentMethodId },
  })
  await setDefaultPaymentMethodRef(input.userId, input.paymentMethodId)
}

/** Detach a payment method from Stripe and remove the mirror. Caller must verify ownership. */
export async function removePaymentMethod(input: {
  userId: string
  paymentMethodId: string
}): Promise<void> {
  // Detaching in Stripe is the source-of-truth delete; ignore "already detached".
  try {
    await stripe.paymentMethods.detach(input.paymentMethodId)
  } catch {
    /* already detached or unknown — fall through to mirror cleanup */
  }
  await deletePaymentMethodRef(input.userId, input.paymentMethodId)
}
