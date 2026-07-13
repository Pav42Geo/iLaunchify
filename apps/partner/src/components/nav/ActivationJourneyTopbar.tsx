// Activation-phase topbar (Pavel 2026-07-12, phased sidebar).
//
// While a partner is approved but still finishing Activation Setup, the
// dashboard shell wears the ONBOARDING header — the dark ink-900 appbar with
// the business logo and the Application → Onboarding → Activation Setup
// journey stepper — with "Activation Setup" as the ACTIVE (white) pill, so the
// funnel reads as one continuous journey. No service labels in this band
// (Pavel 2026-07-12). The account cluster is the LIMITED activation menu
// (ActivationTopbarRight) rendered directly on the dark band.
//
// Once every service is live the layout swaps back to the standard white
// PartnerTopbar (BLACK band = journey chrome only; the operating dashboard
// keeps the app header family).

import Link from 'next/link'
import type { User } from '@ilaunchify/auth'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { ActivationTopbarRight } from './ActivationTopbarRight'

export async function ActivationJourneyTopbar({
  user,
  companyName,
  tier = null,
}: {
  user: User
  companyName: string
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
}) {
  const [logos, placement] = await Promise.all([
    getPublicBrandLogos(),
    getLogoPlacement('businessHeader'),
  ])

  return (
    <header className="sticky top-0 z-40 bg-ink-900 text-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Brand
          label="iLaunchify"
          sublabel={placement.sublabel ?? 'Business'}
          imageSrc={logos.fullDark}
          wordmarkClassName="text-white"
          sublabelClassName="text-neon-500"
        />

        {/* Journey stepper — Application + Onboarding completed (muted, the
            onboarding record stays reachable read-only), Activation ACTIVE. */}
        <nav className="flex items-center gap-1 rounded-full bg-white/10 p-1">
          <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300">
            Application
          </span>
          <Link
            href="/my-application"
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300 transition-colors hover:text-white"
          >
            Onboarding
          </Link>
          <Link
            href="/activation"
            className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-900"
          >
            Activation Setup
          </Link>
        </nav>

        {/* Account cluster — bell + LIMITED menu, directly on the dark band.
            No service labels here (Pavel 2026-07-12). */}
        <div className="ml-auto">
          <ActivationTopbarRight
            email={user.email}
            name={user.name ?? null}
            companyName={companyName}
            tier={tier}
          />
        </div>
      </div>
    </header>
  )
}
