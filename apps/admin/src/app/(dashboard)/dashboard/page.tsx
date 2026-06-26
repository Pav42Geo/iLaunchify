// Admin Dashboard home — Mission Control.
//
// Advanced 5-row layout per docs/DASHBOARDS_PLAN.md §2:
//   Row 1 — Reach KPIs           (6 cards, lg:grid-cols-6)
//   Row 2 — Operations health    (3 widgets, lg:grid-cols-12 × span 4)
//   Row 3 — System health        (3 StatusWidgets, lg:grid-cols-12 × span 4)
//   Row 4 — Moderation queue     (1 QueueWidget, full width)
//   Row 5 — Recent activity      (1 TimelineWidget, full width)
//
// Hero band matches `/admin/partners` cream rounded-3xl shape verbatim
// (memory ilaunchify-admin-surface-pattern). All widget primitives come from
// `@ilaunchify/ui` — page stays a server component, charts inside widgets
// are `'use client'`.

import { requireRole } from '@ilaunchify/auth'
import {
  KpiWidget,
  ListWidget,
  ChartWidget,
  ChartDonut,
  QueueWidget,
  StatusWidget,
  TimelineWidget,
  type ChartDonutSegment,
  type ListWidgetItem,
  type QueueWidgetItem,
  type StatusIndicator,
  type TimelineItem,
} from '@ilaunchify/ui'
import {
  Users,
  Building2,
  Package,
  ShoppingBag,
  DollarSign,
  Activity,
  Inbox,
  PieChart,
  Donut,
  ShieldCheck,
  Webhook,
  Timer,
  AlertTriangle,
  History,
} from 'lucide-react'
import { SecuritySnapshot } from './widgets/SecuritySnapshot'
import {
  loadReachKpis,
  loadInboxQueue,
  loadTicketsByCategory,
  loadOrdersByStatus,
  loadSystemHealth,
  loadModerationQueue,
  loadRecentActivity,
  type InboxQueueListRow,
  type OrdersByStatusBucket,
  type TicketsByCategoryResult,
  type SystemHealthSnapshot,
  type ModerationQueueItem,
  type ActivityRow,
} from './dashboard-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mission control — Admin' }

// -----------------------------------------------------------------------------
// Tone tables — kept module-local so the page can map between domain enums
// and the widget tone vocabulary.
// -----------------------------------------------------------------------------

const ORDER_STATUS_CHART_TONE: Record<
  string,
  ChartDonutSegment['tone']
> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'info',
  ROUTING: 'info',
  IN_FULFILLMENT: 'info',
  READY_TO_SHIP: 'warning',
  SHIPPED: 'success',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'ink',
  REFUNDED: 'danger',
  ON_HOLD: 'danger',
  DISPUTED: 'danger',
}

// =============================================================================
// Page
// =============================================================================

export default async function AdminDashboardPage() {
  await requireRole(['ADMIN'])

  const [kpis, inbox, ticketsByCategory, ordersByStatus, system, moderation, activity] =
    await Promise.all([
      loadReachKpis(),
      loadInboxQueue(),
      loadTicketsByCategory(),
      loadOrdersByStatus(),
      loadSystemHealth(),
      loadModerationQueue(),
      loadRecentActivity(10),
    ])

  return (
    <div className="space-y-6">
      <Hero />

      {/* Row 1 — Reach KPIs (6 cards) */}
      <section
        aria-label="Reach metrics"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <KpiWidget
          label="Total creators"
          value={kpis.totalCreators}
          icon={Users}
          tone="pink"
          href="/creators"
          span={1}
        />
        <KpiWidget
          label="Total partners"
          value={kpis.totalPartners}
          icon={Building2}
          tone="ink"
          href="/partners"
          span={1}
        />
        <KpiWidget
          label="Live products"
          value={kpis.productsLive}
          icon={Package}
          tone="ink"
          href="/products"
          span={1}
        />
        <KpiWidget
          label="Orders today"
          value={kpis.ordersToday}
          icon={ShoppingBag}
          tone="pink"
          href="/orders"
          span={1}
        />
        <KpiWidget
          label="Revenue · 30d"
          value={`$${Math.round(kpis.revenue30dCents / 100).toLocaleString()}`}
          icon={DollarSign}
          tone="success"
          href="/orders"
          span={1}
        />
        <KpiWidget
          label="Active sessions"
          value={kpis.activeSessionsNow}
          icon={Activity}
          tone="neon"
          sublabel="last 15 min"
          span={1}
        />
      </section>

      {/* Row 1b — Security snapshot (Pavel 2026-06-05) — deep-links /security */}
      <SecuritySnapshot />

      {/* Row 2 — Operations health (3 widgets across 12-col grid) */}
      <section
        aria-label="Operations health"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <InboxQueueTile rows={inbox} />
        <TicketsByCategoryTile data={ticketsByCategory} />
        <OrdersByStatusTile buckets={ordersByStatus} />
      </section>

      {/* Row 3 — System health (3 StatusWidgets) */}
      <section
        aria-label="System health"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <ComplianceStatusTile data={system.compliance} />
        <StripeWebhookStatusTile data={system.stripeWebhooks} />
        <CronStatusTile data={system.cronJobs} />
      </section>

      {/* Row 4 — Moderation queue (full width) */}
      <section aria-label="Moderation queue">
        <ModerationQueueTile items={moderation} />
      </section>

      {/* Row 5 — Recent activity (full width) */}
      <section aria-label="Recent activity">
        <RecentActivityTile items={activity} />
      </section>
    </div>
  )
}

