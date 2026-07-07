// Partner "Your standing" — page (MM-6, docs/MANUFACTURER_MERIT_ENGINE.md §7).
// Manufacturer-facing merit view: badge, pillars, path to the next badge, the
// fee ladder, and ratings they can contest. Honest by design — while the engine
// is in shadow the badge is a labeled projection and thin history never hurts.

import { Award, Star, TrendingUp } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { requireUser } from '@ilaunchify/auth'
import { loadStandingPage, type StandingView } from './data'
import { ContestRatingButton } from './ContestRatingButton'
import { StandingManualButton } from './StandingManual'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your standing — Partners' }

const BADGE_PILL: Record<string, string> = {
  VERIFIED: 'border-ink-200 bg-ink-100 text-ink-700',
  TRUSTED: 'border-info-200 bg-info-50 text-info-800',
  PREMIER: 'border-pink-200 bg-pink-50 text-pink-800',
}
function Badge({ b }: { b: string }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider', BADGE_PILL[b] ?? BADGE_PILL.VERIFIED)}>{b}</span>
}

export default async function StandingPage() {
  await requireUser()
  const data = await loadStandingPage()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Partner · Standing</p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Your standing &amp; badge</h1>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
              Your badge is earned from four things — Craft, Reliability, Contribution, and Standing —
              not a single rating. A higher badge lowers your platform fee. Everyone starts at Verified;
              thin history never counts against you.
            </p>
          </div>
          <StandingManualButton />
        </div>
      </div>

      {/* Fee ladder — the reward for standing. */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-ink-500" />
          <h2 className="font-display text-[15px] font-semibold text-ink-900">The fee ladder</h2>
          {!data.live && (
            <span className="ml-auto rounded-full border border-warning-200 bg-warning-50 px-2 py-[2px] text-[10.5px] font-semibold text-warning-800">
              Preview — currently {data.baseFeePct} for everyone
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.feeLadder.map((f) => (
            <div key={f.badge} className="rounded-xl border border-ink-200 p-4">
              <Badge b={f.label.toUpperCase()} />
              <p className="mt-2 font-display text-[26px] font-bold tabular-nums leading-none text-ink-900">{f.pct}</p>
              <p className="mt-1 text-[11.5px] text-ink-500">platform production fee</p>
              <p className="mt-2 text-[12px] leading-snug text-ink-600">{f.blurb}</p>
            </div>
          ))}
        </div>
        {!data.live && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
            The merit engine is running in preview. Your badge below shows where you&rsquo;re headed; fees
            don&rsquo;t change until the platform turns tiered pricing on.
          </p>
        )}
      </section>

      {!data.hasManufacturing ? (
        <section className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
          <p className="text-[13.5px] text-ink-600">Standing applies to manufacturing services. Once your manufacturing service is active and completing orders, your badge and pillar breakdown appear here.</p>
        </section>
      ) : (
        data.services.map((s) => <ServiceStanding key={s.serviceId} s={s} live={data.live} />)
      )}

      {/* Ratings you can contest. */}
      {data.ratings.length > 0 && (
        <section className="rounded-2xl border border-ink-200 bg-white p-6">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Recent ratings</h2>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Believe a rating is unfair or meant for another partner? Contest it — an admin reviews every appeal,
            and your standing is frozen against demotion while it&rsquo;s open.
          </p>
          <div className="mt-4 divide-y divide-ink-100">
            {data.ratings.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold tabular-nums text-ink-900">
                    {r.overall.toFixed(1)}★ <span className="ml-1 text-[11px] font-normal uppercase tracking-wide text-ink-400">{r.roleLabel}</span>
                  </p>
                  {r.comment && <p className="mt-0.5 max-w-xl text-[12.5px] text-ink-600">&ldquo;{r.comment}&rdquo;</p>}
                  <p className="mt-0.5 text-[11px] text-ink-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <ContestRatingButton ratingId={r.id} appealStatus={r.appealStatus} excluded={r.excluded} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ServiceStanding({ s, live }: { s: StandingView; live: boolean }) {
  const projectedDiffers = s.projectedBadge !== s.currentBadge
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Award className="h-5 w-5 text-ink-500" />
        <h2 className="font-display text-[17px] font-semibold text-ink-900">{s.serviceLabel}</h2>
        <Badge b={s.currentBadge} />
        {projectedDiffers && (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-pink-700">
            <TrendingUp className="h-3.5 w-3.5" /> {live ? 'Qualifies for' : 'On track for'} {s.projectedBadge}
          </span>
        )}
        {s.meritScore !== null && (
          <span className="ml-auto font-display text-[24px] font-bold tabular-nums leading-none text-ink-900">{Math.round(s.meritScore)}<span className="ml-1 text-[12px] font-normal text-ink-400">/100</span></span>
        )}
      </div>

      {!s.hasSnapshot ? (
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-600">
          Your standing is calculated nightly once you have completed orders. Until then you hold neutral,
          Verified standing — nothing you haven&rsquo;t had the chance to build counts against you.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-3.5">
            {s.pillars.map((p) => (
              <div key={p.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-medium text-ink-900">
                    {p.label}
                    <span className="ml-2 text-[11px] font-normal text-ink-400">weight {p.weightPct}%</span>
                  </p>
                  <p className="text-[13px] font-semibold tabular-nums text-ink-900">{p.score === null ? 'no data yet' : `${Math.round(p.score)}`}</p>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  {p.score !== null && (
                    <div
                      className={cn('h-full rounded-full', p.score >= 80 ? 'bg-success-500' : p.score >= 55 ? 'bg-warning-500' : 'bg-danger-500')}
                      style={{ width: `${Math.max(2, Math.min(100, p.score))}%` }}
                    />
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-ink-500">{p.hint}</p>
              </div>
            ))}
          </div>

          {s.gaps.length > 0 && (
            <div className="mt-5 rounded-xl border border-info-200 bg-info-50 px-4 py-3">
              <p className="text-[12px] font-semibold text-info-900">Your path to the next badge</p>
              <ul className="mt-1.5 space-y-1">
                {s.gaps.map((g, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-info-800">• {g}</li>
                ))}
              </ul>
            </div>
          )}

          {s.promo && (
            <div className="mt-4 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2.5">
              <p className="text-[12.5px] font-semibold text-pink-800">
                🎉 Fee grace active — you&rsquo;re at {s.promo.feePct} platform fee
                {s.promo.source === 'GLOBAL_GRACE' ? ' (welcome offer)' : ''} through {new Date(s.promo.endsAt).toLocaleDateString()}.
              </p>
            </div>
          )}
          <p className="mt-4 text-[12px] text-ink-500">
            Fee today: <strong className="text-ink-700">{s.feeNowPct}</strong>
            {!s.promo && s.feeProjectedPct !== s.feeNowPct && (
              <> · at {s.projectedBadge}: <strong className="text-pink-700">{s.feeProjectedPct}</strong></>
            )}
            {' '}· {s.ordersCompleted} orders · {s.monthsActive} mo active
          </p>
        </>
      )}
    </section>
  )
}
