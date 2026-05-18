// Stripe Connect Express helpers — used by both creators and partners.
// Per docs/PAYMENTS.md: Express accounts for all three party types.

import { prisma } from '@ilaunchify/db'
import { stripe } from './client'

/**
 * Get-or-create the connected account for a User. Stores the account id
 * on User.stripeAccountId on first creation.
 */
export async function createConnectAccount(params: {
  userId: string
  email: string
  role: 'CREATOR' | 'PARTNER'
}): Promise<{ accountId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  })
  if (user?.stripeAccountId) {
    return { accountId: user.stripeAccountId }
  }

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: params.email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: false },   // platform handles charges; partner only receives transfers
    },
    business_type: params.role === 'PARTNER' ? 'company' : 'individual',
    metadata: {
      ilaunchify_user_id: params.userId,
      ilaunchify_role: params.role,
    },
  })

  await prisma.user.update({
    where: { id: params.userId },
    data: { stripeAccountId: account.id, stripeAccountStatus: 'PENDING' },
  })

  return { accountId: account.id }
}

/**
 * Create a one-time onboarding URL for the user to complete KYC/KYB with Stripe.
 * URL expires after a short window — call this fresh each time the partner clicks "Connect payouts".
 */
export async function createConnectAccountLink(params: {
  accountId: string
  refreshUrl: string
  returnUrl: string
}): Promise<{ url: string }> {
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  })
  return { url: link.url }
}
