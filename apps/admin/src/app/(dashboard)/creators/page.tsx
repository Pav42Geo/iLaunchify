// Admin Creators list — advanced (post Pavel 2026-06-01).
//
// Mirrors the partners list pattern: cream header band + KPI strip +
// URL-driven filter chips + sortable table + RowActionsMenu.
// See memory: ilaunchify-admin-surface-pattern.md
//
// Query params:
//   ?q=jane            — search displayName / handle / user.email / user.name
//   ?tier=BUILDER      — filter by subscriptionTier
//   ?sort=joined|name|revenue|orders — default "joined" (newest)
//   ?page=2            — pagination (50 / page)

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import {
  Users,
  Crown,
  Building2,
  Calendar,
  DollarSign,
  ShoppingBag,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { CreatorRowActions } from './CreatorRowActions'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Creators — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

type TierKey = 'MAKER' | 'BUILDER' | 'AGENCY'

const TIER_ORDER: TierKey[] = ['MAKER', 'BUILDER', 'AGENCY']

const TIER_LABELS: Record<TierKey, string> = {
  MAKER: 'Maker',
  BUILDER: 'Builder',
  AGENCY: 'Agency',
}

const TIER_TONE: Record<TierKey, { dot: string; bg: string; text: string; border: string }> = {
  MAKER: { dot: 'bg-ink-400', bg: 'bg-ink-50', text: 'text-ink-700', border: 'border-ink-200' },
  BUILDER: { dot: 'bg-pink-500', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  AGENCY: { dot: 'bg-success-500', bg: 'bg-success-700', text: 'text-success-900', border: 'border-success-200' },
}

// Cast through `unknown` then to `never` at the call site keeps Prisma's
// runtime arg untouched while side-stepping the readonly-tuple → mutable
// enum-array mismatch in the generated types.
const PAID_ORDER_STATUSES: string[] = [
  'PAID',
  'ROUTING',
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
]

const PAGE_SIZE = 50

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    tier?: string
    sort?: string
    page?: string
  }>
}

function isValidTier(s: string | undefined): s is TierKey {
  return !!s && TIER_ORDER.includes(s as TierKey)
}
function parseSort(s: string | undefined): 'joined' | 'name' | 'revenue' | 'orders' {
  if (s === 'name' || s === 'revenue' || s === 'orders') return s
  return 'joined'
}

