// REBUILD R15.d — admin per-partner tier + override edit page.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { listEntityHistory } from '@ilaunchify/audit'
import { AccountTierEditor } from '../../AccountTierEditor'
import { PARTNER_TIER_STYLE, tierPillStyle } from '../../tier-style'
// Partner-tier-vs-Merit decision C (docs/PARTNER_TIER_VS_MERIT.md): the Merit
// Engine is the single brain for partner standing. This page shows the
// Merit-computed path to the next badge (superseding the old promotion-criteria
// card) and treats the hand-set tier below as an admin OVERRIDE.
import { Award, ArrowUpRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Warehouse',
  ACCESSORY: 'Accessory',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PartnerTierEditPage({ params }: PageProps) {
  await requireCapability('tiers:write')
  const { id } = await params

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      services: { select: { id: true, type: true } },
    },
  })
  if (!partner) notFound()

  // Merit standing is manufacturing-scoped; the badge lives on Partner.tier.
  const mfgService = partner.services.find((s) => s.type === 'MANUFACTURING')
  const [history, snap] = await Promise.all([
    listEntityHistory('Partner', partner.id, 20),
    mfgService
      ? prisma.partnerMeritSnapshot
          .findFirst({ where: { partnerServiceId: mfgService.id }, orderBy: { computedAt: 'desc' } })
          .catch(() => null)
      : Promise.resolve(null),
  ])
  const palette = PARTNER_TIER_STYLE[partner.tier]
  const tierPending = partner.tier === 'VERIFIED' && partner.status !== 'ACTIVE'
  const serviceLabels = partner.services
    .map((s) => SERVICE_LABEL[s.type] ?? s.type)
    .join(' · ')

  return (
    <div className="space-y-6">
      <Link
        href="/tiers?tab=partners"
        className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All partners
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ink-200 bg-white p-5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
            Partner
          </div>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink-900">
            {partner.companyName}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {partner.user.email} · {serviceLabels || 'No services'} ·{' '}
            <span className="font-mono">{partner.status}</span>
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{ ...tierPillStyle(palette), opacity: tierPending ? 0.55 : 1 }}
          title={
            tierPending
              ? 'Tier becomes effective once partner status flips to ACTIVE'
              : undefined
          }
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          {palette.label}
          {tierPending && <Lock className="ml-0.5 h-2.5 w-2.5" aria-hidden="true" />}
        </span>
      </header>

      {tierPending && (
        <div className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-[12.5px] text-warning-900">
          <strong>Heads up:</strong> this partner isn&apos;t ACTIVE yet, so the
          tier is informational only. The gates light up once the 4-section
          verification clears.
        </div>
      )}

      <MeritStandingCard hasMfg={!!mfgService} snap={snap} currentTier={partner.tier} />

      <div className="rounded-xl border border-ink-200 bg-white">
        <div className="border-b border-ink-100 px-5 py-3">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">Admin override</h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            The Merit Engine assigns the badge automatically when live. Use this only to override a
            manufacturer&rsquo;s tier by hand (audited); a fee-grace promo is the better tool for a temporary break.
          </p>
        </div>
        <div className="p-5">
          <AccountTierEditor
            audience="PARTNER"
            entityId={partner.id}
            currentTier={partner.tier}
            currentFeeOverrideBp={partner.feeRateOverrideBp}
            currentFeeOverrideReason={partner.feeRateOverrideReason}
            backHref="/tiers?tab=partners"
          />
        </div>
      </div>

      <HistoryCard history={history} />
    </div>
  )
}

function MeritStandingCard({
  hasMfg,
  snap,
  currentTier,
}: {
  hasMfg: boolean
  snap: { qualifiedBadge: string; meritScore: unknown; gapsJson: unknown; computedAt: Date } | null
  currentTier: string
}) {
  if (!hasMfg) {
    return (
      <section className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-ink-500" />
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Standing</h2>
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-500">
          Merit standing applies to manufacturing services. This partner has no manufacturing service, so no badge is computed.
        </p>
      </section>
    )
  }
  const gaps = Array.isArray(snap?.gapsJson) ? (snap!.gapsJson as string[]) : []
  const score = snap?.meritScore == null ? null : Math.round(Number(snap.meritScore))
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-ink-500" />
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Standing (Merit Engine)</h2>
        </div>
        <a href="/merit" className="inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 hover:text-pink-900">
          Open Merit console <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="mt-1 text-[12px] text-ink-500">
        The badge is earned from the manufacturer&rsquo;s performance — it is not set here. This is the Merit-computed path to the next badge.
      </p>
      {!snap ? (
        <p className="mt-3 text-[12.5px] text-ink-500">
          No snapshot yet — standing is computed nightly once the manufacturer is active and completing orders.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-ink-500">Current</span>
            <span className="font-semibold text-ink-900">{currentTier}</span>
            {snap.qualifiedBadge !== currentTier && (
              <>
                <span className="text-ink-400">→ qualifies for</span>
                <span className="font-semibold text-pink-700">{snap.qualifiedBadge}</span>
              </>
            )}
            {score !== null && <span className="ml-auto tabular-nums text-ink-600">score {score}/100</span>}
          </div>
          {gaps.length > 0 && (
            <div className="rounded-lg border border-info-200 bg-info-50 px-3 py-2">
              <p className="text-[11.5px] font-semibold text-info-900">Path to the next badge</p>
              <ul className="mt-1 space-y-0.5">
                {gaps.map((g, i) => (
                  <li key={i} className="text-[12px] text-info-800">• {g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function HistoryCard({
  history,
}: {
  history: Awaited<ReturnType<typeof listEntityHistory>>
}) {
  // Filter to tier/override-related actions so the partner audit log
  // (which mixes onboarding, files, etc.) doesn't swamp this view.
  const tierActions = new Set([
    'PARTNER_TIER_CHANGE',
    'FEE_OVERRIDE_SET',
    'FEE_OVERRIDE_CLEAR',
  ])
  const filtered = history.filter((h) => tierActions.has(h.action))
  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 px-5 py-3">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
          Tier &amp; fee history
        </h2>
      </header>
      {filtered.length === 0 ? (
        <p className="p-5 text-[13px] text-ink-500">
          No prior tier or fee-override changes for this partner.
        </p>
      ) : (
        <ol className="divide-y divide-ink-100 text-[12.5px]">
          {filtered.map((h) => (
            <li key={h.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-500">
                  {h.action}
                </span>
                <span className="text-[11px] text-ink-500">
                  {new Date(h.at).toLocaleString()}
                </span>
              </div>
              {(h.fromValue || h.toValue) && (
                <div className="mt-0.5 text-ink-700">
                  <span className="font-mono text-ink-500">{h.fromValue ?? '∅'}</span>
                  {' → '}
                  <span className="font-mono">{h.toValue ?? '∅'}</span>
                </div>
              )}
              {h.payload &&
                typeof h.payload === 'object' &&
                'reason' in (h.payload as Record<string, unknown>) && (
                  <p className="mt-1 text-[12px] italic text-ink-600">
                    &ldquo;{String((h.payload as Record<string, unknown>).reason)}&rdquo;
                  </p>
                )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
