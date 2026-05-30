// REBUILD R15.d — admin per-partner tier + override edit page.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { listEntityHistory } from '@ilaunchify/audit'
import { AccountTierEditor } from '../../AccountTierEditor'
import { PARTNER_TIER_STYLE, tierPillStyle } from '../../tier-style'
// R16.c — decision-support card showing how close the partner is to the
// next tier. Pure computation against today's schema; final promotion is
// still a human call via the AccountTierEditor below.
import { PromotionCriteriaCard } from '../../PromotionCriteriaCard'
import { computePartnerPromotionCriteria } from '../../promotion-criteria'

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
  await requireRole(['ADMIN'])
  const { id } = await params

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      services: { select: { type: true } },
    },
  })
  if (!partner) notFound()

  const [history, promotionCriteria] = await Promise.all([
    listEntityHistory('Partner', partner.id, 20),
    computePartnerPromotionCriteria(
      partner.id,
      partner.tier,
      partner.tierChangedAt,
    ),
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
        className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All partners
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Partner
          </div>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-zinc-900">
            {partner.companyName}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
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
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[12.5px] text-amber-900">
          <strong>Heads up:</strong> this partner isn&apos;t ACTIVE yet, so the
          tier is informational only. The gates light up once the 4-section
          verification clears.
        </div>
      )}

      <PromotionCriteriaCard result={promotionCriteria} />

      <AccountTierEditor
        audience="PARTNER"
        entityId={partner.id}
        currentTier={partner.tier}
        currentFeeOverrideBp={partner.feeRateOverrideBp}
        currentFeeOverrideReason={partner.feeRateOverrideReason}
        backHref="/tiers?tab=partners"
      />

      <HistoryCard history={history} />
    </div>
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
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Tier &amp; fee history
        </h2>
      </header>
      {filtered.length === 0 ? (
        <p className="p-5 text-[13px] text-zinc-500">
          No prior tier or fee-override changes for this partner.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-100 text-[12.5px]">
          {filtered.map((h) => (
            <li key={h.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-500">
                  {h.action}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              </div>
              {(h.fromValue || h.toValue) && (
                <div className="mt-0.5 text-zinc-700">
                  <span className="font-mono text-zinc-500">{h.fromValue ?? '∅'}</span>
                  {' → '}
                  <span className="font-mono">{h.toValue ?? '∅'}</span>
                </div>
              )}
              {h.payload &&
                typeof h.payload === 'object' &&
                'reason' in (h.payload as Record<string, unknown>) && (
                  <p className="mt-1 text-[12px] italic text-zinc-600">
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
