'use client'

// REBUILD R16.b — sticky bulk-action bar.
//
// Appears above the table when ≥1 row is selected. Generic over the tier
// shape so both Creator (MAKER/BUILDER/AGENCY) and Partner (VERIFIED/
// TRUSTED/PREMIER) tables share the same component. The server action
// itself is parameterized by `onApply` — the caller passes a typed
// closure that calls bulkChangeCreatorTier or bulkChangePartnerTier.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button, Input } from '@ilaunchify/ui'
import { ArrowRight, X } from 'lucide-react'

type Result =
  | { ok: true; changedCount: number; skipped: number }
  | { ok: false; error: string }

interface Props<TierValue extends string> {
  /** How many rows are currently selected (drives the headline). */
  selectedCount: number
  /** Tier options to render in the picker — value used by the action. */
  tierOptions: Array<{ value: TierValue; label: string }>
  /** Server action — invoked with the chosen tier + reason. */
  onApply: (newTier: TierValue, reason: string) => Promise<Result>
  /** Clear-selection handler from the parent table. */
  onClear: () => void
  /** Subject noun for copy ("creator" / "partner"). */
  subject: 'creator' | 'partner'
}

export function BulkTierActions<TierValue extends string>({
  selectedCount,
  tierOptions,
  onApply,
  onClear,
  subject,
}: Props<TierValue>) {
  const [newTier, setNewTier] = useState<TierValue | ''>('')
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  if (selectedCount === 0) return null

  const handleApply = () => {
    if (!newTier) {
      toast.error('Pick a target tier.')
      return
    }
    if (!reason.trim()) {
      toast.error('A reason is required.')
      return
    }
    startTransition(async () => {
      const res = await onApply(newTier as TierValue, reason.trim())
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const noun = subject === 'creator' ? 'creator' : 'partner'
      const plural = res.changedCount === 1 ? noun : `${noun}s`
      const skippedNote =
        res.skipped > 0
          ? ` · ${res.skipped} skipped (already on tier or missing)`
          : ''
      toast.success(`Updated ${res.changedCount} ${plural}${skippedNote}`)
      setReason('')
      setNewTier('')
      onClear()
    })
  }

  return (
    <div
      role="region"
      aria-label={`Bulk ${subject} tier actions`}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-pink-200 bg-gradient-to-r from-pink-50 to-white px-4 py-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-pink-100 px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wider text-pink-700">
          {selectedCount}
        </span>
        <span className="text-[12.5px] font-medium text-zinc-700">
          {subject}
          {selectedCount === 1 ? '' : 's'} selected
        </span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <label className="sr-only" htmlFor="bulk-tier-pick">
          Target tier
        </label>
        <select
          id="bulk-tier-pick"
          value={newTier}
          onChange={(e) => setNewTier(e.target.value as TierValue | '')}
          disabled={pending}
          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-[12.5px] text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 disabled:opacity-50"
        >
          <option value="">Promote / demote to…</option>
          {tierOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="bulk-tier-reason">
          Reason
        </label>
        <Input
          id="bulk-tier-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — logged to audit"
          disabled={pending}
          className="h-8 min-w-[240px] text-[12.5px]"
        />

        <Button
          type="button"
          variant="pink"
          size="sm"
          onClick={handleApply}
          disabled={pending || !newTier || !reason.trim()}
          className="h-8 text-[12.5px]"
        >
          {pending ? 'Applying…' : 'Apply'}
        </Button>

        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
