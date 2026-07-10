'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { withdrawInterest } from './actions'

export function WithdrawInterestButton({ interestId }: { interestId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await withdrawInterest(interestId)
          router.refresh()
        })
      }
    >
      {isPending ? 'Withdrawing…' : 'Withdraw'}
    </Button>
  )
}
