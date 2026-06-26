// Admin Creator detail (#570) — read-only CRM surface.
//
// Counterpart to /admin/partners/[partnerId] but lighter — creators don't
// have a verification FSM, so the page focuses on observability: who is
// this creator, what brands do they run, what have they ordered, what
// subscriptions are active, what tier are they on, who touched their
// account.
//
// Layout (two columns on lg+):
//   LEFT:  HeroHeader (avatar + name + email + handle + tier pill)
//          BrandsCard (count + grid of mini-brand cards)
//          RecentOrdersCard (last 10 orders with status + total)
//   RIGHT: AccountMetaCard (joined / tier history / fee override / Stripe)
//          SubscriptionsCard (recurring production runs)
//          AuditStripCard (last 10 audit events for this creator's userId)
//
// All numbers + lists derive from existing schema with no new columns.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Crown,
  Building2,
  ShoppingBag,
  Calendar,
  DollarSign,
  Repeat,
  History,
  Mail,
  ExternalLink,
  CreditCard,
  AlertTriangle,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ creatorId: string }>
}

type TierKey = 'MAKER' | 'BUILDER' | 'AGENCY'

const TIER_TONE: Record<TierKey, { bg: string; label: string }> = {
  MAKER: { bg: 'bg-ink-100 text-ink-700', label: 'Maker' },
  BUILDER: { bg: 'bg-pink-100 text-pink-700', label: 'Builder' },
  AGENCY: { bg: 'bg-success-100 text-success-700', label: 'Agency' },
}

export async function generateMetadata({ params }: PageProps) {
  const { creatorId } = await params
  const c = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
    select: { displayName: true },
  })
  return { title: `${c?.displayName ?? 'Creator'} — Admin` }
}

