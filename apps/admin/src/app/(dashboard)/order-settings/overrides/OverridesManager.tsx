'use client'

// Scoped order-settings overrides — list + add + delete (Pavel 2026-06-11).
// Overrides layer over the global OrderSettings default by tier / market / region.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus } from 'lucide-react'
import { formatCentsOrDash } from '@ilaunchify/ui'
import { saveOverride, deleteOverride, type OverrideRowFull, type OverrideInput } from '../actions'

const NUM = 'w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-[12.5px] text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const SCOPES = [
  { value: 'CREATOR_TIER', label: 'Creator tier' },
  { value: 'MARKET', label: 'Market' },
  { value: 'REGION', label: 'Region' },
] as const
const TIERS = ['maker', 'builder', 'agency']
const bps = (b: number | null) => (b == null ? '—' : `${(b / 100).toFixed(2)}%`)
const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s

const EMPTY: OverrideInput = {
  scope: 'CREATOR_TIER', scopeKey: 'agency', note: null,
  productionFeeBps: null, warehouseReferralFeeBps: null,
  flatShippingBaseCents: null, flatShippingPerUnitCents: null, freeShippingThresholdCents: null,
}

export function OverridesManager({ initial }: { initial: OverrideRowFull[] }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)
  const [draft, setDraft] = React.useState<OverrideInput>(EMPTY)

  const numField = (k: keyof OverrideInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) }))

  function add() {
    start(async () => {
      const r = await saveOverride(draft)
      if (!r.ok) { setStatus({ ok: false, msg: r.error }); return }
      setStatus({ ok: true, msg: 'Override saved.' })
      setDraft(EMPTY)
      router.refresh()
    })
  }
  function remove(row: OverrideRowFull) {
    start(async () => {
      const r = await deleteOverride(row.scope, row.scopeKey)
      if (!r.ok) { setStatus({ ok: false, msg: r.error }); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Existing overrides */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Scope</th>
              <th className="px-4 py-2.5 text-left font-semibold">Key</th>
              <th className="px-4 py-2.5 text-left font-semibold">Production fee</th>
              <th className="px-4 py-2.5 text-left font-semibold">Shipping (base / unit / free≥)</th>
              <th className="px-4 py-2.5 text-left font-semibold">Note</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {initial.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-500">No overrides — every order uses the global default.</td></tr>
            )}
            {initial.map((o) => (
              <tr key={o.id} className="hover:bg-ink-50/40">
                <td className="px-4 py-3"><span className="inline-flex rounded-full border border-ink-200 bg-ink-50 px-2 py-[2px] text-[10.5px] font-semibold text-ink-700">{scopeLabel(o.scope)}</span></td>
                <td className="px-4 py-3 font-mono text-[11.5px] text-ink-900">{o.scopeKey}</td>
                <td className="px-4 py-3 tabular-nums">{bps(o.productionFeeBps)}</td>
                <td className="px-4 py-3 tabular-nums text-ink-700">{formatCentsOrDash(o.flatShippingBaseCents)} / {formatCentsOrDash(o.flatShippingPerUnitCents)} / {formatCentsOrDash(o.freeShippingThresholdCents)}</td>
                <td className="px-4 py-3 text-ink-600">{o.note ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => remove(o)} disabled={pending} className="text-ink-400 hover:text-danger-600 disabled:opacity-40" aria-label="Delete override">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add override */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[15px] font-bold text-ink-900">Add an override</h2>
        <p className="mt-1 text-[12.5px] text-ink-500">Leave economics blank to inherit the default. Saving an existing scope+key updates it.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Scope</label>
            <select className={NUM} value={draft.scope} onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value as OverrideInput['scope'], scopeKey: e.target.value === 'CREATOR_TIER' ? 'agency' : '' }))}>
              {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Key</label>
            {draft.scope === 'CREATOR_TIER' ? (
              <select className={NUM} value={draft.scopeKey} onChange={(e) => setDraft((d) => ({ ...d, scopeKey: e.target.value }))}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <input className={NUM} placeholder={draft.scope === 'MARKET' ? 'US' : 'region id'} value={draft.scopeKey} onChange={(e) => setDraft((d) => ({ ...d, scopeKey: e.target.value }))} />
            )}
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-ink-600">Note <span className="text-ink-400">· optional</span></label>
            <input className={NUM} placeholder="e.g. Agency launch promo" value={draft.note ?? ''} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value || null }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Production fee (bps) <span className="text-ink-400">· {bps(draft.productionFeeBps)}</span></label>
            <input className={NUM} type="number" min={0} placeholder="inherit" value={draft.productionFeeBps ?? ''} onChange={numField('productionFeeBps')} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Ship base (¢)</label>
            <input className={NUM} type="number" min={0} placeholder="inherit" value={draft.flatShippingBaseCents ?? ''} onChange={numField('flatShippingBaseCents')} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Ship / unit (¢)</label>
            <input className={NUM} type="number" min={0} placeholder="inherit" value={draft.flatShippingPerUnitCents ?? ''} onChange={numField('flatShippingPerUnitCents')} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-600">Free shipping ≥ (¢)</label>
            <input className={NUM} type="number" min={0} placeholder="inherit" value={draft.freeShippingThresholdCents ?? ''} onChange={numField('freeShippingThresholdCents')} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={add} disabled={pending || !draft.scopeKey.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50">
            <Plus className="h-4 w-4" /> {pending ? 'Saving…' : 'Save override'}
          </button>
          {status && <span className={`text-[13px] ${status.ok ? 'text-success-700' : 'text-danger-600'}`}>{status.msg}</span>}
        </div>
      </div>
    </div>
  )
}
