'use client'

// Payment-method section on the creator billing surface (docs/BILLING_AND_ACCOUNTING.md
// slice 2). Renders the saved cards (display mirror) + actions. The card is added on
// Stripe-hosted Checkout — this component never renders a raw card field.

import { useState, useTransition } from 'react'
import { Button } from '@ilaunchify/ui'
import {
  startAddPaymentMethod,
  makeDefaultPaymentMethod,
  removePaymentMethodAction,
} from './payment-actions'

export interface SavedCard {
  stripePaymentMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}

function brandLabel(brand: string | null): string {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function expLabel(m: number | null, y: number | null): string | null {
  if (!m || !y) return null
  return `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`
}

export function PaymentMethodSection({
  cards,
  configured,
}: {
  cards: SavedCard[]
  configured: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function addCard() {
    setError(null)
    startTransition(async () => {
      const res = await startAddPaymentMethod()
      if (res.ok && res.url) {
        window.location.assign(res.url)
      } else {
        setError(res.error ?? 'Could not start adding a card.')
      }
    })
  }

  function makeDefault(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await makeDefaultPaymentMethod(id)
      if (!res.ok) setError(res.error ?? 'Could not update default card.')
      setBusyId(null)
    })
  }

  function remove(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await removePaymentMethodAction(id)
      if (!res.ok) setError(res.error ?? 'Could not remove card.')
      setBusyId(null)
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
            Payment method
          </h2>
          <p className="mt-1 text-[12px] text-ink-500">
            Used for production orders and your subscription. Your card is entered and
            stored securely by Stripe — iLaunchify never sees or stores card numbers.
          </p>
        </div>
        {configured && (
          <Button size="sm" onClick={addCard} disabled={isPending}>
            {cards.length > 0 ? 'Add card' : 'Add payment method'}
          </Button>
        )}
      </div>

      {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-[12px] text-danger-700">{error}</p>}

      {!configured && (
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
          Payment processing isn’t configured in this environment yet.
        </p>
      )}

      {configured && cards.length === 0 && (
        <div className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center">
          <p className="text-[13px] text-ink-600">No payment method on file yet.</p>
          <p className="mt-1 text-[12px] text-ink-500">
            Add one to place production orders and manage your subscription.
          </p>
        </div>
      )}

      {cards.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {cards.map((c) => {
            const exp = expLabel(c.expMonth, c.expYear)
            const rowBusy = isPending && busyId === c.stripePaymentMethodId
            return (
              <li
                key={c.stripePaymentMethodId}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex h-9 w-12 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-[12px] font-bold uppercase tracking-wide text-ink-700">
                  {brandLabel(c.brand).slice(0, 4)}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink-900">
                    {brandLabel(c.brand)} •••• {c.last4 ?? '????'}
                  </div>
                  {exp && <div className="text-[12px] text-ink-500">Expires {exp}</div>}
                </div>

                {c.isDefault ? (
                  <span className="ml-auto inline-flex items-center rounded-full border border-success-200 bg-success-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-success-800">
                    Default
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(c.stripePaymentMethodId)}
                    disabled={rowBusy}
                    className="ml-auto text-[12px] font-semibold text-pink-700 hover:text-pink-800 disabled:opacity-50"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(c.stripePaymentMethodId)}
                  disabled={rowBusy}
                  className="text-[12px] font-medium text-ink-500 hover:text-danger-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
