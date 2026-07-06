// Partner (manufacturer) dashboard — daily operations cockpit.
//
// Pavel 2026-06-06: "flawless, professional, covers all important metrics +
// daily tasks." Composed from the shared @ilaunchify/ui dashboard widgets so
// it matches the admin surface. Everything is REAL data — no vanity numbers.
//
// Layout:
//   Hero (cream) — welcome + status + quick actions
//   Row 1 — 6 KPIs (awaiting / in production / ready / earned 30d / live products / certs expiring)
//   Row 2 — "Needs your attention" queue (span 8) + production pipeline (span 4)
//   Row 3 — recent dispatches (span 7) + payout activity (span 5)

import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import {
  cn,
  KpiWidget,
  QueueWidget,
  ListWidget,
  TrendChart,
  StatusFunnel,
  type QueueWidgetItem,
  type ListWidgetItem,
} from '@ilaunchify/ui'
import Link from 'next/link'
import {
  Inbox,
  Factory,
  PackageCheck,
  DollarSign,
  Boxes,
  ShieldAlert,
  Plus,
  AlertTriangle,
  Pencil,
  ShieldCheck,
  PackageOpen,
} from 'lucide-react'
import { ActiveWelcomeModal } from './ActiveWelcomeModal'
import { homeEyebrow, heroQuickActions } from '@/lib/role-skins'
import { YourRatingCard, type ServiceRatingView, type RatingCommentView } from './YourRatingCard'

