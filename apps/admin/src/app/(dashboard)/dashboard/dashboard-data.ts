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
      return `/orders`
    case 'CreatorProfile':
      return `/tiers`
    case 'Ingredient':
      return `/ingredients`
    default:
      return null
  }
}
