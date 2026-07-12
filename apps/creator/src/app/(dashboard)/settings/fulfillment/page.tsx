// Adaptive Fulfillment Engine (AFE) — account-wide fulfillment preference.
// The FC scorer tilts its weights toward this at checkout; a per-product override
// (on the product) can still win. docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { FulfillmentPreferenceForm } from './FulfillmentPreferenceForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fulfillment preference — iLaunchify' }

export default async function FulfillmentSettingsPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { fulfillmentPreference: true },
  })

  if (!profile) {
    return (
      <div className="rounded-md border border-ink-200 bg-white p-6 text-sm text-ink-600">
        Your creator profile is missing — contact support.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Fulfillment
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Fulfillment preference
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          When you send a bulk order to a fulfillment center, we automatically pick the best-matched
          one for you. This tells us what to optimize for. You can still override it on any single
          product, and pick a specific center at checkout.
        </p>
      </div>

      <FulfillmentPreferenceForm initial={profile.fulfillmentPreference} />
    </div>
  )
}
