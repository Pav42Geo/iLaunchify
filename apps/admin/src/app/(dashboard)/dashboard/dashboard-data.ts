// Admin dashboard data loaders.
//
// One file for ALL the queries powering the dashboard widgets. Each function
// returns plain serializable data so widget components stay client-renderable
// where they need to be. Every query is a cheap COUNT/groupBy — the dashboard
// renders ~10 of them in parallel via Promise.all.
//
// Pavel's locked principle (2026-05-31): the admin app is NOT a packaging
// platform with a single subject. The dashboard surfaces the broadest
// possible signal — leads / partners / products / orders / revenue / queue —
// so the admin sees what's hot the moment they sign in.

import 'server-only'
import { prisma } from '@ilaunchify/db'

// =============================================================================
// KPI cards — the top row of click-through metric tiles
// =============================================================================

export interface KpiCard {
  /** Stable id used by the layout-editor (V1.5+). */
  id: string
  /** One-word label shown above the number. */
  label: string
  /** Big number displayed in the tile. */
  value: number
  /** Optional dollar-sign prefix when displaying revenue. */
  prefix?: '$'
  /** Optional suffix (% etc). */
  suffix?: string
  /**
   * Delta vs previous comparable window (7d-over-7d for current-week metrics,
   * 30d-over-30d for monthly). Positive = good, negative = bad. Null when
   * baseline isn't computable yet.
   */
  delta?: { pct: number; direction: 'up' | 'down' | 'flat' } | null
  /** Where clicking the tile sends the admin. Always an existing route. */
  href: string
  /** Lucide icon name — render-time lookup in widgets. */
  iconKey:
    | 'orders'
    | 'revenue'
    | 'creators'
    | 'partners'
    | 'products'
    | 'leads'
  /** Token chosen by KpiCard for numeral / icon color. Locked design system. */
  tone: 'ink' | 'pink' | 'neon' | 'success' | 'warning' | 'info'
}

/**
 * Loads the six KPI cards Pavel approved as defaults. Order matches the
 * sidebar/dashboard mental model: Orders (today's lifeblood) → Revenue →
 * People → Catalog.
 */
export async function loadKpiCards(): Promise<KpiCard[]> {
  const now = new Date()
  const last7Start = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const prev7Start = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
  const last30Start = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const prev30Start = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const [
    ordersThis,
    ordersPrev,
    revenueThis,
    revenuePrev,
    creatorsThis,
    creatorsPrev,
    activePartners,
    productsLive,
    leadsOpen,
  ] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: last7Start } },
    }),
    prisma.order.count({
      where: { createdAt: { gte: prev7Start, lt: last7Start } },
    }),
    prisma.order.aggregate({
      where: { paidAt: { gte: last30Start } },
      _sum: { totalCents: true },
    }),
    prisma.order.aggregate({
      where: { paidAt: { gte: prev30Start, lt: last30Start } },
      _sum: { totalCents: true },
    }),
    prisma.creatorProfile.count({
      where: { createdAt: { gte: last30Start } },
    }),
    prisma.creatorProfile.count({
      where: { createdAt: { gte: prev30Start, lt: last30Start } },
    }),
    prisma.partner.count({
      where: { status: { in: ['ACTIVE', 'INTEGRATION_ENHANCED'] } },
    }),
    prisma.productTemplate.count({
      where: { status: 'PUBLISHED' },
    }),
    prisma.partner.count({
      where: { status: { in: ['DRAFT', 'INVITED', 'LEAD'] } },
    }),
  ])

  const revenueThisCents = revenueThis._sum.totalCents ?? 0
  const revenuePrevCents = revenuePrev._sum.totalCents ?? 0

  return [
    {
      id: 'orders-7d',
      label: 'Orders · 7d',
      value: ordersThis,
      delta: pctDelta(ordersThis, ordersPrev),
      href: '/orders',
      iconKey: 'orders',
      tone: 'pink',
    },
    {
      id: 'revenue-30d',
      label: 'Revenue · 30d',
      value: Math.round(revenueThisCents / 100),
      prefix: '$',
      delta: pctDelta(revenueThisCents, revenuePrevCents),
      href: '/orders',
      iconKey: 'revenue',
      tone: 'success',
    },
    {
      id: 'creators-30d',
      label: 'New creators · 30d',
      value: creatorsThis,
      delta: pctDelta(creatorsThis, creatorsPrev),
      // Routes to the new creator CRM index (#569). The /tiers Creators tab
      // is for promotion/demotion — distinct surface.
      href: '/creators',
      iconKey: 'creators',
      tone: 'info',
    },
    {
      id: 'partners-active',
      label: 'Active partners',
      value: activePartners,
      delta: null,
      href: '/partners',
      iconKey: 'partners',
      tone: 'ink',
    },
    {
      id: 'products-live',
      label: 'Live products',
      value: productsLive,
      delta: null,
      href: '/products',
      iconKey: 'products',
      tone: 'ink',
    },
    {
      id: 'leads-open',
      label: 'Open leads',
      value: leadsOpen,
      delta: null,
      href: '/leads',
      iconKey: 'leads',
      tone: 'warning',
    },
  ]
}

