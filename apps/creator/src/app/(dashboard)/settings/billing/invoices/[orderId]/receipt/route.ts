// Receipt redirect (docs/BILLING_AND_ACCOUNTING.md slice 3).
//
// Resolves the Stripe-hosted receipt for one of the creator's OWN orders and
// redirects to it. Ownership is enforced (the order's creatorUserId must match the
// signed-in user) so a creator can never pull another tenant's receipt. We fetch the
// receipt on demand and never store it.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getChargeReceiptUrl } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const user = await requireUser()

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { creatorUserId: true, charge: { select: { stripeChargeId: true } } },
  })

  const backUrl = new URL('/settings/billing/invoices', req.nextUrl.origin)

  // Ownership guard: must be this creator's own order, and it must have a charge.
  if (!order || order.creatorUserId !== user.id || !order.charge) {
    backUrl.searchParams.set('receipt', 'unavailable')
    return NextResponse.redirect(backUrl)
  }

  const receiptUrl = await getChargeReceiptUrl(order.charge.stripeChargeId)
  if (!receiptUrl) {
    backUrl.searchParams.set('receipt', 'unavailable')
    return NextResponse.redirect(backUrl)
  }

  return NextResponse.redirect(receiptUrl)
}
