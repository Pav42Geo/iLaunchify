'use client'

import { Button } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { startConnectOnboarding } from './actions'

export function ConnectButton({ accountStatus }: { accountStatus: string }) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const result = await startConnectOnboarding()
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
    accountStatus === 'PENDING' || accountStatus === 'RESTRICTED'
      ? 'Resume Stripe onboarding'
      : 'Connect payouts with Stripe'

  return (
    <Button onClick={handleClick} disabled={busy} className="w-full">
      {busy ? 'Opening Stripe…' : label}
    </Button>
  )
}
