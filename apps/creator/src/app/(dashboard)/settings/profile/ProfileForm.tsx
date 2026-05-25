'use client'

// Profile form — markets multi-select + audience-size dropdown.
// Save-on-blur via saveTellUsAboutYou action. Updates the creator's
// CreatorProfile.audienceSizeBand + onboardingProgress.declaredTargetMarketIds.

import { useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import { saveTellUsAboutYou } from '../../_actions/checklist-actions'

interface MarketOption {
  id: string
  code: string
  name: string
  region: string | null
}

interface ProfileFormProps {
  displayName: string
  initialAudienceBand: string | null
  initialMarketIds: string[]
  markets: MarketOption[]
}

const AUDIENCE_BANDS = [
  { value: 'UNDER_10K', label: 'Under 10K' },
  { value: '10K-100K', label: '10K – 100K' },
  { value: '100K-1M', label: '100K – 1M' },
  { value: '1M+', label: '1M+' },
]

export function ProfileForm({
  displayName,
  initialAudienceBand,
  initialMarketIds,
  markets,
}: ProfileFormProps) {
  const [audienceBand, setAudienceBand] = useState(initialAudienceBand ?? '')
  const [marketIds, setMarketIds] = useState<string[]>(initialMarketIds)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit(next: { audienceBand: string; marketIds: string[] }) {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveTellUsAboutYou({
        targetMarketIds: next.marketIds,
        audienceSizeBand: next.audienceBand || null,
      })
      if (result.ok) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
      }
    })
  }

  function toggleMarket(marketId: string) {
    const next = marketIds.includes(marketId)
      ? marketIds.filter((id) => id !== marketId)
      : [...marketIds, marketId]
    setMarketIds(next)
    commit({ audienceBand, marketIds: next })
  }

  function setAudienceAndSave(value: string) {
    setAudienceBand(value)
    commit({ audienceBand: value, marketIds })
  }

  return (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="flex justify-end">
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {/* Display name (read-only — edit lives elsewhere if needed) */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-zinc-900">Display name</Label>
        <Input value={displayName} readOnly className="bg-zinc-50" />
        <p className="text-xs text-zinc-500">Set during signup. Contact support to change.</p>
      </div>

      {/* Markets you sell in */}
      <div className="space-y-2">
        <div>
          <Label className="text-sm font-medium text-zinc-900">Which markets do you sell in?</Label>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pick all that apply. Drives which compliance rule packs run on your labels.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {markets.map((m) => {
            const checked = marketIds.includes(m.id)
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  checked
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMarket(m.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">{m.name}</div>
                  {m.region && <div className="text-xs text-zinc-500">{m.region}</div>}
                </div>
              </label>
            )
          })}
        </div>
        {markets.length === 0 && (
          <p className="text-sm text-zinc-500">
            No markets are currently active. Contact support if you think this is wrong.
          </p>
        )}
      </div>

      {/* Audience size */}
      <div className="space-y-2">
        <div>
          <Label className="text-sm font-medium text-zinc-900">Audience size</Label>
          <p className="mt-0.5 text-xs text-zinc-500">
            Helps us match you with partners sized appropriately for your launch.
          </p>
        </div>
        <select
          value={audienceBand}
          onChange={(e) => setAudienceAndSave(e.target.value)}
          className="block w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Select…</option>
          {AUDIENCE_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const display = pending ? 'saving' : status
  const text = { saving: 'Saving…', saved: '✓ Saved', error: '⚠ Save failed', idle: '' }[display]
  const cls = {
    saving: 'text-zinc-500',
    saved: 'text-emerald-600',
    error: 'text-red-600',
    idle: '',
  }[display]
  return <span className={`text-xs ${cls}`}>{text}</span>
}
