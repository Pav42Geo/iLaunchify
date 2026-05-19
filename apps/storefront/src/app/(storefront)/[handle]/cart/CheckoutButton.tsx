'use client'

import { Button } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { startCheckout } from './actions'

export function CheckoutButton({ brandHandle }: { brandHandle: string }) {
  const [busy, setBusy] = useState(false)

  async function handleCheckout() {
    setBusy(true)
    try {
      const result = await startCheckout({ brandHandle })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Redirect to Stripe Checkout
      window.location.href = result.url
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button className="w-full" onClick={handleCheckout} disabled={busy} size="lg">
      {busy ? 'Opening Stripe…' : 'Proceed to checkout'}
    </Button>
  )
}
