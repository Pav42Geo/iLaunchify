'use client'

// Refund requests on a ticket (docs/ADMIN_RBAC.md P3). Agents propose; leads
// approve/reject inline. Server actions live in ../refund-requests/actions.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, Check, X } from 'lucide-react'
import { proposeRefund, approveRefund, rejectRefund } from '../refund-requests/actions'

export type RefundRequestView = {
  id: string
  amountCents: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decisionNote: string | null
}

const PILL: Record<RefundRequestView['status'], string> = {
  PENDING: 'border-warning-200 bg-warning-50 text-warning-800',
  APPROVED: 'border-success-200 bg-success-50 text-success-800',
  REJECTED: 'border-danger-200 bg-danger-50 text-danger-800',
}

export function RefundPanel({
  orderId,
  ticketId,
  requests,
  canPropose,
  canApprove,
}: {
  orderId: string
  ticketId: string
  requests: RefundRequestView[]
  canPropose: boolean
  canApprove: boolean
}) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const hasPending = requests.some((r) => r.status === 'PENDING')

  function submit() {
    const dollars = Number(amount)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter an amount greater than zero.')
      return
    }
    if (reason.trim().length < 5) {
      toast.error('Add a short reason.')
      return
    }
    start(async () => {
      const r = await proposeRefund({
        orderId,
        ticketId,
        amountCents: Math.round(dollars * 100),
        reason: reason.trim(),
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Refund requested — pending approval.')
      setAmount('')
      setReason('')
      router.refresh()
    })
  }

  function decide(id: string, kind: 'approve' | 'reject') {
    if (kind === 'approve' && !window.confirm('Approve this refund? Runs the refund if enabled.')) return
    const note = kind === 'reject' ? window.prompt('Reason for rejecting (optional):') ?? undefined : undefined
    start(async () => {
      const r = kind === 'approve' ? await approveRefund({ id }) : await rejectRefund({ id, note })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(kind === 'approve' ? 'Refund approved.' : 'Request rejected.')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-800">
        <RotateCcw className="h-3.5 w-3.5 text-ink-400" /> Refund requests
      </h2>

      {requests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[14px] font-bold tabular-nums text-ink-900">${(r.amountCents / 100).toFixed(2)}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider ${PILL[r.status]}`}>
                    {r.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-600">{r.reason}</p>
                {r.decisionNote && <p className="mt-0.5 text-[11px] text-ink-400">Note: {r.decisionNote}</p>}
              </div>
              {canApprove && r.status === 'PENDING' && (
                <div className="flex flex-none gap-1.5">
                  <button type="button" disabled={pending} onClick={() => decide(r.id, 'approve')} className="inline-flex items-center gap-1 rounded-full bg-success-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-success-700 disabled:opacity-50">
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button type="button" disabled={pending} onClick={() => decide(r.id, 'reject')} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50">
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canPropose && !hasPending && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-ink-100 pt-3">
          <label className="text-[11.5px] text-ink-600">
            <span className="mb-1 block font-medium">Amount ($)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-24 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
          <label className="min-w-[180px] flex-1 text-[11.5px] text-ink-600">
            <span className="mb-1 block font-medium">Reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why a refund / credit is warranted"
              className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
          >
            Request refund
          </button>
        </div>
      )}

      {canPropose && hasPending && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">A refund request is already pending approval.</p>
      )}
    </section>
  )
}
