// Step 3 landing — "Connect a channel" (Shopify / Amazon / Brand site / Other).
// Deep-linked from the Launch Checklist drawer (item #3).
//
// V1 just captures the creator's intent. Real channel integration (OAuth,
// inventory sync, product push) is V1.5+ — the ChannelConnection schema
// from #111 is already in place to receive future wiring.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { ChannelForm } from './ChannelForm'
import type { ChannelChoice } from '../../_actions/checklist-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect a channel — iLaunchify' }

export default async function ChannelsSettingsPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })

  if (!profile) {
    return (
      <div className="rounded-md border border-ink-200 bg-white p-6 text-sm text-ink-600">
        Your creator profile is missing — contact support.
      </div>
    )
  }

  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  const initialChannel = (typeof progress.selectedChannel === 'string'
    ? progress.selectedChannel
    : '') as ChannelChoice | ''
  const initialUrl = typeof progress.channelUrl === 'string' ? progress.channelUrl : ''

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-ink-700">
          Step 3 of 5
        </p>
        <h1 className="mt-1 font-display text-ui-title">
          Where will customers buy your products?
        </h1>
        <p className="mt-1 text-ui-body text-ink-500">
          iLaunchify is the production layer — your customers check out on your own channel.
          Tell us which one so we can size shipping and packaging correctly.
        </p>
      </header>

      <ChannelForm initialChannel={initialChannel} initialUrl={initialUrl} />

      <div className="rounded-md bg-ink-50 px-4 py-3 text-xs text-ink-600">
        💡 Heads up — real Shopify / Amazon push integration ships in a later release. For now
        this just records your intent so we can prepare the right shipping + packaging defaults.
      </div>
    </div>
  )
}
