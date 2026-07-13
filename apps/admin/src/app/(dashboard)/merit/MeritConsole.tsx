'use client'

// Manufacturer Merit console — policy editor + dry-run simulator (MM-3).
// Tune weights/thresholds/evidence/fees/windows, simulate the resulting badge
// distribution over the stored snapshots, then save. Nothing here changes a
// manufacturer's tier or fee — assignment stays shadow until MM-5.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SlidersHorizontal, PlayCircle, Save, Power } from 'lucide-react'
import { saveMeritPolicy, runMeritSimulation, type MeritPolicyInput, type SimulationResult } from './actions'

const inputCls =
  'w-20 rounded-lg border border-ink-200 px-2 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

function Num({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[12.5px] text-ink-800">{label}</span>
        {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
      </span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} />
    </label>
  )
}

export function MeritConsole({ initial }: { initial: MeritPolicyInput }) {
  const [p, setP] = useState(initial)
  const [sim, setSim] = useState<SimulationResult | null>(null)
  const [isSaving, startSave] = useTransition()
  const [isSim, startSim] = useTransition()

  const set = (k: keyof MeritPolicyInput, v: number | boolean) => setP((prev) => ({ ...prev, [k]: v }))
  const num = (k: keyof MeritPolicyInput) => (v: number) => set(k, v)
  const weightSum = p.craftWeight + p.reliabilityWeight + p.contributionWeight + p.standingWeight

  function simulate() {
    startSim(async () => {
      const res = await runMeritSimulation(p)
      if (!res.ok) return void toast.error(res.error)
      setSim(res.data)
    })
  }
  function save() {
    startSave(async () => {
      const res = await saveMeritPolicy(p)
      if (!res.ok) return void toast.error(res.error)
      toast.success(res.message ?? 'Saved.')
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-ink-500" />
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Merit policy</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-600">
        Tune the model, simulate the badge distribution over tonight&rsquo;s snapshots, then save.
        While the engine is in <strong>Shadow</strong>, saving changes nothing for manufacturers;
        turning it <strong>Live</strong> assigns badges and applies badge fees on the next sweep and checkout.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <div className="space-y-2">
          <h3 className={`text-[11px] font-bold uppercase tracking-widest ${weightSum === 100 ? 'text-ink-500' : 'text-danger-600'}`}>
            Pillar weights {weightSum !== 100 && `(sum ${weightSum} ≠ 100)`}
          </h3>
          <Num label="Craft" value={p.craftWeight} onChange={num('craftWeight')} />
          <Num label="Reliability" value={p.reliabilityWeight} onChange={num('reliabilityWeight')} />
          <Num label="Contribution" value={p.contributionWeight} onChange={num('contributionWeight')} />
          <Num label="Standing" value={p.standingWeight} onChange={num('standingWeight')} />
          <h3 className="pt-2 text-[11px] font-bold uppercase tracking-widest text-ink-500">Score gates</h3>
          <Num label="Trusted ≥" value={p.trustedThreshold} onChange={num('trustedThreshold')} />
          <Num label="Premier ≥" value={p.premierThreshold} onChange={num('premierThreshold')} />
          <Num label="Ops confidence" value={p.opsConfidence} onChange={num('opsConfidence')} hint="Bayesian shrink for ops rates" />
        </div>

        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Evidence gates</h3>
          <Num label="Trusted min orders" value={p.trustedMinOrders} onChange={num('trustedMinOrders')} />
          <Num label="Trusted min months" value={p.trustedMinMonths} onChange={num('trustedMinMonths')} />
          <Num label="Premier min orders" value={p.premierMinOrders} onChange={num('premierMinOrders')} />
          <Num label="Premier min months" value={p.premierMinMonths} onChange={num('premierMinMonths')} />
          <Num label="Premier max defect/100" value={p.premierMaxDefectPer100} onChange={num('premierMaxDefectPer100')} />
          <h3 className="pt-2 text-[11px] font-bold uppercase tracking-widest text-ink-500">Hysteresis (days)</h3>
          <Num label="Promote sustain" value={p.promoteSustainDays} onChange={num('promoteSustainDays')} />
          <Num label="Demote miss" value={p.demoteMissDays} onChange={num('demoteMissDays')} />
          <Num label="New-shop grace" value={p.graceDays} onChange={num('graceDays')} />
        </div>

        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Fee per badge (bps)</h3>
          <Num label="Verified" value={p.verifiedFeeBps} onChange={num('verifiedFeeBps')} hint={`${(p.verifiedFeeBps / 100).toFixed(2)}%`} />
          <Num label="Trusted" value={p.trustedFeeBps} onChange={num('trustedFeeBps')} hint={`${(p.trustedFeeBps / 100).toFixed(2)}%`} />
          <Num label="Premier" value={p.premierFeeBps} onChange={num('premierFeeBps')} hint={`${(p.premierFeeBps / 100).toFixed(2)}%`} />
        </div>

        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Team seats per badge</h3>
          <Num label="Verified" value={p.verifiedTeamSeats} onChange={num('verifiedTeamSeats')} />
          <Num label="Trusted" value={p.trustedTeamSeats} onChange={num('trustedTeamSeats')} />
          <Num label="Premier" value={p.premierTeamSeats} onChange={num('premierTeamSeats')} hint={p.premierTeamSeats === 0 ? 'unlimited' : undefined} />
          <p className="text-[11px] leading-relaxed text-ink-500">
            Earned capacity, never sold (LOCKED 2026-07-13). Badge drops are gentle: over-cap
            teams keep everyone — only NEW invites are blocked. 0 = unlimited.
          </p>
        </div>
      </div>

      {/* Go-live switch — this is the lever that turns standing into real badges
          and real fees. Weighted deliberately: calm while shadow, unmistakably
          live when on. */}
      <div className={`mt-5 flex items-center justify-between gap-4 rounded-2xl border p-4 ${p.enabled ? 'border-pink-300 bg-pink-50/60' : 'border-ink-200 bg-[var(--bg-hero)]'}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${p.enabled ? 'bg-pink-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
            <Power className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-[15px] font-semibold text-ink-900">Merit engine</h3>
            <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wide ${p.enabled ? 'bg-pink-100 text-pink-800' : 'bg-ink-100 text-ink-600'}`}>
              {p.enabled ? 'Live' : 'Shadow'}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={p.enabled}
          aria-label="Merit engine live"
          onClick={() => set('enabled', !p.enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ${p.enabled ? 'bg-pink-600' : 'bg-ink-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${p.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {sim && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50/40 p-3.5 text-[12.5px] text-ink-800">
          <span className="font-semibold">Simulation over {sim.total} manufacturers:</span>{' '}
          Verified {sim.distribution.VERIFIED} · Trusted {sim.distribution.TRUSTED} · Premier {sim.distribution.PREMIER}.
          <span className="ml-2 text-ink-500">
            {sim.changedFromCurrent} differ from today&rsquo;s hand-set tier · {sim.changedFromSnapshot} differ from the saved policy.
          </span>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={simulate} disabled={isSim} className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:border-ink-400 disabled:opacity-60">
          <PlayCircle className="h-4 w-4" />
          {isSim ? 'Simulating…' : 'Simulate'}
        </button>
        <button onClick={save} disabled={isSaving || weightSum !== 100} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-60">
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </section>
  )
}
