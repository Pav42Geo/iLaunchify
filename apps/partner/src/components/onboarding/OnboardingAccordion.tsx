'use client'

// 4-section accordion form for partner onboarding.
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Phase 1 (shipped): shell + Section 1 (Your business) + Welcome screen.
// Phase 2 (this commit): Sections 2 (Your company) + 3 (What you can do) +
// 4 (Payment & contract) + Submit-for-review flow.
//
// Status FSM hand-off: when partner clicks "Submit for review" we call
// submitForReview() which promotes Partner.status from DRAFT → IDENTITY_PENDING_REVIEW.
// Admin verification queue (#94 shipped) picks up from there.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import type { PartnerFile, ServiceType } from '@prisma/client'
import { YourBusinessSection } from './sections/YourBusinessSection'
import { YourCompanySection, type CompanyState } from './sections/YourCompanySection'
import { WhatYouCanDoSection, type CapsByType } from './sections/WhatYouCanDoSection'
import { PaymentContractSection, type PaymentContractState } from './sections/PaymentContractSection'
import { SectionShell, type SectionStatus } from './SectionShell'
import { submitForReview } from '../../app/(onboarding)/onboarding/actions'

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

interface BusinessState {
  targetMarketIds: string[]
  primaryRegionId: string | null
  serviceTypes: ServiceType[]
}

type BusinessFile = Pick<PartnerFile, 'id' | 'kind' | 'originalFilename' | 'sizeBytes' | 'uploadedAt'>

interface OnboardingAccordionProps {
  companyName: string
  initialBusiness: BusinessState
  initialCompany: CompanyState
  initialFiles: BusinessFile[]
  initialCaps: CapsByType
  initialPayment: PaymentContractState
  markets: MarketOption[]
  regions: RegionOption[]
}

type SectionId = 'business' | 'company' | 'capabilities' | 'commercial'

