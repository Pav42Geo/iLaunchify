'use client'

// 4-section accordion form for partner onboarding.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Section 1 (Your business) is fully implemented; Sections 2-4 are visual
// stubs in Phase 1 of the build. Phase 2 fleshes them out.

import { useState } from 'react'
import { Button } from '@ilaunchify/ui'
import type { ServiceType } from '@prisma/client'
import { YourBusinessSection } from './sections/YourBusinessSection'
import { SectionShell, type SectionStatus } from './SectionShell'

interface MarketOption {
  id: string
  code: string
  name: string
  region: string | null
}

interface RegionOption {
  id: string
  code: string
  name: string
  marketId: string
  parentRegionId: string | null
}

interface InitialState {
  targetMarketIds: string[]
  primaryRegionId: string | null
  serviceTypes: ServiceType[]
}

interface OnboardingAccordionProps {
  companyName: string
  initialState: InitialState
  markets: MarketOption[]
  regions: RegionOption[]
}

type SectionId = 'business' | 'company' | 'capabilities' | 'commercial'

export function OnboardingAccordion({
  companyName,
  initialState,
  markets,
  regions,
}: OnboardingAccordionProps) {
  // Section 1 is expanded by default (Pavel decision 2026-05-25 — "Start here").
  const [openSection, setOpenSection] = useState<SectionId | null>('business')

  // Local mirror of section completion for the progress bar + section pills.
  // Server is source of truth (each section saves to DB); this local state lets
  // the UI react immediately to user input without waiting for round trips.
  const [businessState, setBusinessState] = useState<InitialState>(initialState)

  const sectionStatus: Record<SectionId, SectionStatus> = {
    business: computeBusinessStatus(businessState),
    company: 'NOT_STARTED',
    capabilities: 'NOT_STARTED',
    commercial: 'NOT_STARTED',
  }

  const completeCount = Object.values(sectionStatus).filter((s) => s === 'COMPLETE').length
  const progressPct = Math.round((completeCount / 4) * 100)
  const canSubmit = completeCount === 4

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {companyName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Complete these sections so we can verify your account. You can save your progress
          and return any time.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <SectionShell
          id="business"
          title="Your business"
          subtitle="What you make, where you operate, and what kind of partner you are"
          status={sectionStatus.business}
          isOpen={openSection === 'business'}
          onToggle={() => setOpenSection(openSection === 'business' ? null : 'business')}
          isStartHere
        >
          <YourBusinessSection
            initialState={businessState}
            markets={markets}
            regions={regions}
            onChange={setBusinessState}
          />
        </SectionShell>

        <SectionShell
          id="company"
          title="Your company"
          subtitle="Legal entity, contact, addresses, insurance, certifications"
          status={sectionStatus.company}
          isOpen={openSection === 'company'}
          onToggle={() => setOpenSection(openSection === 'company' ? null : 'company')}
        >
          <Placeholder
            description="This section captures your legal identity, business license, insurance certificate, and industry certifications. Phase 2 of the build wires this up to the existing document-upload flow at /onboarding/documents and the verification queue."
            comingNext
          />
        </SectionShell>

        <SectionShell
          id="capabilities"
          title="What you can do"
          subtitle="Production capacity, MOQ, lead time, certifications"
          status={sectionStatus.capabilities}
          isOpen={openSection === 'capabilities'}
          onToggle={() =>
            setOpenSection(openSection === 'capabilities' ? null : 'capabilities')
          }
        >
          <Placeholder
            description="Conditional fields based on the partner types you selected in 'Your business' above. Manufacturing partners see production capacity questions; label-printing partners see substrate + color-mode questions. Phase 2 of the build."
            comingNext
          />
        </SectionShell>

        <SectionShell
          id="commercial"
          title="Payment & contract"
          subtitle="Stripe Connect, payment method, sign the standard partner agreement"
          status={sectionStatus.commercial}
          isOpen={openSection === 'commercial'}
          onToggle={() =>
            setOpenSection(openSection === 'commercial' ? null : 'commercial')
          }
        >
          <Placeholder
            description="Wraps the existing Stripe Connect onboarding flow (/onboarding/stripe) and surfaces the STANDARD_V1.0 partner agreement for sign-off. Phase 2 of the build."
            comingNext
          />
        </SectionShell>
      </div>

      <footer className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline">Save draft</Button>
        <Button
          disabled={!canSubmit}
          className="bg-emerald-600 hover:bg-emerald-700"
          title={canSubmit ? undefined : 'Complete all 4 sections to submit'}
        >
          Submit for review →
        </Button>
      </footer>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function computeBusinessStatus(state: InitialState): SectionStatus {
  const hasMarket = state.targetMarketIds.length > 0
  const hasRegion = !!state.primaryRegionId
  const hasType = state.serviceTypes.length > 0
  if (hasMarket && hasRegion && hasType) return 'COMPLETE'
  if (hasMarket || hasRegion || hasType) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function Placeholder({
  description,
  comingNext,
}: {
  description: string
  comingNext?: boolean
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
      {comingNext && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Coming in Phase 2 of the build
        </p>
      )}
      <p>{description}</p>
    </div>
  )
}
