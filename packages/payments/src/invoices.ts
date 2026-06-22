// Billing-history helpers (docs/BILLING_AND_ACCOUNTING.md slice 3).
//
// iLaunchify's creator spend is mostly one-time production-order Charges (plus
// recurring subscription invoices). For the "Orders & invoices" surface we link
// each paid order to its Stripe-hosted receipt — fetched on demand, never stored,
// so no card or receipt data lives in our DB.

import { stripe } from './client'

/**
 * Resolve the Stripe-hosted receipt URL for a Charge. Returns null if Stripe isn't
 * configured, the charge is unknown, or no receipt exists yet. Never throws.
 */
export async function getChargeReceiptUrl(stripeChargeId: string): Promise<string | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null
  try {
    const charge = await stripe.charges.retrieve(stripeChargeId)
    return charge.receipt_url ?? null
  } catch {
    return null
  }
}
