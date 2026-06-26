// REBUILD R15.c → v2 admin surface uplift (2026-06-01).
//
// Three URL-driven tabs at /admin/tiers?tab=<creators|partners|plans>.
// Page chrome now matches the locked v2 admin pattern:
//   - Cream rounded-3xl hero band w/ eyebrow + h1 + subline + black-pill CTA
//   - 5-card KPI strip (Total accounts / Creator Builder+Agency / Partner
//     Trusted+Premier / Fee overrides / Plans)
//   - Pill-style tab bar (NOT bottom-border) so the page reads as a
//     destination, not a sub-route of a list
//   - Existing CreatorsTab / PartnersTab / PlansTab continue to load
//     their own data — we only re-skin the chrome that wraps them.
//
// See memory: ilaunchify-admin-surface-pattern.md (v2 rules)
// Reference: apps/admin/src/app/(dashboard)/partners/page.tsx
//
// Permission model: requireCapability('tiers:write') — single role gate; finer
// per-action permissions land when V1.5 brings the staff role split.

import Link from 'next/link'
import {
  Users,
  Building2,
  Sliders,
  Star,
  ShieldCheck,
  Receipt,
  LayoutGrid,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { CreatorsTab } from './CreatorsTab'
import { PartnersTab } from './PartnersTab'
import { PlansTab } from './PlansTab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tiers & plans — Admin' }

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

type TabKey = 'creators' | 'partners' | 'plans'

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'creators', label: 'Creators', icon: Users },
  { key: 'partners', label: 'Partners', icon: Building2 },
  { key: 'plans', label: 'Plans & fees', icon: Sliders },
]

function isTabKey(s: string | undefined): s is TabKey {
  return s === 'creators' || s === 'partners' || s === 'plans'
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    tab?: string
    q?: string
    tier?: string
    partnerType?: string
  }>
}

export default async function TiersPage({ searchParams }: PageProps) {
  await requireCapability('tiers:write')
  const sp = await searchParams
  const activeTab: TabKey = isTabKey(sp.tab) ? sp.tab : 'creators'

  // KPI strip data — counts independent of any active filter so the
  // header always shows the platform-wide picture.
  const [
    creatorCount,
    partnerCount,
    planCount,
    creatorTierCounts,
    partnerTierCounts,
    creatorOverrideCount,
    partnerOverrideCount,
  ] = await Promise.all([
    prisma.creatorProfile.count(),
    prisma.partner.count(),
    prisma.subscriptionPlan.count(),
    prisma.creatorProfile.groupBy({
      by: ['subscriptionTier'],
      _count: { _all: true },
    }),
    prisma.partner.groupBy({
      by: ['tier'],
      _count: { _all: true },
    }),
    prisma.creatorProfile.count({ where: { feeRateOverrideBp: { not: null } } }),
    prisma.partner.count({ where: { feeRateOverrideBp: { not: null } } }),
  ])

  const creatorTierMap = new Map(
    creatorTierCounts.map((c) => [c.subscriptionTier as string, c._count._all]),
  )
  const partnerTierMap = new Map(
    partnerTierCounts.map((c) => [c.tier as string, c._count._all]),
  )

  const totalAccounts = creatorCount + partnerCount
  const paidCreatorCount =
    (creatorTierMap.get('BUILDER') ?? 0) + (creatorTierMap.get('AGENCY') ?? 0)
  const upperPartnerCount =
    (partnerTierMap.get('TRUSTED') ?? 0) + (partnerTierMap.get('PREMIER') ?? 0)
  const overrideCount = creatorOverrideCount + partnerOverrideCount

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings · Tiers & Plans"
        title="Tier & plan management"
        description="Manage creator and partner subscription tiers, per-account fee overrides, and the platform-wide feature matrix."
        actions={
          <Link
            href="/tiers?tab=plans"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Sliders className="h-4 w-4" /> Edit plans
          </Link>
        }
      />

      <TiersKpiStrip
        activeTab={activeTab}
        totalAccounts={totalAccounts}
        paidCreatorCount={paidCreatorCount}
        upperPartnerCount={upperPartnerCount}
        overrideCount={overrideCount}
        planCount={planCount}
        creatorCount={creatorCount}
        partnerCount={partnerCount}
      />

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

// -----------------------------------------------------------------------------
// Header — cream band + 5-card KPI strip
// -----------------------------------------------------------------------------

function TiersKpiStrip({
  activeTab,
  totalAccounts,
  paidCreatorCount,
  upperPartnerCount,
  overrideCount,
  planCount,
  creatorCount,
  partnerCount,
}: {
  activeTab: TabKey
  totalAccounts: number
  paidCreatorCount: number
  upperPartnerCount: number
  overrideCount: number
  planCount: number
  creatorCount: number
  partnerCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/tiers"
          label="Total accounts"
          value={totalAccounts}
          icon={Users}
          subline={`${creatorCount} creators · ${partnerCount} partners`}
          active={activeTab === 'creators' || activeTab === 'partners'}
        />
        <KpiCard
          href="/tiers?tab=creators&tier=BUILDER"
          label="Creator Builder+"
          value={paidCreatorCount}
          icon={Star}
          tone="emerald"
          subline="Builder + Agency"
        />
        <KpiCard
          href="/tiers?tab=partners&tier=TRUSTED"
          label="Partner Trusted+"
          value={upperPartnerCount}
          icon={ShieldCheck}
          tone="emerald"
          subline="Trusted + Premier"
        />
        <KpiCard
          href="/tiers?tab=creators&tier=BUILDER"
          label="Fee overrides"
          value={overrideCount}
          icon={Receipt}
          tone="amber"
          subline="Per-account custom rate"
        />
        <KpiCard
          href="/tiers?tab=plans"
          label="Plans"
          value={planCount}
          icon={LayoutGrid}
          tone="sky"
          subline="Creator + partner"
          active={activeTab === 'plans'}
        />
    </div>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  active?: boolean
  subline?: string
}) {
  const ring: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'group-hover:ring-warning-300/60',
    emerald: 'group-hover:ring-success-300/60',
    sky: 'group-hover:ring-info-300/60',
    rose: 'group-hover:ring-danger-300/60',
  }
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
    rose: 'bg-danger-100 text-danger-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// TabBar — pill-style segmented control (v2 pattern)
// -----------------------------------------------------------------------------

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
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-ink-200 bg-white p-0.5"
    >
      {TABS.map((t) => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <Link
            key={t.key}
            href={t.key === 'creators' ? '/tiers' : `/tiers?tab=${t.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
              isActive
                ? 'bg-ink-900 text-white'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            <span
              className={cn(
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
                isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              {counts[t.key]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
