// Stripe setup-Checkout return handler (docs/BILLING_AND_ACCOUNTING.md slice 2).
//
// Stripe redirects here with ?session_id=... after the user adds a card. We resolve
// the attached PaymentMethod, set it default, and upsert the display mirror, then
// bounce back to /settings/billing with a status flag. No card data is handled here
// — only the opaque session id and the resulting pm_ crumbs.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@ilaunchify/auth'
import { syncPaymentMethodFromCheckout } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const billingUrl = new URL('/settings/billing', req.nextUrl.origin)

  if (!sessionId) {
    billingUrl.searchParams.set('pm', 'error')
    return NextResponse.redirect(billingUrl)
  }

  try {
    const result = await syncPaymentMethodFromCheckout({ userId: user.id, sessionId })
    if (result) {
      await logAuditAs(user, {
        entityType: 'PaymentMethod',
        entityId: sessionId,
        action: 'PAYMENT_METHOD_ADDED',
      })
      billingUrl.searchParams.set('pm', 'added')
    } else {
      billingUrl.searchParams.set('pm', 'error')
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing] payment-method return sync failed', (err as Error).message)
    billingUrl.searchParams.set('pm', 'error')
  }

  return NextResponse.redirect(billingUrl)
}
