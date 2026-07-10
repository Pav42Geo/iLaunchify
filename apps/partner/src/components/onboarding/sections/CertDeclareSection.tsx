'use client'

// Onboarding cert declaration — the unified CertificatePicker, autosaving.
//
// Records which admin-library cert types the partner holds (declaration only,
// no proof). Options are eligibility-filtered server-side to the partner's
// domains before they reach here. Save-on-change mirrors the rest of the
// onboarding accordion's silent autosave pattern. Activation turns each declared
// type into a real PartnerCertificateInstance (PDF + expiry + admin review).

import { useState, useTransition } from 'react'
import { CertificatePicker, type CertPickerOption } from '@/components/CertificatePicker'
import { saveDeclaredCerts } from '../../../app/(onboarding)/onboarding/actions'

export function CertDeclareSection({
  options,
  initialSelected,
}: {
  options: CertPickerOption[]
  initialSelected: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [, startTransition] = useTransition()

  function onChange(ids: string[]) {
    setSelected(ids)
    startTransition(() => {
      void saveDeclaredCerts(ids)
    })
  }

  return (
    <div className="mt-6 border-t border-ink-100 pt-5">
      <p className="text-[13px] font-semibold text-ink-900">Certifications you hold</p>
      <p className="mb-2.5 mt-0.5 text-[12.5px] leading-[1.5] text-ink-500">
        Pick every cert you carry. You’ll upload the PDF + expiry for each after approval — this just
        tells us what to expect. Only certs relevant to what you make are shown.
      </p>
      <CertificatePicker
        options={options}
        value={selected}
        onChange={onChange}
        label="Choose certificate"
        requestHref="/certifications/request"
      />
    </div>
  )
}
