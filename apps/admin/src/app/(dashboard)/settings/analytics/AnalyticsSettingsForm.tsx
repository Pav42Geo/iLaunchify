'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { AnalyticsSettingsValues } from '@ilaunchify/db'
import { saveAnalyticsSettings } from './actions'

const THRESHOLDS: Array<{
  key: keyof AnalyticsSettingsValues
  label: string
  hint: string
}> = [
  { key: 'otifTargetPct', label: 'OTIF target', hint: 'On-time-in-full goal. Below this shows a warning on Insights.' },
  { key: 'refundRateAlertPct', label: 'Refund-rate alert', hint: 'Flag when 30-day refund rate exceeds this.' },
  { key: 'rerouteRateAlertPct', label: 'Reroute-rate alert', hint: 'Flag when dispatch reroute rate exceeds this.' },
  { key: 'qcFailAlertPct', label: 'QC-fail alert', hint: 'Flag when quality-check failure rate exceeds this.' },
]

export function AnalyticsSettingsForm({
  initial,
}: {
  initial: AnalyticsSettingsValues
}) {
  const [v, setV] = useState<AnalyticsSettingsValues>(initial)
  const [pending, start] = useTransition()
  const [dirty, setDirty] = useState(false)

  function patch(p: Partial<AnalyticsSettingsValues>) {
    setV((s) => ({ ...s, ...p }))
    setDirty(true)
  }

  function save() {
    start(async () => {
      const r = await saveAnalyticsSettings(v)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Analytics settings saved.')
      setDirty(false)
    })
  }

  return (
    <div className="space-y-5">
      {/* Behavioral capture switch */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-ink-900">Behavioral capture</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Master intent switch for product-usage events (client posthog-js + server forwarding). The
          PostHog key still gates actual sends — see the Status panel above; this records the admin&rsquo;s
          intent so capture can be paused without pulling env vars.
        </p>
        <div className="mt-3">
          <Toggle
            label="Behavioral capture enabled"
            desc="When off, the app should skip firing behavioral events (funnels, Studio engagement)."
            on={v.behavioralCaptureEnabled}
            onToggle={() => patch({ behavioralCaptureEnabled: !v.behavioralCaptureEnabled })}
          />
        </div>
      </div>

      {/* Thresholds */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-ink-900">Targets &amp; alert thresholds</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Percent thresholds the Insights surface reads to tone metrics and (later) route alerts.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {THRESHOLDS.map((t) => (
            <label key={t.key} className="block">
              <span className="text-[12.5px] font-semibold text-ink-800">{t.label}</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Number(v[t.key])}
                  onChange={(e) => patch({ [t.key]: Number(e.target.value) } as Partial<AnalyticsSettingsValues>)}
                  className="w-24 rounded-lg border border-ink-200 px-3 py-1.5 text-[13px] tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                />
                <span className="text-[13px] text-ink-500">%</span>
              </div>
              <span className="mt-1 block text-[11.5px] text-ink-500">{t.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-[12px] text-ink-500">Unsaved changes</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function Toggle({
  label,
  desc,
  on,
  onToggle,
}: {
  label: string
  desc: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-ink-100 bg-ink-50/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink-900">{label}</p>
        <p className="mt-0.5 text-[12px] text-ink-500">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ' +
          (on ? 'bg-success-500' : 'bg-ink-300')
        }
      >
        <span
          className={
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
            (on ? 'translate-x-5' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  )
}
