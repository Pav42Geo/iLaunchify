'use client'

// The iLaunchify Plans savings calculator — the centerpiece of the upgrade page.
//
// Honest model (real take rates from seed-subscription-plans.ts): higher tiers
// charge a LOWER platform fee on production, so the fee delta vs Maker (15%)
// offsets the subscription. We show net savings/mo, annualized, break-even, and
// — crucially — when you're BELOW break-even we tell you to stay on Maker. That
// "we'll tell you when NOT to upgrade" honesty is the trust lever (research:
// Printify/Printful frame "pays for itself at N orders").

import { useMemo, useState } from 'react'

export interface CalcTier {
  key: 'maker' | 'builder' | 'agency'
  name: string
  /** Platform take rate as a fraction (Maker 0.15, Builder 0.12, Agency 0.08). */
  feePct: number
  /** Monthly subscription price in cents (0 for Maker). */
  monthlyCents: number
}

const MAKER_FEE = 0.15
const MAX_SPEND = 12000
const STEP = 100

const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

export function PlansSavingsCalculator({
  tiers,
  currentTier,
}: {
  tiers: CalcTier[]
  currentTier: 'maker' | 'builder' | 'agency'
}) {
  const [spend, setSpend] = useState(1500)

  const paid = useMemo(() => tiers.filter((t) => t.key !== 'maker'), [tiers])

  // Net monthly benefit of each paid tier vs Maker at this spend.
  const rows = paid.map((t) => {
    const feeSaved = (MAKER_FEE - t.feePct) * spend // $/mo saved on platform fees
    const monthly = t.monthlyCents / 100
    const net = feeSaved - monthly
    const breakEven = MAKER_FEE - t.feePct > 0 ? monthly / (MAKER_FEE - t.feePct) : Infinity
    return { ...t, feeSaved, monthly, net, breakEven }
  })

  // Recommend the paid tier with the highest positive net; else Maker.
  const best = rows.reduce<(typeof rows)[number] | null>((b, r) => (r.net > (b?.net ?? 0) ? r : b), null)
  const ahead = !!best && best.net > 0

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Savings calculator</p>
        <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.02em] text-ink-900">
          See how much a plan saves you
        </h2>
        <p className="mt-1 text-[13px] text-ink-600">
          Higher plans charge a lower platform fee on production. Drag to your monthly production
          spend — we’ll show what each plan nets you (and tell you if you should just stay on Maker).
        </p>
      </div>

      <div className="px-5 py-5">
        {/* Slider */}
        <div className="flex items-baseline justify-between">
          <label htmlFor="spend" className="text-[13px] font-medium text-ink-700">
            Your monthly production spend
          </label>
          <span className="font-display text-2xl font-bold tabular-nums text-ink-900">
            {fmt(spend)}
            {spend >= MAX_SPEND && <span className="text-[14px] font-semibold text-ink-500">+</span>}
            <span className="ml-1 text-[12px] font-normal text-ink-500">/mo</span>
          </span>
        </div>
        <input
          id="spend"
          type="range"
          min={0}
          max={MAX_SPEND}
          step={STEP}
          value={spend}
          onChange={(e) => setSpend(Number(e.target.value))}
          className="mt-3 w-full accent-pink-500"
          aria-label="Monthly production spend"
        />
        <div className="mt-1 flex justify-between text-[11px] text-ink-400">
          <span>$0</span>
          <span>{fmt(MAX_SPEND)}+/mo</span>
        </div>

        {/* Result banner */}
        <div
          className={`mt-5 rounded-xl border px-4 py-3.5 ${
            ahead ? 'border-success-200 bg-success-50' : 'border-ink-200 bg-ink-50/60'
          }`}
        >
          {ahead && best ? (
            <p className="text-[14px] leading-relaxed text-ink-800">
              At {fmt(spend)}/mo, <span className="font-semibold text-success-700">{best.name}</span>{' '}
              saves you{' '}
              <span className="font-display text-[18px] font-bold text-success-700">{fmt(best.net)}/mo</span>{' '}
              after the subscription — about{' '}
              <span className="font-semibold">{fmt(best.net * 12)}/year</span>.
            </p>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink-700">
              At {fmt(spend)}/mo you’re below break-even —{' '}
              <span className="font-semibold text-ink-900">stay on Maker</span> for now (it’s free).
              {rows[0] && Number.isFinite(rows[0].breakEven) && (
                <>
                  {' '}
                  {rows[0].name} starts paying for itself around{' '}
                  <span className="font-semibold">{fmt(rows[0].breakEven)}/mo</span> in production.
                </>
              )}
            </p>
          )}
        </div>

        {/* Per-tier net rows */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {rows.map((r) => {
            const positive = r.net > 0
            const isBest = best?.key === r.key && positive
            return (
              <div
                key={r.key}
                className={`rounded-xl border px-4 py-3 ${
                  isBest ? 'border-success-300 bg-success-50/50' : 'border-ink-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-900">{r.name}</span>
                  <span className="text-[11px] text-ink-500">
                    {Math.round(r.feePct * 100)}% fee · {fmt(r.monthly)}/mo
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    className={`font-display text-xl font-bold tabular-nums ${
                      positive ? 'text-success-700' : 'text-ink-400'
                    }`}
                  >
                    {positive ? `+${fmt(r.net)}` : fmt(r.net)}
                  </span>
                  <span className="text-[11.5px] text-ink-500">net / mo</span>
                  {isBest && (
                    <span className="ml-auto rounded-full bg-pink-500 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-white">
                      Best for you
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  Saves {fmt(r.feeSaved)}/mo on fees{r.monthly > 0 ? ` − ${fmt(r.monthly)} plan` : ''}
                </p>
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-[11px] text-ink-400">
          Estimate only — platform fees apply to production subtotals; shipping &amp; taxes excluded.
          You&rsquo;re on <span className="font-medium capitalize text-ink-600">{currentTier}</span> today.
        </p>
      </div>
    </div>
  )
}
