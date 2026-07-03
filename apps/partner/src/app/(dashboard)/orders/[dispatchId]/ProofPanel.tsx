'use client'

// Proof-round panel for LABEL dispatches (P2, D3). Upload a versioned proof;
// each round shows its creator decision. The READY gate is server-enforced in
// markReady — this panel is the workflow surface.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileImage, Upload, CircleCheck, CircleX, Clock } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { uploadProofRound } from './proof-actions'

export interface ProofRoundView {
  id: string
  version: number
  filename: string
  status: string
  annotation: string | null
  createdAt: string
  decidedAt: string | null
  url: string
}

export function ProofPanel({
  dispatchId,
  required,
  rounds,
  canUpload,
}: {
  dispatchId: string
  required: boolean
  rounds: ProofRoundView[]
  canUpload: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const latest = rounds[0] ?? null
  const approved = rounds.some((r) => r.status === 'APPROVED')
  const awaitingCreator = latest?.status === 'PENDING'
  const showUpload = canUpload && !approved && !awaitingCreator

  function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('dispatchId', dispatchId)
        fd.set('file', file)
        const r = await uploadProofRound(fd)
        if (!r.ok) toast.error(r.error)
        else {
          toast.success('Proof sent to the creator for approval')
          router.refresh()
        }
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <FileImage className="h-4 w-4 text-ink-500" aria-hidden="true" /> Pre-production proof
        {required && !approved && (
          <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-pink-700">
            Required before ready
          </span>
        )}
      </h2>
      <p className="mt-1 text-[12px] text-ink-600">
        {required
          ? 'First job for this creator — production can be marked ready only after they approve a proof.'
          : 'Optional for this job — the creator has worked with you before.'}
      </p>

      {rounds.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-50 rounded-xl border border-ink-100">
          {rounds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
              {r.status === 'APPROVED' ? (
                <CircleCheck className="h-4 w-4 shrink-0 text-success-500" aria-hidden="true" />
              ) : r.status === 'REJECTED' ? (
                <CircleX className="h-4 w-4 shrink-0 text-danger-500" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 shrink-0 text-warning-500" aria-hidden="true" />
              )}
              <span className="font-medium text-ink-900">v{r.version}</span>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-ink-700 underline decoration-ink-300 underline-offset-2 hover:text-ink-900"
              >
                {r.filename}
              </a>
              <span
                className={cn(
                  'ml-auto text-[12px] font-medium',
                  r.status === 'APPROVED'
                    ? 'text-success-700'
                    : r.status === 'REJECTED'
                      ? 'text-danger-600'
                      : 'text-warning-700',
                )}
              >
                {r.status === 'PENDING' ? 'Awaiting creator' : r.status.toLowerCase()}
              </span>
              {r.annotation && (
                <p className="basis-full text-[12px] text-ink-600">Creator: “{r.annotation}”</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {showUpload && (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
            disabled={busy || isPending}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {busy || isPending ? 'Uploading…' : rounds.length > 0 ? `Upload proof v${(latest?.version ?? 0) + 1}` : 'Upload proof'}
          </button>
        </div>
      )}
      {awaitingCreator && (
        <p className="mt-3 text-[12.5px] text-ink-500">
          Waiting on the creator — you&apos;ll be notified the moment they decide.
        </p>
      )}
    </section>
  )
}
