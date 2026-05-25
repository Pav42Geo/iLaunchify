'use client'

// Section 2 — "Your company"
// Per docs/PARTNER_ONBOARDING.md §7.4.
//
// Captures legal entity + contact + address + 3 verification documents:
//   - Certificate of incorporation
//   - State / county business license
//   - General liability insurance certificate
//
// Save behavior: text fields auto-save on blur (debounced); file uploads
// stream to R2 immediately via the existing uploadPartnerDocument() action.
// The Partner.address fields and the BUSINESS verification section are the
// source of truth on the server.

import { useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import type { PartnerFile } from '@prisma/client'
import { saveYourCompanySection } from '../../../app/(onboarding)/onboarding/actions'
import { FileUploadSlot, type ExistingFile } from '../../../app/(onboarding)/onboarding/documents/FileUploadSlot'

export interface CompanyState {
  companyName: string
  legalName: string
  websiteUrl: string
  contactPhone: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
}

type BusinessFile = Pick<PartnerFile, 'id' | 'kind' | 'originalFilename' | 'sizeBytes' | 'uploadedAt'>

interface YourCompanySectionProps {
  initialState: CompanyState
  initialFiles: BusinessFile[]
  onChange: (state: CompanyState, files: BusinessFile[]) => void
}

export function YourCompanySection({
  initialState,
  initialFiles,
  onChange,
}: YourCompanySectionProps) {
  const [state, setState] = useState<CompanyState>(initialState)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<CompanyState>) {
    const next = { ...state, ...patch }
    setState(next)
    onChange(next, initialFiles)
  }

  // Save when a field loses focus — keeps the wire quieter than per-keystroke.
  function commit() {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveYourCompanySection(state)
      if (result.ok) {
        setError(null)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
        setError(humanizeError(result.error))
      }
    })
  }

  // Index existing files by kind so each slot gets the relevant subset.
  const filesByKind = new Map<string, ExistingFile[]>()
  for (const f of initialFiles) {
    const list = filesByKind.get(f.kind) ?? []
    list.push({
      id: f.id,
      originalFilename: f.originalFilename,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt,
    })
    filesByKind.set(f.kind, list)
  }

  return (
    <div className="space-y-8">
      <div className="-mt-3 flex items-center justify-end gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {/* Legal entity */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-zinc-900">Legal entity</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="companyName" label="Doing-business-as (DBA)" required>
            <Input
              id="companyName"
              value={state.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              onBlur={commit}
            />
          </Field>
          <Field id="legalName" label="Legal entity name" required hint="Exactly as on your incorporation docs">
            <Input
              id="legalName"
              value={state.legalName}
              onChange={(e) => update({ legalName: e.target.value })}
              onBlur={commit}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="websiteUrl" label="Website">
            <Input
              id="websiteUrl"
              placeholder="https://"
              value={state.websiteUrl}
              onChange={(e) => update({ websiteUrl: e.target.value })}
              onBlur={commit}
            />
          </Field>
          <Field id="contactPhone" label="Primary phone">
            <Input
              id="contactPhone"
              placeholder="+1 (415) 555-0100"
              value={state.contactPhone}
              onChange={(e) => update({ contactPhone: e.target.value })}
              onBlur={commit}
            />
          </Field>
        </div>
      </section>

      {/* Address */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-zinc-900">Primary facility address</h3>
        <p className="-mt-2 text-sm text-zinc-500">
          Where production happens. Used for shipping coordination and tax forms.
        </p>

        <Field id="addressLine1" label="Street address" required>
          <Input
            id="addressLine1"
            value={state.addressLine1}
            onChange={(e) => update({ addressLine1: e.target.value })}
            onBlur={commit}
          />
        </Field>

        <Field id="addressLine2" label="Suite / unit (optional)">
          <Input
            id="addressLine2"
            value={state.addressLine2}
            onChange={(e) => update({ addressLine2: e.target.value })}
            onBlur={commit}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="city" label="City" required>
            <Input
              id="city"
              value={state.city}
              onChange={(e) => update({ city: e.target.value })}
              onBlur={commit}
            />
          </Field>
          <Field id="state" label="State" required>
            <Input
              id="state"
              placeholder="CA"
              maxLength={2}
              value={state.state}
              onChange={(e) => update({ state: e.target.value.toUpperCase() })}
              onBlur={commit}
            />
          </Field>
          <Field id="postalCode" label="ZIP" required>
            <Input
              id="postalCode"
              value={state.postalCode}
              onChange={(e) => update({ postalCode: e.target.value })}
              onBlur={commit}
            />
          </Field>
          <Field id="country" label="Country" required>
            <Input
              id="country"
              value={state.country}
              onChange={(e) => update({ country: e.target.value.toUpperCase() })}
              onBlur={commit}
            />
          </Field>
        </div>
      </section>

      {/* Documents */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-zinc-900">Verification documents</h3>
        <p className="-mt-2 text-sm text-zinc-500">
          PDF, PNG, JPEG, or WebP — up to 20&nbsp;MB each. Files are stored privately on
          Cloudflare R2 and only seen by the iLaunchify admin reviewing your application.
        </p>

        <FileUploadSlot
          label="Certificate of incorporation"
          description="Articles of incorporation or business registration document."
          sectionType="BUSINESS"
          kind="CERT_OF_INCORPORATION"
          existingFiles={filesByKind.get('CERT_OF_INCORPORATION') ?? []}
          required
        />
        <FileUploadSlot
          label="Business license"
          description="State or county business operating license."
          sectionType="BUSINESS"
          kind="BUSINESS_LICENSE"
          existingFiles={filesByKind.get('BUSINESS_LICENSE') ?? []}
          required
        />
        <FileUploadSlot
          label="General liability insurance"
          description="Current Certificate of Insurance (COI) showing $1M+ general liability coverage."
          sectionType="BUSINESS"
          kind="INSURANCE"
          existingFiles={filesByKind.get('INSURANCE') ?? []}
          required
        />
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-zinc-900">
          {label}
        </Label>
        {required && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-red-600">
            Required
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const display = pending ? 'saving' : status
  const text = { saving: 'Saving…', saved: '✓ Saved', error: '⚠ Save failed', idle: '' }[display]
  const cls = {
    saving: 'text-zinc-500',
    saved: 'text-emerald-600',
    error: 'text-red-600',
    idle: '',
  }[display]
  return <span className={`text-xs ${cls}`}>{text}</span>
}

function humanizeError(code: string): string {
  switch (code) {
    case 'NOT_A_PARTNER':
      return 'Sign in with a partner account.'
    case 'PARTNER_NOT_FOUND':
      return 'Your partner record is missing — contact support.'
    case 'NAME_REQUIRED':
      return 'Company name and legal name are required.'
    default:
      return `Save failed (${code}).`
  }
}
