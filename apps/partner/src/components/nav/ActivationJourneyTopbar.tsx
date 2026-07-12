// Activation-phase topbar (Pavel 2026-07-12, phased sidebar).
//
// While a partner is approved but still finishing Activation Setup, the
// dashboard shell wears the ONBOARDING header — the dark ink-900 appbar with
// the business logo and the Application → Onboarding → Activation Setup
// journey stepper — with "Activation Setup" as the ACTIVE (white) pill, so the
// funnel reads as one continuous journey. Service pills mirror the onboarding
// header (static here — services are locked post-approval). The account
// cluster (bell + user menu) sits in a white capsule so its ink-toned icons
// stay legible on the dark band.
//
// Once every service is live the layout swaps back to the standard white
// PartnerTopbar (BLACK band = journey chrome only; the operating dashboard
// keeps the app header family).

import Link from 'next/link'
import type { User } from '@ilaunchify/auth'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { PartnerTopbarRight } from './PartnerTopbarRight'

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print',
  WAREHOUSE: 'Fulfillment',
}

export async function ActivationJourneyTopbar({
  user,
  companyName,
  tier = null,
  serviceTypes = [],
}: {
  user: User
  companyName: string
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
  serviceTypes?: string[]
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

        {/* Service pills — the services being activated (locked post-approval). */}
        {serviceTypes.length > 0 && (
          <div className="hidden items-center gap-1.5 md:flex">
            {serviceTypes.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11.5px] font-semibold text-ink-300"
              >
                {SERVICE_LABEL[t] ?? t}
              </span>
            ))}
          </div>
        )}

        {/* Account cluster on a white capsule (ink-toned icons need it on dark). */}
        <div className="ml-auto flex items-center gap-1 rounded-full bg-white py-0.5 pl-1.5 pr-0.5">
          <PartnerTopbarRight
            email={user.email}
            name={user.name ?? null}
            image={user.image ?? 'https://i.pravatar.cc/120?img=12'}
            companyName={companyName}
            tier={tier}
            showMyApplication
          />
        </div>
      </div>
    </header>
  )
}