export default async function CreatorsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const tier = isValidTier(sp.tier) ? sp.tier : undefined
  const sort = parseSort(sp.sort)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Where clause shared across queries
  const where = {
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { handle: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(tier ? { subscriptionTier: tier } : {}),
  }

  // KPI strip data — counts by tier independent of filter so chips stay stable
  const [totalCount, tierCounts, lifetimeRevenue, newThisMonthCount, total, creators] = await Promise.all([
    prisma.creatorProfile.count(),
    prisma.creatorProfile.groupBy({ by: ['subscriptionTier'], _count: { _all: true } }),
    prisma.order.aggregate({
      where: { status: { in: PAID_ORDER_STATUSES as never } },
      _sum: { totalCents: true },
    }),
    prisma.creatorProfile.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.creatorProfile.count({ where }),
    prisma.creatorProfile.findMany({
      where,
      orderBy: sort === 'name' ? { displayName: 'asc' } : { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { brands: true } },
      },
    }),
  ])

  const tierCountMap = new Map(tierCounts.map((c) => [c.subscriptionTier as TierKey, c._count._all]))

  // Lifetime order count + revenue per creator (second hop — needed for
  // table cells, possible sort, and revenue KPI). Skip the round-trip
  // entirely if the page is empty.
  const creatorUserIds = creators.map((c) => c.user.id)
  const orderAgg =
    creatorUserIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ['creatorUserId'],
          where: {
            creatorUserId: { in: creatorUserIds },
            status: { in: PAID_ORDER_STATUSES as never },
          },
          _count: { _all: true },
          _sum: { totalCents: true },
        })
  const orderByUser = new Map(
    orderAgg.map((r) => [
      r.creatorUserId,
      {
        count: (r._count as { _all?: number } | null | undefined)?._all ?? 0,
        totalCents: r._sum?.totalCents ?? 0,
      },
    ]),
  )

  // For revenue / orders sort, re-sort the page in-memory (Prisma can't
  // orderBy on aggregated foreign-relation sums without a raw query).
  let pageRows = creators
  if (sort === 'revenue') {
    pageRows = [...creators].sort((a, b) => {
      const ra = orderByUser.get(a.user.id)?.totalCents ?? 0
      const rb = orderByUser.get(b.user.id)?.totalCents ?? 0
      return rb - ra
    })
  } else if (sort === 'orders') {
    pageRows = [...creators].sort((a, b) => {
      const oa = orderByUser.get(a.user.id)?.count ?? 0
      const ob = orderByUser.get(b.user.id)?.count ?? 0
      return ob - oa
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* HEADER (cream band) */}
      <Header
        totalCount={totalCount}
        makerCount={tierCountMap.get('MAKER') ?? 0}
        builderCount={tierCountMap.get('BUILDER') ?? 0}
        agencyCount={tierCountMap.get('AGENCY') ?? 0}
        lifetimeRevenueCents={lifetimeRevenue._sum?.totalCents ?? 0}
        newThisMonthCount={newThisMonthCount}
      />

      {/* FILTER BAR */}
      <FilterBar
        q={q}
        tier={tier}
        sort={sort}
        tierCountMap={tierCountMap}
        total={total}
      />

      {/* TABLE */}
      {pageRows.length === 0 ? (
        <EmptyState filtered={Boolean(q || tier)} />
      ) : (
        <CreatorsTable rows={pageRows} orderByUser={orderByUser} sort={sort} />
      )}

      {/* PAGINATION */}
      <Pagination page={page} totalPages={totalPages} sp={sp} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({
  totalCount,
  makerCount,
  builderCount,
  agencyCount,
  lifetimeRevenueCents,
  newThisMonthCount,
}: {
  totalCount: number
  makerCount: number
  builderCount: number
  agencyCount: number
  lifetimeRevenueCents: number
  newThisMonthCount: number
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Users & Roles · Creators"
        title="Creator roster"
        description="Every creator on the platform — tier, brand portfolio, lifetime spend, and account age in one place."
        actions={
          <Link
            href="/tiers"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Crown className="h-4 w-4" />
            Manage tiers
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/creators"
          label="Total"
          value={totalCount.toLocaleString()}
          icon={Users}
          active
          subline={newThisMonthCount > 0 ? `+${newThisMonthCount} this month` : undefined}
        />
        <KpiCard
          href="/creators?tier=MAKER"
          label="Maker"
          value={makerCount.toLocaleString()}
          icon={Users}
        />
        <KpiCard
          href="/creators?tier=BUILDER"
          label="Builder"
          value={builderCount.toLocaleString()}
          icon={Crown}
          tone="pink"
        />
        <KpiCard
          href="/creators?tier=AGENCY"
          label="Agency"
          value={agencyCount.toLocaleString()}
          icon={Sparkles}
          tone="emerald"
        />
        <KpiCard
          href="/creators?sort=revenue"
          label="Lifetime revenue"
          value={formatRevenue(lifetimeRevenueCents)}
          icon={DollarSign}
          tone="amber"
        />
      </div>
    </>
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
  value: string
  icon: typeof Users
  tone?: 'amber' | 'emerald' | 'sky' | 'pink' | 'rose'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-warning-300/60',
    emerald: 'group-hover:ring-success-300/60',
    sky: 'group-hover:ring-info-300/60',
    pink: 'group-hover:ring-pink-300/60',
    rose: 'group-hover:ring-danger-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
    pink: 'bg-pink-100 text-pink-700',
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
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value}</p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// FilterBar
// -----------------------------------------------------------------------------

function FilterBar({
  q,
  tier,
  sort,
  tierCountMap,
  total,
}: {
  q: string
  tier: TierKey | undefined
  sort: 'joined' | 'name' | 'revenue' | 'orders'
  tierCountMap: Map<TierKey, number>
  total: number
}) {
  const buildHref = (overrides: Partial<{ tier: string; sort: string; q: string }>) => {
    const params = new URLSearchParams()
    const finalQ = overrides.q !== undefined ? overrides.q : q
    const finalTier = overrides.tier !== undefined ? overrides.tier : tier ?? ''
    const finalSort = overrides.sort !== undefined ? overrides.sort : sort
    if (finalQ) params.set('q', finalQ)
    if (finalTier) params.set('tier', finalTier)
    if (finalSort && finalSort !== 'joined') params.set('sort', finalSort)
    const qs = params.toString()
    return `/creators${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, handle, or email…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {tier && <input type="hidden" name="tier" value={tier} />}
        {sort !== 'joined' && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {(q || tier || sort !== 'joined') && (
          <Link
            href="/creators"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        {/* Right: sort + count */}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{total.toLocaleString()} results</span>
          <SortToggle currentSort={sort} buildHref={buildHref} />
        </div>
      </form>

      {/* Tier chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Tier
        </span>
        <FilterChip href={buildHref({ tier: '' })} active={!tier} label="All" count={null} />
        {TIER_ORDER.map((t) => (
          <FilterChip
            key={t}
            href={buildHref({ tier: t })}
            active={tier === t}
            label={TIER_LABELS[t]}
            count={tierCountMap.get(t) ?? 0}
            tone={TIER_TONE[t]}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  tone?: { bg: string; text: string; border: string; dot: string }
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : tone
            ? `${tone.bg} ${tone.text} ${tone.border} hover:bg-white`
            : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {tone && !active && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {label}
      {count !== null && (
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
          {count}
        </span>
      )}
    </Link>
  )
}

function SortToggle({
  currentSort,
  buildHref,
}: {
  currentSort: 'joined' | 'name' | 'revenue' | 'orders'
  buildHref: (o: Partial<{ tier: string; sort: string; q: string }>) => string
}) {
  const options: { value: 'joined' | 'name' | 'revenue' | 'orders'; label: string }[] = [
    { value: 'joined', label: 'Newest joined' },
    { value: 'name', label: 'Name A→Z' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'orders', label: 'Orders' },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={buildHref({ sort: o.value })}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
            currentSort === o.value
              ? 'bg-ink-900 text-white'
              : 'text-ink-600 hover:bg-ink-50',
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

type CreatorRow = {
  id: string
  userId: string
  displayName: string | null
  handle: string | null
  subscriptionTier: string
  feeRateOverrideBp: number | null
  createdAt: Date
  user: { id: string; email: string; name: string | null }
  _count: { brands: number }
}

function CreatorsTable({
  rows,
  orderByUser,
  sort,
}: {
  rows: CreatorRow[]
  orderByUser: Map<string, { count: number; totalCents: number }>
  sort: 'joined' | 'name' | 'revenue' | 'orders'
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Creator</Th>
            <Th>Tier</Th>
            <Th className="text-right">Brands</Th>
            <Th className="text-right">Orders</Th>
            <Th className="text-right">Revenue</Th>
            <Th className="text-right">Joined</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((c) => {
            const tier = (TIER_ORDER.includes(c.subscriptionTier as TierKey)
              ? c.subscriptionTier
              : 'MAKER') as TierKey
            const tone = TIER_TONE[tier]
            const orders = orderByUser.get(c.user.id) ?? { count: 0, totalCents: 0 }
            const ageDays = daysSince(c.createdAt)
            const displayName = c.displayName ?? c.user.name ?? c.user.email
            return (
              <tr key={c.id} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/creators/${c.id}`}
                    className="flex items-start gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                  >
                    <Avatar name={displayName} />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900 hover:text-pink-700">
                        {displayName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-500">{c.user.email}</p>
                      {c.handle && (
                        <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-pink-700">
                          @{c.handle}
                        </p>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      tone.bg,
                      tone.text,
                      tone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {TIER_LABELS[tier]}
                  </span>
                  {c.feeRateOverrideBp !== null && (
                    <p className="mt-1 text-[10px] text-warning-700">
                      fee override · {c.feeRateOverrideBp}bp
                    </p>
                  )}
                </td>
                <NumCell n={c._count.brands} icon={Building2} />
                <NumCell n={orders.count} icon={ShoppingBag} />
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span className="inline-flex items-center gap-1 text-ink-700">
                    <DollarSign className="h-3 w-3 text-ink-400" aria-hidden="true" />
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
                <td className="px-3 py-3 text-right align-top">
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600">
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatAge(ageDays)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <CreatorRowActions
                    creatorId={c.id}
                    userId={c.userId}
                    displayName={displayName}
                    email={c.user.email}
                    handle={c.handle ?? null}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sort === 'revenue' || sort === 'orders' ? (
        <div className="border-t border-ink-100 bg-ink-50/40 px-4 py-2 text-[10.5px] italic text-ink-500">
          Sorted across this page only — switch to “Newest joined” for global order.
        </div>
      ) : null}
    </div>
  )
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function NumCell({
  n,
  icon: Icon,
}: {
  n: number
  icon?: typeof Users
}) {
  return (
    <td className="px-3 py-3 text-right align-top tabular-nums">
      <span className="inline-flex items-center gap-1 text-ink-700">
        {Icon && <Icon className="h-3 w-3 text-ink-400" aria-hidden="true" />}
        <span className={n > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'}>{n}</span>
      </span>
    </td>
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

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number
  totalPages: number
  sp: { q?: string; tier?: string; sort?: string }
}) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set('q', sp.q)
    if (sp.tier) params.set('tier', sp.tier)
    if (sp.sort) params.set('sort', sp.sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/creators${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <Users className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No creators match' : 'No creators yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'New creators land here the moment they finish onboarding.'}
      </p>
      {filtered && (
        <Link
          href="/creators"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Local helpers
// -----------------------------------------------------------------------------

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
