// REBUILD R15.c — Admin Tier Management module.
//
// Three URL-driven tabs at /admin/tiers?tab=<creators|partners|plans>:
//   - Creators: list every CreatorProfile with current subscriptionTier
//     + last-change timestamp + per-account fee override. Edit drawer
//     (R15.d) lets admin promote/demote and set a feeRateOverrideBp.
//   - Partners: same shape for Partner.tier (Verified/Trusted/Premier).
//     Partner-type filter so admin can scope to MANUFACTURING etc.
//   - Plans & fees: read-only summary table of the 6 SubscriptionPlan
//     rows + their PlanFeature + FeeRule children. Inline editor
//     (R15.e) ships next.
//
// Permission model: requireRole(['ADMIN']) — single role gate; finer
// per-action permissions land when V1.5 brings the staff role split.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Crown, Users, Building2, Sliders } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { CreatorsTab } from './CreatorsTab'
import { PartnersTab } from './PartnersTab'
import { PlansTab } from './PlansTab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tiers & plans — Admin' }

type TabKey = 'creators' | 'partners' | 'plans'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: 'creators', label: 'Creators', icon: Users },
  { key: 'partners', label: 'Partners', icon: Building2 },
  { key: 'plans',    label: 'Plans & fees', icon: Sliders },
]

interface PageProps {
  searchParams: Promise<{
    tab?: string
    q?: string
    tier?: string
    partnerType?: string
  }>
}

export default async function TiersPage({ searchParams }: PageProps) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const activeTab: TabKey = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as TabKey)
    : 'creators'

  // Counts for tab badges — cheap aggregate counts, no row data here.
  const [creatorCount, partnerCount, planCount] = await Promise.all([
    prisma.creatorProfile.count(),
    prisma.partner.count(),
    prisma.subscriptionPlan.count(),
  ])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            <Crown className="h-3.5 w-3.5" /> Admin
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-zinc-900">
            Tiers &amp; plans
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage creator and partner subscription tiers, per-account fee
            overrides, and the platform-wide feature matrix.
          </p>
        </div>
      </header>

      <TabBar
        active={activeTab}
        counts={{ creators: creatorCount, partners: partnerCount, plans: planCount }}
      />

      {activeTab === 'creators' && <CreatorsTab q={sp.q ?? ''} tier={sp.tier ?? ''} />}
      {activeTab === 'partners' && (
        <PartnersTab
          q={sp.q ?? ''}
          tier={sp.tier ?? ''}
          partnerType={sp.partnerType ?? ''}
        />
      )}
      {activeTab === 'plans' && <PlansTab />}
    </div>
  )
}

// =============================================================================
// TabBar — same vocabulary as the creator /products tabs (R11)
// =============================================================================

function TabBar({
  active,
  counts,
}: {
  active: TabKey
  counts: Record<TabKey, number>
}) {
  return (
    <nav
      aria-label="Tier management tabs"
      className="flex flex-wrap items-center gap-1 border-b border-zinc-200"
    >
      {TABS.map((t) => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <Link
            key={t.key}
            href={`/tiers${t.key === 'creators' ? '' : `?tab=${t.key}`}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
              (isActive
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800')
            }
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            <span
              className={
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold ' +
                (isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600')
              }
            >
              {counts[t.key]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
