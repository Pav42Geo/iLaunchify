'use client'

// REBUILD R16.b — Partner table client wrapper.
//
// Mirrors CreatorsBulkTable but carries the Partner-specific bits:
//   - service-type label list under the partner name
//   - status pill (the tier-pending lock badge stays on VERIFIED rows
//     whose partner.status isn't ACTIVE yet)
//   - bulkChangePartnerTier server-action wiring
//
// Admin can still bulk-promote not-yet-ACTIVE partners (per R15.c
// decision) — the lock badge is the signal, not a hard block.

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { PARTNER_TIER_STYLE, tierPillStyle } from './tier-style'
import { BulkTierActions } from './BulkTierActions'
import { bulkChangePartnerTier } from './actions'

interface PartnerRow {
  id: string
  companyName: string
  email: string
  status: string
  tier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  tierChangedAt: Date | string | null
  feeRateOverrideBp: number | null
  feeRateOverrideReason: string | null
  serviceLabels: string
}

interface Props {
  rows: PartnerRow[]
}

const TIER_OPTIONS = [
  { value: 'VERIFIED' as const, label: 'Verified' },
  { value: 'TRUSTED' as const, label: 'Trusted' },
  { value: 'PREMIER' as const, label: 'Premier' },
]

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: '#1D9E75', label: 'Active' },
  UNDER_REVIEW: { color: '#BA7517', label: 'Under review' },
  IN_PROGRESS: { color: '#378ADD', label: 'Onboarding' },
  INVITED: { color: '#888780', label: 'Invited' },
  SUSPENDED: { color: '#E24B4A', label: 'Suspended' },
  DRAFT: { color: '#888780', label: 'Draft' },
}

export function PartnersBulkTable({ rows }: Props) {
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
        subject="partner"
        onClear={clearAll}
        onApply={(newTier, reason) =>
          bulkChangePartnerTier({
            partnerIds: Array.from(selected),
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
                  aria-label="Select all visible partners"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-pink-600"
                />
              </th>
              <th className="px-4 py-2.5">Partner</th>
              <th className="px-4 py-2.5">Service type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Tier</th>
              <th className="px-4 py-2.5">Fee override</th>
              <th className="px-4 py-2.5">Last change</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const palette = PARTNER_TIER_STYLE[r.tier]
              const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT!
              const tierPending = r.tier === 'VERIFIED' && r.status !== 'ACTIVE'
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
                      aria-label={`Select ${r.companyName}`}
                      checked={isSelected}
                      onChange={() => toggleRow(r.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-pink-600"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-zinc-900">{r.companyName}</div>
                    <div className="text-[11.5px] text-zinc-500">{r.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                    {r.serviceLabels || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
                      style={{ color: status.color }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: status.color }}
                      />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
                      style={{
                        ...tierPillStyle(palette),
                        opacity: tierPending ? 0.55 : 1,
                      }}
                      title={
                        tierPending
                          ? 'Tier becomes effective once partner status flips to ACTIVE'
                          : undefined
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: palette.dot }}
                      />
                      {palette.label}
                      {tierPending && (
                        <Lock className="ml-0.5 h-2.5 w-2.5" aria-hidden="true" />
                      )}
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
                  <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                    {r.tierChangedAt
                      ? new Date(r.tierChangedAt).toLocaleDateString()
                      : 'Never changed'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/tiers/partner/${r.id}`}
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
