'use client'

// Co-Creation Settings form (Pavel 2026-07-10) — the Product Builder's
// ?view=settings tab. One form, four policy cards, one audited save.
// Mirrors OrderSettingsForms' conventions (Card/Field/SaveBar, NUM input).

import * as React from 'react'
import { Power, Radar, RefreshCcw, Scale, Sparkles, Wand2 } from 'lucide-react'
import {
  saveCoCreationSettings,
  grantPromoTokens,
  type CoCreationSettingsValues,
} from './settings-actions'

const NUM =
  'w-36 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'

function Card({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Radar
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700">
          <Icon className="h-4 w-4" />
        </span>
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors ${checked ? 'bg-ink-900' : 'bg-ink-200'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5 left-0' : 'left-0.5'}`}
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(0)' }}
      />
    </button>
  )
}

const intOr = (e: React.ChangeEvent<HTMLInputElement>, min: number) =>
  Math.max(min, parseInt(e.target.value, 10) || min)

/** V1 token credits — admin grants until the payments slice ships checkout. */
function GrantTokensRow() {
  const [email, setEmail] = React.useState('')
  const [tokens, setTokens] = React.useState(3)
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="mt-2 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-3">
      <div className="text-[13px] font-medium text-ink-800">Grant tokens (V1 credits)</div>
      <div className="text-[11.5px] text-ink-500">
        Manual grants until token checkout ships with payments. Append-only ledger, audited.
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          placeholder="partner login email"
          onChange={(e) => { setEmail(e.target.value); setMsg(null) }}
          className="w-64 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={tokens}
          onChange={(e) => { setTokens(Math.max(1, parseInt(e.target.value, 10) || 1)); setMsg(null) }}
          className="w-20 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={() =>
            start(async () => {
              const r = await grantPromoTokens(email, tokens)
              setMsg(r.ok ? { ok: true, text: `Granted ${tokens} token${tokens === 1 ? '' : 's'}.` } : { ok: false, text: r.error })
            })
          }
          className="rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Granting…' : 'Grant'}
        </button>
        {msg && <span className={`text-[12.5px] ${msg.ok ? 'text-success-700' : 'text-danger-600'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}

export function CoCreationSettingsForm({ initial }: { initial: CoCreationSettingsValues }) {
  const [v, setV] = React.useState(initial)
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)

  const patch = (k: keyof CoCreationSettingsValues, val: number | boolean) => {
    setV((s) => ({ ...s, [k]: val }))
    setStatus(null)
  }
  const num =
    (k: keyof CoCreationSettingsValues, min: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
      patch(k, intOr(e, min))

  const wSum = v.claimsWeightPct + v.volumeWeightPct + v.meritWeightPct + v.locationWeightPct
  const norm = (n: number) => (wSum > 0 ? `${Math.round((n / wSum) * 100)}%` : '—')

  const save = () =>
    start(async () => {
      const r = await saveCoCreationSettings(v)
      setStatus(r.ok ? { ok: true, msg: 'Saved.' } : { ok: false, msg: r.error })
    })

  return (
    <div className="space-y-5">
      <Card
        icon={Power}
        title="Module kick-off"
        desc="The pool/briefs marketplace needs two-sided liquidity — keep it OFF while onboarding partners, flip it when there are enough makers to answer briefs. Entry surfaces (Brief Builder, Opportunities pool, notifications) gate on this; rooms and interests already in flight stay accessible."
      >
        <Field
          label="Co-creation module enabled"
          hint={v.moduleEnabled ? 'LIVE — creators can post briefs and makers see the pool.' : 'Off — creators see a “coming soon” panel; the pool is hidden.'}
        >
          <Toggle checked={v.moduleEnabled} onChange={(x) => patch('moduleEnabled', x)} />
        </Field>
      </Card>

      <Card
        icon={Radar}
        title="Pool & interests"
        desc="Who sees a brief, when — and how many irons a maker can have in the fire (D-CC2)."
      >
        <Field
          label="Pool access"
          hint="Manufacturers are always in. Co-packers execute recipes — the recommended middle option lets them see recipe-door briefs only."
        >
          <select
            aria-label="Pool access policy"
            value={v.poolAccessPolicy}
            onChange={(e) => {
              setV((s) => ({
                ...s,
                poolAccessPolicy: e.target.value as CoCreationSettingsValues['poolAccessPolicy'],
              }))
              setStatus(null)
            }}
            className="w-72 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          >
            <option value="MFG_ONLY">Manufacturers only</option>
            <option value="MFG_ALL_COPACK_RECIPE">Mfrs all · co-packers recipe-door only</option>
            <option value="MFG_COPACK_EQUAL">Manufacturers + co-packers equally</option>
          </select>
        </Field>
        <Field
          label="Pool exclusivity window (days)"
          hint="A brief's first N days surface only to strong fits, so best-match makers get first look. 0 disables."
        >
          <input className={NUM} type="number" min={0} max={90} value={v.poolExclusivityDays} onChange={num('poolExclusivityDays', 0)} />
        </Field>
        <Field
          label="Exclusivity fit floor (0–100)"
          hint="Minimum fit score to see a brief during its exclusivity window. Makers already engaged always keep visibility."
        >
          <input className={NUM} type="number" min={0} max={100} value={v.exclusivityMinFit} onChange={num('exclusivityMinFit', 0)} />
        </Field>
        <Field
          label="Response window (days)"
          hint="Briefs stop surfacing to new makers after this many days — powers the “time to respond” countdown on pool cards. 0 disables."
        >
          <input className={NUM} type="number" min={0} max={90} value={v.interestWindowDays} onChange={num('interestWindowDays', 0)} />
        </Field>
        <Field
          label="Max open interests per maker"
          hint="Concurrent SUBMITTED/SHORTLISTED interests (anti-spam). 0 = unlimited; a 20/day rate limit always backstops."
        >
          <input className={NUM} type="number" min={0} max={100} value={v.maxOpenInterestsPerPartner} onChange={num('maxOpenInterestsPerPartner', 0)} />
        </Field>
      </Card>

      <Card
        icon={Scale}
        title="Fit ranking weights"
        desc="D-CC6 (decided 2026-07-10): merit informs ranking but never gates access — low-merit makers keep bidding and creators judge with full information. Raw magnitudes; the scorer renormalizes to 100."
      >
        <Field label="Claim coverage" hint={`Normalized: ${norm(v.claimsWeightPct)} of the fit score`}>
          <input className={NUM} type="number" min={0} max={100} value={v.claimsWeightPct} onChange={num('claimsWeightPct', 0)} />
        </Field>
        <Field label="Volume fit" hint={`Normalized: ${norm(v.volumeWeightPct)}`}>
          <input className={NUM} type="number" min={0} max={100} value={v.volumeWeightPct} onChange={num('volumeWeightPct', 0)} />
        </Field>
        <Field label="Merit / rating" hint={`Normalized: ${norm(v.meritWeightPct)} — earned standing, never purchased, never a gate`}>
          <input className={NUM} type="number" min={0} max={100} value={v.meritWeightPct} onChange={num('meritWeightPct', 0)} />
        </Field>
        <Field label="Location bias" hint={`Normalized: ${norm(v.locationWeightPct)}`}>
          <input className={NUM} type="number" min={0} max={100} value={v.locationWeightPct} onChange={num('locationWeightPct', 0)} />
        </Field>
      </Card>

      <Card icon={Wand2} title="Creator side" desc="Brief Builder assist + shortlist behavior.">
        <Field
          label="Benchmark minimum sample"
          hint="Comparable catalog products required before “Benchmark volume & budget” suggests numbers — below this it refuses (honesty gate)."
        >
          <input className={NUM} type="number" min={1} max={50} value={v.benchmarkMinSample} onChange={num('benchmarkMinSample', 1)} />
        </Field>
        <Field label="Max shortlist size" hint="Concurrently starred interests per brief. 0 = unlimited.">
          <input className={NUM} type="number" min={0} max={20} value={v.maxShortlistSize} onChange={num('maxShortlistSize', 0)} />
        </Field>
      </Card>

      <Card
        icon={RefreshCcw}
        title="Maker switching"
        desc="D-CC3 (decided 2026-07-10, policy admin-choosable): whether — and until when — a creator can switch to a different maker after selection. The archived room keeps its full decision log either way."
      >
        <Field
          label="Switch policy"
          hint="Ladder from strict to loose. A funded milestone is a HARD stop under every option — from there problems route through support/dispute, never a one-click swap."
        >
          <select
            aria-label="Maker switch policy"
            value={v.makerSwitchPolicy}
            onChange={(e) => {
              setV((s) => ({
                ...s,
                makerSwitchPolicy: e.target.value as CoCreationSettingsValues['makerSwitchPolicy'],
              }))
              setStatus(null)
            }}
            className="w-72 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          >
            <option value="DISABLED">Disabled — selection is final</option>
            <option value="WITHIN_GRACE_DAYS">Within a grace window after the room opens</option>
            <option value="UNTIL_NDA_SIGNED">Until the mutual NDA signs (IP exposure point)</option>
            <option value="UNTIL_FIRST_SUBMISSION">Until the maker submits any work</option>
            <option value="UNTIL_TERMS_AGREED">Until milestone terms are agreed</option>
            <option value="UNTIL_RECIPE_APPROVED">Until recipe approval</option>
            <option value="UNTIL_FUNDED">Until first milestone funds (loosest)</option>
          </select>
        </Field>
        {v.makerSwitchPolicy === 'WITHIN_GRACE_DAYS' ? (
          <Field label="Grace window (days)" hint="Switching allowed only this many days after the room opens. 0 = no time limit (money backstop still applies).">
            <input className={NUM} type="number" min={0} max={90} value={v.makerSwitchGraceDays} onChange={num('makerSwitchGraceDays', 0)} />
          </Field>
        ) : null}
        <Field label="Max switches per brief" hint="How many times one brief can change makers. 0 = unlimited.">
          <input className={NUM} type="number" min={0} max={10} value={v.maxMakerSwitches} onChange={num('maxMakerSwitches', 0)} />
        </Field>
      </Card>

      <Card
        icon={Sparkles}
        title="Promoted interests"
        desc="StaffMeUp-inverted (decided 2026-07-10): makers buy LABELED promoted slots pinned above the organic list — fit and merit ranking are never affected, and only brief-eligible makers can promote. Token checkout ships with the payments slice; until then this stays off."
      >
        <Field label="Enable promoted interests" hint="Master switch. Purchase mechanics are gated on payments verification.">
          <Toggle checked={v.promotedInterestsEnabled} onChange={(x) => patch('promotedInterestsEnabled', x)} />
        </Field>
        <Field label="Promoted slots per brief" hint="Max “Promoted” cards pinned above the organic interest list.">
          <input className={NUM} type="number" min={0} max={10} value={v.promotedSlotsPerBrief} onChange={num('promotedSlotsPerBrief', 0)} />
        </Field>
        <Field label="Promo token price (cents)" hint="Price of one promotion token (one interest, one brief).">
          <input className={NUM} type="number" min={0} max={100000} value={v.promoTokenPriceCents} onChange={num('promoTokenPriceCents', 0)} />
        </Field>
        <Field
          label="Require good standing to promote"
          hint="Suspended / probation makers can never promote — promotion must not amplify a bad actor."
        >
          <Toggle checked={v.requireVerifiedForPromotion} onChange={(x) => patch('requireVerifiedForPromotion', x)} />
        </Field>
        <GrantTokensRow />
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {status && (
          <span className={`text-[13px] ${status.ok ? 'text-success-700' : 'text-danger-600'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  )
}
