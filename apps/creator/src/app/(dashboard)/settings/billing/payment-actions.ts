'use server'

// Payment-method actions (docs/BILLING_AND_ACCOUNTING.md slice 2).
//
// The card itself is entered on Stripe-hosted Checkout (setup mode) — we never
// see or store a PAN. These actions only orchestrate Stripe + our display mirror,
// and every mutation is scoped to the signed-in user's own Customer.

import { requireUser } from '@ilaunchify/auth'
import { prisma, ownsPaymentMethodRef } from '@ilaunchify/db'
import {
  isStripeConfigured,
  createSetupCheckoutSession,
  setDefaultPaymentMethod,
  removePaymentMethod,
} from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

async function getOrigin(): Promise<string> {
  const { headers } = await import('next/headers')
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

/** Begin adding a card: open a Stripe-hosted setup Checkout, return its URL. */
export async function startAddPaymentMethod(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await requireUser()
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Payment processing is not configured in this environment yet.' }
  }
  if (!user.email) {
    return { ok: false, error: 'Your account is missing an email — contact support.' }
  }
  const origin = await getOrigin()
  try {
    const { url } = await createSetupCheckoutSession({
      userId: user.id,
      email: user.email,
      name: user.name ?? null,
      successUrl: `${origin}/settings/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/settings/billing?pm=cancelled`,
    })
    return { ok: true, url }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing] startAddPaymentMethod failed', (err as Error).message)
    return { ok: false, error: 'Could not start adding a card. Please try again.' }
  }
}

/** Make a saved card the default for future invoices. */
export async function makeDefaultPaymentMethod(
  paymentMethodId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if (!(await ownsPaymentMethodRef(user.id, paymentMethodId))) {
    return { ok: false, error: 'That payment method is not on your account.' }
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  })
  if (!dbUser?.stripeCustomerId) return { ok: false, error: 'No billing customer on file.' }
  try {
    await setDefaultPaymentMethod({
      userId: user.id,
      customerId: dbUser.stripeCustomerId,
      paymentMethodId,
    })
    await logAuditAs(user, {
      entityType: 'PaymentMethod',
      entityId: paymentMethodId,
      action: 'PAYMENT_METHOD_DEFAULT_SET',
    })
    revalidatePath('/settings/billing')
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing] makeDefaultPaymentMethod failed', (err as Error).message)
    return { ok: false, error: 'Could not update your default card. Please try again.' }
  }
}

/** Remove a saved card (detaches in Stripe + clears the mirror). */
export async function removePaymentMethodAction(
  paymentMethodId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if (!(await ownsPaymentMethodRef(user.id, paymentMethodId))) {
    return { ok: false, error: 'That payment method is not on your account.' }
  }
  try {
    await removePaymentMethod({ userId: user.id, paymentMethodId })
    await logAuditAs(user, {
      entityType: 'PaymentMethod',
      entityId: paymentMethodId,
      action: 'PAYMENT_METHOD_REMOVED',
    })
    revalidatePath('/settings/billing')
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing] removePaymentMethodAction failed', (err as Error).message)
    return { ok: false, error: 'Could not remove that card. Please try again.' }
  }
}