// =============================================================================
// Hero — matches /admin/partners cream rounded-3xl band
// =============================================================================

function Hero() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Admin · Dashboard
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Mission control
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Live signals from across the platform — operations queue, system
            health, moderation queue, and what just happened.
          </p>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Row 2 — InboxQueueTile
// =============================================================================

function InboxQueueTile({ rows }: { rows: InboxQueueListRow[] }) {
  const items: ListWidgetItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    sublabel: r.sublabel,
    value: r.value,
    href: r.href,
    tone: r.tone,
  }))
  return (
    <ListWidget
      title="Inbox queue"
      subtitle="Items awaiting admin attention"
      icon={Inbox}
      tone="pink"
      items={items}
      span={4}
      footerLink={{ href: '/leads', label: 'Open inbox' }}
      emptyLabel="All queues clear."
    />
  )
}

// =============================================================================
// Row 2 — TicketsByCategoryTile
// =============================================================================

function TicketsByCategoryTile({
  data,
}: {
  data: TicketsByCategoryResult
}) {
  // Graceful "not wired yet" state when the Ticket model isn't migrated
  // locally (or there are simply no rows).
  if (!data.available) {
    return (
      <ChartWidget
        title="Tickets by category"
        subtitle="Rolling out soon"
        icon={PieChart}
        tone="warning"
        span={4}
      >
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-4 text-center text-[12.5px] text-ink-500">
          Support tickets are not wired up in this environment yet.
        </div>
      </ChartWidget>
    )
  }

  const segments: ChartDonutSegment[] = data.buckets.map((b, i) => ({
    name: b.name,
    value: b.count,
    tone:
      (['warning', 'info', 'pink', 'success', 'danger', 'ink'] as const)[i % 6],
  }))

  const total = segments.reduce((acc, s) => acc + s.value, 0)

  return (
    <ChartWidget
      title="Tickets by category"
      subtitle="Open tickets, all priorities"
      icon={PieChart}
      tone="warning"
      span={4}
    >
      {segments.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-4 text-center text-[12.5px] text-ink-500">
          No open tickets right now.
        </div>
      ) : (
        <ChartDonut
          segments={segments}
          centerLabel={
            <div>
              <p className="font-display text-[24px] font-bold leading-none text-ink-900 tabular-nums">
                {total}
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-ink-700">
                open
              </p>
            </div>
          }
        />
      )}
    </ChartWidget>
  )
}

// =============================================================================
// Row 2 — OrdersByStatusTile
// =============================================================================

function OrdersByStatusTile({
  buckets,
}: {
  buckets: OrdersByStatusBucket[]
}) {
  const segments: ChartDonutSegment[] = buckets.map((b) => ({
    name: b.status.replace(/_/g, ' '),
    value: b.count,
    tone: ORDER_STATUS_CHART_TONE[b.status] ?? 'ink',
  }))
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  return (
    <ChartWidget
      title="Orders by status"
      subtitle="Funnel snapshot, all-time"
      icon={Donut}
      tone="success"
      span={4}
      footerLink={{ href: '/orders', label: 'View all orders' }}
    >
      {segments.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-4 text-center text-[12.5px] text-ink-500">
          No orders yet — the funnel is empty.
        </div>
      ) : (
        <ChartDonut
          segments={segments}
          centerLabel={
            <div>
              <p className="font-display text-[24px] font-bold leading-none text-ink-900 tabular-nums">
                {total}
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-ink-700">
                orders
              </p>
            </div>
          }
        />
      )}
    </ChartWidget>
  )
}

// =============================================================================
// Row 3 — ComplianceStatusTile
// =============================================================================

