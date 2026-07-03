'use client'

// Creator proof-approval panel (P2 proof loop, D3). Renders when the order's
// print job has proof rounds; the PENDING round gets approve/reject controls.
// Approval is final and unblocks the printer; rejection requires a note.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileImage, CircleCheck, CircleX, Clock } from 'lucide-react'
import { decideProofRound } from './proof-actions'

export interface CreatorProofRoundView {
  id: string
  version: number
  filename: string
  status: string
  annotation: string | null
  createdAt: string
}

export function ProofApprovalPanel({ rounds }: { rounds: CreatorProofRoundView[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const pending = rounds.find((r) => r.status === 'PENDING') ?? null

  async function decide(approve: boolean) {
    if (!pending) return
    setBusy(true)
    try {
      const r = await decideProofRound({ roundId: pending.id, approve, annotation: note })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(approve ? 'Proof approved — the printer can proceed' : 'Changes requested — the printer will upload a new proof')
      setNote('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <FileImage className="h-4 w-4 text-ink-500" aria-hidden="true" /> Print proof approval
        {pending && (
          <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-pink-700">
            Needs your decision
          </span>
        )}
      </h2>
      <p className="mt-1 text-[12px] text-ink-600">
        Your print partner&apos;s pre-production proof. Production waits for your approval —
        check colors, text, and the die-cut carefully; approval is final for this run.
      </p>

      <ul className="mt-4 divide-y divide-ink-50 rounded-lg border border-ink-100">
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
              href={`/api/proof-file/${r.id}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-ink-700 underline decoration-ink-300 underline-offset-2 hover:text-ink-900"
            >
              {r.filename}
            </a>
            <span className="ml-auto text-[12px] text-ink-500">
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
            {r.annotation && r.status === 'REJECTED' && (
              <p className="basis-full text-[12px] text-ink-600">Your note: “{r.annotation}”</p>
            )}
          </li>
        ))}
      </ul>

      {pending && (
        <div className="mt-4 space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Notes for the printer (required if requesting changes)"
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy || note.trim().length === 0}
              onClick={() => decide(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12.5px] font-medium text-ink-700 transition-colors hover:border-danger-300 hover:text-danger-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <CircleX className="h-3.5 w-3.5" aria-hidden="true" /> Request changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <CircleCheck className="h-4 w-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Approve proof'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
