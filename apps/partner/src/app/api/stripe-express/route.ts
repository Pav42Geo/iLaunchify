// GET /api/stripe-express — 302 to a fresh Stripe Express dashboard login
// link for the acting org admin (P3 §18: payout history + 1099s live in
// Stripe's own dashboard; we mint a short-lived login link, never store it).
// Commercial surface → org admins only.

import { NextResponse } from 'next/server'
import { requireUser, requirePartnerAdminAccess } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { createExpressDashboardLink } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const user = await requireUser()
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // The Connect account lives on the FOUNDER's user row (Stripe onboarding
  // is part of the founder's Layer-4 commercial setup).
  const founder = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: { user: { select: { stripeAccountId: true, stripeAccountStatus: true } } },
  })
  const accountId = founder?.user.stripeAccountId
  if (!accountId || founder.user.stripeAccountStatus !== 'ACTIVE') {
    return NextResponse.redirect(new URL('/payments?stripe=incomplete', req.url))
  }

  const link = await createExpressDashboardLink(accountId)
  if (!link) {
    return NextResponse.redirect(new URL('/payments?stripe=unavailable', req.url))
  }
  return NextResponse.redirect(link)
}
