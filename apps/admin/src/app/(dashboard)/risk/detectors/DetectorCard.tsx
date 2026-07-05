'use client'

// Per-detector settings card (Risk Center M2). Mode ladder + threshold fields
// + notes, saved through the audited server action. The FP-rate line is the
// promotion gate: the plan requires <20% measured FP before any detector
// climbs above WARN — the card warns, the admin decides.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { updateDetectorSetting } from './actions'

const MODES = ['MONITOR', 'WARN', 'GATE', 'ACT'] as const
type Mode = (typeof MODES)[number]

const MODE_HINT: Record<Mode, string> = {
  MONITOR: 'Shadow mode — logs events, notifies no one',
  WARN: 'Notifies the affected party + inbox row',
  GATE: 'Blocks progression until a human chooses',
  ACT: 'Automatic mitigation',
}

export interface DetectorCardProps {
  detectorKey: string
  title: string
  trigger: string
  benchmark: string
  mode: Mode
  thresholds: Record<string, number>
  notes: string
  fired: number
  falsePositives: number
}

export function DetectorCard(props: DetectorCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>(props.mode)
  const [thresholds, setThresholds] = useState(props.thresholds)
  const [notes, setNotes] = useState(props.notes)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const fpRate = props.fired > 0 ? Math.round((props.falsePositives / props.fired) * 100) : null
  const promotionRisky = mode !== 'MONITOR' && mode !== props.mode && (fpRate === null || fpRate > 20)
  const dirty =
    mode !== props.mode ||
    notes !== props.notes ||
    JSON.stringify(thresholds) !== JSON.stringify(props.thresholds)

  const save = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateDetectorSetting({
        detectorKey: props.detectorKey,
        mode,
        thresholds,
        notes,
        fpStats: { fired: props.fired, falsePositives: props.falsePositives },
      })
      if (!res.ok) setError(res.error)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">{props.title}</h2>
          <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
            {props.detectorKey} · {props.trigger}
          </p>
          <p className="mt-1 text-[12px] text-ink-600">{props.benchmark}</p>
        </div>
        <div className="text-right text-[12px] text-ink-600">
          <p>
            <span className="font-semibold tabular-nums text-ink-900">{props.fired.toLocaleString()}</span> fired
          </p>
          <p className={cn('tabular-nums', fpRate !== null && fpRate > 20 ? 'font-semibold text-danger-700' : '')}>
            {fpRate === null ? 'no FP data yet' : `${fpRate}% false positive (${props.falsePositives})`}
          </p>
        </div>
      </div>

      {/* Mode ladder */}
      <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Escalation mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              mode === m ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-500">{MODE_HINT[mode]}</p>
      {promotionRisky && (
        <p className="mt-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] leading-relaxed text-warning-800">
          Promotion gate: this detector {fpRate === null ? 'has no measured false-positive data yet' : `runs at ${fpRate}% false positives (target <20%)`}. Promote anyway only with a reason in the notes — the FP stats are recorded in the audit row.
        </p>
      )}

      {/* Thresholds */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Object.entries(thresholds).map(([key, value]) => (
          <label key={key} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{key}</span>
            <input
              type="number"
              value={value}
              min={0}
              step="any"
              onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-[13px] tabular-nums text-ink-900 focus:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
        ))}
      </div>

      {/* Notes + save */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Ops note</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this mode / these thresholds…"
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </label>
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] font-medium text-danger-700">{error}</p>}
      {saved && !dirty && <p className="mt-2 text-[12px] font-medium text-success-700">Saved.</p>}
    </section>
  )
}
