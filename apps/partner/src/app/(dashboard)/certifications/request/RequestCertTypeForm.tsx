'use client'

// C3 — partner-facing "request a new certificate type" form. Creates a
// CertificateTypeRequest that admins triage in /admin/certificate-requests.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { requestCertificateType } from '../actions'

export function RequestCertTypeForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [issuingBody, setIssuingBody] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('Enter the certificate name.')
      return
    }
    startTransition(async () => {
      const result = await requestCertificateType({ name, issuingBody, description })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success('Request submitted — admin will review it')
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h3 className="mt-2 font-semibold text-zinc-900">Request submitted</h3>
        <p className="mt-1 text-sm text-zinc-600">
          An admin will review <span className="font-medium">{name.trim()}</span> and add it to the
          library if approved. You&apos;ll be able to claim it once it&apos;s live.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setName('')
              setIssuingBody('')
              setDescription('')
              setDone(false)
            }}
          >
            Request another
          </Button>
          <Button type="button" onClick={() => router.push('/certifications')}>
            Back to certifications
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <Field label="Certificate name" required hint="e.g. Regenerative Organic Certified">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Certificate name"
          required
          disabled={isPending}
        />
      </Field>
      <Field label="Issuing body" hint="Who issues / administers it (optional)">
        <Input
          value={issuingBody}
          onChange={(e) => setIssuingBody(e.target.value)}
          placeholder="e.g. Regenerative Organic Alliance"
          disabled={isPending}
        />
      </Field>
      <Field label="What is it for?" hint="A short note helps admin verify it faster (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={isPending}
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/certifications')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || name.trim().length < 2}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Submitting…' : 'Submit request'}
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
