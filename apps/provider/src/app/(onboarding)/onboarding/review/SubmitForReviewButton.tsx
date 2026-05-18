'use client'

import { Button } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { submitForReview } from './actions'

export function SubmitForReviewButton({ partnerId }: { partnerId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const result = await submitForReview({ partnerId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Submitted. We will review within 1-2 business days.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={busy}>
      {busy ? 'Submitting…' : 'Submit for review'}
    </Button>
  )
}
