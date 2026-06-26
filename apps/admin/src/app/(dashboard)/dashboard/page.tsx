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

import { requireRole, getViewerCapabilities, type Capability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
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
  type WidgetSpan,
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

  // Role-aware: SUPER_ADMIN resolves to ALL capabilities, so the canonical
  // admin view is unchanged. Subaccounts (support agent / lead / billing) see
  // exactly the widgets their role can act on — every tile is capability-gated.
  const caps = await getViewerCapabilities()
  const can = (c: Capability) => caps.includes(c)

  // Each persona scopes which signals matter. Compute visibility up front so we
  // can both gate the tiles AND skip the matching data loads for subaccounts.
  const showCreators = can('creators:read')
  const showPartners = can('partners:read')
  const showOrders = can('orders:read')
  const showRevenue = can('billing:read') || can('orders:read')
  const showPlatform = can('platform:admin') || can('security:admin')
  const showSecurity = can('security:admin')
  const showInbox = can('partners:read')
  const showTickets = can('tickets:read')
  const showOrdersChart = can('orders:read')
  const showCompliance = can('compliance:read')
  const showWebhooks = can('billing:read')
  const showCron = can('platform:admin')
  const showModeration = can('reviews:write') || can('partners:approve')
  const showActivity = can('audit:read')

  const [kpis, inbox, ticketsByCategory, ordersByStatus, system, moderation, activity] =
    await Promise.all([
      loadReachKpis(),
      showInbox ? loadInboxQueue() : Promise.resolve([]),
      showTickets ? loadTicketsByCategory() : Promise.resolve({ available: false, buckets: [] } as TicketsByCategoryResult),
      showOrdersChart ? loadOrdersByStatus() : Promise.resolve([] as OrdersByStatusBucket[]),
      loadSystemHealth(),
      showModeration ? loadModerationQueue() : Promise.resolve([] as ModerationQueueItem[]),
      showActivity ? loadRecentActivity(10) : Promise.resolve([] as ActivityRow[]),
    ])

  // Anything in the "needs you now" band? Drives whether we render that row.
  const hasActionRow = showModeration || showInbox
  const hasAnyKpi = showCreators || showPartners || showPartners || showOrders || showRevenue || showPlatform
  const hasOpsRow = showTickets || showOrdersChart
  const hasSystemRow = showCompliance || showWebhooks || showCron
  const nothingVisible =
    !hasActionRow && !hasAnyKpi && !showSecurity && !hasOpsRow && !hasSystemRow && !showActivity

  return (
    <div className="space-y-6">
      <Hero />

      {nothingVisible && (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-10 text-center text-[13px] text-ink-500">
          Your admin role doesn’t have any dashboard widgets assigned yet. Ask a
          super admin to grant capabilities in Roles &amp; Permissions.
        </div>
      )}

      {/* Needs you now — action-first: queues that need a human decision */}
      {hasActionRow && (
        <section
          aria-label="Needs you now"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          {showModeration && <ModerationQueueTile items={moderation} span={showInbox ? 8 : 12} />}
          {showInbox && <InboxQueueTile rows={inbox} span={showModeration ? 4 : 12} />}
        </section>
      )}

      {/* Reach KPIs (capability-filtered) */}
      {hasAnyKpi && (
        <section
          aria-label="Reach metrics"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          {showCreators && (
            <KpiWidget label="Total creators" value={kpis.totalCreators} icon={Users} tone="pink" href="/creators" span={1} />
          )}
          {showPartners && (
            <KpiWidget label="Total partners" value={kpis.totalPartners} icon={Building2} tone="ink" href="/partners" span={1} />
          )}
          {showPartners && (
            <KpiWidget label="Live products" value={kpis.productsLive} icon={Package} tone="ink" href="/products" span={1} />
          )}
          {showOrders && (
            <KpiWidget label="Orders today" value={kpis.ordersToday} icon={ShoppingBag} tone="pink" href="/orders" span={1} />
          )}
          {showRevenue && (
            <KpiWidget label="Revenue · 30d" value={`$${Math.round(kpis.revenue30dCents / 100).toLocaleString()}`} icon={DollarSign} tone="success" href="/orders" span={1} />
          )}
          {showPlatform && (
            <KpiWidget label="Active sessions" value={kpis.activeSessionsNow} icon={Activity} tone="neon" sublabel="last 15 min" span={1} />
          )}
        </section>
      )}

      {/* Security snapshot (Pavel 2026-06-05) — deep-links /security */}
      {showSecurity && <SecuritySnapshot />}

      {/* Operations health — charts */}
      {hasOpsRow && (
        <section
          aria-label="Operations health"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          {showTickets && <TicketsByCategoryTile data={ticketsByCategory} span={showOrdersChart ? 6 : 12} />}
          {showOrdersChart && <OrdersByStatusTile buckets={ordersByStatus} span={showTickets ? 6 : 12} />}
        </section>
      )}

      {/* System health (3 StatusWidgets) */}
      {hasSystemRow && (
        <section
          aria-label="System health"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          {showCompliance && <ComplianceStatusTile data={system.compliance} />}
          {showWebhooks && <StripeWebhookStatusTile data={system.stripeWebhooks} />}
          {showCron && <CronStatusTile data={system.cronJobs} />}
        </section>
      )}

      {/* Recent activity (full width) */}
      {showActivity && (
        <section aria-label="Recent activity">
          <RecentActivityTile items={activity} />
        </section>
      )}
    </div>
  )
}

// =============================================================================
// Hero — matches /admin/partners cream rounded-3xl band
// =============================================================================

function Hero() {
  return (
    <AdminPageHeader
      eyebrow="Admin · Dashboard"
      title="Mission control"
      description="Live signals from across the platform — operations queue, system health, moderation queue, and what just happened."
    />
  )
}

// =============================================================================
// Row 2 — InboxQueueTile
// =============================================================================

function InboxQueueTile({ rows, span = 4 }: { rows: InboxQueueListRow[]; span?: WidgetSpan }) {
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
      span={span}
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
  span = 4,
}: {
  data: TicketsByCategoryResult
  span?: WidgetSpan
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
        span={span}
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
      span={span}
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
  span = 4,
}: {
  buckets: OrdersByStatusBucket[]
  span?: WidgetSpan
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
      span={span}
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

function ModerationQueueTile({ items, span = 12 }: { items: ModerationQueueItem[]; span?: WidgetSpan }) {
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
      span={span}
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
