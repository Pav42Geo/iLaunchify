'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@ilaunchify/ui'
import type { SupportSettingsValues, SupportPriority } from '@ilaunchify/db'
import { saveSupportSettings } from './actions'

const PRIORITIES: SupportPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

const TIERS: { key: 'maker' | 'builder' | 'agency'; label: string; hint: string }[] = [
  { key: 'maker', label: 'Maker', hint: 'Entry tier' },
  { key: 'builder', label: 'Builder', hint: 'Mid tier' },
  { key: 'agency', label: 'Agency', hint: 'Top tier' },
]

// Convenient minute presets for the SLA dropdowns.
const SLA_PRESETS: { label: string; minutes: number }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '8 hours', minutes: 480 },
  { label: '24 hours', minutes: 1440 },
  { label: '48 hours', minutes: 2880 },
  { label: '5 days', minutes: 7200 },
]

export function SupportPolicyForm({ initial }: { initial: SupportSettingsValues }) {
  const [v, setV] = useState<SupportSettingsValues>(initial)
  const [pending, start] = useTransition()
  const [dirty, setDirty] = useState(false)

  function patch(p: Partial<SupportSettingsValues>) {
    setV((s) => ({ ...s, ...p }))
    setDirty(true)
  }

  function save() {
    start(async () => {
      const r = await saveSupportSettings(v)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Support policy saved.')
      setDirty(false)
    })
  }

  const responseKey = (k: string) => `${k}ResponseMinutes` as keyof SupportSettingsValues
  const priorityKey = (k: string) => `${k}MinPriority` as keyof SupportSettingsValues

  return (
    <div className="space-y-5">
      {/* Master switches */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-ink-900">Bindings</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Toggle each tier effect independently. Off = creator tickets use the category / priority
          defaults only.
        </p>
        <div className="mt-3 space-y-2.5">
          <Toggle
            label="Apply tier SLA targets"
            desc="Stamp a first-response SLA window on new creator tickets based on tier."
            on={v.slaTargetsEnabled}
            onToggle={() => patch({ slaTargetsEnabled: !v.slaTargetsEnabled })}
          />
          <Toggle
            label="Apply tier priority floor"
            desc="Raise a new creator ticket to at least the tier's minimum priority."
            on={v.priorityFloorEnabled}
            onToggle={() => patch({ priorityFloorEnabled: !v.priorityFloorEnabled })}
          />
        </div>
      </div>

      {/* Per-tier policy table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Creator tier</th>
              <th className="px-5 py-2.5 text-left font-semibold">First-response SLA</th>
              <th className="px-5 py-2.5 text-left font-semibold">Minimum priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {TIERS.map((t) => (
              <tr key={t.key}>
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-ink-900">{t.label}</span>
                  <span className="ml-2 text-[11px] text-ink-400">{t.hint}</span>
                </td>
                <td className="px-5 py-3.5">
                  <select
                    value={v[responseKey(t.key)] as number}
                    disabled={!v.slaTargetsEnabled || pending}
                    onChange={(e) => patch({ [responseKey(t.key)]: Number(e.target.value) } as Partial<SupportSettingsValues>)}
                    className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
                  >
                    {SLA_PRESETS.map((p) => (
                      <option key={p.minutes} value={p.minutes}>
                        {p.label}
                      </option>
                    ))}
                    {/* Preserve a custom non-preset value if one was set via DB. */}
                    {!SLA_PRESETS.some((p) => p.minutes === (v[responseKey(t.key)] as number)) && (
                      <option value={v[responseKey(t.key)] as number}>
                        {v[responseKey(t.key)] as number} min (custom)
                      </option>
                    )}
                  </select>
                </td>
                <td className="px-5 py-3.5">
                  <select
                    value={v[priorityKey(t.key)] as string}
                    disabled={!v.priorityFloorEnabled || pending}
                    onChange={(e) => patch({ [priorityKey(t.key)]: e.target.value } as Partial<SupportSettingsValues>)}
                    className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Contact-us forwarding — where the public footer contact form is delivered. */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <p className="text-[13px] font-semibold text-ink-900">Contact-us forwarding email</p>
        <p className="mt-0.5 text-[12px] text-ink-500">
          Public footer &ldquo;Contact us&rdquo; submissions are emailed here. Leave blank to fall back to
          the platform default.
        </p>
        <input
          type="email"
          value={v.contactForwardingEmail ?? ''}
          placeholder="ilaunchify@gmail.com"
          onChange={(e) => patch({ contactForwardingEmail: e.target.value })}
          className="mt-2 w-full max-w-md rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-full bg-pink-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save policy'}
        </button>
        {dirty && <span className="text-[12px] text-ink-500">Unsaved changes</span>}
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
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink-900">{label}</p>
        <p className="mt-0.5 text-[12px] text-ink-500">{desc}</p>
      </div>
      <Switch checked={on} onChange={onToggle} aria-label={label} className="flex-none" />
    </div>
  )
}
