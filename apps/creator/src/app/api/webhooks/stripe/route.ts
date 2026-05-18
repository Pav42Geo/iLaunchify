import { NextRequest, NextResponse } from 'next/server'
import { handleStripeEvent, stripe } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'missing signature/secret' }, { status: 400 })
  }

  const payload = await req.text()
  let event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (err) {
    return NextResponse.json(
      { error: `signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    )
  }

  try {
    const result = await handleStripeEvent(event)
    return NextResponse.json({ received: true, handled: result.handled })
  } catch (err) {
    console.error('Stripe webhook error', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