export function OnboardingAccordion({
  companyName,
  initialBusiness,
  initialCompany,
  initialFiles,
  initialCaps,
  initialPayment,
  markets,
  regions,
}: OnboardingAccordionProps) {
  const router = useRouter()

  // Section 1 is expanded by default on first visit (Pavel decision 2026-05-25 — "Start here").
  // On return visits we default to the first non-complete section (computed below).
  const [openSection, setOpenSection] = useState<SectionId | null>(() =>
    pickInitialOpen(initialBusiness, initialCompany, initialFiles, initialCaps, initialPayment),
  )

  // Local mirrors of each section's state so progress + canSubmit react immediately.
  const [businessState, setBusinessState] = useState<BusinessState>(initialBusiness)
  const [companyState, setCompanyState] = useState<CompanyState>(initialCompany)
  const [companyFiles, setCompanyFiles] = useState<BusinessFile[]>(initialFiles)
  const [caps, setCaps] = useState<CapsByType>(initialCaps)
  const [payment, setPayment] = useState<PaymentContractState>(initialPayment)

  const [isSubmitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [missingItems, setMissingItems] = useState<string[]>([])

  const sectionStatus: Record<SectionId, SectionStatus> = {
    business: computeBusinessStatus(businessState),
    company: computeCompanyStatus(companyState, companyFiles),
    capabilities: computeCapabilitiesStatus(businessState.serviceTypes, caps),
    commercial: computeCommercialStatus(payment),
  }

  const completeCount = Object.values(sectionStatus).filter((s) => s === 'COMPLETE').length
  const progressPct = Math.round((completeCount / 4) * 100)
  const canSubmit = completeCount === 4

  function handleSubmit() {
    setSubmitError(null)
    setMissingItems([])
    startSubmit(async () => {
      const result = await submitForReview()
      if (result.ok) {
        // Submitted! Server promoted partner to IDENTITY_PENDING_REVIEW. Bounce to
        // the dashboard which will route to the status page based on the new state.
        router.push('/dashboard')
        router.refresh()
      } else if (result.error === 'INCOMPLETE') {
        setSubmitError('A few things still need attention before we can submit:')
        setMissingItems(result.missing ?? [])
      } else {
        setSubmitError(`Could not submit (${result.error}). Try again or contact support.`)
      }
    })
  }

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
          subtitle="Legal entity, contact, address, certificate of incorporation, insurance"
          status={sectionStatus.company}
          isOpen={openSection === 'company'}
          onToggle={() => setOpenSection(openSection === 'company' ? null : 'company')}
        >
          <YourCompanySection
            initialState={companyState}
            initialFiles={companyFiles}
            onChange={(s, f) => {
              setCompanyState(s)
              setCompanyFiles(f)
            }}
          />
        </SectionShell>

        <SectionShell
          id="capabilities"
          title="What you can do"
          subtitle="Production capacity, MOQ, lead time — one tab per partner type"
          status={sectionStatus.capabilities}
          isOpen={openSection === 'capabilities'}
          onToggle={() =>
            setOpenSection(openSection === 'capabilities' ? null : 'capabilities')
          }
        >
          <WhatYouCanDoSection
            selectedTypes={businessState.serviceTypes}
            initialCaps={caps}
            onChange={setCaps}
          />
        </SectionShell>

        <SectionShell
          id="commercial"
          title="Payment & contract"
          subtitle="Stripe Connect for payouts + sign the standard partner agreement"
          status={sectionStatus.commercial}
          isOpen={openSection === 'commercial'}
          onToggle={() =>
            setOpenSection(openSection === 'commercial' ? null : 'commercial')
          }
        >
          <PaymentContractSection state={payment} onChange={setPayment} />
        </SectionShell>
      </div>

      <footer className="mt-10 space-y-3">
        {submitError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{submitError}</p>
            {missingItems.length > 0 && (
              <ul className="mt-1 ml-5 list-disc text-amber-800">
                {missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-zinc-500">
            Your progress saves automatically. You can leave and come back any time.
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700"
            title={canSubmit ? undefined : 'Complete all 4 sections to submit'}
          >
            {isSubmitting ? 'Submitting…' : 'Submit for review →'}
          </Button>
        </div>
      </footer>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Status computation
// -----------------------------------------------------------------------------

function computeBusinessStatus(state: BusinessState): SectionStatus {
  const hasMarket = state.targetMarketIds.length > 0
  const hasRegion = !!state.primaryRegionId
  const hasType = state.serviceTypes.length > 0
  if (hasMarket && hasRegion && hasType) return 'COMPLETE'
  if (hasMarket || hasRegion || hasType) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function computeCompanyStatus(state: CompanyState, files: BusinessFile[]): SectionStatus {
  const hasLegalInfo =
    !!state.legalName && !!state.companyName && !!state.addressLine1 && !!state.city && !!state.state
  const hasBusinessLicense = files.some((f) => f.kind === 'BUSINESS_LICENSE')
  const hasInsurance = files.some((f) => f.kind === 'INSURANCE')
  const hasCertOfInc = files.some((f) => f.kind === 'CERT_OF_INCORPORATION')

  if (hasLegalInfo && hasBusinessLicense && hasInsurance && hasCertOfInc) return 'COMPLETE'
  if (hasLegalInfo || hasBusinessLicense || hasInsurance || hasCertOfInc) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function computeCapabilitiesStatus(
  selectedTypes: ServiceType[],
  caps: CapsByType,
): SectionStatus {
  if (selectedTypes.length === 0) return 'NOT_STARTED'

  // A type counts as "filled" if any of its representative fields is non-empty.
  // We don't enforce specific values here — admin verifies content.
  const filledTypes = selectedTypes.filter((t) => {
    // Each CapsByType[t] is a different shape, but they're all string-valued
    // records at the type-script level. Read via Record<string, string> so
    // dynamic-key access stays type-safe.
    const c = (caps as Record<string, Record<string, string> | undefined>)[t]
    if (!c) return false
    return Object.values(c).some((v) => v && v.trim().length > 0)
  })

  if (filledTypes.length === selectedTypes.length) return 'COMPLETE'
  if (filledTypes.length > 0) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function computeCommercialStatus(state: PaymentContractState): SectionStatus {
  const stripeOk = state.stripeAccountStatus === 'ACTIVE'
  const signed = state.signedAt !== null
  if (stripeOk && signed) return 'COMPLETE'
  if (stripeOk || signed || state.stripeAccountStatus === 'PENDING') return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

// Initial open section: first non-complete (so returning users land on the right work).
function pickInitialOpen(
  business: BusinessState,
  company: CompanyState,
  files: BusinessFile[],
  caps: CapsByType,
  payment: PaymentContractState,
): SectionId {
  if (computeBusinessStatus(business) !== 'COMPLETE') return 'business'
  if (computeCompanyStatus(company, files) !== 'COMPLETE') return 'company'
  if (computeCapabilitiesStatus(business.serviceTypes, caps) !== 'COMPLETE') return 'capabilities'
  if (computeCommercialStatus(payment) !== 'COMPLETE') return 'commercial'
  return 'business'
}
