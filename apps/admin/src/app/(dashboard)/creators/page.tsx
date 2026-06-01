// Admin Creators index — read-only CRM (#569).
//
// What this is NOT: the /admin/tiers Creators tab. That surface is for
// per-account tier management — admin promotes / demotes / overrides fee.
// This surface is for understanding *who's on the platform* — name + email,
// current tier, brand count, lifetime revenue, account age. It's the
// counterpart to /admin/partners (which existed first).
//
// V1 columns:
//   • Creator           Display name + email + handle slug
//   • Tier              MAKER / BUILDER / AGENCY pill (links to /tiers#creator-{id})
//   • Brands            Count
//   • Orders            Lifetime count
//   • Revenue           Lifetime totalCents (sum of PAID + COMPLETED orders)
//   • Joined            Account age in days
//
// Filter: URL param `?tier=BUILDER` (matches existing /products?tab=new pattern).
// Search: planned for V1.1 — out of scope today.

import { Users, Crown, Building2, Calendar, DollarSign, ShoppingBag, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Creators — Admin' }

type TierKey = 'MAKER' | 'BUILDER' | 'AGENCY'

const TIER_TONE: Record<TierKey, { bg: string; label: string }> = {
  MAKER: { bg: 'bg-ink-100 text-ink-700', label: 'Maker' },
  BUILDER: { bg: 'bg-pink-100 text-pink-700', label: 'Builder' },
  AGENCY: { bg: 'bg-emerald-100 text-emerald-700', label: 'Agency' },
}

interface PageProps {
  searchParams: Promise<{ tier?: string }>
}

export default async function CreatorsPage({ searchParams }: PageProps) {
  const { tier: tierParam } = await searchParams
  const tier =
    tierParam && ['MAKER', 'BUILDER', 'AGENCY'].includes(tierParam)
      ? (tierParam as TierKey)
      : null

  // One round-trip for the creator rows + brand count + identity.
  const creators = await prisma.creatorProfile.findMany({
    where: tier ? { subscriptionTier: tier } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { brands: true } },
    },
  })

  // Second hop: lifetime order count + revenue. Sum of totalCents for orders
  // that have actually been paid (skip PENDING_PAYMENT / CANCELLED).
  // CreatorProfile.userId → Order.creatorUserId (Order FKs to User, not Profile).
  const creatorUserIds = creators.map((c) => c.user.id)
  const orderAgg =
    creatorUserIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ['creatorUserId'],
          where: {
            creatorUserId: { in: creatorUserIds },
            status: {
              in: [
                'PAID',
                'ROUTING',
                'IN_FULFILLMENT',
                'READY_TO_SHIP',
                'SHIPPED',
                'IN_TRANSIT',
                'DELIVERED',
                'COMPLETED',
              ],
            },
          },
          _count: { _all: true },
          _sum: { totalCents: true },
        })
  const orderByUser = new Map(
    orderAgg.map((r) => [
      r.creatorUserId,
      { count: r._count._all, totalCents: r._sum.totalCents ?? 0 },
    ]),
  )

  // Counts for the tier filter chips — independent of the active filter so
  // the row counts stay stable as the admin toggles.
  const tierCounts = await prisma.creatorProfile.groupBy({
    by: ['subscriptionTier'],
    _count: { _all: true },
  })
  const tierCountMap = new Map(
    tierCounts.map((r) => [r.subscriptionTier, r._count._all]),
  )
  const totalCount = tierCounts.reduce((acc, r) => acc + r._count._all, 0)

  return (
    <div className="space-y-6">
      <Header
        title="Creators"
        subtitle="Every creator with an account, sorted by signup recency. Click a row to manage their tier or open their order history."
        chips={[
          { icon: Users, label: `${totalCount} total` },
          { icon: Crown, label: `${tierCountMap.get('BUILDER') ?? 0} Builder` },
          { icon: Crown, label: `${tierCountMap.get('AGENCY') ?? 0} Agency` },
        ]}
      />

      <FilterChips active={tier} counts={tierCountMap} total={totalCount} />

      {creators.length === 0 ? (
        <EmptyState filtered={tier !== null} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <Th>Creator</Th>
                <Th>Tier</Th>
                <Th className="text-right">Brands</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Joined</Th>
                <Th className="w-[40px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {creators.map((c) => {
                const tone = TIER_TONE[c.subscriptionTier as TierKey] ?? TIER_TONE.MAKER
                const orders = orderByUser.get(c.user.id) ?? {
                  count: 0,
                  totalCents: 0,
                }
                const ageDays = daysSince(c.createdAt)
                return (
                  <tr key={c.id} className="group hover:bg-ink-50/40">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2.5">
                        <Avatar name={c.displayName ?? c.user.name ?? c.user.email} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900">
                            {c.displayName ?? c.user.name ?? '—'}
                          </p>
                          <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
                            {c.user.email}
                          </p>
                          {c.handle && (
                            <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-pink-700">
                              @{c.handle}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/tiers#creator-${c.id}`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                          tone.bg,
                          'transition-opacity hover:opacity-80',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                        )}
                      >
                        <Crown className="h-2.5 w-2.5" aria-hidden="true" />
                        {tone.label}
                      </Link>
                      {c.feeRateOverrideBp !== null && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          fee override · {c.feeRateOverrideBp}bp
                        </p>
                      )}
                    </td>
                    <NumCell n={c._count.brands} icon={Building2} />
                    <NumCell n={orders.count} icon={ShoppingBag} />
                    <td className="px-4 py-3 text-right align-top tabular-nums">
                      <span className="inline-flex items-center gap-1 text-ink-700">
                        <DollarSign
                          className="h-3 w-3 text-ink-400"
                          aria-hidden="true"
                        />
                        <span
                          className={
                            orders.totalCents > 0
                              ? 'font-semibold text-ink-900'
                              : 'text-ink-400'
                          }
                        >
                          {formatRevenue(orders.totalCents)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600">
                        <Calendar className="h-3 w-3 text-ink-400" />
                        {formatAge(ageDays)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      <Link
                        href={`/tiers#creator-${c.id}`}
                        aria-label={`Manage ${c.displayName ?? c.user.email}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Local helpers
// =============================================================================

function FilterChips({
  active,
  counts,
  total,
}: {
  active: TierKey | null
  counts: Map<string, number>
  total: number
}) {
  const filters: Array<{ value: TierKey | null; label: string; count: number }> = [
    { value: null, label: 'All', count: total },
    { value: 'MAKER', label: 'Maker', count: counts.get('MAKER') ?? 0 },
    { value: 'BUILDER', label: 'Builder', count: counts.get('BUILDER') ?? 0 },
    { value: 'AGENCY', label: 'Agency', count: counts.get('AGENCY') ?? 0 },
  ]
  return (
    <nav aria-label="Filter by tier" className="flex flex-wrap gap-2">
      {filters.map((f) => {
        const isActive = active === f.value
        const href = f.value ? `/creators?tier=${f.value}` : '/creators'
        return (
          <Link
            key={f.label}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? 'border-pink-500 bg-pink-500 text-white'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            {f.label}
            <span
              className={cn(
                'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums',
                isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700',
              )}
            >
              {f.count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-pink-200 text-[11px] font-bold text-pink-700"
    >
      {initials || '?'}
    </span>
  )
}

function Header({
  title,
  subtitle,
  chips,
}: {
  title: string
  subtitle: string
  chips: Array<{ icon: typeof Users; label: string }>
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-[#F3EFE8] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
            People & access
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-[3px] text-[11px] font-medium text-ink-700"
            >
              <c.icon className="h-3 w-3" aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={
        'px-4 py-2.5 text-left font-semibold ' + (className ?? '')
      }
    >
      {children}
    </th>
  )
}

function NumCell({
  n,
  icon: Icon,
}: {
  n: number
  icon?: typeof Users
}) {
  return (
    <td className="px-4 py-3 text-right align-top tabular-nums">
      <span className="inline-flex items-center gap-1 text-ink-700">
        {Icon && <Icon className="h-3 w-3 text-ink-400" aria-hidden="true" />}
        <span
          className={n > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'}
        >
          {n}
        </span>
      </span>
    </td>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <Users className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No creators in this tier' : 'No creators yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a different tier filter.'
          : 'New creators land here the moment they finish onboarding.'}
      </p>
    </div>
  )
}

function formatRevenue(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(0)}k`
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 3600 * 1000)))
}

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}
