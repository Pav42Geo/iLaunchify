// Manufacturer Merit console — v2 admin surface (docs/MANUFACTURER_MERIT_ENGINE.md,
// MM-3). Watch the shadow-mode standing engine and calibrate the policy before it
// ever touches a tier or fee. KPIs + per-manufacturer standing + policy simulator.

import { Award, ShieldCheck, Star, GitCompareArrows, Database } from 'lucide-react'
import { KpiWidget } from '@ilaunchify/ui'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { loadMeritConsole, type MeritRow } from './data'
import { MeritConsole } from './MeritConsole'
import { FeeGracePanel } from './FeeGracePanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manufacturer standing — Admin' }

const BADGE_PILL: Record<string, string> = {
  VERIFIED: 'border-ink-200 bg-ink-100 text-ink-700',
  TRUSTED: 'border-info-200 bg-info-50 text-info-800',
  PREMIER: 'border-pink-200 bg-pink-50 text-pink-800',
}

function Badge({ b }: { b: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-[1px] text-[10.5px] font-semibold ${BADGE_PILL[b] ?? BADGE_PILL.VERIFIED}`}>{b}</span>
}

export default async function MeritPage() {
  await requireCapability('billing:write')
  const c = await loadMeritConsole()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Manufacturers"
        title="Manufacturer standing"
        description="Fair, multi-signal merit — Craft, Reliability, Contribution, Standing — earns the badge (Verified → Trusted → Premier) that unlocks the fee tier. Running in SHADOW: the engine proposes standing nightly but never changes a tier or fee until you flip it live (MM-5)."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-10">
        <KpiWidget span={2} label="Verified" value={c.distribution.VERIFIED} tone="ink" icon={ShieldCheck} sublabel="entry · 4.5% fee" />
        <KpiWidget span={2} label="Trusted" value={c.distribution.TRUSTED} tone="info" icon={Award} sublabel="proven · 2.5% fee" />
        <KpiWidget span={2} label="Premier" value={c.distribution.PREMIER} tone="pink" icon={Star} sublabel="top · 0% fee" />
        <KpiWidget span={2} label="Would change" value={c.mismatches} tone={c.mismatches > 0 ? 'warning' : 'success'} icon={GitCompareArrows} sublabel="qualified ≠ current tier" />
        <KpiWidget span={2} label="Engine" value={c.enabled ? 'On (shadow)' : 'Off'} tone="ink" icon={Database} sublabel={c.hasSnapshots ? 'nightly snapshots' : 'no snapshots yet'} />
      </div>

      <MeritConsole
        initial={{
          craftWeight: c.policy.weights.craft, reliabilityWeight: c.policy.weights.reliability,
          contributionWeight: c.policy.weights.contribution, standingWeight: c.policy.weights.standing,
          trustedThreshold: c.policy.thresholds.trusted, premierThreshold: c.policy.thresholds.premier,
          trustedMinOrders: c.policy.evidence.trustedMinOrders, trustedMinMonths: c.policy.evidence.trustedMinMonths,
          premierMinOrders: c.policy.evidence.premierMinOrders, premierMinMonths: c.policy.evidence.premierMinMonths,
          premierMaxDefectPer100: c.policy.evidence.premierMaxDefectPer100, opsConfidence: c.policy.opsConfidence,
          verifiedFeeBps: c.policy.feeBpsByBadge.VERIFIED, trustedFeeBps: c.policy.feeBpsByBadge.TRUSTED, premierFeeBps: c.policy.feeBpsByBadge.PREMIER,
          promoteSustainDays: c.windows.promoteSustainDays, demoteMissDays: c.windows.demoteMissDays, graceDays: c.windows.graceDays,
          enabled: c.enabled,
        }}
      />

      <FeeGracePanel
        initial={{ enabled: c.feeGrace.enabled, value: c.feeGrace.value, unit: c.feeGrace.unit, feeBps: c.feeGrace.feeBps }}
        grants={c.grants}
        manufacturers={c.manufacturers}
      />

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Standing (latest snapshot per manufacturer)</h2>
          <span className="text-[11.5px] text-ink-500">
            {c.enabled
              ? <>Engine <strong className="text-ink-700">live</strong> — fee resolves from the badge.</>
              : <>Shadow: everyone pays the base <strong className="text-ink-700">{c.baseProductionFeePct}</strong> production fee. &ldquo;If live&rdquo; previews the badge fee.</>}
          </span>
        </div>
        {!c.hasSnapshots ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-500">
            No snapshots yet — the nightly merit sweep (<code>/api/cron/merit</code>) hasn&rsquo;t run, or there are no active manufacturers.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-5 py-2.5 font-semibold">Manufacturer</th>
                <th className="px-3 py-2.5 font-semibold">Current → Qualified</th>
                <th className="px-3 py-2.5 font-semibold">Score</th>
                <th className="px-3 py-2.5 font-semibold">Craft/Rel/Contrib/Stand</th>
                <th className="px-3 py-2.5 font-semibold">Orders</th>
                <th className="px-3 py-2.5 font-semibold">Fee now → if live</th>
                <th className="px-5 py-2.5 font-semibold">Next step</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r: MeritRow) => (
                <tr key={r.serviceId} className="border-b border-ink-50 last:border-0">
                  <td className="px-5 py-2.5 font-medium text-ink-900">{r.companyName}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Badge b={r.currentBadge} />
                      {r.qualifiedBadge !== r.currentBadge && (
                        <>
                          <span className="text-ink-400">→</span>
                          <Badge b={r.qualifiedBadge} />
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-ink-900">{r.meritScore}</td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-600">
                    {r.pillars.craft}/{r.pillars.reliability}/{r.pillars.contribution}/{r.pillars.standing}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-700">{r.ordersCompleted}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[12px]">
                    <span className="text-ink-700">{r.feeNowPct}</span>
                    {r.feeWouldChange && (
                      <>
                        <span className="mx-1 text-ink-400">→</span>
                        <span className="font-semibold text-pink-700">{r.feeIfLivePct}</span>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-[12px] text-ink-500">{r.gaps[0] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
