// Partner "Your standing" — page (MM-6, docs/MANUFACTURER_MERIT_ENGINE.md §7).
// Restyled 2026-07-12 1:1 to the "Merit & fee tier" panel of
// design/partner-profile-prototype-v2.html using the settings panel kit.
// Manufacturer-facing merit view: badge, fee ladder, pillars, path to the next
// badge, and ratings they can contest. Honest by design — while the engine is
// in shadow the badge is a labeled projection and thin history never hurts.

import { Award, Star, TrendingUp } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { requireUser } from '@ilaunchify/auth'
import { PanelCard, PanelHeader, InfoBanner, StPill } from '@/components/panel-kit'
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

// Prototype pillar sublines (.pillar .ps) — the fuller engine hints stay on the
// card's title attribute so no explanation is lost.
const PILLAR_SUB: Record<string, string> = {
  craft: 'Quality ratings & low defect rate',
  reliability: 'On-time, few strikes',
  contribution: 'Platform participation',
  standing: 'History & tenure',
}

export default async function StandingPage() {
  await requireUser()
  const data = await loadStandingPage()
  // All services share the partner-level badge — the ladder highlights it.
  const currentBadge = data.services[0]?.currentBadge ?? null
  // Active fee grace/grant (MM-7) — partner-level in practice. Surfaced at the
  // LADDER, not just in the snapshot card: a NEW partner (no snapshot yet) is
  // exactly who the welcome offer applies to.
  const promo = data.services.find((s) => s.promo)?.promo ?? null

  return (
    <div className="space-y-6">
      {/* Merit & fee tier — the prototype's #p-merit panel, no page hero
          (Pavel 2026-07-13). */}
      <PanelCard>
        <PanelHeader
          title="Merit & fee tier"
          desc={
            <>
              Your badge is <b className="font-semibold text-ink-700">earned</b>, not bought — the Merit
              Engine sets your tier and production fee.
            </>
          }
          aside={
            <div className="flex flex-none items-center gap-2.5">
              {!data.live && <StPill tone="warn">Preview — no fee is withheld yet</StPill>}
              <StandingManualButton />
            </div>
          }
        />

        {/* Fee ladder (.fee-ladder / .fee-step). While a welcome offer / grant
            is active, the "you" step shows the PROMO rate you actually pay and
            the badge rate it temporarily replaces. */}
        <div className="grid gap-2.5 sm:grid-cols-3">
          {data.feeLadder.map((f) => {
            const isYou = currentBadge === f.badge
            const promoHere = isYou && promo && promo.feePct !== f.pct
            return (
              <div
                key={f.badge}
                className={cn('rounded-xl border p-3 text-center', isYou ? 'border-pink-500 bg-pink-50' : 'border-ink-200')}
              >
                <p className={cn('text-[11px] font-bold uppercase tracking-[0.03em]', isYou ? 'text-pink-700' : 'text-ink-500')}>
                  {f.label}
                  {isYou && ' · you'}
                </p>
                {promoHere ? (
                  <p className="mt-[3px] font-display text-[22px] font-bold tabular-nums leading-none text-ink-900">
                    <span className="mr-1.5 text-[14px] font-semibold text-ink-400 line-through">{f.pct}</span>
                    {promo.feePct}
                  </p>
                ) : (
                  <p className="mt-[3px] font-display text-[22px] font-bold tabular-nums leading-none text-ink-900">{f.pct}</p>
                )}
                <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
                  {promoHere
                    ? `${promo.source === 'GLOBAL_GRACE' ? 'Welcome offer' : 'Fee grant'} through ${new Date(promo.endsAt).toLocaleDateString()}`
                    : f.blurb}
                </p>
              </div>
            )
          })}
        </div>

        {/* Welcome-offer banner — visible even before the first merit snapshot
            (new partners are exactly who this applies to). */}
        {promo && (
          <InfoBanner tone="ok" icon={<Star />} className="mb-0 mt-4">
            {promo.source === 'GLOBAL_GRACE' ? 'Welcome offer' : 'Fee grant'} active — you pay{' '}
            <b className="font-semibold">{promo.feePct}</b> on every order through{' '}
            {new Date(promo.endsAt).toLocaleDateString()}. After that, your badge sets your fee — earn
            Trusted or Premier before it ends to keep it low.
          </InfoBanner>
        )}
        {!data.live && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
            The merit engine is running in preview — nothing is withheld from your payouts today. Your
            badge below shows where you&rsquo;re headed; the tier fee starts only when the platform turns
            badge economics on.
          </p>
        )}
      </PanelCard>

      {!data.hasManufacturing ? (
        <PanelCard className="p-8 text-center">
          <p className="text-[13.5px] text-ink-600">Standing applies to manufacturing services. Once your manufacturing service is active and completing orders, your badge and pillar breakdown appear here.</p>
        </PanelCard>
      ) : (
        data.services.map((s) => (
          <ServiceStanding key={s.serviceId} s={s} live={data.live} thresholds={data.thresholds} />
        ))
      )}

      {/* Ratings you can contest. */}
      {data.ratings.length > 0 && (
        <PanelCard>
          <PanelHeader
            title="Recent ratings"
            desc={
              <>
                Believe a rating is unfair or meant for another partner? Contest it — an admin reviews
                every appeal, and your standing is frozen against demotion while it&rsquo;s open.
              </>
            }
          />
          <div className="divide-y divide-ink-100">
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
        </PanelCard>
      )}
    </div>
  )
}

