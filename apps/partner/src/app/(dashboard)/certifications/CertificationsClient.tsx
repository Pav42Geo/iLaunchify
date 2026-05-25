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
              className={`rounded-md border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
            >
              <div className="font-medium text-zinc-900">{t.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{t.description}</div>
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

    const fd = new FormData()
    fd.set('certificateTypeId', certType.id)
    fd.set('issuingBody', issuingBody)
    fd.set('certificateNumber', certificateNumber)
    fd.set('issueDate', issueDate)
    fd.set('expiryDate', expiryDate)
    fd.set('notes', notes)
    fd.set('file', file)

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
      className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/30 p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900">Claim {certType.name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{certType.description}</p>
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
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
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
          className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-zinc-300 bg-white p-4 text-left hover:border-emerald-300"
          disabled={isPending}
        >
          {file ? (
            <>
              <FileText className="h-5 w-5 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">{file.name}</div>
                <div className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <span className="text-xs text-emerald-700">Click to change</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-zinc-400" />
              <div className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">Upload PDF</span>
                <span className="ml-1 text-xs">up to 20 MB · PDF / PNG / JPEG / WebP</span>
              </div>
            </>
          )}
        </button>
        <p className="mt-1 text-xs text-zinc-500">
          📎 Private — only iLaunchify admin sees the PDF. Public pages show only the verified
          badge.
        </p>
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
      <Label className="text-sm font-medium text-zinc-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">
            Required
          </span>
        )}
      </Label>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}
