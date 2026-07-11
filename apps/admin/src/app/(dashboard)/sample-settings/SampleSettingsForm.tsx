'use client'

// Sample policy settings form — grouped knobs the admin can switch (Pavel
// 2026-06-11). Saves the SampleSettings singleton via saveSampleSettings.

import * as React from 'react'
import { CreditCard, Truck, ShieldAlert } from 'lucide-react'
import { formatCentsOrDash } from '@ilaunchify/ui'
import { saveSampleSettings, type SampleSettingsValues } from './actions'

const NUM = 'w-32 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400 disabled:bg-ink-50 disabled:text-ink-400'

export function SampleSettingsForm({ initial }: { initial: SampleSettingsValues }) {
  const [v, setV] = React.useState<SampleSettingsValues>(initial)
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)

  const set = <K extends keyof SampleSettingsValues>(k: K, val: SampleSettingsValues[K]) => {
    setV((s) => ({ ...s, [k]: val }))
    setStatus(null)
  }
  const num = (e: React.ChangeEvent<HTMLInputElement>) => (e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))

  function save() {
    start(async () => {
      const res = await saveSampleSettings(v)
      setStatus(res.ok ? { ok: true, msg: 'Saved.' } : { ok: false, msg: res.error })
    })
  }

  return (
    <div className="space-y-5">
      {/* Credit-back */}
      <Section icon={CreditCard} title="Credit-back" desc="When a sample is paid, mint credit toward the creator's first production order.">
        <Toggle label="Credit-back enabled" hint="Off = creators just pay for samples, no credit." checked={v.creditBackEnabled} onChange={(b) => set('creditBackEnabled', b)} />
        <Field label="Credit expiry (days)" hint="How long a minted credit stays usable.">
          <input className={NUM} type="number" min={1} value={v.creditExpiryDays} disabled={!v.creditBackEnabled} onChange={(e) => set('creditExpiryDays', Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </Field>
        <Field label="Max credit per sample (¢)" hint={`Platform ceiling on one sample's credit · ${formatCentsOrDash(v.creditMaxCapCents)} · blank = none`}>
          <input className={NUM} type="number" min={0} placeholder="none" value={v.creditMaxCapCents ?? ''} disabled={!v.creditBackEnabled} onChange={(e) => set('creditMaxCapCents', num(e))} />
        </Field>
      </Section>

      {/* Sample economics */}
      <Section icon={Truck} title="Sample economics" desc="What a sample order costs the creator.">
        <Field label="Flat sample shipping (¢)" hint={formatCentsOrDash(v.sampleFlatShippingCents)}>
          <input className={NUM} type="number" min={0} value={v.sampleFlatShippingCents} onChange={(e) => set('sampleFlatShippingCents', Math.max(0, parseInt(e.target.value, 10) || 0))} />
        </Field>
        <Field label="Sample platform fee (bps)" hint={`${(v.samplePlatformFeeBps / 100).toFixed(2)}% of the sample subtotal · 0 = no fee`}>
          <input className={NUM} type="number" min={0} max={10000} value={v.samplePlatformFeeBps} onChange={(e) => set('samplePlatformFeeBps', Math.max(0, Math.min(10000, parseInt(e.target.value, 10) || 0)))} />
        </Field>
      </Section>

      {/* Guardrails */}
      <Section icon={ShieldAlert} title="Guardrails" desc="Abuse limits + compliance gating.">
        <Field label="Abuse window (days)" hint="Window for each partner's per-creator sample cap.">
          <input className={NUM} type="number" min={1} value={v.abuseWindowDays} onChange={(e) => set('abuseWindowDays', Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </Field>
        <Toggle label="Branded samples require an approved die-line" hint="On = branded samples stay locked until the product's die-line passes compliance." checked={v.brandedRequiresDieline} onChange={(b) => set('brandedRequiresDieline', b)} />
      </Section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50">
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {status && <span className={`text-[13px] ${status.ok ? 'text-success-700' : 'text-danger-600'}`}>{status.msg}</span>}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, desc, children }: { icon: typeof CreditCard; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Icon className="h-4 w-4" /></span>
        <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-500">{desc}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-800">{label}</div>
        {hint && <div className="text-[11.5px] text-ink-500">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-800">{label}</div>
        {hint && <div className="text-[11.5px] text-ink-500">{hint}</div>}
      </div>
      <span className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-[var(--control-accent)]' : 'bg-[var(--switch-off-bg)]'}`}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  )
}
