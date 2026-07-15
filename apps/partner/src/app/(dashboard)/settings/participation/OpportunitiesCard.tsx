'use client'

// Partner-side marketplace opportunities: shows which Group B opportunities are
// active, locked (requestable), or blocked by a prerequisite the partner must
// resolve. "Request access" files a PartnerAccessRequest to the admin Inbox.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md (phase-2 request queue).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { PartnerAccessLever } from '@ilaunchify/auth'
import { requestPartnerAccess } from './opportunity-actions'

export type OpportunityState = 'active' | 'requestable' | 'blocked'

export interface OpportunityRow {
  lever: PartnerAccessLever
  label: string
  desc: string
  state: OpportunityState
  blockedReason?: string
  hasPending: boolean
}

function StatusPill({ state, hasPending }: { state: OpportunityState; hasPending: boolean }) {
  if (state === 'active') {
    return (
      <span className="inline-flex items-center rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success-800">
        Active
      </span>
    )
  }
  if (hasPending) {
    return (
      <span className="inline-flex items-center rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warning-800">
        Requested
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
      Locked
    </span>
  )
}

function RequestButton({ lever }: { lever: PartnerAccessLever }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  function submit() {
    start(async () => {
      const r = await requestPartnerAccess({ lever })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Request sent. Our team will review it shortly.')
      setDone(true)
    })
  }

  if (done) return <span className="text-[12px] font-semibold text-warning-800">Requested</span>

  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className="rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
    >
      {pending ? 'Sending…' : 'Request access'}
    </button>
  )
}

export function OpportunitiesCard({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="font-display text-[15px] font-bold text-ink-900">Marketplace opportunities</div>
      <p className="mb-3 mt-1 max-w-2xl text-[12.5px] text-ink-500">
        Opportunities you are eligible for. Locked ones can be requested; our team reviews each
        request. Some require a prerequisite you control (shown inline).
      </p>
      <div>
        {rows.map((r) => (
          <div
            key={r.lever}
            className="flex items-center justify-between gap-4 border-b border-ink-100 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink-900">{r.label}</span>
                <StatusPill state={r.state} hasPending={r.hasPending} />
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-500">
                {r.state === 'blocked' && r.blockedReason ? r.blockedReason : r.desc}
              </div>
            </div>
            {r.state === 'requestable' && !r.hasPending && <RequestButton lever={r.lever} />}
          </div>
        ))}
      </div>
    </div>
  )
}
