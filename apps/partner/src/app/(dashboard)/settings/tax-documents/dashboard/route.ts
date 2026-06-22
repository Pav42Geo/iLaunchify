// Stripe Express dashboard deep-link (docs/BILLING_AND_ACCOUNTING.md — partner 1099s).
//
// Creates a single-use login link to THIS partner's own Stripe Express dashboard,
// where the bank/payout details, tax info (W-9), and 1099 forms live, then redirects.
// Ownership is implicit — we only ever mint a link for the signed-in user's own
// connected account. Falls back to a friendly notice if the account can't be linked.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { createExpressDashboardLink } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const back = new URL('/settings/tax-documents', req.nextUrl.origin)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeAccountId: true },
  })

  if (!dbUser?.stripeAccountId) {
    back.searchParams.set('tax', 'dashboard_unavailable')
    return NextResponse.redirect(back)
  }

  const url = await createExpressDashboardLink(dbUser.stripeAccountId)
  if (!url) {
    back.searchParams.set('tax', 'dashboard_unavailable')
    return NextResponse.redirect(back)
  }

  await logAuditAs(user, {
    entityType: 'TaxDocument',
    entityId: dbUser.stripeAccountId,
    action: 'TAX_DASHBOARD_ACCESSED',
  })
  return NextResponse.redirect(url)
}
