'use client'

// REBUILD R16.b — Creator table client wrapper.
//
// Wraps the existing read-only CreatorsTable shape with:
//   - a leading checkbox column + header-checkbox for select-all-visible
//   - a sticky BulkTierActions bar above the table when ≥1 selected
//   - server-action wiring through bulkChangeCreatorTier
//
// The server-side CreatorsTab now just renders <CreatorsBulkTable rows={…} />
// and the rest of the page stays untouched.

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { CREATOR_TIER_STYLE, tierPillStyle } from './tier-style'
import { BulkTierActions } from './BulkTierActions'
import { bulkChangeCreatorTier } from './actions'

interface CreatorRow {
  id: string
  displayName: string
  handle: string
  subscriptionTier: 'MAKER' | 'BUILDER' | 'AGENCY'
  tierChangedAt: Date | string | null
  feeRateOverrideBp: number | null
  feeRateOverrideReason: string | null
  email: string
  brandCount: number
}

interface Props {
  rows: CreatorRow[]
}

const TIER_OPTIONS = [
  { value: 'MAKER' as const, label: 'Maker' },
  { value: 'BUILDER' as const, label: 'Builder' },
  { value: 'AGENCY' as const, label: 'Agency' },
]

export function CreatorsBulkTable({ rows }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = !allOnPageSelected && rows.some((r) => selected.has(r.id))

  const toggleAll = () => {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev)
        for (const r of rows) next.delete(r.id)
        return next
      }
      const next = new Set(prev)
      for (const r of rows) next.add(r.id)
      return next
    })
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearAll = () => setSelected(new Set())

  return (
    <div className="space-y-3">
      <BulkTierActions
        selectedCount={selected.size}
        tierOptions={TIER_OPTIONS}
        subject="creator"
        onClear={clearAll}
        onApply={(newTier, reason) =>
          bulkChangeCreatorTier({
            creatorProfileIds: Array.from(selected),
            newTier,
            reason,
          })
        }
      />

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50 text-left text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 w-[34px]">
                <input
                  type="checkbox"
                  aria-label="Select all visible creators"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    // Indeterminate state for partial selection.
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-pink-600"
                />
              </th>
              <th className="px-4 py-2.5">Creator</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Tier</th>
              <th className="px-4 py-2.5">Fee override</th>
              <th className="px-4 py-2.5">Brands</th>
              <th className="px-4 py-2.5">Last change</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const palette = CREATOR_TIER_STYLE[r.subscriptionTier]
              const isSelected = selected.has(r.id)
              return (
                <tr
                  key={r.id}
                  className={
                    'hover:bg-zinc-50/60 ' + (isSelected ? 'bg-pink-50/40' : '')
                  }
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.displayName}`}
                      checked={isSelected}
                      onChange={() => toggleRow(r.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-pink-600"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-zinc-900">{r.displayName}</div>
                    <div className="text-[11.5px] text-zinc-500">@{r.handle}</div>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{r.email}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
                      style={tierPillStyle(palette)}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: palette.dot }}
                      />
                      {palette.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.feeRateOverrideBp != null ? (
                      <span
                        className="inline-flex items-center gap-1 text-[12px] text-amber-800"
                        title={r.feeRateOverrideReason ?? ''}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {(r.feeRateOverrideBp / 100).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{r.brandCount}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                    {r.tierChangedAt
                      ? new Date(r.tierChangedAt).toLocaleDateString()
                      : 'Never changed'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/tiers/creator/${r.id}`}
                      className="text-[11.5px] font-medium text-pink-700 hover:text-pink-900"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