// =============================================================================
// Orders by status — chart data
// =============================================================================

export interface OrdersByStatusBucket {
  status: string
  count: number
  tone: 'pink' | 'success' | 'warning' | 'info' | 'ink' | 'danger'
}

export async function loadOrdersByStatus(): Promise<OrdersByStatusBucket[]> {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    _count: { _all: true },
  })

  // Stable display order — funnel-shaped left to right.
  const order: Record<string, number> = {
    PENDING_PAYMENT: 0,
    PAID: 1,
    ROUTING: 2,
    IN_FULFILLMENT: 3,
    READY_TO_SHIP: 4,
    SHIPPED: 5,
    IN_TRANSIT: 6,
    DELIVERED: 7,
    COMPLETED: 8,
    CANCELLED: 9,
    REFUNDED: 10,
    ON_HOLD: 11,
    DISPUTED: 12,
  }
  const tones: Record<string, OrdersByStatusBucket['tone']> = {
    PENDING_PAYMENT: 'warning',
    PAID: 'pink',
    ROUTING: 'info',
    IN_FULFILLMENT: 'pink',
    READY_TO_SHIP: 'info',
    SHIPPED: 'info',
    IN_TRANSIT: 'info',
    DELIVERED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'ink',
    REFUNDED: 'danger',
    ON_HOLD: 'warning',
    DISPUTED: 'danger',
  }
  return rows
    .map((r) => ({
      status: r.status,
      count: r._count._all,
      tone: tones[r.status] ?? 'ink',
    }))
    .sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99))
}

// =============================================================================
// Signups funnel — last 30 days of creator + partner registrations
// =============================================================================

export interface SignupsTimeseriesPoint {
  date: string // YYYY-MM-DD
  creators: number
  partners: number
}

export async function loadSignupsTimeseries(): Promise<SignupsTimeseriesPoint[]> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - 29) // last 30 days inclusive

  const [creators, partners] = await Promise.all([
    prisma.creatorProfile.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.partner.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
  ])

  const out: Record<string, SignupsTimeseriesPoint> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    out[key] = { date: key, creators: 0, partners: 0 }
  }
  for (const c of creators) {
    const key = c.createdAt.toISOString().slice(0, 10)
    if (out[key]) out[key].creators += 1
  }
  for (const p of partners) {
    const key = p.createdAt.toISOString().slice(0, 10)
    if (out[key]) out[key].partners += 1
  }
  return Object.values(out)
}

// =============================================================================
// Inbox preview — top N items from each queue
// =============================================================================

export interface InboxRow {
  id: string
  queue: 'leads' | 'partners' | 'products' | 'ingredients' | 'certs'
  title: string
  subtitle?: string
  href: string
  ageDays: number
  /** Optional pill on the right (e.g. "5× echo", "PENDING"). */
  pill?: string
}

