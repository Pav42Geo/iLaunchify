'use client'

// Phase H3.1 — Adjust order button. Seeds a CheckoutDraft from the
// existing Order using startOrderAdjustment, then navigates the creator
// into the wizard with the adjust banner showing.

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startOrderAdjustment } from '../../products/[productId]/checkout/adjust-actions'

interface Props {
  productId: string
  orderId: string
}

export function AdjustOrderButton({ productId, orderId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await startOrderAdjustment({ productId, orderId })
            if (!res.ok) {
              setError(res.error)
              return
            }
            router.push(`/products/${productId}/checkout?adjust=${orderId}`)
          })
        }}
        className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-60"
      >
        {isPending ? 'Loading order…' : 'Adjust order'}
      </button>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <p className="text-[10.5px] text-red-700">
        Resubmitting only re-asks the partner gates affected by your changes.
      </p>
    </div>
  )
}
