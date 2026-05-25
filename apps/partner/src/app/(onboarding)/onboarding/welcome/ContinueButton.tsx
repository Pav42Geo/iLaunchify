'use client'

// Stamps Partner.onboardingProgress.welcomeSeen=true before navigating, so
// future /dashboard hits skip the welcome screen and route based on
// Partner.status instead. Without the stamp the dashboard layout's redirect
// guard would bounce the partner back here on every reload.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { ArrowRight } from 'lucide-react'
import { markWelcomeSeen } from '../actions'

export function ContinueSetupButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await markWelcomeSeen()
      router.push('/onboarding')
    })
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      size="lg"
      className="bg-emerald-600 hover:bg-emerald-700"
    >
      {isPending ? 'Opening…' : 'Continue setup'}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  )
}