function ComplianceStatusTile({
  data,
}: {
  data: SystemHealthSnapshot['compliance']
}) {
  const indicators: StatusIndicator[] = [
    {
      label: 'Compliance service',
      status: data.status,
      value:
        data.lastRenderMs != null ? `${data.lastRenderMs} ms avg` : 'not wired',
      sublabel:
        data.rulePackVersion != null
          ? `Rule pack ${data.rulePackVersion}`
          : 'Live probe pending — synthetic sparkline.',
      sparkline: data.sparkline,
    },
  ]
  return (
    <StatusWidget
      title="Compliance service"
      subtitle="FDA rule pack render latency"
      icon={ShieldCheck}
      tone="info"
      span={4}
      indicators={indicators}
    />
  )
}

// =============================================================================
// Row 3 — StripeWebhookStatusTile
// =============================================================================

function formatRelativeTime(d: Date): string {
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function StripeWebhookStatusTile({
  data,
}: {
  data: SystemHealthSnapshot['stripeWebhooks']
}) {
  const indicators: StatusIndicator[] = [
    {
      label: 'Webhook receiver',
      status: data.status,
      value:
        data.lastSuccessAt != null
          ? formatRelativeTime(data.lastSuccessAt)
          : 'not wired',
      sublabel: `Error rate 24h: ${data.errorRate24h.toFixed(1)}%`,
      sparkline: data.sparkline.length >= 2 ? data.sparkline : undefined,
    },
  ]
  return (
    <StatusWidget
      title="Stripe webhooks"
      subtitle="Receive health · last 24h"
      icon={Webhook}
      tone="pink"
      span={4}
      indicators={indicators}
    />
  )
}

// =============================================================================
// Row 3 — CronStatusTile
// =============================================================================

function CronStatusTile({
  data,
}: {
  data: SystemHealthSnapshot['cronJobs']
}) {
  const indicators: StatusIndicator[] = data.jobs.map((j) => ({
    label: j.label,
    status: j.status,
    value:
      j.lastRunAt != null ? formatRelativeTime(j.lastRunAt) : 'not wired yet',
    sublabel: j.name,
  }))
  return (
    <StatusWidget
      title="Cron jobs"
      subtitle="Background tasks last seen"
      icon={Timer}
      tone="warning"
      span={4}
      indicators={indicators}
    />
  )
}

// =============================================================================
// Row 4 — ModerationQueueTile
// =============================================================================

function ModerationQueueTile({ items }: { items: ModerationQueueItem[] }) {
  const queueItems: QueueWidgetItem[] = items.map((item) => ({
    id: item.id,
    label: item.label,
    sublabel: `${item.sublabel} · ${item.ageDays}d waiting`,
    tone: item.ageDays > 10 ? 'danger' : 'warning',
    // QueueWidget is a client component — pass a rendered element, not the
    // Lucide component itself (forwardRef objects can't cross the RSC boundary).
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    primaryAction: {
      label: `${item.actionLabel} →`,
      href: item.href,
      tone: 'ink',
    },
  }))
  return (
    <QueueWidget
      title="Moderation queue"
      subtitle="Items stuck longer than the SLA — act fast"
      icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
      tone="danger"
      span={12}
      items={queueItems}
      emptyLabel="Nothing waiting. Queue is clear."
    />
  )
}

// =============================================================================
// Row 5 — RecentActivityTile
// =============================================================================

const ACTIVITY_TONE_MAP: Record<string, TimelineItem['tone']> = {
  Partner: 'ink',
  Product: 'pink',
  ProductTemplate: 'pink',
  Order: 'success',
  CreatorProfile: 'pink',
  Ingredient: 'warning',
}

function humanizeAction(action: string): string {
  // Normalize "partner.activate" → "Partner activate", and snake.case →
  // friendly verb. We keep the entity-level prefix so the row reads as a
  // sentence: "Partner activate · Acme Co".
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function RecentActivityTile({ items }: { items: ActivityRow[] }) {
  const timelineItems: TimelineItem[] = items.map((row) => ({
    id: row.id,
    when: row.createdAt,
    title: humanizeAction(row.action),
    body: `${row.actorLabel} · ${row.entityType}`,
    tone: ACTIVITY_TONE_MAP[row.entityType] ?? 'ink',
    href: row.href ?? undefined,
  }))
  return (
    <TimelineWidget
      title="Recent activity"
      subtitle="Last 10 audit log entries"
      icon={History}
      tone="ink"
      span={12}
      items={timelineItems}
      footerLink={{ href: '/audit', label: 'View all audit log' }}
      emptyLabel="No activity yet."
    />
  )
}