export default async function CreatorDetailPage({ params }: PageProps) {
  const { creatorId } = await params

  const creator = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
    include: {
      user: { select: { id: true, email: true, name: true, image: true } },
      brands: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { products: true, orders: true } },
          operatingRegion: { select: { code: true, name: true } },
        },
      },
    },
  })

  if (!creator) notFound()

  // Lifetime + recent orders (10 most recent for the table).
  const [recentOrders, lifetimeAgg, subscriptions, auditRows] =
    await Promise.all([
      prisma.order.findMany({
        where: { creatorUserId: creator.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { brand: { select: { name: true, handle: true } } },
      }),
      prisma.order.aggregate({
        where: {
          creatorUserId: creator.user.id,
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
      }),
      prisma.productionSubscription.findMany({
        where: { creatorUserId: creator.user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          brand: { select: { name: true } },
          product: { select: { name: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { actorId: creator.user.id },
            { entityType: 'CreatorProfile', entityId: creator.id },
          ],
        },
        orderBy: { at: 'desc' },
        take: 10,
      }),
    ])

  const tierTone = TIER_TONE[creator.subscriptionTier as TierKey] ?? TIER_TONE.MAKER
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - creator.createdAt.getTime()) / (24 * 3600 * 1000)),
  )

  return (
    <div className="space-y-6">
      {/* HERO HEADER */}
      <AdminDetailHeader
        backHref="/creators"
        backLabel="All creators"
        eyebrow="Creator profile"
        title={creator.displayName ?? creator.user.name ?? '—'}
        avatar={
          <Avatar name={creator.displayName ?? creator.user.name ?? creator.user.email} size="lg" />
        }
        meta={
          <>
            {creator.handle && (
              <span className="inline-flex items-center gap-1 text-pink-700">
                <span className="font-semibold">@{creator.handle}</span>
              </span>
            )}
            <a
              href={`mailto:${creator.user.email}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/80 px-2.5 py-[3px] text-[11.5px] text-ink-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              {creator.user.email}
            </a>
            <Link
              href={`/tiers#creator-${creator.id}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold uppercase tracking-wider',
                tierTone.bg,
                'transition-opacity hover:opacity-80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              )}
            >
              <Crown className="h-3 w-3" aria-hidden="true" />
              {tierTone.label}
            </Link>
            {creator.feeRateOverrideBp !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-[3px] text-[11.5px] font-semibold text-warning-800 border border-warning-200">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Fee override · {creator.feeRateOverrideBp}bp
              </span>
            )}
          </>
        }
      >
        {/* Stat strip */}
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
          <Stat icon={Building2} label="Brands" value={creator.brands.length} />
          <Stat
            icon={ShoppingBag}
            label="Lifetime orders"
            value={lifetimeAgg._count._all}
          />
          <Stat
            icon={DollarSign}
            label="Lifetime revenue"
            value={formatRevenue(lifetimeAgg._sum.totalCents ?? 0)}
          />
          <Stat icon={Calendar} label="Member for" value={formatAge(ageDays)} />
        </div>
      </AdminDetailHeader>

      {/* TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BrandsCard brands={creator.brands} />
          <RecentOrdersCard rows={recentOrders} />
        </div>
        <div className="space-y-6">
          <AccountMetaCard creator={creator} />
          <SubscriptionsCard rows={subscriptions} />
          <AuditStripCard rows={auditRows} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Cards
// =============================================================================

function BrandsCard({
  brands,
}: {
  brands: Array<{
    id: string
    name: string
    handle: string
    colorPrimary: string | null
    tagline: string | null
    operatingRegion: { code: string; name: string } | null
    _count: { products: number; orders: number }
    createdAt: Date
  }>
}) {
  return (
    <Card
      icon={Building2}
      title="Brands"
      subtitle={
        brands.length === 0
          ? 'No brands yet'
          : `${brands.length} brand${brands.length === 1 ? '' : 's'}`
      }
    >
      {brands.length === 0 ? (
        <Empty label="This creator hasn't created a brand yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {brands.map((b, idx) => (
            <li
              key={b.id}
              className="relative rounded-xl border border-ink-200 bg-white p-3"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-9 w-9 shrink-0 rounded-lg border border-ink-100"
                  style={{
                    backgroundColor: b.colorPrimary ?? '#FF2E63',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{b.name}</p>
                  <p className="mt-0.5 text-[11px] text-pink-700">
                    @{b.handle}
                  </p>
                  {b.tagline && (
                    <p className="mt-1 line-clamp-2 text-[11.5px] text-ink-600">
                      {b.tagline}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12px] uppercase tracking-wider text-ink-700">
                    {b._count.products} prod · {b._count.orders} orders
                    {b.operatingRegion && ` · ${b.operatingRegion.code}`}
                  </p>
                </div>
              </div>
              {idx === 0 && brands.length > 1 && (
                <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-pink-100 px-2 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-pink-700">
                  Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function RecentOrdersCard({
  rows,
}: {
  rows: Array<{
    id: string
    status: string
    totalCents: number
    createdAt: Date
    brand: { name: string; handle: string } | null
  }>
}) {
  return (
    <Card
      icon={ShoppingBag}
      title="Recent orders"
      subtitle={
        rows.length === 0
          ? 'No orders'
          : `Latest ${rows.length} of all time`
      }
      actionHref="/orders"
      actionLabel="All orders"
    >
      {rows.length === 0 ? (
        <Empty label="No orders placed yet." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-3 px-1.5 py-2.5"
            >
              <Link
                href={`/orders/${o.id}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 -mx-1.5 -my-1.5 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                <OrderStatusDot status={o.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink-900">
                    {o.brand?.name ?? 'Untitled brand'}
                  </p>
                  <p className="mt-0.5 text-[12px] uppercase tracking-wider text-ink-700">
                    {o.status.replace(/_/g, ' ').toLowerCase()}
                    {' · '}
                    {new Date(o.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <span className="text-[12.5px] font-semibold tabular-nums text-ink-900">
                  {formatRevenue(o.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AccountMetaCard({
  creator,
}: {
  creator: {
    createdAt: Date
    tierChangedAt: Date | null
    feeRateOverrideBp: number | null
    feeRateOverrideReason: string | null
    stripeTierSubscriptionId: string | null
    tierCurrentPeriodEnd: Date | null
    tierCancelAtPeriodEnd: boolean
    returnsWindowDays: number
    audienceSizeBand: string | null
  }
}) {
  return (
    <Card icon={CreditCard} title="Account" subtitle="Identity + billing meta">
      <dl className="divide-y divide-ink-100 text-[12.5px]">
        <Row label="Joined">
          {creator.createdAt.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Row>
        <Row label="Tier last changed">
          {creator.tierChangedAt
            ? creator.tierChangedAt.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Never (default Maker)'}
        </Row>
        <Row label="Audience">{creator.audienceSizeBand ?? '—'}</Row>
        <Row label="Returns window">{creator.returnsWindowDays} days</Row>
        {creator.stripeTierSubscriptionId && (
          <Row label="Stripe sub">
            <span className="font-mono text-[10.5px] text-ink-700">
              {creator.stripeTierSubscriptionId.slice(0, 18)}…
            </span>
          </Row>
        )}
        {creator.tierCurrentPeriodEnd && (
          <Row
            label={creator.tierCancelAtPeriodEnd ? 'Cancels on' : 'Renews on'}
          >
            <span
              className={
                creator.tierCancelAtPeriodEnd
                  ? 'text-danger-700'
                  : 'text-ink-700'
              }
            >
              {creator.tierCurrentPeriodEnd.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </Row>
        )}
        {creator.feeRateOverrideReason && (
          <Row label="Fee override note">
            <span className="text-warning-800">
              {creator.feeRateOverrideReason}
            </span>
          </Row>
        )}
      </dl>
    </Card>
  )
}

function SubscriptionsCard({
  rows,
}: {
  rows: Array<{
    id: string
    status: string
    cadence: string
    nextRunAt: Date | null
    runsCompleted: number
    totalRuns: number | null
    brand: { name: string } | null
    product: { name: string } | null
  }>
}) {
  return (
    <Card
      icon={Repeat}
      title="Production subscriptions"
      subtitle={
        rows.length === 0
          ? 'No active subscriptions'
          : `${rows.filter((r) => r.status === 'ACTIVE').length} active`
      }
    >
      {rows.length === 0 ? (
        <Empty label="No recurring production runs." />
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-ink-100 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-ink-900">
                  {s.product?.name ?? 'Untitled product'}
                </p>
                <SubStatusPill status={s.status} />
              </div>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {s.brand?.name ?? '—'} · {s.cadence.toLowerCase()}
              </p>
              <p className="mt-1.5 text-[10.5px] tabular-nums text-ink-700">
                Run {s.runsCompleted + 1}
                {s.totalRuns ? ` of ${s.totalRuns}` : ''}
                {s.nextRunAt &&
                  ` · next ${s.nextRunAt.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AuditStripCard({
  rows,
}: {
  rows: Array<{
    id: string
    action: string
    entityType: string
    entityId: string
    at: Date
    actorRole: string
  }>
}) {
  return (
    <Card
      icon={History}
      title="Recent activity"
      subtitle={
        rows.length === 0
          ? 'No audit events'
          : `Latest ${rows.length} events`
      }
      actionHref="/audit"
      actionLabel="Full log"
    >
      {rows.length === 0 ? (
        <Empty label="No audit events for this creator yet." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-[11.5px]">
              <span
                aria-hidden="true"
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink-700">
                  <span className="font-medium text-ink-900">
                    {r.actorRole === 'SYSTEM' ? 'System' : r.actorRole.toLowerCase()}
                  </span>{' '}
                  <span className="text-ink-600">
                    {r.action.toLowerCase().replace(/_/g, ' ')}
                  </span>{' '}
                  <span className="text-ink-500">on {r.entityType}</span>
                </p>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-ink-400">
                {relativeTime(r.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// =============================================================================
// Reusable bits
// =============================================================================

function Card({
  icon: Icon,
  title,
  subtitle,
  actionHref,
  actionLabel,
  children,
}: {
  icon: typeof Building2
  title: string
  subtitle?: string
  actionHref?: string
  actionLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>
            )}
          </div>
        </div>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
          >
            {actionLabel}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

function Avatar({
  name,
  size = 'md',
}: {
  name: string
  size?: 'md' | 'lg'
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const sizeCls =
    size === 'lg'
      ? 'h-16 w-16 text-[20px]'
      : 'h-8 w-8 text-[11px]'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-pink-200 font-bold text-pink-700',
        sizeCls,
      )}
    >
      {initials || '?'}
    </span>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2
  label: string
  value: number | string
}) {
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 font-display text-[20px] font-semibold tabular-nums leading-none tracking-tight text-ink-900">
        {value}
      </p>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <dt className="text-[12px] uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="text-right font-medium text-ink-900">{children}</dd>
    </div>
  )
}

function OrderStatusDot({ status }: { status: string }) {
  const tone: Record<string, string> = {
    PENDING_PAYMENT: 'bg-warning-500',
    PAID: 'bg-pink-500',
    ROUTING: 'bg-info-500',
    IN_FULFILLMENT: 'bg-pink-500',
    READY_TO_SHIP: 'bg-info-500',
    SHIPPED: 'bg-info-500',
    IN_TRANSIT: 'bg-info-500',
    DELIVERED: 'bg-success-500',
    COMPLETED: 'bg-success-500',
    CANCELLED: 'bg-ink-400',
    REFUNDED: 'bg-danger-500',
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone[status] ?? 'bg-ink-400',
      )}
    />
  )
}

function SubStatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    ACTIVE: 'bg-success-50 text-success-700 border-success-200',
    PAUSED: 'bg-warning-50 text-warning-700 border-warning-200',
    CANCELLED: 'bg-ink-100 text-ink-700 border-ink-200',
    COMPLETED: 'bg-pink-50 text-pink-700 border-pink-200',
  }
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider',
        tone[status] ?? 'bg-ink-100 text-ink-700 border-ink-200',
      )}
    >
      {status.toLowerCase()}
    </span>
  )
}

// =============================================================================
// Formatters
// =============================================================================

function formatRevenue(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(0)}k`
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

function relativeTime(d: Date): string {
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}