function ServiceStanding({
  s,
  live,
  thresholds,
}: {
  s: StandingView
  live: boolean
  thresholds: { trusted: number; premier: number }
}) {
  const projectedDiffers = s.projectedBadge !== s.currentBadge
  const threshold =
    s.projectedBadge === 'PREMIER' ? thresholds.premier : s.projectedBadge === 'TRUSTED' ? thresholds.trusted : null
  return (
    <PanelCard>
      <div className="flex flex-wrap items-center gap-3">
        <Award className="h-5 w-5 text-ink-500" aria-hidden="true" />
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
          {s.currentBadge === 'VERIFIED' ? (
            <>
              Your standing is calculated nightly once you have completed orders. Until then you hold
              neutral, Verified standing — nothing you haven&rsquo;t had the chance to build counts
              against you.
            </>
          ) : (
            // Badge above VERIFIED with no snapshot = an iLaunchify-granted
            // tier (audited admin override). Don't claim "neutral Verified".
            <>
              You hold <b className="font-semibold text-ink-800">{s.currentBadge}</b> standing, granted
              by iLaunchify. Nightly scoring starts once you have completed orders — from then on, the
              four pillars below keep the badge earned.
            </>
          )}
        </p>
      ) : (
        <>
          {/* Snapshot summary (.info-banner, success tone) */}
          {s.meritScore !== null && (
            <InfoBanner tone="ok" icon={<Star />} className="mb-0 mt-4">
              Merit score <b className="font-semibold">{Math.round(s.meritScore)} / 100</b> ·{' '}
              {live ? 'qualifies for' : 'on track for'} {s.projectedBadge}
              {threshold !== null && <> (threshold {threshold})</>} · {s.ordersCompleted.toLocaleString()} orders ·{' '}
              {s.monthsActive} months active
              {s.defectRatePer100 !== null && <> · defect rate {s.defectRatePer100} / 100</>}.
            </InfoBanner>
          )}

          {/* Pillars (.pillars / .pillar) */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.pillars.map((p) => (
              <div key={p.key} className="rounded-xl border border-ink-200 p-3.5" title={p.hint}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-bold text-ink-900">{p.label}</p>
                  <p className="text-[11px] font-semibold text-ink-400">{p.weightPct}%</p>
                </div>
                <div className="mb-1.5 mt-[9px] h-[7px] overflow-hidden rounded-full bg-ink-100">
                  {p.score !== null && (
                    <div
                      className="h-full rounded-full bg-pink-500"
                      style={{ width: `${Math.max(2, Math.min(100, p.score))}%` }}
                    />
                  )}
                </div>
                <p className="font-display text-[20px] font-bold tabular-nums leading-none text-ink-900">
                  {p.score === null ? (
                    <span className="text-[12px] font-normal text-ink-400">no data yet</span>
                  ) : (
                    Math.round(p.score)
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-ink-500">{PILLAR_SUB[p.key] ?? p.hint}</p>
              </div>
            ))}
          </div>

          {s.gaps.length > 0 && (
            <InfoBanner tone="info" className="mb-0 mt-[18px]">
              <p className="font-semibold">Your path to the next badge</p>
              <ul className="mt-1.5 space-y-1">
                {s.gaps.map((g, i) => (
                  <li key={i} className="text-[12.5px] leading-snug">• {g}</li>
                ))}
              </ul>
            </InfoBanner>
          )}

          {/* Promo/grace is surfaced at the fee ladder (partner-level) — here
              just the resolved numbers. */}
          <p className="mt-4 text-[12px] text-ink-500">
            Fee today: <strong className="text-ink-700">{s.feeNowPct}</strong>
            {s.promo && (
              <> ({s.promo.source === 'GLOBAL_GRACE' ? 'welcome offer' : 'fee grant'} through {new Date(s.promo.endsAt).toLocaleDateString()})</>
            )}
            {!s.promo && s.feeProjectedPct !== s.feeNowPct && (
              <> · at {s.projectedBadge}: <strong className="text-pink-700">{s.feeProjectedPct}</strong></>
            )}
            {' '}· {s.ordersCompleted} orders · {s.monthsActive} mo active
          </p>
        </>
      )}
    </PanelCard>
  )
}
