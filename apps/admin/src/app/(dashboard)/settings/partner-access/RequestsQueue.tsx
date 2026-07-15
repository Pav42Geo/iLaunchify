'use client'

// Inbox: partner Access request queue. Approve (writes ALLOW override) or deny.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md phase-2 request queue.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { PartnerAccessRequestRow } from '@ilaunchify/db'
import { LEVERS } from '../../partners/[partnerId]/access/lever-meta'
import { decidePartnerAccessRequest } from './request-actions'

const leverLabel = (lever: string) => LEVERS.find((l) => l.lever === lever)?.label ?? lever

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'PENDING'
      ? 'border-warning-200 bg-warning-50 text-warning-800'
      : status === 'APPROVED'
        ? 'border-success-200 bg-success-50 text-success-800'
        : 'border-ink-200 bg-ink-50 text-ink-500'
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ' +
        cls
      }
    >
      {status}
    </span>
  )
}

function DecideButtons({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  function decide(decision: 'APPROVE' | 'DENY') {
    start(async () => {
      const r = await decidePartnerAccessRequest({ requestId, decision })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(decision === 'APPROVE' ? 'Request approved.' : 'Request denied.')
      setDone(true)
    })
  }

  if (done) return <span className="text-[12px] text-ink-400">Decided</span>

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => decide('DENY')}
        disabled={pending}
        className="rounded-full border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
      >
        Deny
      </button>
      <button
        type="button"
        onClick={() => decide('APPROVE')}
        disabled={pending}
        className="rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Approve'}
      </button>
    </div>
  )
}

export function RequestsQueue({ rows }: { rows: PartnerAccessRequestRow[] }) {
  const pending = rows.filter((r) => r.status === 'PENDING')
  const decided = rows.filter((r) => r.status !== 'PENDING')

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
        <div className="text-[14px] font-semibold text-ink-700">No access requests</div>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-500">
          When a partner asks to unlock a locked opportunity (print rotation, nomination,
          brief intake…), it lands here for approval. Approving writes an “Allow” override on
          their Access tab.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-ink-500">
        Partners request a locked lever; approving writes an <strong>Allow</strong> override on
        their Access tab (denying leaves it inherited). {pending.length} pending.
      </p>
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-[11.5px] uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-semibold">Partner</th>
              <th className="px-4 py-3 font-semibold">Requested lever</th>
              <th className="px-4 py-3 font-semibold">Note</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Decision</th>
            </tr>
          </thead>
          <tbody>
            {[...pending, ...decided].map((r) => (
              <tr key={r.id} className="border-b border-ink-100 last:border-b-0 align-top">
                <td className="px-4 py-3">
                  <Link
                    href={`/partners/${r.partnerId}/access`}
                    className="font-semibold text-ink-900 hover:text-pink-700 hover:underline"
                  >
                    {r.companyName}
                  </Link>
                  <div className="mt-0.5 text-[11px] text-ink-400">
                    {r.createdAt.toLocaleDateString()}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-ink-900">{leverLabel(r.lever)}</span>
                  {r.requested && (
                    <span className="ml-1 text-ink-500">→ {r.requested}</span>
                  )}
                </td>
                <td className="px-4 py-3 max-w-xs text-ink-600">{r.note || '(none)'}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-3">
                  {r.status === 'PENDING' ? (
                    <DecideButtons requestId={r.id} />
                  ) : (
                    <span className="block text-right text-[12px] text-ink-400">
                      {r.decidedAt ? r.decidedAt.toLocaleDateString() : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
