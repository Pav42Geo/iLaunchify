'use client'

// Admin on/off switches for each product domain. Toggling calls setDomainEnabled
// (audited) and optimistically updates. Builder picks up the change on next load.

import { useState, useTransition } from 'react'
import { Switch } from '@ilaunchify/ui'
import { setDomainEnabled } from './actions'

export interface DomainRow {
  key: string
  label: string
  artifact: string
  /** The builder flow for this domain is live (else enabling has no visible effect yet). */
  flowLive: boolean
  enabled: boolean
}

export function DomainTogglesClient({ rows }: { rows: DomainRow[] }) {
  const [state, setState] = useState<Record<string, boolean>>(Object.fromEntries(rows.map((r) => [r.key, r.enabled])))
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle(key: string) {
    const next = !state[key]
    setState((s) => ({ ...s, [key]: next }))
    setBusy(key)
    setError(null)
    start(async () => {
      const r = await setDomainEnabled(key, next)
      setBusy(null)
      if (!r.ok) {
        setState((s) => ({ ...s, [key]: !next })) // revert
        setError(r.error)
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-700">{error}</div>}
      <ul className="divide-y divide-ink-100">
        {rows.map((r) => {
          const on = state[r.key]
          return (
            <li key={r.key} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink-900">{r.label}</span>
                  {!r.flowLive && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                      builder flow not live
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-500">
                  {r.artifact}
                  {!r.flowLive && on ? ' · enabled, but won’t appear in the builder until the flow ships' : ''}
                </div>
              </div>
              <Switch
                checked={on}
                disabled={busy === r.key}
                onChange={() => toggle(r.key)}
                aria-label={`${on ? 'Disable' : 'Enable'} ${r.label}`}
                className="flex-none"
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
