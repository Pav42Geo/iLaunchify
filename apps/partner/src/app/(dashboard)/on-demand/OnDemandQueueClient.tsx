'use client'

// On-demand review queue client (C2.3): approve (with optional daily capacity),
// decline (with note), suspend previously enabled products.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, PauseCircle, Loader2, Factory } from 'lucide-react'
import { decideOnDemandEnablement, suspendOnDemandEnablement, type OnDemandRequestRow } from './actions'

const STATUS_TONE: Record<string, string> = {
  REQUESTED: 'bg-info-50 text-info-700',
  PARTNER_REVIEW: 'bg-info-50 text-info-700',
  ENABLED: 'bg-success-50 text-success-700',
  DECLINED: 'bg-danger-50 text-danger-700',
  SUSPENDED: 'bg-warning-50 text-warning-700',
}

export function OnDemandQueueClient({
  pending,
  decided,
  migrated,
}: {
  pending: OnDemandRequestRow[]
  decided: OnDemandRequestRow[]
  migrated: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3600)
  }

  async function decide(row: OnDemandRequestRow, decision: 'ENABLED' | 'DECLINED') {
    let note: string | undefined
    let capacity: number | null = null
    if (decision === 'DECLINED') {
      note = window.prompt(`Decline "${row.productName}" — add a short reason for the creator:`) ?? undefined
      if (note === undefined) return // cancelled
    } else {
      const cap = window.prompt('Optional: max on-demand units per day (leave empty for no cap):', '')
      if (cap === null) return
      capacity = cap.trim() === '' ? null : Number(cap)
      if (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0)) {
        flash('Capacity must be a positive number (or empty).')
        return
      }
    }
    setBusyId(row.id)
    try {
      const res = await decideOnDemandEnablement({ enablementId: row.id, decision, note, capacityPerDay: capacity })
      flash(res.ok ? (decision === 'ENABLED' ? `${row.productName} enabled for on-demand.` : 'Request declined.') : res.error)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function suspend(row: OnDemandRequestRow) {
    const ok = window.confirm(`Pause on-demand for "${row.productName}"? New consumer orders will hold until re-enabled.`)
    if (!ok) return
    setBusyId(row.id)
    try {
      const res = await suspendOnDemandEnablement(row.id)
      flash(res.ok ? 'On-demand paused.' : res.error)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      {!migrated && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-800">
          On-demand tables aren’t migrated yet — run <code>pnpm db:push</code> to activate this queue.
        </div>
      )}
      {notice && <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-[12.5px] font-medium text-pink-900">{notice}</div>}

      <section className="space-y-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">Awaiting your review ({pending.length})</h2>
        {pending.map((r) => (
          <div key={r.id} className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">{r.productName}</p>
                <p className="truncate text-[11.5px] text-ink-500">
                  {r.creatorLabel} · requested {new Date(r.requestedAtIso).toLocaleDateString()}
                  {r.snapshotSummary ? ` · ${r.snapshotSummary}` : ''}
                </p>
                {/* Frozen branding under review (Pavel 2026-07-22): approving
                    locks THIS design. No design yet = say so, never a blank. */}
                {r.designLabel ? (
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-600">
                    {r.designLabel}
                    {r.designUrl && (
                      <>
                        {' · '}
                        <a
                          href={r.designUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-semibold text-pink-700 hover:underline"
                        >
                          View label PDF
                        </a>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-[11.5px] text-warning-700">
                    No label design attached yet: you are approving branding sight-unseen.
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${STATUS_TONE[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void decide(r, 'ENABLED')}
                disabled={busyId === r.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
              >
                {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Enable on-demand
              </button>
              <button
                onClick={() => void decide(r, 'DECLINED')}
                disabled={busyId === r.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:border-ink-400 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Decline
              </button>
            </div>
          </div>
        ))}
        {pending.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-[12.5px] text-ink-500">
            <Factory className="mx-auto mb-1.5 h-4 w-4 text-ink-300" />
            No pending requests.
          </p>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">Decided</h2>
          {decided.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-ink-900">{r.productName}</p>
                <p className="truncate text-[11px] text-ink-500">
                  {r.creatorLabel}
                  {r.capacityPerDay ? ` · cap ${r.capacityPerDay}/day` : ''}
                  {r.partnerNote ? ` · “${r.partnerNote}”` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${STATUS_TONE[r.status]}`}>{r.status}</span>
                {r.status === 'ENABLED' && (
                  <button
                    onClick={() => void suspend(r)}
                    disabled={busyId === r.id}
                    title="Pause on-demand for this product"
                    className="rounded-full border border-ink-200 p-1 text-ink-400 hover:border-ink-400 hover:text-ink-700 disabled:opacity-50"
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
