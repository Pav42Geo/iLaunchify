'use client'

// Partner onboarding — single-column card stepper (Pavel 2026-07-09).
// Ports design/partner-onboarding-cards-mockup.html to React. Replaces the
// accordion at /onboarding. Deliberately a thin stepper SHELL: each step renders
// the same field section the accordion used, so all save-on-blur autosave,
// validation and hydration are unchanged — only the chrome (one card per step,
// progress bar, Back/Continue, slide animation) is new.
//
// Steps: 1 Your business · 2 Your company · 3 What you can do · 4 Certifications
// · 5 Payment & contract. Certifications is its own step here (it was folded into
// capabilities in the accordion). Submit is server-gated (submitForReview returns
// INCOMPLETE + the missing items), so the user can move freely between steps.

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { PartnerFile } from '@ilaunchify/db'
import type { ServiceType } from '@ilaunchify/db'
import { YourBusinessSection } from './sections/YourBusinessSection'
import { YourCompanySection, type CompanyState } from './sections/YourCompanySection'
import { WhatYouCanDoSection, type CapsByType } from './sections/WhatYouCanDoSection'
import { CertDeclareSection } from './sections/CertDeclareSection'
import { PaymentContractSection, type PaymentContractState } from './sections/PaymentContractSection'
import { submitForReview } from '../../app/(onboarding)/onboarding/actions'
import type { CertPickerOption } from '@/components/CertificatePicker'

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

interface OnboardingWizardProps {
  companyName: string
  initialBusiness: BusinessState
  initialCompany: CompanyState
  initialFiles: BusinessFile[]
  initialCaps: CapsByType
  initialPayment: PaymentContractState
  markets: MarketOption[]
  regions: RegionOption[]
  certOptions: CertPickerOption[]
  initialDeclaredCertIds: string[]
  banner?: ReactNode
}

export function OnboardingWizard({
  companyName,
  initialBusiness,
  initialCompany,
  initialFiles,
  initialCaps,
  initialPayment,
  markets,
  regions,
  certOptions,
  initialDeclaredCertIds,
  banner,
}: OnboardingWizardProps) {
  const router = useRouter()

  // Live mirrors — WhatYouCanDo needs the selected types from the business step.
  const [businessState, setBusinessState] = useState<BusinessState>(initialBusiness)
  const [companyState, setCompanyState] = useState<CompanyState>(initialCompany)
  const [companyFiles, setCompanyFiles] = useState<BusinessFile[]>(initialFiles)
  const [caps, setCaps] = useState<CapsByType>(initialCaps)
  const [payment, setPayment] = useState<PaymentContractState>(initialPayment)

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'next' | 'back'>('next')
  const [isSubmitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [missingItems, setMissingItems] = useState<string[]>([])

  const STEPS: { eyebrow: string; title: ReactNode; sub: string; body: ReactNode }[] = [
    {
      eyebrow: 'Your business',
      title: (
        <>
          Where do you <Em>operate?</Em>
        </>
      ),
      sub: 'Markets set your label + compliance rules, and where you operate helps us match you with nearby creators.',
      body: (
        <YourBusinessSection
          initialState={businessState}
          markets={markets}
          regions={regions}
          onChange={setBusinessState}
        />
      ),
    },
    {
      eyebrow: 'Your company',
      title: (
        <>
          Verify <Em>who you are.</Em>
        </>
      ),
      sub: 'Legal entity, contact, address, and the documents our team checks before approval.',
      body: (
        <YourCompanySection
          initialState={companyState}
          initialFiles={companyFiles}
          onChange={(s, f) => {
            setCompanyState(s)
            setCompanyFiles(f)
          }}
        />
      ),
    },
    {
      eyebrow: 'What you can do',
      title: (
        <>
          Exactly what you <Em>produce.</Em>
        </>
      ),
      sub: 'Pick from the list — this is the data our matching engine routes on, not free text.',
      body: (
        <WhatYouCanDoSection
          selectedTypes={businessState.serviceTypes}
          initialCaps={caps}
          onChange={setCaps}
        />
      ),
    },
    {
      eyebrow: 'Certifications',
      title: (
        <>
          Confirm your <Em>certifications.</Em>
        </>
      ),
      sub: 'Only the certs eligible for what you make are shown. Pick each — you’ll attach the PDF + expiry after approval.',
      body: <CertDeclareSection options={certOptions} initialSelected={initialDeclaredCertIds} />,
    },
    {
      eyebrow: 'Payment & contract',
      title: (
        <>
          Last step — <Em>get paid.</Em>
        </>
      ),
      sub: 'Connect payouts and sign the partner agreement. Then we review and activate.',
      body: <PaymentContractSection state={payment} onChange={setPayment} />,
    },
  ]

  const total = STEPS.length
  const cur = Math.min(step, total - 1)
  const last = cur === total - 1
  const pct = Math.round(((cur + 1) / total) * 100)
  const active = STEPS[cur]!

  function goNext() {
    if (last) {
      handleSubmit()
      return
    }
    setDir('next')
    setStep((s) => Math.min(s + 1, total - 1))
    setSubmitError(null)
  }
  function goBack() {
    setDir('back')
    setStep((s) => Math.max(s - 1, 0))
    setSubmitError(null)
  }

  function handleSubmit() {
    setSubmitError(null)
    setMissingItems([])
    startSubmit(async () => {
      const result = await submitForReview()
      if (result.ok) {
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
    <div className="mx-auto max-w-[640px] px-5 pb-24 pt-8">
      <style>{`@keyframes obN{from{opacity:0;transform:translateX(28px) scale(.99)}to{opacity:1;transform:none}}@keyframes obB{from{opacity:0;transform:translateX(-28px) scale(.99)}to{opacity:1;transform:none}}`}</style>

      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-ink-500">
        <span>
          Step {cur + 1} of {total} · <span className="text-ink-400">Welcome, {companyName}</span>
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-pink-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {banner}

      <div
        key={cur}
        style={{ animation: `${dir === 'next' ? 'obN' : 'obB'} .32s cubic-bezier(.22,.61,.36,1)` }}
        className="rounded-[20px] border border-ink-200 bg-white p-7 shadow-[0_18px_50px_-28px_rgba(20,20,25,0.35)]"
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-700">{active.eyebrow}</div>
        <h2 className="mb-1 mt-2 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900">
          {active.title}
        </h2>
        <p className="mb-5 text-[14px] leading-[1.5] text-ink-600">{active.sub}</p>

        {active.body}

        {submitError && (
          <div className="mt-5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800">
            <p className="font-semibold">{submitError}</p>
            {missingItems.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {missingItems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={cur === 0 || isSubmitting}
            className="rounded-full px-2 py-2.5 text-[14px] font-semibold text-ink-600 disabled:opacity-35"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={isSubmitting}
            className={
              'rounded-full px-6 py-3 text-[14px] font-bold text-white disabled:opacity-60 ' +
              (last ? 'bg-pink-600 hover:opacity-90' : 'bg-ink-900 hover:opacity-90')
            }
          >
            {last ? (isSubmitting ? 'Submitting…' : 'Submit for review') : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Em({ children }: { children: ReactNode }) {
  return <span className="font-serif font-medium italic text-pink-500">{children}</span>
}
