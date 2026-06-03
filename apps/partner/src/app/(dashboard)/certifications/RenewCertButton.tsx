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
import { renewCertificate } from './actions'

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
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <RefreshCw className="h-3 w-3" /> Renewal pending review
      </span>
    )
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-7 border-emerald-300 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="mr-1 h-3 w-3" /> Renew
      </Button>
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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!file) return setError('Upload the renewed certificate PDF.')
    if (!expiryDate) return setError('New expiry date is required.')

    const fd = new FormData()
    fd.set('oldInstanceId', instanceId)
    fd.set('issuingBody', issuingBody)
    fd.set('certificateNumber', certificateNumber)
    fd.set('issueDate', issueDate)
    fd.set('expiryDate', expiryDate)
    fd.set('notes', notes)
    fd.set('file', file)

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
      className="mt-3 space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900">Renew {certName}</h4>
          <p className="mt-0.5 text-xs text-zinc-500">
            Upload the new certificate. Your products keep the old badge until admin verifies
            this — then attachments move over automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-zinc-400 hover:bg-white hover:text-zinc-700"
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
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
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
          className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-zinc-300 bg-white p-3 text-left hover:border-emerald-300"
          disabled={isPending}
        >
          {file ? (
            <>
              <FileText className="h-5 w-5 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">{file.name}</div>
                <div className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <span className="text-xs text-emerald-700">Change</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-zinc-400" />
              <div className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">Upload PDF</span>
                <span className="ml-1 text-xs">up to 20 MB</span>
              </div>
            </>
          )}
        </button>
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || !file || !expiryDate}
          className="bg-emerald-600 hover:bg-emerald-700"
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
      <Label className="text-sm font-medium text-zinc-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">
            Required
          </span>
        )}
      </Label>
      {children}
    </div>
  )
}