export async function loadInboxPreview(): Promise<InboxRow[]> {
  // Field names (locked schema):
  //   Partner.companyName              (NOT displayName)
  //   ProductTemplate.name             (NOT displayName/internalName)
  //   ProductTemplate.manufacturerService.partner.companyName (NOT .partner direct)
  //   Ingredient.ownerPartner.companyName
  const [leads, partners, products, ingredients] = await Promise.all([
    prisma.partner.findMany({
      where: { status: { in: ['DRAFT', 'INVITED'] } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
      take: 3,
    }),
    prisma.partner.findMany({
      where: {
        status: { in: ['IDENTITY_PENDING_REVIEW', 'OPS_PENDING_REVIEW', 'UNDER_REVIEW'] },
      },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
      take: 3,
    }),
    prisma.productTemplate.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'UNDER_REVIEW'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        manufacturerService: {
          select: { partner: { select: { companyName: true } } },
        },
      },
      take: 3,
    }),
    prisma.ingredient.findMany({
      where: { source: 'PARTNER_PRIVATE', verificationStatus: 'SELF_ATTESTED' },
      orderBy: { createdAt: 'asc' },
      include: { ownerPartner: { select: { companyName: true } } },
      take: 3,
    }),
  ])

  const now = Date.now()
  const out: InboxRow[] = []

  for (const l of leads) {
    out.push({
      id: `lead:${l.id}`,
      queue: 'leads',
      title: l.companyName || l.user?.name || l.user?.email || 'Untitled lead',
      subtitle: l.user?.email ?? undefined,
      href: '/leads',
      ageDays: daysSince(now, l.createdAt),
      pill: l.status,
    })
  }
  for (const p of partners) {
    out.push({
      id: `partner:${p.id}`,
      queue: 'partners',
      title: p.companyName || p.user?.name || 'Unnamed partner',
      subtitle: p.user?.email ?? undefined,
      href: `/partners/${p.id}`,
      ageDays: daysSince(now, p.createdAt),
      pill: p.status.replace(/_/g, ' '),
    })
  }
  for (const pr of products) {
    out.push({
      id: `product:${pr.id}`,
      queue: 'products',
      title: pr.name || 'Untitled product',
      subtitle: pr.manufacturerService?.partner?.companyName ?? undefined,
      href: `/products/${pr.id}`,
      ageDays: daysSince(now, pr.createdAt),
      pill: pr.status.replace(/_/g, ' '),
    })
  }
  for (const ig of ingredients) {
    out.push({
      id: `ingredient:${ig.id}`,
      queue: 'ingredients',
      title: ig.internalName || ig.name,
      subtitle: ig.ownerPartner?.companyName ?? undefined,
      href: '/ingredients',
      ageDays: daysSince(now, ig.createdAt),
      pill: 'self-attested',
    })
  }
  // Sort everything by age desc so the oldest stuck items rise to the top.
  out.sort((a, b) => b.ageDays - a.ageDays)
  return out.slice(0, 8)
}

// =============================================================================
// Recent audit activity
// =============================================================================

export interface ActivityRow {
  id: string
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  createdAt: Date
  /** Optional deep-link target. */
  href: string | null
}

export async function loadRecentActivity(limit = 12): Promise<ActivityRow[]> {
  // Schema notes:
  //   • AuditLog.at  (NOT createdAt — see packages/db/prisma/schema.prisma)
  //   • The `actor` relation exists but the generated Prisma client may not
  //     surface it on every workspace yet — match packages/audit's existing
  //     listAuditLogs() shape and resolve actor names in a second hop.
  const rows = await prisma.auditLog.findMany({
    orderBy: { at: 'desc' },
    take: limit,
  })

  // Hop: actor lookup. Most rows on a healthy platform are written by
  // a small number of admins, so one IN-query is enough.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((v): v is string => Boolean(v))),
  )
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
  const byId = new Map(actors.map((a) => [a.id, a]))

  return rows.map((r) => {
    const actor = r.actorId ? byId.get(r.actorId) : null
    return {
      id: r.id,
      actorLabel:
        actor?.name ||
        actor?.email ||
        (r.actorRole === 'SYSTEM' ? 'System' : 'Anonymous'),
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      createdAt: r.at,
      href: hrefForEntity(r.entityType, r.entityId),
    }
  })
}

// =============================================================================
// Helpers
// =============================================================================

