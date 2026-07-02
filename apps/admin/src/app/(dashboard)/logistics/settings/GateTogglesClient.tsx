'use client'

// Admin on/off switches + inline ops notes for each logistics gate. Toggling
// calls updateLogisticsGate (audited) and optimistically updates; checkout /
// routing pick the change up server-side on the next request (isLogisticsEnabled).

import { useState, useTransition } from 'react'
import { Switch } from '@ilaunchify/ui'
import { updateLogisticsGate } from './actions'

export interface GateRow {
  key: string
  label: string
  group: string
  description: string
  enabled: boolean
  note: string | null
  /** Pre-formatted on the server (null = no DB row yet). */
  updatedAtLabel: string | null
}

export function GateTogglesClient({ rows }: { rows: GateRow[] }) {
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(
    Object.fromEntries(rows.map((r) => [r.key, r.enabled])),
  )
  const [noteMap, setNoteMap] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.key, r.note ?? ''])),
  )
  const [savedNoteMap, setSavedNoteMap] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.key, r.note ?? ''])),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  function toggle(key: string) {
    const next = !(enabledMap[key] ?? false)
    setEnabledMap((s) => ({ ...s, [key]: next }))
    setBusy(key)
    setError(null)
    start(async () => {
      const r = await updateLogisticsGate(key, { enabled: next })
      setBusy(null)
      if (!r.ok) {
        setEnabledMap((s) => ({ ...s, [key]: !next })) // revert
        setError(r.error)
      }
    })
  }

  function saveNote(key: string) {
    const note = (noteMap[key] ?? '').trim()
    if (note === (savedNoteMap[key] ?? '')) return // unchanged
    setBusy(key)
    setError(null)
    start(async () => {
      const r = await updateLogisticsGate(key, { note: note || null })
      setBusy(null)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSavedNoteMap((s) => ({ ...s, [key]: note }))
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {error && (
        <div className="border-b border-danger-200 bg-danger-50 px-4 py-2 text-[13px] text-danger-700">
          {error}
        </div>
      )}
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Gate</th>
            <th className="px-3 py-2.5 text-left font-semibold">Ops note</th>
            <th className="px-3 py-2.5 text-right font-semibold">Updated</th>
            <th className="w-[72px] px-4 py-2.5 text-right font-semibold">Enabled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const on = enabledMap[r.key] ?? false
            return (
              <tr key={r.key} className="transition-colors hover:bg-pink-50/20">
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink-900">{r.label}</span>
                    <span className="rounded-full bg-ink-100 px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                      {r.group}
                    </span>
                  </div>
                  <p className="mt-0.5 max-w-md text-[11.5px] text-ink-500">{r.description}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">{r.key}</p>
                </td>
                <td className="px-3 py-3 align-top">
                  <input
                    type="text"
                    value={noteMap[r.key] ?? ''}
                    disabled={busy === r.key}
                    onChange={(e) => setNoteMap((s) => ({ ...s, [r.key]: e.target.value }))}
                    onBlur={() => saveNote(r.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    placeholder="e.g. waiting on ShipBob master agreement"
                    aria-label={`Ops note for ${r.label}`}
                    className="w-full min-w-[220px] rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200 disabled:bg-ink-50"
                  />
                </td>
                <td className="px-3 py-3 text-right align-top text-[11.5px] text-ink-500">
                  {r.updatedAtLabel ?? '—'}
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <Switch
                    checked={on}
                    disabled={busy === r.key}
                    onChange={() => toggle(r.key)}
                    aria-label={`${on ? 'Disable' : 'Enable'} ${r.label}`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
