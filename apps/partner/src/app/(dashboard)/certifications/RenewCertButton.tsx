'use client'

// C4 — one-click renewal. Renders a "Renew" button on expired / expiring certs.
// Opens an inline form (fresh PDF + new expiry) that fires renewCertificate,
// which creates a NEW PENDING_REVIEW instance linked to the old one. When admin
// verifies it, product attachments auto-migrate.
//
// Auto-opens when the page is hit with ?renew=<instanceId> (the deep-link in
// the expiry-reminder notification emails).

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Upload, FileText, RefreshCw, X } from 'lucide-react'
import { StPill } from '@/components/panel-kit'
import { renewCertificate } from './actions'
import { CERT_UPLOAD_CONSENT_TEXT } from './consent'

export function RenewCertButton({
  instanceId,
  certName,
  renewalPending,
  autoOpen = false,
}: {
  instanceId: string
  certName: string
  /** True when a renewal instance already exists (old.replacedById set). */
  renewalPending?: boolean
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(autoOpen)

  if (renewalPending) {
    return (
      <StPill tone="warn">
        <RefreshCw aria-hidden="true" /> Renewal pending review
      </StPill>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-600"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" /> Renew
      </button>
    )
  }

  return <RenewForm instanceId={instanceId} certName={certName} onClose={() => setOpen(false)} />
}

function RenewForm({
  instanceId,
  certName,
  onClose,
}: {
  instanceId: string
  certName: string
  onClose: () => void
}) {
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
    if (!file) return setError('Upload the renewed certificate PDF.')
    if (!expiryDate) return setError('New expiry date is required.')
    if (!consent) return setError('Please confirm the upload consent.')

    const fd = new FormData()
    fd.set('oldInstanceId', instanceId)
    fd.set('issuingBody', issuingBody)
    fd.set('certificateNumber', certificateNumber)
    fd.set('issueDate', issueDate)
    fd.set('expiryDate', expiryDate)
    fd.set('notes', notes)
    fd.set('file', file)
    fd.set('consent', consent ? 'true' : 'false')

    startTransition(async () => {
      const result = await renewCertificate(fd)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`${certName} renewal submitted for review`)
      onClose()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-1 w-full space-y-4 rounded-xl border border-ink-200 bg-white p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-ui-value text-ink-900">Renew {certName}</h4>
          <p className="mt-0.5 text-ui-caption text-ink-500">
            Upload the new certificate. Your products keep the old badge until admin verifies
            this — then attachments move over automatically.
          </p>
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
        <Field label="Issuing body">
          <Input value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Certificate number">
          <Input
            value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Issue date">
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="New expiry date" required>
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
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-ink-400 focus:outline-none"
          disabled={isPending}
        />
      </Field>

      <Field label="Renewed certificate PDF" required>
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
          className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-ink-300 bg-white p-3 text-left hover:border-success-300"
          disabled={isPending}
        >
          {file ? (
            <>
              <FileText className="h-5 w-5 text-success-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-900">{file.name}</div>
                <div className="text-ui-caption text-ink-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <span className="text-xs text-success-700">Change</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-ink-400" />
              <div className="text-sm text-ink-600">
                <span className="font-medium text-ink-900">Upload PDF</span>
                <span className="ml-1 text-xs">up to 20 MB</span>
              </div>
            </>
          )}
        </button>
      </Field>

      <label className="flex items-start gap-2 rounded-md border border-ink-200 bg-white p-3 text-xs text-ink-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-success-600 focus:ring-success-500"
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
          className="rounded-full bg-pink-500 text-white hover:bg-pink-600"
        >
          {isPending ? 'Submitting…' : 'Submit renewal'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
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
      {children}
    </div>
  )
}
