'use client'

// Support-restore button (versioning v2 Phase 4). Double-confirm: this mutates
// a creator's working design. Server side is tickets:admin-gated + audited +
// labeled in the creator's drawer; agents without the capability get bounced
// by the guard (button stays visible — the guard is the authority).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw } from 'lucide-react'
import { supportRestoreSnapshot } from './actions'

export function RestoreButton({ designId, snapshotId }: { designId: string; snapshotId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleClick = async () => {
    if (
      !window.confirm(
        'Restore this version into the creator’s working design?\n\nThis is audited and will appear as “Restored by iLaunchify support” in their version history. The current state is pinned first, so nothing is lost.',
      )
    )
      return
    setBusy(true)
    setError(null)
    const res = await supportRestoreSnapshot(designId, snapshotId)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        Restore
      </button>
      {error && <span className="max-w-[200px] text-right text-[10px] text-danger-600">{error}</span>}
    </span>
  )
}
