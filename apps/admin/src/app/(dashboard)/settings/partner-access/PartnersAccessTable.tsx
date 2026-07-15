// Bulk Access list (Partners tab): every partner × key lever effective-state,
// resolver-driven. design/partner-access-admin-prototype.html → "Access list".
// Server component: batched read + resolve; row actions deep-link to the partner
// Access tab (never inline-mutate). docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.

import Link from 'next/link'
import { getPartnerAccessCounts, listPartnerAccessContexts } from '@ilaunchify/db'
import type { PartnerAccessContext, PartnerAccessPolicyValues } from '@ilaunchify/db'
import {
  resolveNamedReviewsAudience,
  resolvePartnerOpportunity,
  type AccessLeverState,
  type AccessOverride,
  type AccessPolicy,
  type LeverResolution,
  type PartnerAccessLever,
  type PartnerFacts,
} from '@ilaunchify/auth'

const PAGE_SIZE = 50

function toFacts(ctx: PartnerAccessContext): PartnerFacts {
  return {
    status: ctx.status,
    participationMode: ctx.participationMode === 'PUBLIC' ? 'PUBLIC' : 'INVITED_ONLY',
    profilePublished: ctx.profilePublished,
    hasFullDisclosureNameable: ctx.hasFullDisclosureNameable,
    isPurePrinter: ctx.isPurePrinter,
    onboardingComplete: ctx.onboardingComplete,
  }
}

function resolve(
  ctx: PartnerAccessContext,
  policy: AccessPolicy,
  lever: PartnerAccessLever,
): LeverResolution {
  const ov = ctx.overrides.find((o) => o.lever === lever)
  const override: AccessOverride | null = ov
    ? { lever, state: ov.state as AccessLeverState, value: ov.value, expiresAt: ov.expiresAt }
    : null
  return resolvePartnerOpportunity(lever, policy, toFacts(ctx), override)
}

function EffCell({ res }: { res: LeverResolution }) {
  let tone: string
  let label: string
  if (res.source === 'master') {
    tone = 'bg-warning-50 text-warning-700 border border-warning-100'
    label = 'Master off'
  } else if (res.source === 'prerequisite') {
    tone = 'bg-warning-50 text-warning-700 border border-warning-100'
    label = 'Blocked'
  } else if (res.source === 'override') {
    tone = res.effective ? 'bg-success-500 text-white' : 'bg-danger-50 text-danger-700 border border-danger-100'
    label = res.effective ? 'On' : 'Denied'
  } else {
    tone = res.effective
      ? 'bg-success-50 text-success-700 border border-success-100'
      : 'bg-ink-100 text-ink-500 border border-ink-200'
    label = res.effective ? 'On' : 'Off'
  }
  const src =
    res.source === 'override'
      ? 'override'
      : res.source === 'prerequisite'
        ? 'prerequisite'
        : res.source === 'master'
          ? 'master'
          : 'default'
  return (
    <div>
      <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold ${tone}`}>
        {label}
      </span>
      <div className="mt-0.5 text-[10px] text-ink-400">{src}</div>
    </div>
  )
}

function tierPill(tier: string) {
  const t = tier.toUpperCase()
  if (t === 'PREMIER') return 'bg-neon-500 text-ink-900'
  if (t === 'TRUSTED') return 'bg-pink-50 text-pink-700 border border-pink-100'
  if (t === 'VERIFIED') return 'bg-info-50 text-info-700 border border-info-100'
  return 'bg-ink-100 text-ink-600 border border-ink-200'
}

export async function PartnersAccessTable({
  policy,
  page,
}: {
  policy: PartnerAccessPolicyValues
  page: number
}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const [counts, rows] = await Promise.all([
    getPartnerAccessCounts(),
    listPartnerAccessContexts({ take: PAGE_SIZE, skip: (safePage - 1) * PAGE_SIZE }),
  ])
  const p = policy as AccessPolicy
  const from = (safePage - 1) * PAGE_SIZE + 1
  const to = (safePage - 1) * PAGE_SIZE + rows.length

  const kpis = [
    { v: counts.publicProfiles, l: 'Public profiles' },
    { v: counts.total, l: 'Total partners' },
    { v: counts.withOverrides, l: 'With overrides' },
    { v: counts.restricted, l: 'Restricted (Deny)' },
    { v: counts.pendingRequests, l: 'Pending requests' },
  ]

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="font-display text-[22px] font-bold text-ink-900">{k.v}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-500">{k.l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-ink-50 text-left">
                {['Partner', 'Tier', 'Public profile', 'Sharing', 'Named reviews', 'Brief intake', 'Rotation', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-ink-200 px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((ctx) => {
                const audience = resolveNamedReviewsAudience(p, ctx.overrides.find((o) => o.lever === 'NAMED_REVIEWS')
                  ? {
                      lever: 'NAMED_REVIEWS',
                      state: ctx.overrides.find((o) => o.lever === 'NAMED_REVIEWS')!.state as AccessLeverState,
                      value: ctx.overrides.find((o) => o.lever === 'NAMED_REVIEWS')!.value,
                    }
                  : null)
                return (
                  <tr key={ctx.partnerId} className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-ink-900">{ctx.companyName}</div>
                      <div className="text-[11px] text-ink-500">
                        {ctx.serviceTypes.join(' · ') || 'No services'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.03em] ${tierPill(ctx.tier)}`}
                      >
                        {ctx.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><EffCell res={resolve(ctx, p, 'PUBLIC_PROFILE')} /></td>
                    <td className="px-3 py-2.5"><EffCell res={resolve(ctx, p, 'PROFILE_SHARING')} /></td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2 py-[2px] text-[11px] font-semibold text-ink-600">
                        {audience === 'any' ? 'Any' : audience === 'anonymous' ? 'Anonymous' : 'Paid only'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><EffCell res={resolve(ctx, p, 'BRIEF_INTAKE')} /></td>
                    <td className="px-3 py-2.5"><EffCell res={resolve(ctx, p, 'PRINT_ROTATION')} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/partners/${ctx.partnerId}/access`}
                        className="inline-flex items-center rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[13px] text-ink-500">
                    No partners on this page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-ink-100 px-3 py-3 text-[12px] text-ink-500">
          <span>
            {rows.length ? `Showing ${from}–${to} of ${counts.total}` : `0 of ${counts.total}`}
          </span>
          <div className="flex gap-2">
            <Link
              aria-disabled={safePage <= 1}
              href={`/settings/partner-access?tab=partners&page=${Math.max(1, safePage - 1)}`}
              className={
                'rounded-full border border-ink-300 bg-white px-3 py-1.5 font-semibold text-ink-900 hover:bg-ink-50 ' +
                (safePage <= 1 ? 'pointer-events-none opacity-40' : '')
              }
            >
              Prev
            </Link>
            <Link
              aria-disabled={to >= counts.total}
              href={`/settings/partner-access?tab=partners&page=${safePage + 1}`}
              className={
                'rounded-full border border-ink-300 bg-white px-3 py-1.5 font-semibold text-ink-900 hover:bg-ink-50 ' +
                (to >= counts.total ? 'pointer-events-none opacity-40' : '')
              }
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
