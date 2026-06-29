'use client'

// Picker + inline claim form for adding a new certification.
// User clicks a cert-type card; the form expands inline with fields
// (issuing body, cert number, dates, PDF upload). Submit fires claimCertificate.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Upload, FileText, X } from 'lucide-react'
import { claimCertificate } from './actions'
import { CERT_UPLOAD_CONSENT_TEXT } from './consent'

interface CertTypeOption {
  id: string
  name: string
  slug: string
  description: string
}

export function CertificationsClient({ availableTypes }: { availableTypes: CertTypeOption[] }) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const selected = availableTypes.find((t) => t.id === selectedTypeId) ?? null

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {availableTypes.map((t) => {
          const isSelected = t.id === selectedTypeId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTypeId(isSelected ? null : t.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-ink-900 bg-ink-900/[0.04] ring-1 ring-ink-900'
                  : 'border-ink-200 bg-white hover:border-ink-400'
              }`}
            >
              <div className="font-medium text-ink-900">{t.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-ink-500">{t.description}</div>
            </button>
          )
        })}
      </div>

      {selected && (
        <ClaimForm
          certType={selected}
          onClose={() => setSelectedTypeId(null)}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Claim form
// -----------------------------------------------------------------------------

function ClaimForm({ certType, onClose }: { certType: CertTypeOption; onClose: () => void }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [issuingBody, setIssuingBody] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!file) {
      setError('Upload the certificate PDF.')
      return
    }
    if (!expiryDate) {
      setError('Expiry date is required.')
      return
    }
    if (!consent) {
      setError('Please confirm the upload consent.')
      return
    }

    const fd = new FormData()
    fd.set('certificateTypeId', certType.id)
    fd.set('issuingBody', issuingBody)
    fd.set('certificateNumber', certificateNumber)
    fd.set('issueDate', issueDate)
    fd.set('expiryDate', expiryDate)
    fd.set('notes', notes)
    fd.set('file', file)
    fd.set('consent', consent ? 'true' : 'false')

    startTransition(async () => {
      const result = await claimCertificate(fd)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`${certType.name} submitted for review`)
      onClose()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-ink-200 bg-[var(--bg-hero)]/60 p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-ink-900">Claim {certType.name}</h3>
          <p className="mt-0.5 text-ui-caption text-ink-500">{certType.description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-700"
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Issuing body" hint="e.g. NSF International, Orthodox Union (OU)">
          <Input
            value={issuingBody}
            onChange={(e) => setIssuingBody(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Certificate number" hint="From your PDF">
          <Input
            value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Issue date">
          <Input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Expiry date" required>
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            required
            disabled={isPending}
          />
        </Field>
      </div>

      <Field label="Notes for admin (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          disabled={isPending}
        />
      </Field>

      {/* PDF upload */}
      <Field label="Certificate PDF" required>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={isPending}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-400"
          disabled={isPending}
        >
          {file ? (
            <>
              <FileText className="h-5 w-5 text-pink-700" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-900">{file.name}</div>
                <div className="text-ui-caption text-ink-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <span className="text-xs font-medium text-pink-700">Click to change</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-ink-400" />
              <div className="text-sm text-ink-600">
                <span className="font-medium text-ink-900">Upload PDF</span>
                <span className="ml-1 text-xs">up to 20 MB · PDF / PNG / JPEG / WebP</span>
              </div>
            </>
          )}
        </button>
        <p className="mt-1 text-ui-caption text-ink-500">
          📎 Private — only iLaunchify admin sees the PDF. Public pages show only the verified
          badge.
        </p>
      </Field>

      <label className="flex items-start gap-2 rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
        />
        <span>{CERT_UPLOAD_CONSENT_TEXT}</span>
      </label>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || !file || !expiryDate || !consent}
          className="bg-ink-900 hover:bg-ink-700"
        >
          {isPending ? 'Submitting…' : 'Submit for review'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-ink-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-danger-600">
            Required
          </span>
        )}
      </Label>
      {hint && <p className="text-ui-caption text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}
