// Cancellation P1 (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md §3.4)
// — Stripe Billing Portal for creator self-serve card updates.
//
// Why: involuntary churn. The dunning grace banner tells creators to update
// their payment method, but until now there was no surface to do it. The
// portal gives Stripe-hosted card update + invoice history with zero PCI
// surface on our side.
//
// Deliberately LOCKED DOWN: subscription cancel + plan switching are DISABLED
// in the portal configuration. Cancellation must flow through OUR modal
// (structured reason capture + audit + TierCancellationEvent — the P0 build);
// a portal cancel would bypass all three. Plan changes flow through Checkout.
//
// Configuration management: we create one shared portal configuration tagged
// with metadata `ilaunchify_kind: 'creator_billing_v1'` on first use and find
// it by that tag afterwards (module-memory cached per process). Bump the
// kind suffix if the feature set ever changes — old configs are left behind
// and simply stop being selected.

import { prisma } from '@ilaunchify/db'
import { stripe } from './client'

let cachedConfigurationId: string | null = null

const CONFIG_KIND = 'creator_billing_v1'

async function getOrCreatePortalConfiguration(): Promise<string> {
  if (cachedConfigurationId) return cachedConfigurationId

  const existing = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  })
  const match = existing.data.find(
    (c) => c.metadata?.ilaunchify_kind === CONFIG_KIND,
  )
  if (match) {
    cachedConfigurationId = match.id
    return match.id
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'iLaunchify — manage your billing details',
    },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      // Cancel + plan switching stay in OUR flows (see file header).
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address'],
      },
    },
    metadata: { ilaunchify_kind: CONFIG_KIND },
  })
  cachedConfigurationId = created.id
  return created.id
}

export interface CreateBillingPortalSessionInput {
  userId: string
  /** Absolute URL Stripe sends the creator back to (usually /settings/plan). */
  returnUrl: string
}

/**
 * Create a Billing Portal session for the user's shared Stripe Customer.
 * Throws if the user has no Stripe Customer yet (nothing to manage).
 */
export async function createBillingPortalSession(
  input: CreateBillingPortalSessionInput,
): Promise<{ url: string }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { stripeCustomerId: true },
  })
  if (!user?.stripeCustomerId) {
    throw new Error('No billing customer on file yet.')
  }

  const configuration = await getOrCreatePortalConfiguration()
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    configuration,
    return_url: input.returnUrl,
  })
  return { url: session.url }
}
