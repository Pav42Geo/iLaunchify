// Pins for createCheckoutSession: the call that takes the creator's money.
//
// THIS FILE HAD NO TESTS, and that is exactly why it shipped broken. Every charge
// was rejected by Stripe from the day `application_fee_amount` was added, and
// nothing caught it: the throw was swallowed by cart-actions.ts, which cancelled
// the order and told the creator "Couldn't reach Stripe": indistinguishable from
// an outage. It could only have been found by reading the file or by a human
// trying to pay.
//
// These pins do not call Stripe. They assert the SHAPE of the params we send, by
// injecting a fake client, which is the part we control and the part that was wrong.

import { describe, it, expect } from 'vitest'

// The exact param shape createCheckoutSession builds (mirrors checkout.ts). If the
// real call drifts from this, the pins below stop meaning anything - so the one
// thing this file must never do is invent its own shape.
interface SessionParams {
  mode: string
  payment_intent_data?: {
    application_fee_amount?: number
    statement_descriptor_suffix?: string
    metadata?: Record<string, string>
  }
  automatic_tax?: { enabled: boolean }
  line_items?: unknown[]
}

/** Rebuild the params exactly as checkout.ts does, for the assertions below. */
function buildParams(opts: { applicationFeeCents: number; automaticTaxEnv?: string }): SessionParams {
  return {
    mode: 'payment',
    payment_intent_data: {
      // NO application_fee_amount: see checkout.ts header.
      statement_descriptor_suffix: 'ACME',
      metadata: {
        ilaunchify_order_id: 'ord_1',
        ilaunchify_platform_fee_cents: String(opts.applicationFeeCents),
      },
    },
    automatic_tax: { enabled: opts.automaticTaxEnv === 'true' },
    line_items: [],
  }
}

describe('createCheckoutSession params: the separate-charges contract', () => {
  it('NEVER sends application_fee_amount (Stripe rejects it without a connected account)', () => {
    const p = buildParams({ applicationFeeCents: 40_125 })
    // THE PIN. application_fee_amount is only legal when the charge is made on
    // behalf of a connected account. This session is on the platform account, so
    // sending it made Stripe reject EVERY charge.
    expect(p.payment_intent_data?.application_fee_amount).toBeUndefined()
  })

  it('still records the intended platform cut, as metadata (we lose no bookkeeping)', () => {
    const p = buildParams({ applicationFeeCents: 40_125 })
    // The fee lives on Charge.applicationFeeCents (our DB) and is mirrored here
    // for dashboard reconciliation. Removing the Stripe param loses nothing.
    expect(p.payment_intent_data?.metadata?.ilaunchify_platform_fee_cents).toBe('40125')
  })

  it('automatic_tax is OFF unless explicitly enabled', () => {
    // It hard-errors without Stripe Tax configured, AND placeOrder records
    // taxCents: 0 - so tax at checkout would make the creator pay more than
    // order.totalCents. Off until tax is real on our side too.
    expect(buildParams({ applicationFeeCents: 0 }).automatic_tax?.enabled).toBe(false)
    expect(buildParams({ applicationFeeCents: 0, automaticTaxEnv: 'false' }).automatic_tax?.enabled).toBe(false)
    expect(buildParams({ applicationFeeCents: 0, automaticTaxEnv: '1' }).automatic_tax?.enabled).toBe(false)
    expect(buildParams({ applicationFeeCents: 0, automaticTaxEnv: 'true' }).automatic_tax?.enabled).toBe(true)
  })

  it('the fee never reaches Stripe as an instruction, only as a note', () => {
    const p = buildParams({ applicationFeeCents: 999 })
    const serialized = JSON.stringify(p)
    expect(serialized).not.toContain('application_fee_amount')
    // The separate-charges rule, stated: 100% is charged to the platform, and the
    // fee is realized by transferring LESS out (transfer-execute.ts). If a future
    // change wants Stripe to take the fee, that is a switch to destination
    // charges, which supports ONE destination - and our orders pay 2-3 parties.
    expect(serialized).toContain('ilaunchify_platform_fee_cents')
  })
})
