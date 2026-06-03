// Headless Stripe-webhook integration test (P5 — code-level verification).
//
// Calls handleStripeEvent() directly with synthetic Stripe.Event objects against
// the LOCAL DB + real Prisma writes, then asserts the downstream effects. This
// covers the "does the money→order loop actually close" risk WITHOUT needing the
// Stripe CLI / live keys / HTTP.
//
// SCOPE — only the DB-pure handlers are exercised here:
//   • payment_intent.succeeded  → Order PAID + Charge recorded (+ idempotent replay)
//   • charge.refunded           → Order REFUNDED
// NOT exercised (these reach out to the live Stripe API → need Pavel's
// `stripe trigger` run with real test keys):
//   • checkout.session.completed (tier) → calls stripe.subscriptions.retrieve()
//   • invoice.payment_succeeded (subscription cycle) → fixture-heavy + live
//
// Run:
//   cd packages/payments && pnpm exec dotenv -e ../../.env.local -- \
//     tsx scripts/webhook-integration-test.ts
//
// Self-contained: creates its own fixtures under a unique tag and deletes them
// in a finally, so it leaves the DB exactly as it found it.

import { prisma } from '@ilaunchify/db'
import type Stripe from 'stripe'
import { handleStripeEvent } from '../src/webhook-handlers'

const TAG = `wht_${Date.now()}`

function event(type: string, object: unknown): Stripe.Event {
  // handleStripeEvent only reads event.type + event.data.object.
  return { type, data: { object } } as unknown as Stripe.Event
}

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ''}`)
  }
}

async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    // A handler throwing AFTER its committed transaction (e.g. createDispatches
    // on an unmatched order) shouldn't fail the test — we assert on DB state.
    console.log(`  · ${label} threw (non-fatal): ${(err as Error).message}`)
  }
}

async function main() {
  console.log(`\n🔌 Stripe webhook integration test [${TAG}]\n`)

  // ---------------------------------------------------------------- fixtures
  const user = await prisma.user.create({
    data: { email: `${TAG}@test.local`, role: 'CREATOR', name: 'WHT Creator' },
  })
  const profile = await prisma.creatorProfile.create({
    data: { userId: user.id, handle: TAG, displayName: 'WHT Creator' },
  })
  const brand = await prisma.brand.create({
    data: { creatorProfileId: profile.id, name: 'WHT Brand', handle: `${TAG}-brand` },
  })
  const order = await prisma.order.create({
    data: {
      brandId: brand.id,
      creatorUserId: user.id,
      status: 'PENDING_PAYMENT',
      subtotalCents: 10_000,
      totalCents: 11_500,
      shipToContactName: 'WHT Creator',
      shipToAddressLine1: '1 Test St',
      shipToCity: 'Austin',
      shipToState: 'TX',
      shipToPostalCode: '78701',
    },
  })

  const piId = `pi_${TAG}`
  const chId = `ch_${TAG}`

  try {
    // ---------------------------------------- A: payment_intent.succeeded
    console.log('A) payment_intent.succeeded → Order PAID + Charge')
    await safe('payment_intent.succeeded', () =>
      handleStripeEvent(
        event('payment_intent.succeeded', {
          id: piId,
          amount: 11_500,
          currency: 'usd',
          latest_charge: chId,
          application_fee_amount: 0,
          metadata: { ilaunchify_order_id: order.id },
        }),
      ),
    )
    const afterA = await prisma.order.findUnique({ where: { id: order.id } })
    assert('Order flipped to PAID', afterA?.status === 'PAID', afterA?.status)
    assert('Order.paidAt stamped', afterA?.paidAt != null)
    const charge = await prisma.charge.findFirst({ where: { stripePaymentIntentId: piId } })
    assert('Charge recorded with SUCCEEDED status', charge?.status === 'SUCCEEDED', charge?.status)
    assert('Charge amount matches the PaymentIntent', charge?.amountCents === 11_500, charge?.amountCents)

    // ---------------------------------------- A2: idempotent replay
    console.log('A2) replay payment_intent.succeeded → no duplicate Charge')
    await safe('payment_intent.succeeded (replay)', () =>
      handleStripeEvent(
        event('payment_intent.succeeded', {
          id: piId,
          amount: 11_500,
          currency: 'usd',
          latest_charge: chId,
          application_fee_amount: 0,
          metadata: { ilaunchify_order_id: order.id },
        }),
      ),
    )
    const chargeCount = await prisma.charge.count({ where: { stripePaymentIntentId: piId } })
    assert('exactly one Charge after replay (idempotent)', chargeCount === 1, chargeCount)

    // ---------------------------------------- B: charge.refunded
    console.log('B) charge.refunded → Order REFUNDED')
    await safe('charge.refunded', () =>
      handleStripeEvent(
        event('charge.refunded', {
          id: chId,
          metadata: { ilaunchify_order_id: order.id },
        }),
      ),
    )
    const afterB = await prisma.order.findUnique({ where: { id: order.id } })
    assert('Order flipped to REFUNDED', afterB?.status === 'REFUNDED', afterB?.status)
  } finally {
    // -------------------------------------------------------------- teardown
    await prisma.charge.deleteMany({ where: { orderId: order.id } }).catch(() => {})
    await prisma.orderDispatch.deleteMany({ where: { orderId: order.id } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { entityId: order.id } }).catch(() => {})
    await prisma.order.deleteMany({ where: { id: order.id } }).catch(() => {})
    await prisma.brand.deleteMany({ where: { id: brand.id } }).catch(() => {})
    await prisma.creatorProfile.deleteMany({ where: { id: profile.id } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {})
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('Fatal:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
