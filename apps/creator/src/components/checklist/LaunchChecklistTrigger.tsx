'use client'

// "Launch Checklist (N)" sidebar nav item. Hidden when no pending items.
// Clicking opens the drawer (state lives in LaunchChecklistProvider).

import { Rocket } from 'lucide-react'
import { pendingChecklistCount, useLaunchChecklist } from './LaunchChecklistProvider'

export function LaunchChecklistTrigger() {
  const { open, snapshot } = useLaunchChecklist()
  const pending = pendingChecklistCount(snapshot)

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      <Rocket className="h-4 w-4" />
      <span className="flex-1 text-left">Launch Checklist</span>
      {pending > 0 && (
        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
          {pending}
        </span>
      )}
    </button>
  )
}
