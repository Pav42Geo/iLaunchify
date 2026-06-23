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
import { requireUser } from '@ilaunchify/auth'
import {
  cn,
  KpiWidget,
  QueueWidget,
  StatusWidget,
  ListWidget,
  type QueueWidgetItem,
  type StatusIndicator,
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
  Truck,
} from 'lucide-react'
import { ActiveWelcomeModal } from './ActiveWelcomeModal'

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

export default async function ProviderDashboardHome() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: { select: { id: true } },
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
            order: { select: { id: true, brand: { select: { name: true } } } },
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

  // ---- "Needs your attention" queue ----
  const queue: QueueWidgetItem[] = [
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

  // ---- Production pipeline ----
  const pipeline: StatusIndicator[] = [
    { label: 'Awaiting acceptance', value: String(awaiting.length), status: awaiting.length > 0 ? 'amber' : 'green' },
    { label: 'In production', value: String(inProduction), status: 'green' },
    { label: 'Ready to ship', value: String(ready), status: ready > 0 ? 'amber' : 'green' },
    { label: 'In transit', value: String(shipped), status: 'green' },
    { label: 'QC failed', value: String(failedQc.length), status: failedQc.length > 0 ? 'red' : 'green' },
  ]

  // ---- Recent dispatches + payouts ----
  const recentDispatches: ListWidgetItem[] = dispatches.slice(0, 8).map((d) => ({
    id: d.id,
    label: `${d.order.brand.name} · ${d.type.toLowerCase()}`,
    sublabel: `#${d.order.id.slice(-8)} · ${new Date(d.createdAt).toLocaleDateString()}`,
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

      {/* Hero */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Manufacturing · Dashboard
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Welcome back
            </h1>
            <p className="mt-1 text-[13px] text-ink-600">
              {partner.companyName} ·{' '}
              {queue.length > 0
                ? `${queue.length} item${queue.length === 1 ? '' : 's'} need your attention`
                : 'You’re all caught up'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/products/new"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New product
            </Link>
            <Link
              href="/orders?tab=awaiting"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Inbox className="h-4 w-4" aria-hidden="true" /> Order inbox
            </Link>
          </div>
        </div>
      </div>

      {/* Row 1 — KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <KpiWidget label="Awaiting acceptance" value={awaiting.length} icon={Inbox} tone={awaiting.length > 0 ? 'warning' : 'ink'} href="/orders?tab=awaiting" span={2} />
        <KpiWidget label="In production" value={inProduction} icon={Factory} tone="ink" href="/orders?tab=production" span={2} />
        <KpiWidget label="Ready to ship" value={ready} icon={PackageCheck} tone="info" href="/orders?tab=ready" span={2} />
        <KpiWidget label="Earned · 30d" value={`$${(earned30 / 100).toLocaleString()}`} icon={DollarSign} tone="success" sparkline={earnSpark} href="/payments" span={2} />
        <KpiWidget label="Live products" value={liveProducts} icon={Boxes} tone="pink" href="/products?tab=live" span={2} />
        <KpiWidget label="Certs expiring" value={expiringCerts.length} icon={ShieldAlert} tone={expiringCerts.length > 0 ? 'danger' : 'ink'} href="/certifications" span={2} />
      </section>

      {/* Row 2 — attention queue + pipeline */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <QueueWidget
          title="Needs your attention"
          subtitle="Time-sensitive tasks across orders, products & certifications"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tone="warning"
          items={queue}
          maxItems={8}
          emptyLabel="Nothing needs action right now — nice work."
          span={8}
        />
        <StatusWidget
          title="Production pipeline"
          subtitle="Dispatches by stage"
          icon={Truck}
          tone="ink"
          indicators={pipeline}
          span={4}
        />
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