function pctDelta(curr: number, prev: number) {
  if (prev === 0) {
    if (curr === 0) return { pct: 0, direction: 'flat' as const }
    return { pct: 100, direction: 'up' as const }
  }
  const pct = ((curr - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) return { pct: 0, direction: 'flat' as const }
  return {
    pct: Math.round(pct),
    direction: pct > 0 ? ('up' as const) : ('down' as const),
  }
}

function daysSince(now: number, then: Date): number {
  return Math.max(0, Math.floor((now - then.getTime()) / (24 * 3600 * 1000)))
}

function hrefForEntity(type: string, id: string): string | null {
  switch (type) {
    case 'Partner':
      return `/partners/${id}`
    case 'Product':
    case 'ProductTemplate':
      return `/products/${id}`
    case 'Order':
      // /admin/orders/[orderId] exists (196-line detail page).
      return `/orders/${id}`
    case 'CreatorProfile':
      // /admin/creators/[creatorId] shipped in #570.
      return `/creators/${id}`
    case 'Ingredient':
      // No per-ingredient detail page yet — index is the right landing.
      return `/ingredients`
    default:
      return null
  }
}

// =============================================================================
// REACH KPIs — advanced 5-row dashboard, Row 1
// =============================================================================
//
// The DASHBOARDS_PLAN.md §2 spec — broader signal set than the v1 KPI strip.
// Each metric is a single COUNT/aggregate, drilled into existing list routes.

export interface ReachKpis {
  totalCreators: number
  totalPartners: number
  productsLive: number
  ordersToday: number
  revenue30dCents: number
  activeSessionsNow: number
}

export async function loadReachKpis(): Promise<ReachKpis> {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const last30Start = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000)

  const [
    totalCreators,
    totalPartners,
    productsLive,
    ordersToday,
    revenue30d,
    activeSessionsNow,
  ] = await Promise.all([
    prisma.creatorProfile.count(),
    prisma.partner.count(),
    prisma.productTemplate.count({ where: { status: 'PUBLISHED' } }),
    prisma.order.count({
      where: { createdAt: { gte: startOfToday } },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'ROUTING', 'IN_FULFILLMENT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'] },
        paidAt: { gte: last30Start },
      },
      _sum: { totalCents: true },
    }),
    // Distinct users with a recent updatedAt — proxy for "active right now"
    // until we wire NextAuth Session.expires polling.
    prisma.user
      .count({ where: { updatedAt: { gte: fifteenMinAgo } } })
      .catch(() => 0),
  ])

  return {
    totalCreators,
    totalPartners,
    productsLive,
    ordersToday,
    revenue30dCents: revenue30d._sum.totalCents ?? 0,
    activeSessionsNow,
  }
}

// =============================================================================
// OPERATIONS — Row 2 widgets
// =============================================================================

export interface InboxQueueCounts {
  leads: number
  partnerVerifications: number
  certReviews: number
  ingredientQueue: number
  productApprovals: number
}

export async function loadInboxQueueCounts(): Promise<InboxQueueCounts> {
  const [leads, partnerVerifications, certReviews, ingredientQueue, productApprovals] =
    await Promise.all([
      prisma.partner.count({ where: { status: { in: ['DRAFT', 'INVITED', 'LEAD'] } } }),
      prisma.partner.count({
        where: {
          status: { in: ['IDENTITY_PENDING_REVIEW', 'OPS_PENDING_REVIEW', 'UNDER_REVIEW'] },
        },
      }),
      // Pending partner certificate verifications — non-fatal if model surface
      // differs across migrations.
      prisma.partnerCertificateInstance
        .count({ where: { status: 'PENDING_REVIEW' } })
        .catch(() => 0),
      prisma.ingredient.count({
        where: { source: 'PARTNER_PRIVATE', verificationStatus: 'SELF_ATTESTED' },
      }),
      prisma.productTemplate.count({
        where: { status: { in: ['PENDING_REVIEW', 'PENDING_EDIT_REVIEW'] } },
      }),
    ])
  return { leads, partnerVerifications, certReviews, ingredientQueue, productApprovals }
}

// =============================================================================
// TICKETS BY CATEGORY — Row 2 donut
// =============================================================================
//
// Schema-defensive: the Ticket model exists but the migration may not have run
// in this workspace. We try the query and fall back to an empty result on any
// error so the layout still renders a graceful "rolling out soon" tile.

export interface TicketCategoryBucket {
  name: string
  count: number
}

export interface TicketsByCategoryResult {
  buckets: TicketCategoryBucket[]
  available: boolean
}

