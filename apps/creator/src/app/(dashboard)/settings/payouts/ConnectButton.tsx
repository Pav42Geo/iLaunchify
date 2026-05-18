'use client'

import { Button } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { startCreatorConnect } from './actions'

export function ConnectButton({ currentStatus }: { currentStatus: string }) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const result = await startCreatorConnect()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.location.href = result.url
    } finally {
      setBusy(false)
    }
  }

  const label =
    currentStatus === 'ACTIVE'
      ? 'Manage payout account on Stripe'
      : currentStatus === 'PENDING' || currentStatus === 'RESTRICTED'
        ? 'Resume Stripe onboarding'
        : 'Connect payouts with Stripe'

  return (
    <Button onClick={handleClick} disabled={busy}>
      {busy ? 'Opening Stripe…' : label}
    </Button>
  )
}
