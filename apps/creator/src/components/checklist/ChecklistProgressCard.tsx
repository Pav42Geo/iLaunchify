'use client'

// Surfaces the REAL Launch Checklist progress on the first-run Dashboard hub and
// routes into the canonical drawer — so the hub and the drawer share ONE checklist
// (no duplicate step list). Reads the same snapshot the drawer + sidebar badge use.
// See docs/CREATOR_FIRST_RUN_PROPOSAL.md (checklist reconciliation, 2026-06-26).

import { Rocket, ArrowRight } from 'lucide-react'
import {
  useLaunchChecklist,
  computeChecklistCompletion,
} from './LaunchChecklistProvider'

const TOTAL_STEPS = 5

export function ChecklistProgressCard() {
  const { snapshot, open } = useLaunchChecklist()
  const completion = computeChecklistCompletion(snapshot)
  const done = Object.values(completion).filter(Boolean).length
  const pct = Math.round((done / TOTAL_STEPS) * 100)
  const allDone = done >= TOTAL_STEPS

  if (allDone) return null

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
          <Rocket className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink-900">Finish setting up your account</p>
          <p className="text-[12px] text-ink-500">
            Markets, payment, sales channel &amp; brand · {done} of {TOTAL_STEPS} done
          </p>
        </div>
        <button
          type="button"
          onClick={open}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          {done === 0 ? 'Start setup' : 'Continue setup'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 h-[5px] overflow-hidden rounded-pill bg-ink-100">
        <div className="h-full rounded-pill bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