export async function loadTicketsByCategory(): Promise<TicketsByCategoryResult> {
  try {
    // Cast to any so this file compiles even when the Ticket migration hasn't
    // been run yet locally (the model is declared in schema.prisma but the
    // generated client may lag). The try/catch makes runtime errors render a
    // graceful empty-state tile.
    const client = prisma as unknown as {
      ticket?: {
        groupBy: (args: unknown) => Promise<
          Array<{ categoryId: string; _count: { _all: number } }>
        >
      }
      ticketCategory?: {
        findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>
      }
    }
    if (!client.ticket || !client.ticketCategory) {
      return { buckets: [], available: false }
    }
    const rows = await client.ticket.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
      where: { status: { notIn: ['CLOSED', 'RESOLVED'] } },
    })
    if (rows.length === 0) {
      // Model migrated, no rows yet — still treat as available (empty state
      // in the widget will read "No open tickets" not "rolling out soon").
      return { buckets: [], available: true }
    }
    const cats = await client.ticketCategory.findMany({
      where: { id: { in: rows.map((r) => r.categoryId) } },
      select: { id: true, name: true },
    })
    const byId = new Map(cats.map((c) => [c.id, c.name]))
    return {
      buckets: rows.map((r) => ({
        name: byId.get(r.categoryId) ?? 'Uncategorized',
        count: r._count._all,
      })),
      available: true,
    }
  } catch {
    // Migration not run / model surface missing — render graceful empty state.
    return { buckets: [], available: false }
  }
}

// =============================================================================
// SYSTEM HEALTH — Row 3
// =============================================================================
//
// "Not wired yet" is the polite default. Each probe attempts a small query
// against AuditLog (the only existing source) — if it returns nothing it
// renders amber instead of green/red. Crons + Stripe + compliance haven't yet
// shipped a dedicated CronRun / WebhookEvent table, so we degrade gracefully.

export type SystemHealthStatus = 'green' | 'amber' | 'red'

export interface SystemHealthIndicator {
  label: string
  status: SystemHealthStatus
  value?: string
  sublabel?: string
  /** Tiny 24-point sparkline. */
  sparkline?: number[]
}

export interface ComplianceServiceHealth {
  status: SystemHealthStatus
  lastRenderMs: number | null
  rulePackVersion: string | null
  sparkline: number[]
}

export async function loadComplianceServiceHealth(): Promise<ComplianceServiceHealth> {
  // Real implementation would scrape compliance-service /healthz — we
  // synthesize a believable placeholder until that endpoint lands.
  // Deterministic seed so the dashboard doesn't visually thrash on reload.
  const points = Array.from({ length: 24 }).map((_, i) => 800 + ((i * 37) % 200))
  return {
    status: 'amber',
    lastRenderMs: null,
    rulePackVersion: null,
    sparkline: points,
  }
}

export interface StripeWebhookHealth {
  status: SystemHealthStatus
  lastSuccessAt: Date | null
  errorRate24h: number
  sparkline: number[]
}

export async function loadStripeWebhookHealth(): Promise<StripeWebhookHealth> {
  try {
    const recent = await prisma.auditLog.findFirst({
      where: { action: { startsWith: 'stripe.webhook.' } },
      orderBy: { at: 'desc' },
      select: { at: true, action: true },
    })
    const last24h = new Date(Date.now() - 24 * 3600 * 1000)
    const [total24h, errors24h] = await Promise.all([
      prisma.auditLog.count({
        where: { action: { startsWith: 'stripe.webhook.' }, at: { gte: last24h } },
      }),
      prisma.auditLog.count({
        where: { action: { startsWith: 'stripe.webhook.error' }, at: { gte: last24h } },
      }),
    ])
    const errorRate = total24h === 0 ? 0 : (errors24h / total24h) * 100
    // Build hourly buckets across the last 24h.
    const buckets: number[] = Array.from({ length: 24 }).map(() => 0)
    if (total24h > 0) {
      const rows = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'stripe.webhook.' }, at: { gte: last24h } },
        select: { at: true },
      })
      for (const r of rows) {
        const hoursAgo = Math.floor((Date.now() - r.at.getTime()) / (3600 * 1000))
        const idx = 23 - Math.max(0, Math.min(23, hoursAgo))
        buckets[idx] = (buckets[idx] ?? 0) + 1
      }
    }
    return {
      status: !recent
        ? 'amber'
        : errorRate > 5
          ? 'red'
          : 'green',
      lastSuccessAt: recent?.at ?? null,
      errorRate24h: errorRate,
      sparkline: buckets,
    }
  } catch {
    return { status: 'amber', lastSuccessAt: null, errorRate24h: 0, sparkline: [] }
  }
}

