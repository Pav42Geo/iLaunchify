// Insights surface — data loaders (P2, docs/ANALYTICS_STRATEGY.md §7).
//
// V1 computes every metric NATIVELY from the primary DB (CockroachDB via Prisma),
// exactly like the admin dashboard. This is the deliberate P2 step BEFORE the
// warehouse (D2) + dbt semantic layer exist. When the warehouse lands, these
// loaders get repointed at dbt-computed rollups (or a nightly cache) — the page
// contract (the returned shapes) stays identical, so only this file changes.
//
// Queries are bounded (COUNT / groupBy / aggregate, or a capped sample for
// cycle-time averages Prisma can't aggregate). Metrics that depend on the freshly
// added analytics substrate (AnalyticsEvent store, OrderDispatch.promisedShipBy)
// are wrapped defensively: if the migration hasn't run yet they degrade to a
// null/empty state with a "not ready" flag instead of throwing.

import 'server-only'
import { prisma, getAnalyticsSettings } from '@ilaunchify/db'

export type InsightsTab = 'marketplace' | 'fulfillment' | 'financial'

export interface Delta {
  pct: number
  direction: 'up' | 'down' | 'flat'
}

function delta(current: number, previous: number): Delta | null {
  if (previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

const DAY = 24 * 3600 * 1000
function windows() {
  const now = Date.now()
  return {
    last30: new Date(now - 30 * DAY),
    prev30: new Date(now - 60 * DAY),
    last90: new Date(now - 90 * DAY),
  }
}

export function fmtMoney(cents: number): string {
  const d = cents / 100
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`
  if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}k`
  return `$${d.toFixed(0)}`
}
export function fmtPct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`
}

// =============================================================================
// Marketplace
// =============================================================================

export interface MarketplaceInsights {
  gmvCents: number
  gmvDelta: Delta | null
  takeRatePct: number | null
  aovCents: number
  paidOrders: number
  paidOrdersDelta: Delta | null
  newCreators: number
  ordersByStatus: Array<{ status: string; count: number }>
  funnel: Array<{ label: string; event: string; count: number }> | null
}

export async function loadMarketplace(): Promise<MarketplaceInsights> {
  const { last30, prev30 } = windows()

  const [gmvThis, gmvPrev, feeThis, paidThis, paidPrev, newCreators, byStatus] =
    await Promise.all([
      prisma.order.aggregate({ where: { paidAt: { gte: last30 } }, _sum: { totalCents: true } }),
      prisma.order.aggregate({ where: { paidAt: { gte: prev30, lt: last30 } }, _sum: { totalCents: true } }),
      prisma.charge.aggregate({ where: { createdAt: { gte: last30 } }, _sum: { applicationFeeCents: true } }),
      prisma.order.count({ where: { paidAt: { gte: last30 } } }),
      prisma.order.count({ where: { paidAt: { gte: prev30, lt: last30 } } }),
      prisma.creatorProfile.count({ where: { createdAt: { gte: last30 } } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

  const gmvCents = gmvThis._sum.totalCents ?? 0
  const gmvPrevCents = gmvPrev._sum.totalCents ?? 0
  const feeCents = feeThis._sum.applicationFeeCents ?? 0
  const takeRatePct = gmvCents > 0 ? (feeCents / gmvCents) * 100 : null
  const aovCents = paidThis > 0 ? Math.round(gmvCents / paidThis) : 0

  return {
    gmvCents,
    gmvDelta: delta(gmvCents, gmvPrevCents),
    takeRatePct,
    aovCents,
    paidOrders: paidThis,
    paidOrdersDelta: delta(paidThis, paidPrev),
    newCreators,
    ordersByStatus: byStatus
      .map((r) => ({ status: String(r.status), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    funnel: await loadActivationFunnel(last30),
  }
}

// Activation funnel from the AnalyticsEvent store. Defensive: returns null when
// the analytics substrate hasn't been migrated (db:push) or has no rows yet.
async function loadActivationFunnel(
  since: Date,
): Promise<MarketplaceInsights['funnel']> {
  const steps: Array<{ label: string; event: string }> = [
    { label: 'Signed up', event: 'signup_completed' },
    { label: 'Product created', event: 'product_created' },
    { label: 'Design published', event: 'design_published' },
    { label: 'Checkout started', event: 'checkout_started' },
    { label: 'Order paid', event: 'order_paid' },
  ]
  try {
    const rows = await prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { occurredAt: { gte: since }, name: { in: steps.map((s) => s.event) } },
      _count: { _all: true },
    })
    const map = new Map(rows.map((r) => [String(r.name), r._count._all]))
    return steps.map((s) => ({ ...s, count: map.get(s.event) ?? 0 }))
  } catch {
    return null // substrate not migrated yet
  }
}

// =============================================================================
// Fulfillment
// =============================================================================

export interface FulfillmentInsights {
  otifPct: number | null
  otifSample: number
  otifTargetPct: number
  avgAcceptHours: number | null
  avgProductionDays: number | null
  rerouteRatePct: number | null
  rerouteAlertPct: number
  qcFailRatePct: number | null
  qcFailAlertPct: number
  dispatchesByStatus: Array<{ status: string; count: number }>
}

export async function loadFulfillment(): Promise<FulfillmentInsights> {
  const { last30, last90 } = windows()
  const settings = await getAnalyticsSettings()

  const [total30, rerouted30, qcFailed30, byStatus] = await Promise.all([
    prisma.orderDispatch.count({ where: { createdAt: { gte: last30 } } }),
    prisma.orderDispatch.count({ where: { createdAt: { gte: last30 }, rerouteCount: { gt: 0 } } }),
    prisma.orderDispatch.count({ where: { createdAt: { gte: last30 }, qualityCheckFailedAt: { not: null } } }),
    prisma.orderDispatch.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  // Cycle-time averages: Prisma can't aggregate timestamp diffs, so pull a bounded
  // sample of recently-ready dispatches and average in JS.
  let avgAcceptHours: number | null = null
  let avgProductionDays: number | null = null
  try {
    const sample = await prisma.orderDispatch.findMany({
      where: { readyAt: { not: null }, createdAt: { gte: last90 } },
      select: { createdAt: true, acceptedAt: true, productionStartedAt: true, readyAt: true },
      orderBy: { readyAt: 'desc' },
      take: 500,
    })
    const acc: number[] = []
    const prod: number[] = []
    for (const d of sample) {
      if (d.acceptedAt) acc.push((d.acceptedAt.getTime() - d.createdAt.getTime()) / (3600 * 1000))
      if (d.productionStartedAt && d.readyAt)
        prod.push((d.readyAt.getTime() - d.productionStartedAt.getTime()) / DAY)
    }
    avgAcceptHours = acc.length ? round1(avg(acc)) : null
    avgProductionDays = prod.length ? round1(avg(prod)) : null
  } catch {
    /* leave null */
  }

  // OTIF — needs the freshly added promised-date fields. Defensive.
  let otifPct: number | null = null
  let otifSample = 0
  try {
    const promised = await prisma.orderDispatch.findMany({
      where: { promisedShipBy: { not: null }, readyAt: { not: null }, createdAt: { gte: last90 } },
      select: { promisedShipBy: true, readyAt: true },
      take: 2000,
    })
    otifSample = promised.length
    if (otifSample > 0) {
      const onTime = promised.filter((d) => d.readyAt! <= d.promisedShipBy!).length
      otifPct = (onTime / otifSample) * 100
    }
  } catch {
    /* promised-date columns not migrated yet */
  }

  return {
    otifPct,
    otifSample,
    otifTargetPct: settings.otifTargetPct,
    avgAcceptHours,
    avgProductionDays,
    rerouteRatePct: total30 > 0 ? (rerouted30 / total30) * 100 : null,
    rerouteAlertPct: settings.rerouteRateAlertPct,
    qcFailRatePct: total30 > 0 ? (qcFailed30 / total30) * 100 : null,
    qcFailAlertPct: settings.qcFailAlertPct,
    dispatchesByStatus: byStatus
      .map((r) => ({ status: String(r.status), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  }
}

// =============================================================================
// Financial
// =============================================================================

export interface FinancialInsights {
  feeCapturedCents: number
  refundRatePct: number | null
  refundAlertPct: number
  refundedCents: number
  disputeCount: number
  clawbackExposureCents: number
}

export async function loadFinancial(): Promise<FinancialInsights> {
  const { last30 } = windows()
  const settings = await getAnalyticsSettings()

  const [feeAgg, refundAgg, refundCount, paidOrders, disputeCount, clawbacks] =
    await Promise.all([
      prisma.charge.aggregate({ where: { createdAt: { gte: last30 } }, _sum: { applicationFeeCents: true } }),
      prisma.refund.aggregate({ where: { createdAt: { gte: last30 } }, _sum: { amountCents: true } }),
      prisma.refund.count({ where: { createdAt: { gte: last30 } } }),
      prisma.order.count({ where: { paidAt: { gte: last30 } } }),
      prisma.orderDispute.count({ where: { createdAt: { gte: last30 } } }),
      prisma.partnerClawback.findMany({
        where: { status: { notIn: ['EXECUTED', 'WAIVED'] } },
        select: { amountCents: true, remainingCents: true },
      }),
    ])

  const clawbackExposureCents = clawbacks.reduce(
    (sum, c) => sum + (c.remainingCents ?? c.amountCents),
    0,
  )

  return {
    feeCapturedCents: feeAgg._sum.applicationFeeCents ?? 0,
    refundRatePct: paidOrders > 0 ? (refundCount / paidOrders) * 100 : null,
    refundAlertPct: settings.refundRateAlertPct,
    refundedCents: refundAgg._sum.amountCents ?? 0,
    disputeCount,
    clawbackExposureCents,
  }
}

// -----------------------------------------------------------------------------
function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