// Feedback module §5.4 — display labels for the "Your rating" card.
const SERVICE_RATING_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  LABEL_PRINTING: 'Print services',
  COPACKING: 'Co-packing',
  WAREHOUSE: 'Fulfillment',
}
const RATING_ROLE_LABEL: Record<string, string> = {
  MANUFACTURER: 'Manufacturing',
  PRINTER: 'Print',
  COPACKER: 'Co-packing',
  WAREHOUSE: 'Fulfillment',
}
function humanizeDim(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — Partners' }

const DAY = 24 * 60 * 60 * 1000

function weeklyBuckets(dates: Date[], weeks = 12): number[] {
  const now = Date.now()
  const out = new Array<number>(weeks).fill(0)
  for (const d of dates) {
    const idx = weeks - 1 - Math.floor((now - d.getTime()) / (7 * DAY))
    if (idx >= 0 && idx < weeks) out[idx] = (out[idx] ?? 0) + 1
  }
  return out
}

function weeklyDollarBuckets(rows: { createdAt: Date; amountCents: number }[], weeks = 12): number[] {
  const now = Date.now()
  const out = new Array<number>(weeks).fill(0)
  for (const r of rows) {
    const idx = weeks - 1 - Math.floor((now - r.createdAt.getTime()) / (7 * DAY))
    if (idx >= 0 && idx < weeks) out[idx] = (out[idx] ?? 0) + r.amountCents / 100
  }
  return out
}

export default async function ProviderDashboardHome() {
  const user = await requireUser()
  // P3 multi-seat: resolve via membership (founder or teammate); the cockpit
  // shows only the services THIS USER may work.
  const access = await getPartnerAccess(user.id)
  if (!access) return null
  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    include: {
      services: {
        where: { id: { in: access.serviceIds } },
        select: {
          id: true,
          type: true,
          // Feedback module §5.4 — the "Your rating" card
          ratingMean: true,
          ratingCount: true,
          ratingDims: true,
        },
      },
      certificateInstances: {
        select: {
          id: true,
          status: true,
          expiryDate: true,
          certificateType: { select: { name: true } },
        },
      },
    },
  })
  if (!partner) return null
  const serviceIds = partner.services.map((s) => s.id)

  // Feedback module §5.4 — rating views + latest creator comments.
  const ratingServices: ServiceRatingView[] = partner.services.map((s) => ({
    serviceLabel: SERVICE_RATING_LABEL[s.type as string] ?? s.type,
    mean: s.ratingMean != null ? Number(s.ratingMean) : null,
    count: s.ratingCount,
    isNew: s.ratingCount > 0 && s.ratingCount < 3,
    dims: Object.entries(
      (s.ratingDims ?? {}) as Record<string, { mean: number; n: number }>,
    ).map(([slug, v]) => ({ label: humanizeDim(slug), mean: v.mean, n: v.n })),
  }))
  const ratingComments: RatingCommentView[] = (
    await prisma.partnerRating.findMany({
      where: { partnerServiceId: { in: serviceIds }, comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { comment: true, overall: true, role: true, createdAt: true },
    })
  ).map((r) => ({
    comment: r.comment!,
    overall: Number(r.overall),
    roleLabel: RATING_ROLE_LABEL[r.role] ?? r.role,
    createdAt: r.createdAt.toISOString(),
  }))

  // Role skin (docs/PARTNER_ROLE_ACCOUNTS.md §2) — copy, quick actions and the
  // FC inbound queue all derive from this user's workable service types.
  const serviceTypes = partner.services.map((s) => s.type as string)
  const isManufacturer = serviceTypes.includes('MANUFACTURING') && access.isAdmin
  const warehouseServiceIds = partner.services
    .filter((s) => (s.type as string) === 'WAREHOUSE')
    .map((s) => s.id)

  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY)
  const in30 = new Date(now.getTime() + 30 * DAY)

  const [dispatches, productGroups, needsChangesProducts, transfers] = await Promise.all([
    serviceIds.length
      ? prisma.orderDispatch.findMany({
          where: { partnerServiceId: { in: serviceIds } },
          select: {
            id: true,
            status: true,
            costCents: true,
            acceptDeadlineAt: true,
            createdAt: true,
            type: true,
            // orderNumber post-dates the generated client → spread it in loosely
            // (sent at runtime, read cast-guarded at the use site) so the known
            // keys stay precisely typed.
            order: { select: { id: true, brand: { select: { name: true } }, ...({ orderNumber: true } as object) } },
          },
          orderBy: { createdAt: 'desc' },
          take: 120,
        })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.productTemplate.groupBy({
          by: ['status'],
          where: { manufacturerServiceId: { in: serviceIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    serviceIds.length
      ? prisma.productTemplate.findMany({
          where: { manufacturerServiceId: { in: serviceIds }, status: 'NEEDS_CHANGES' },
          select: { id: true, name: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([] as Array<{ id: string; name: string; updatedAt: Date }>),
    prisma.transfer.findMany({
      where: { destinationUserId: user.id },
      select: { amountCents: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])

  // FC skin — inbound shipments awaiting receipt confirmation (mirrors the
  // /inbound ownership rule: ship-to service, never dispatch.partnerServiceId)
  // + storage releases awaiting pick (P1 outbound queue; also covers
  // HOLD_AT_MANUFACTURER storing manufacturers).
  const [inboundExpected, releasesAwaitingPick] = await Promise.all([
    warehouseServiceIds.length > 0
      ? prisma.orderDispatch.count({
          where: {
            status: { in: ['SHIPPED', 'IN_TRANSIT'] },
            order: {
              shipToType: 'WAREHOUSE_PARTNER',
              shipToPartnerServiceId: { in: warehouseServiceIds },
            },
          },
        })
      : Promise.resolve(0),
    serviceIds.length
      ? prisma.storageReleaseOrder.count({
          where: {
            status: 'REQUESTED',
            storageAgreement: { partnerServiceId: { in: serviceIds } },
          },
        })
      : Promise.resolve(0),
  ])

  // ---- Dispatch metrics ----
  const dCount = (sts: string[]) => dispatches.filter((d) => sts.includes(d.status as string)).length
  const awaiting = dispatches.filter((d) => d.status === 'PENDING_ACCEPT')
  const inProduction = dCount(['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK'])
  const ready = dCount(['READY'])
  const shipped = dCount(['SHIPPED', 'IN_TRANSIT'])
  const changesRequested = dispatches.filter((d) => d.status === 'CHANGES_REQUESTED')
  const failedQc = dispatches.filter((d) => d.status === 'FAILED_QC')

  // ---- Products ----
  const statusCount = (s: string) =>
    productGroups.find((g) => g.status === s)?._count._all ?? 0
  const liveProducts = statusCount('PUBLISHED')

  // ---- Certs expiring (verified, within 30 days) ----
  const expiringCerts = partner.certificateInstances.filter(
    (c) => c.status === 'VERIFIED' && c.expiryDate > now && c.expiryDate <= in30,
  )

  // ---- Earnings (COMPLETED transfers) ----
  const completed = transfers.filter((t) => t.status === 'COMPLETED')
  const earned30 = completed
    .filter((t) => t.createdAt >= since30)
    .reduce((a, t) => a + t.amountCents, 0)
  const pendingPayout = transfers
    .filter((t) => t.status === 'PENDING' || t.status === 'READY' || t.status === 'EXECUTING')
    .reduce((a, t) => a + t.amountCents, 0)
  const earnSpark = weeklyBuckets(completed.map((t) => t.createdAt))
  const sincePrev60 = new Date(now.getTime() - 60 * DAY)
  const earnedPrev30 = completed
    .filter((t) => t.createdAt >= sincePrev60 && t.createdAt < since30)
    .reduce((a, t) => a + t.amountCents, 0)
  const earnDeltaPct = earnedPrev30 > 0 ? Math.round(((earned30 - earnedPrev30) / earnedPrev30) * 100) : null
  const earnDollarSpark = weeklyDollarBuckets(completed)

  // ---- "Needs your attention" queue ----
  const queue: QueueWidgetItem[] = [
    ...(inboundExpected > 0
      ? [
          {
            id: 'inbound-expected',
            label: `Confirm inbound receipts · ${inboundExpected} shipment${inboundExpected === 1 ? '' : 's'}`,
            sublabel: 'Reconcile received counts against the manifest',
            icon: <PackageOpen className="h-4 w-4" aria-hidden="true" />,
            tone: 'warning' as const,
            primaryAction: { label: 'Receive', href: '/inbound', tone: 'pink' as const },
          },
        ]
      : []),
    ...(releasesAwaitingPick > 0
      ? [
          {
            id: 'releases-awaiting',
            label: `Pick stock releases · ${releasesAwaitingPick} waiting`,
            sublabel: 'Creator-requested releases out of stored stock',
            icon: <PackageOpen className="h-4 w-4" aria-hidden="true" />,
            tone: 'warning' as const,
            primaryAction: { label: 'Open queue', href: '/outbound', tone: 'pink' as const },
          },
        ]
      : []),
    ...awaiting.map((d) => {
      const overdue = d.acceptDeadlineAt < now
      return {
        id: `accept-${d.id}`,
        label: `Accept dispatch · ${d.order.brand.name}`,
        sublabel: overdue
          ? 'Acceptance window passed — respond now'
          : `Respond by ${d.acceptDeadlineAt.toLocaleDateString()} · $${(d.costCents / 100).toFixed(0)}`,
        icon: <Inbox className="h-4 w-4" aria-hidden="true" />,
        tone: (overdue ? 'danger' : 'warning') as 'danger' | 'warning',
        primaryAction: { label: 'Review', href: `/orders/${d.id}`, tone: 'pink' as const },
      }
    }),
    ...changesRequested.map((d) => ({
      id: `chg-${d.id}`,
      label: `Changes requested · ${d.order.brand.name}`,
      sublabel: 'Creator is adjusting the manifest',
      icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
      tone: 'info' as const,
      primaryAction: { label: 'Open', href: `/orders/${d.id}` },
    })),
    ...failedQc.map((d) => ({
      id: `qc-${d.id}`,
      label: `QC failed · ${d.order.brand.name}`,
      sublabel: 'Needs remake or reroute',
      icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" />,
      tone: 'danger' as const,
      primaryAction: { label: 'Open', href: `/orders/${d.id}` },
    })),
    ...needsChangesProducts.map((p) => ({
      id: `prod-${p.id}`,
      label: `Fix product · ${p.name}`,
      sublabel: 'Admin requested changes before it can publish',
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
      tone: 'warning' as const,
      primaryAction: { label: 'Fix', href: `/products/${p.id}/edit`, tone: 'pink' as const },
    })),
    ...expiringCerts.map((c) => ({
      id: `cert-${c.id}`,
      label: `Renew ${c.certificateType.name}`,
      sublabel: `Expires ${c.expiryDate.toLocaleDateString()}`,
      icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
      tone: 'warning' as const,
      primaryAction: { label: 'Renew', href: '/certifications' },
    })),
  ]

  // ---- Production pipeline (proportional funnel) ----
  const pipeline = [
    { label: 'Awaiting acceptance', value: awaiting.length, tone: (awaiting.length > 0 ? 'pink' : 'muted') as 'pink' | 'muted', href: '/orders?tab=awaiting' },
    { label: 'In production', value: inProduction, tone: 'ink' as const, href: '/orders?tab=production' },
    { label: 'Ready to ship', value: ready, tone: (ready > 0 ? 'pink' : 'muted') as 'pink' | 'muted', href: '/orders?tab=ready' },
    { label: 'In transit', value: shipped, tone: 'muted' as const, href: '/orders' },
  ]

  // ---- Recent dispatches + payouts ----
  const recentDispatches: ListWidgetItem[] = dispatches.slice(0, 8).map((d) => ({
    id: d.id,
    label: `${d.order.brand.name} · ${d.type.toLowerCase()}`,
    sublabel: `${(d.order as { orderNumber?: string | null }).orderNumber ?? `#${d.order.id.slice(-8)}`} · ${new Date(d.createdAt).toLocaleDateString()}`,
    value: `$${(d.costCents / 100).toFixed(0)}`,
    href: `/orders/${d.id}`,
    tone: PIPELINE_TONE[d.status as string] ?? 'ink',
  }))
  const recentPayouts: ListWidgetItem[] = transfers.slice(0, 6).map((t, i) => ({
    id: `t-${i}`,
    label: `$${(t.amountCents / 100).toFixed(2)}`,
    sublabel: new Date(t.createdAt).toLocaleDateString(),
    value: t.status.toLowerCase(),
    tone: t.status === 'COMPLETED' ? 'success' : t.status === 'FAILED' || t.status === 'REVERSED' ? 'danger' : 'ink',
  }))

  return (
    <div className="space-y-6">
      {partner.status === 'ACTIVE' && <ActiveWelcomeModal companyName={partner.companyName} />}

      {/* Hero — compact, unified */}
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{homeEyebrow(serviceTypes)}</p>
            <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Welcome back
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-600">
              {partner.companyName} ·{' '}
              {queue.length > 0
                ? `${queue.length} item${queue.length === 1 ? '' : 's'} need your attention`
                : 'You’re all caught up'}
            </p>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            {heroQuickActions(serviceTypes).map((a) =>
              a.primary ? (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
                >
                  <Inbox className="h-4 w-4" aria-hidden="true" /> {a.label}
                </Link>
              ) : (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                >
                  {a.href === '/inbound' ? (
                    <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}{' '}
                  {a.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Needs you now — action-first */}
      <section className="grid grid-cols-1 lg:grid-cols-12">
        <QueueWidget
          title="Needs you now"
          subtitle="Time-sensitive tasks across orders, products & certifications"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tone="warning"
          items={queue}
          maxItems={6}
          emptyLabel="Nothing needs action right now — nice work."
          span={12}
        />
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <KpiWidget label="Awaiting acceptance" value={awaiting.length} icon={Inbox} tone={awaiting.length > 0 ? 'warning' : 'ink'} href="/orders?tab=awaiting" span={2} />
        <KpiWidget label="In production" value={inProduction} icon={Factory} tone="ink" href="/orders?tab=production" span={2} />
        <KpiWidget label="Ready to ship" value={ready} icon={PackageCheck} tone="info" href="/orders?tab=ready" span={2} />
        <KpiWidget label="Earned · 30d" value={`$${(earned30 / 100).toLocaleString()}`} icon={DollarSign} tone="success" sparkline={earnSpark} href="/payments" span={2} />
        {isManufacturer ? (
          <KpiWidget label="Live products" value={liveProducts} icon={Boxes} tone="pink" href="/products?tab=live" span={2} />
        ) : (
          <KpiWidget label="Inbound expected" value={inboundExpected} icon={PackageOpen} tone={inboundExpected > 0 ? 'warning' : 'ink'} href="/inbound" span={2} />
        )}
        <KpiWidget label="Certs expiring" value={expiringCerts.length} icon={ShieldAlert} tone={expiringCerts.length > 0 ? 'danger' : 'ink'} href="/certifications" span={2} />
      </section>

      {/* Earnings trend + production funnel */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-900">Earnings over time</span>
              <span className="text-[11px] text-ink-500">Last 12 weeks</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-ui-title tabular-nums text-ink-900">
                ${(earned30 / 100).toLocaleString()}
              </span>
              {earnDeltaPct != null && (
                <span className={cn('text-[12px] font-semibold', earnDeltaPct >= 0 ? 'text-success-500' : 'text-danger-500')}>
                  <span aria-hidden>{earnDeltaPct >= 0 ? '↑' : '↓'}</span> {Math.abs(earnDeltaPct)}%
                  <span className="font-normal text-ink-500"> vs prior 30d</span>
                </span>
              )}
            </div>
            <TrendChart data={earnDollarSpark} height={72} className="mt-3" ariaLabel="Earnings over time" />
          </div>
        </div>
        <div className="lg:col-span-5">
          <StatusFunnel title="Production pipeline" stages={pipeline} />
        </div>
      </section>

      {/* Row 3 — recent activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ListWidget
          title="Recent dispatches"
          subtitle="Latest production jobs routed to you"
          icon={Factory}
          tone="ink"
          items={recentDispatches}
          emptyLabel="No dispatches yet."
          footerLink={{ href: '/orders', label: 'All orders' }}
          span={7}
        />
        <ListWidget
          title="Payout activity"
          subtitle={`$${(pendingPayout / 100).toLocaleString()} pending payout`}
          icon={DollarSign}
          tone="success"
          items={recentPayouts}
          emptyLabel="No payouts yet."
          footerLink={{ href: '/payments', label: 'Payments' }}
          span={5}
        />
      </section>

      {/* Row 4 — Feedback module §5.4: what creators see, mirrored back */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <YourRatingCard services={ratingServices} comments={ratingComments} span={12} />
      </section>
    </div>
  )
}

const PIPELINE_TONE: Record<string, ListWidgetItem['tone']> = {
  PENDING_ACCEPT: 'warning',
  ACCEPTED: 'info',
  PRODUCING: 'info',
  QUALITY_CHECK: 'info',
  READY: 'success',
  SHIPPED: 'ink',
  IN_TRANSIT: 'ink',
  DELIVERED: 'success',
  FAILED_QC: 'danger',
  CHANGES_REQUESTED: 'warning',
}