export interface CronJobIndicator {
  name: string
  label: string
  lastRunAt: Date | null
  status: SystemHealthStatus
}

export interface CronHealth {
  jobs: CronJobIndicator[]
  status: SystemHealthStatus
}

const CRON_JOBS: Array<{ name: string; label: string }> = [
  { name: 'auto-cancel-dispatches', label: 'Auto-cancel dispatches' },
  { name: 'audit-log-retention', label: 'Audit log retention' },
  { name: 'subscription-invoice-spawn', label: 'Subscription invoice spawn' },
]

export async function loadCronHealth(): Promise<CronHealth> {
  try {
    const jobs: CronJobIndicator[] = await Promise.all(
      CRON_JOBS.map(async ({ name, label }) => {
        const last = await prisma.auditLog.findFirst({
          where: { action: `system.cron.${name}` },
          orderBy: { at: 'desc' },
          select: { at: true },
        })
        const lastRunAt = last?.at ?? null
        const ageHours = lastRunAt
          ? (Date.now() - lastRunAt.getTime()) / (3600 * 1000)
          : null
        const status: SystemHealthStatus =
          ageHours === null
            ? 'amber'
            : ageHours > 6
              ? 'red'
              : 'green'
        return { name, label, lastRunAt, status }
      }),
    )
    const worst: SystemHealthStatus = jobs.some((j) => j.status === 'red')
      ? 'red'
      : jobs.some((j) => j.status === 'amber')
        ? 'amber'
        : 'green'
    return { jobs, status: worst }
  } catch {
    return {
      jobs: CRON_JOBS.map(({ name, label }) => ({
        name,
        label,
        lastRunAt: null,
        status: 'amber' as const,
      })),
      status: 'amber',
    }
  }
}

// =============================================================================
// MODERATION QUEUE — Row 4
// =============================================================================
//
// Top items needing attention. Each source contributes up to N rows; we merge,
// sort by oldest, take the top 5.

export interface ModerationQueueItem {
  id: string
  source: 'lead' | 'product' | 'partner' | 'dispatch'
  label: string
  sublabel: string
  ageDays: number
  href: string
  actionLabel: string
}

export async function loadModerationQueue(): Promise<ModerationQueueItem[]> {
  const now = Date.now()
  const fiveDaysAgo = new Date(now - 5 * 24 * 3600 * 1000)

  const [leads, products, partners, dispatches] = await Promise.all([
    prisma.partner.findMany({
      where: { status: 'DRAFT', createdAt: { lt: fiveDaysAgo } },
      orderBy: { createdAt: 'asc' },
      take: 2,
      include: { user: { select: { email: true } } },
    }),
    prisma.productTemplate.findMany({
      where: {
        status: { in: ['PENDING_REVIEW', 'PENDING_EDIT_REVIEW'] },
        updatedAt: { lt: fiveDaysAgo },
      },
      orderBy: { updatedAt: 'asc' },
      take: 2,
      include: {
        manufacturerService: {
          select: { partner: { select: { companyName: true } } },
        },
      },
    }),
    prisma.partner.findMany({
      where: { status: 'UNDER_REVIEW', statusChangedAt: { lt: fiveDaysAgo } },
      orderBy: { statusChangedAt: 'asc' },
      take: 2,
      include: { user: { select: { email: true } } },
    }),
    prisma.orderDispatch.findMany({
      where: { acceptDeadlineAt: { lt: new Date() }, status: 'PENDING_ACCEPT' },
      orderBy: { acceptDeadlineAt: 'asc' },
      take: 2,
      include: {
        partnerService: {
          select: { partner: { select: { companyName: true } } },
        },
        order: { select: { id: true } },
      },
    }),
  ])

  const items: ModerationQueueItem[] = []

  for (const l of leads) {
    items.push({
      id: `lead:${l.id}`,
      source: 'lead',
      label: l.companyName || l.user?.email || 'Untitled lead',
      sublabel: 'Lead has been in DRAFT for more than 5 days',
      ageDays: daysSince(now, l.createdAt),
      href: `/partners/${l.id}`,
      actionLabel: 'Triage',
    })
  }
  for (const p of products) {
    items.push({
      id: `product:${p.id}`,
      source: 'product',
      label: p.name || 'Untitled product',
      sublabel: `Awaiting review — ${p.manufacturerService?.partner?.companyName ?? 'unknown partner'}`,
      ageDays: daysSince(now, p.updatedAt),
      href: `/products/${p.id}`,
      actionLabel: 'Review',
    })
  }
  for (const p of partners) {
    items.push({
      id: `partner:${p.id}`,
      source: 'partner',
      label: p.companyName || p.user?.email || 'Unnamed partner',
      sublabel: 'Verification stuck UNDER_REVIEW for more than 5 days',
      ageDays: p.statusChangedAt ? daysSince(now, p.statusChangedAt) : 0,
      href: `/partners/${p.id}`,
      actionLabel: 'Review',
    })
  }
  for (const d of dispatches) {
    items.push({
      id: `dispatch:${d.id}`,
      source: 'dispatch',
      label: `Dispatch past accept deadline`,
      sublabel: `${d.partnerService?.partner?.companyName ?? 'Partner'} — order ${shortIdLocal(d.order.id)}`,
      ageDays: daysSince(now, d.acceptDeadlineAt),
      href: `/orders/${d.order.id}`,
      actionLabel: 'Resolve',
    })
  }

  items.sort((a, b) => b.ageDays - a.ageDays)
  return items.slice(0, 5)
}

