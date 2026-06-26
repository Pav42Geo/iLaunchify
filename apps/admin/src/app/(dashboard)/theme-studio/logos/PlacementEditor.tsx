'use client'

// Per-header logo placement editor (Phase D2). For each surface: pick the full
// lockup vs the compact mark, and set/clear an optional sublabel ("Admin Mode",
// "Business", a Studio name…). Empty sublabel removes the text entirely.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { savePlatformLogoPlacement } from './actions'

type Row = { key: string; label: string; kind: 'full' | 'mark'; sublabel: string }

export function PlacementEditor({ rows }: { rows: Row[] }) {
  return (
    <div className="divide-y divide-ink-100">
      {rows.map((r) => (
        <PlacementRow key={r.key} row={r} />
      ))}
    </div>
  )
}

function PlacementRow({ row }: { row: Row }) {
  const router = useRouter()
  const [kind, setKind] = useState<'full' | 'mark'>(row.kind)
  const [sublabel, setSublabel] = useState(row.sublabel)
  const [pending, start] = useTransition()
  const dirty = kind !== row.kind || sublabel !== row.sublabel

  function save() {
    start(async () => {
      const res = await savePlatformLogoPlacement(row.key, kind, sublabel)
      if (res.ok) {
        toast.success(`${row.label} updated`)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-[180px] flex-1 text-[length:var(--fs-sm)] font-medium text-ink-800">{row.label}</span>

      {/* Full / Mark segmented toggle */}
      <div className="inline-flex overflow-hidden rounded-pill border border-ink-300">
        {(['full', 'mark'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-3 py-1 text-[length:var(--fs-xs)] font-semibold capitalize ${kind === k ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'}`}
          >
            {k === 'full' ? 'Full lockup' : 'Mark only'}
          </button>
        ))}
      </div>

      {/* Sublabel free text (empty = no label) */}
      <input
        value={sublabel}
        onChange={(e) => setSublabel(e.target.value)}
        placeholder="Sublabel (optional)"
        className="h-9 w-44 rounded-[var(--input-radius)] border border-[var(--border-soft)] bg-[var(--input-bg)] px-3 text-[length:var(--fs-sm)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--input-focus)]"
      />

      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="rounded-pill bg-pink-500 px-3 py-1.5 text-[length:var(--fs-xs)] font-semibold text-white hover:bg-pink-600 disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
