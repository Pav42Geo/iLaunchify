'use client'

// Step 7 — My cart. Stubbed for G1; G5 brings the final compliance scan +
// Proceed-at-my-risk ack + promo code + Stripe Checkout pipeline.

import { StepShell, PlaceholderBody } from './_StepShell'
import type { CartState, CheckoutDraftState } from '../types'

interface Props {
  productId: string
  state: CartState
  draft: CheckoutDraftState
  onChange: (patch: Partial<CartState>) => void
}

export function CartStep({ productId: _productId, state, draft, onChange }: Props) {
  return (
    <StepShell
      index={7}
      title="My cart"
      subtitle="Last review before payment."
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Promo code (optional)
          </label>
          <input
            value={state.promoCode ?? ''}
            onChange={(e) =>
              onChange({ promoCode: e.target.value.trim().toUpperCase() || null })
            }
            placeholder="LAUNCH50"
            className="mt-1 block w-48 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm uppercase tracking-wider focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </div>

        <PlaceholderBody>
          <p className="font-medium text-ink-800">G5 fills this in.</p>
          <p className="mt-1 text-[13px]">
            Final compliance scan (reuses the same scanLabelCompliance from the
            studio); if BLOCKING findings remain, the &ldquo;Proceed at my
            risk&rdquo; acknowledgement from DS-69 fires here with the verb
            switched from Export to Proceed. On accept, Stripe Checkout takes
            over via @ilaunchify/payments. Webhook completion triggers G8&apos;s
            production export bundle.
          </p>
        </PlaceholderBody>

        <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-4 text-xs text-ink-600">
          <span className="font-semibold text-ink-800">Draft snapshot:</span>{' '}
          quantity {draft.production.quantity ?? '—'}, ship to{' '}
          {draft.fulfillment.shipToType ?? '—'}, finishes{' '}
          {draft.production.finishPartnerFinishIds.length}, accessories{' '}
          {draft.accessories.itemIds.length}.
        </div>
      </div>
    </StepShell>
  )
}