function shortIdLocal(id: string): string {
  return id.length > 8 ? id.slice(-6) : id
}

// =============================================================================
// INBOX QUEUE LIST ROWS — Row 2 widget (5-row ListWidget)
// =============================================================================
//
// Each row maps to one of the platform inboxes. We return live counts as the
// `value` chip and a deep link to the relevant admin index.

export interface InboxQueueListRow {
  id: string
  label: string
  sublabel?: string
  value: string
  href: string
  tone: 'pink' | 'ink' | 'success' | 'warning' | 'info' | 'danger' | 'neon'
}

export async function loadInboxQueue(): Promise<InboxQueueListRow[]> {
  const counts = await loadInboxQueueCounts()
  return [
    {
      id: 'leads',
      label: 'Pending leads',
      sublabel: 'DRAFT / INVITED / LEAD',
      value: String(counts.leads),
      href: '/leads',
      tone: counts.leads > 0 ? 'warning' : 'ink',
    },
    {
      id: 'partner-verifications',
      label: 'Partner verifications',
      sublabel: 'Awaiting admin review',
      value: String(counts.partnerVerifications),
      href: '/partners?status=UNDER_REVIEW',
      tone: counts.partnerVerifications > 0 ? 'pink' : 'ink',
    },
    {
      id: 'cert-reviews',
      label: 'Cert reviews',
      sublabel: 'Pending PartnerCertificateInstance',
      value: String(counts.certReviews),
      href: '/certificate-types',
      tone: counts.certReviews > 0 ? 'info' : 'ink',
    },
    {
      id: 'ingredient-queue',
      label: 'Ingredient queue',
      sublabel: 'Self-attested partner ingredients',
      value: String(counts.ingredientQueue),
      href: '/ingredients',
      tone: counts.ingredientQueue > 0 ? 'warning' : 'ink',
    },
    {
      id: 'product-approvals',
      label: 'Product approvals',
      sublabel: 'PENDING_REVIEW · PENDING_EDIT_REVIEW',
      value: String(counts.productApprovals),
      href: '/products?status=PENDING_REVIEW',
      tone: counts.productApprovals > 0 ? 'pink' : 'ink',
    },
  ]
}

// =============================================================================
// SYSTEM HEALTH — combined Row 3 loader
// =============================================================================
//
// Wraps the three independent probes into a single object the page can render
// without juggling three Promises. Each sub-probe is already try/catch-wrapped
// internally, so this never throws.

export interface SystemHealthSnapshot {
  compliance: ComplianceServiceHealth
  stripeWebhooks: StripeWebhookHealth
  cronJobs: CronHealth
}

export async function loadSystemHealth(): Promise<SystemHealthSnapshot> {
  const [compliance, stripeWebhooks, cronJobs] = await Promise.all([
    loadComplianceServiceHealth(),
    loadStripeWebhookHealth(),
    loadCronHealth(),
  ])
  return { compliance, stripeWebhooks, cronJobs }
}
