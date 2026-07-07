'use client'

// Fee grace & promotions — admin panel (MM-7). Two levers:
//   • Global grace — toggle + duration (days/months) + %, applied to every
//     manufacturer from their activation date (live-computed, instantly reversible).
//   • Manual grants — pick specific manufacturers, set a % and window. Manual
//     wins over global. Both leave the badge at Verified — they skip the engine's
//     fee, not its scoring.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Search } from 'lucide-react'
import { saveFeeGracePolicy, createFeeGrants, revokeFeeGrant } from './fee-grace-actions'

type Unit = 'DAYS' | 'MONTHS'
interface Grant { id: string; companyName: string; feePct: string; startsAt: string; endsAt: string; active: boolean; revoked: boolean }
interface Props {
  initial: { enabled: boolean; value: number; unit: Unit; feeBps: number }
  grants: Grant[]
  manufacturers: { serviceId: string; name: string }[]
}

const pctFromBps = (bps: number) => String(bps / 100)
const bpsFromPct = (pct: string) => Math.round(parseFloat(pct || '0') * 100)

export function FeeGracePanel({ initial, grants, manufacturers }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Global grace state
  const [enabled, setEnabled] = useState(initial.enabled)
  const [value, setValue] = useState(String(initial.value))
  const [unit, setUnit] = useState<Unit>(initial.unit)
  const [gracePct, setGracePct] = useState(pctFromBps(initial.feeBps))
  const [gMsg, setGMsg] = useState<string | null>(null)

  // Manual grant state
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [grantPct, setGrantPct] = useState('0')
  const [grantValue, setGrantValue] = useState('3')
  const [grantUnit, setGrantUnit] = useState<Unit>('MONTHS')
  const [reason, setReason] = useState('')
  const [mMsg, setMMsg] = useState<string | null>(null)

  const filtered = useMemo(
    () => manufacturers.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase())),
    [manufacturers, filter],
  )

  function saveGlobal() {
    setGMsg(null)
    start(async () => {
      const r = await saveFeeGracePolicy({ feeGraceEnabled: enabled, feeGraceValue: parseInt(value || '0', 10), feeGraceUnit: unit, feeGraceFeeBps: bpsFromPct(gracePct) })
      setGMsg(r.ok ? (r.message ?? 'Saved.') : r.error)
      if (r.ok) router.refresh()
    })
  }

  function toggle(id: string) {
    setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function grant() {
    setMMsg(null)
    start(async () => {
      const r = await createFeeGrants({ partnerServiceIds: [...picked], feeBps: bpsFromPct(grantPct), value: parseInt(grantValue || '0', 10), unit: grantUnit, reason })
      setMMsg(r.ok ? (r.message ?? 'Granted.') : r.error)
      if (r.ok) { setPicked(new Set()); setReason(''); router.refresh() }
    })
  }

  function revoke(id: string) {
    start(async () => { const r = await revokeFeeGrant(id); if (r.ok) router.refresh(); else setMMsg(r.error) })
  }

  const inputCls = 'rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-300'

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
        <Gift className="h-4 w-4 text-ink-500" />
        <h2 className="font-display text-[14px] font-semibold text-ink-900">Fee grace &amp; promotions</h2>
        <span className="ml-auto text-[11.5px] text-ink-500">Skips the merit fee for a window · badge stays Verified</span>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Global grace */}
        <div className="rounded-xl border border-ink-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-[13.5px] font-semibold text-ink-900">Global grace (new manufacturers)</h3>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-ink-700">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-pink-600" />
              {enabled ? 'On' : 'Off'}
            </label>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink-500">
            Every manufacturer gets this window from their activation date. Live-computed — changing it
            instantly re-prices everyone; turning it off ends it for all.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[11.5px] font-medium text-ink-600">Duration
              <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={`mt-1 block w-20 ${inputCls}`} />
            </label>
            <label className="text-[11.5px] font-medium text-ink-600">Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={`mt-1 block w-24 ${inputCls}`}>
                <option value="MONTHS">Months</option>
                <option value="DAYS">Days</option>
              </select>
            </label>
            <label className="text-[11.5px] font-medium text-ink-600">Fee %
              <input type="number" min={0} max={100} step="0.5" value={gracePct} onChange={(e) => setGracePct(e.target.value)} className={`mt-1 block w-20 ${inputCls}`} />
            </label>
            <button type="button" disabled={pending} onClick={saveGlobal} className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50">Save</button>
          </div>
          {gMsg && <p className="mt-2 text-[11.5px] text-info-700">{gMsg}</p>}
        </div>

        {/* Manual grants */}
        <div className="rounded-xl border border-ink-200 p-4">
          <h3 className="font-display text-[13.5px] font-semibold text-ink-900">Grant specific manufacturers</h3>
          <p className="mt-1 text-[12px] leading-snug text-ink-500">Pick one or more (e.g. early-bird partners). A manual grant overrides the global rule.</p>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-ink-200 px-2">
            <Search className="h-3.5 w-3.5 text-ink-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search manufacturers…" className="w-full py-1.5 text-[12.5px] text-ink-900 focus:outline-none" />
          </div>
          <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-ink-100">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-ink-400">No manufacturers.</p>
            ) : filtered.map((m) => (
              <label key={m.serviceId} className="flex cursor-pointer items-center gap-2 border-b border-ink-50 px-3 py-1.5 text-[12.5px] text-ink-800 last:border-0 hover:bg-ink-50">
                <input type="checkbox" checked={picked.has(m.serviceId)} onChange={() => toggle(m.serviceId)} className="h-3.5 w-3.5 accent-pink-600" />
                {m.name}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[11.5px] font-medium text-ink-600">Fee %
              <input type="number" min={0} max={100} step="0.5" value={grantPct} onChange={(e) => setGrantPct(e.target.value)} className={`mt-1 block w-20 ${inputCls}`} />
            </label>
            <label className="text-[11.5px] font-medium text-ink-600">Duration
              <input type="number" min={1} value={grantValue} onChange={(e) => setGrantValue(e.target.value)} className={`mt-1 block w-20 ${inputCls}`} />
            </label>
            <label className="text-[11.5px] font-medium text-ink-600">Unit
              <select value={grantUnit} onChange={(e) => setGrantUnit(e.target.value as Unit)} className={`mt-1 block w-24 ${inputCls}`}>
                <option value="MONTHS">Months</option>
                <option value="DAYS">Days</option>
              </select>
            </label>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={`mt-3 block w-full ${inputCls}`} />
          <button type="button" disabled={pending || picked.size === 0} onClick={grant} className="mt-3 rounded-full bg-pink-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-pink-500 disabled:opacity-50">
            Grant to {picked.size || 'selected'} manufacturer{picked.size === 1 ? '' : 's'}
          </button>
          {mMsg && <p className="mt-2 text-[11.5px] text-info-700">{mMsg}</p>}
        </div>
      </div>

      {/* Active + past grants */}
      {grants.length > 0 && (
        <div className="border-t border-ink-100 px-5 pb-5 pt-3">
          <h3 className="font-display text-[13px] font-semibold text-ink-900">Grants</h3>
          <table className="mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="py-1.5 font-semibold">Manufacturer</th>
                <th className="py-1.5 font-semibold">Fee</th>
                <th className="py-1.5 font-semibold">Ends</th>
                <th className="py-1.5 font-semibold">Status</th>
                <th className="py-1.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-t border-ink-50">
                  <td className="py-1.5 font-medium text-ink-900">{g.companyName}</td>
                  <td className="py-1.5 tabular-nums text-ink-700">{g.feePct}</td>
                  <td className="py-1.5 tabular-nums text-ink-600">{new Date(g.endsAt).toLocaleDateString()}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-[1px] text-[10.5px] font-semibold ${g.revoked ? 'bg-ink-100 text-ink-500' : g.active ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-500'}`}>
                      {g.revoked ? 'Revoked' : g.active ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {g.active && !g.revoked && (
                      <button type="button" disabled={pending} onClick={() => revoke(g.id)} className="text-[11px] font-semibold text-pink-700 hover:text-pink-900 disabled:opacity-50">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
