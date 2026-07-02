// Data layer for /logistics/channel-plans (Phase L3b — docs/LOGISTICS_AND_
// FULFILLMENT.md §7 + §9 admin surfaces). Rows are ChannelInboundPlan records:
// factory→channel-FC inbound plans (Amazon FBA / Walmart WFS / TikTok FBT).
//
// V1 has no SP-API writer yet ("Confirm with Amazon" is pending Amazon
// developer approval), so plan volume stays tiny — filter/sort/paginate in
// memory after one query, like fulfillment-centers/fc-data.ts. Revisit with
// DB-level skip/take (shipments-data.ts pattern) once SP-API starts minting
// plans at order volume.

import { prisma } from '@ilaunchify/db'
import type { ChannelInboundPlanStatus } from '@ilaunchify/db'

export const PLAN_PAGE_SIZE = 50

export const PLAN_STATUS_ORDER: ChannelInboundPlanStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'SHIPPED',
  'CHECKED_IN',
  'RECONCILED',
  'CANCELLED',
]

export const PLAN_STATUS_LABEL: Record<ChannelInboundPlanStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  SHIPPED: 'Shipped',
  CHECKED_IN: 'Checked in',
  RECONCILED: 'Reconciled',
  CANCELLED: 'Cancelled',
}

/** placementChoice values (schema comment: "MINIMAL_SPLITS" | "OPTIMIZED_SPLITS"). */
export const PLACEMENT_LABEL: Record<string, string> = {
  MINIMAL_SPLITS: 'Minimal splits',
  OPTIMIZED_SPLITS: 'Optimized splits',
}

export function placementLabel(choice: string | null): string | null {
  if (!choice) return null
  return PLACEMENT_LABEL[choice] ?? choice
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// -----------------------------------------------------------------------------
// feesJson — placement-fee snapshot backing the optimizer decision
// -----------------------------------------------------------------------------

export interface PlacementFees {
  choice: string | null
  minimalTotalCents: number | null
  optimizedTotalCents: number | null
  savingsCents: number | null
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * feesJson carries the @ilaunchify/shipping PlacementDecision snapshot
 * ({ choice, minimalTotalCents, optimizedTotalCents, savingsCents } —
 * packages/shipping/src/channel-gates.ts decidePlacementSplits). Json columns
 * carry no schema, so parse defensively; null when nothing recognizable.
 */
export function parsePlacementFees(json: unknown): PlacementFees | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const fees: PlacementFees = {
    choice: typeof o.choice === 'string' ? o.choice : null,
    minimalTotalCents: asFiniteNumber(o.minimalTotalCents),
    optimizedTotalCents: asFiniteNumber(o.optimizedTotalCents),
    savingsCents: asFiniteNumber(o.savingsCents),
  }
  if (
    fees.choice === null &&
    fees.minimalTotalCents === null &&
    fees.optimizedTotalCents === null
  ) {
    return null
  }
  return fees
}

/** Estimated total for the chosen placement option (plan column wins over snapshot). */
export function chosenPlacementTotalCents(
  fees: PlacementFees | null,
  placementChoice: string | null,
): number | null {
  if (!fees) return null
  const choice = placementChoice ?? fees.choice
  if (choice === 'MINIMAL_SPLITS') return fees.minimalTotalCents
  if (choice === 'OPTIMIZED_SPLITS') return fees.optimizedTotalCents
  return fees.minimalTotalCents ?? fees.optimizedTotalCents
}

// -----------------------------------------------------------------------------
// reconciliationJson — received-vs-expected snapshot written at check-in (§7.2)
// -----------------------------------------------------------------------------

export interface ReconLine {
  key: string
  expected: number | null
  received: number | null
}

export interface ReconSummary {
  lines: ReconLine[]
  /** True when any line deviates or an explicit mismatch flag is set. */
  hasDiff: boolean
}

/**
 * No writer exists yet (check-in webhook lands with SP-API), so parse the
 * documented shape defensively:
 *   { lines|items: [{ sku|key|label, expected|expectedUnits, received|receivedUnits }],
 *     mismatch?: boolean, discrepancies?: unknown[] }
 * or a flat { expected(Units), received(Units) }. hasDiff = any line deviates,
 * or mismatch === true, or discrepancies is non-empty. Computed in memory over
 * rows already loaded for the page — no extra query (KPI stays cheap).
 */
export function parseReconciliation(json: unknown): ReconSummary | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const lines: ReconLine[] = []

  const rawLines = Array.isArray(o.lines) ? o.lines : Array.isArray(o.items) ? o.items : null
  if (rawLines) {
    for (const raw of rawLines) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const l = raw as Record<string, unknown>
      const key =
        typeof l.sku === 'string'
          ? l.sku
          : typeof l.key === 'string'
            ? l.key
            : typeof l.label === 'string'
              ? l.label
              : `Line ${lines.length + 1}`
      lines.push({
        key,
        expected: asFiniteNumber(l.expected) ?? asFiniteNumber(l.expectedUnits),
        received: asFiniteNumber(l.received) ?? asFiniteNumber(l.receivedUnits),
      })
    }
  } else {
    const expected = asFiniteNumber(o.expected) ?? asFiniteNumber(o.expectedUnits)
    const received = asFiniteNumber(o.received) ?? asFiniteNumber(o.receivedUnits)
    if (expected !== null || received !== null) {
      lines.push({ key: 'Total units', expected, received })
    }
  }

  const lineDiff = lines.some(
    (l) => l.expected !== null && l.received !== null && l.expected !== l.received,
  )
  const explicitFlag =
    o.mismatch === true || (Array.isArray(o.discrepancies) && o.discrepancies.length > 0)

  if (lines.length === 0 && !explicitFlag) return null
  return { lines, hasDiff: lineDiff || explicitFlag }
}

// -----------------------------------------------------------------------------
// destinationsJson — channel-assigned FC addresses
// -----------------------------------------------------------------------------

export interface DestinationEntry {
  label: string
  detail: string | null
}

/** Defensive list view of destinationsJson; null when it isn't a non-empty array
 *  (the detail page falls back to raw JSON in that case). */
export function parseDestinations(json: unknown): DestinationEntry[] | null {
  if (!Array.isArray(json) || json.length === 0) return null
  return json.map((raw, i) => {
    if (typeof raw === 'string') return { label: raw, detail: null }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const d = raw as Record<string, unknown>
      const label =
        [d.name, d.warehouseId, d.fcCode, d.code].find(
          (v): v is string => typeof v === 'string' && v.length > 0,
        ) ?? `Destination ${i + 1}`
      const parts = [d.addressLine1, d.city, d.state, d.postalCode].filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
      return { label, detail: parts.length > 0 ? parts.join(', ') : null }
    }
    return { label: `Destination ${i + 1}`, detail: null }
  })
}

// -----------------------------------------------------------------------------
// List page filters / rows / loader
// -----------------------------------------------------------------------------

export type PlanSortKey = 'order' | 'creator' | 'channel' | 'appointment' | 'status' | 'createdAt'
export type SortDir = 'asc' | 'desc'

export interface ParsedPlanFilters {
  q: string
  status: ChannelInboundPlanStatus | ''
  channel: string // Channel.code chip ('' = all)
  sort: PlanSortKey
  dir: SortDir
  page: number
}

export interface PlanRow {
  planId: string
  orderId: string
  orderRef: string
  creatorId: string
  creatorLabel: string
  channelCode: string
  channelName: string
  externalPlanId: string
  placementChoice: string | null
  chosenFeeCents: number | null
  appointmentAt: Date | null
  status: ChannelInboundPlanStatus
  hasReconDiff: boolean
  createdAt: Date
}

export interface PlanPageData {
  filters: ParsedPlanFilters
  rows: PlanRow[]
  totalFiltered: number
  totalPages: number
  kpis: {
    total: number
    draftCount: number
    inFlightCount: number
    checkedIn7d: number
    reconDiffCount: number
  }
  statusCounts: Record<ChannelInboundPlanStatus, number>
  /** Channel codes present across ALL plans (chip row), with display names + counts. */
  channelOrder: string[]
  channelNames: Record<string, string>
  channelCounts: Record<string, number>
}

const SORT_KEYS: PlanSortKey[] = ['order', 'creator', 'channel', 'appointment', 'status', 'createdAt']

export function parsePlanFilters(sp: {
  q?: string
  status?: string
  channel?: string
  sort?: string
  dir?: string
  page?: string
}): ParsedPlanFilters {
  const status = (PLAN_STATUS_ORDER as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as ChannelInboundPlanStatus)
    : ''
  const sort = SORT_KEYS.includes(sp.sort as PlanSortKey) ? (sp.sort as PlanSortKey) : 'createdAt'
  const dir: SortDir = sp.dir === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  return {
    q: (sp.q ?? '').trim(),
    status,
    channel: (sp.channel ?? '').trim().toLowerCase(),
    sort,
    dir,
    page,
  }
}

/** URL builder — merges overrides into the current filters, dropping defaults. */
export function buildPlanHref(
  filters: ParsedPlanFilters,
  overrides: Partial<{
    q: string
    status: string
    channel: string
    sort: PlanSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.status) params.set('status', next.status)
  if (next.channel) params.set('channel', next.channel)
  if (next.sort !== 'createdAt') params.set('sort', next.sort)
  if (next.dir !== 'desc') params.set('dir', next.dir)
  if (next.page > 1) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/logistics/channel-plans?${qs}` : '/logistics/channel-plans'
}

export async function loadPlanData(sp: {
  q?: string
  status?: string
  channel?: string
  sort?: string
  dir?: string
  page?: string
}): Promise<PlanPageData> {
  const filters = parsePlanFilters(sp)

  const plans = await prisma.channelInboundPlan.findMany({
    select: {
      id: true,
      externalPlanId: true,
      placementChoice: true,
      feesJson: true,
      appointmentAt: true,
      status: true,
      reconciliationJson: true,
      createdAt: true,
      updatedAt: true,
      order: { select: { id: true, orderNumber: true } },
      channelConnection: {
        select: {
          channel: { select: { code: true, displayName: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })

  const all: PlanRow[] = plans.map((p) => {
    const creator = p.channelConnection.creator
    const channel = p.channelConnection.channel
    const fees = parsePlacementFees(p.feesJson)
    return {
      planId: p.id,
      orderId: p.order.id,
      orderRef: p.order.orderNumber ?? `#${p.order.id.slice(-8)}`,
      creatorId: creator.id,
      creatorLabel: creator.name ?? creator.email,
      channelCode: channel.code,
      channelName: channel.displayName,
      externalPlanId: p.externalPlanId,
      placementChoice: p.placementChoice,
      chosenFeeCents: chosenPlacementTotalCents(fees, p.placementChoice),
      appointmentAt: p.appointmentAt,
      status: p.status,
      hasReconDiff: parseReconciliation(p.reconciliationJson)?.hasDiff ?? false,
      createdAt: p.createdAt,
    }
  })

  // ---- KPIs + chip counts over the FULL set (not the filtered slice) ----
  const statusCounts: Record<ChannelInboundPlanStatus, number> = {
    DRAFT: 0,
    CONFIRMED: 0,
    SHIPPED: 0,
    CHECKED_IN: 0,
    RECONCILED: 0,
    CANCELLED: 0,
  }
  const channelCounts: Record<string, number> = {}
  const channelNames: Record<string, string> = {}
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let checkedIn7d = 0
  let reconDiffCount = 0

  for (let i = 0; i < all.length; i += 1) {
    const row = all[i]
    const plan = plans[i]
    if (!row || !plan) continue
    statusCounts[row.status] += 1
    channelCounts[row.channelCode] = (channelCounts[row.channelCode] ?? 0) + 1
    channelNames[row.channelCode] = row.channelName
    // No checkedInAt column — updatedAt is the check-in proxy (status flips
    // move updatedAt); good enough for a 7-day pulse KPI.
    if (
      (row.status === 'CHECKED_IN' || row.status === 'RECONCILED') &&
      plan.updatedAt.getTime() >= sevenDaysAgo
    ) {
      checkedIn7d += 1
    }
    if (row.status === 'RECONCILED' && row.hasReconDiff) reconDiffCount += 1
  }

  const kpis = {
    total: all.length,
    draftCount: statusCounts.DRAFT,
    inFlightCount: statusCounts.CONFIRMED + statusCounts.SHIPPED,
    checkedIn7d,
    reconDiffCount,
  }
  const channelOrder = Object.keys(channelCounts).sort()

  // ---- Filter ----
  let rows = all
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.orderRef.toLowerCase().includes(q) ||
        r.creatorLabel.toLowerCase().includes(q) ||
        r.channelCode.toLowerCase().includes(q) ||
        r.channelName.toLowerCase().includes(q) ||
        r.externalPlanId.toLowerCase().includes(q),
    )
  }
  if (filters.status) rows = rows.filter((r) => r.status === filters.status)
  if (filters.channel) rows = rows.filter((r) => r.channelCode.toLowerCase() === filters.channel)

  // ---- Sort ----
  const dirMul = filters.dir === 'asc' ? 1 : -1
  const statusRank: Record<ChannelInboundPlanStatus, number> = {
    DRAFT: 0,
    CONFIRMED: 1,
    SHIPPED: 2,
    CHECKED_IN: 3,
    RECONCILED: 4,
    CANCELLED: 5,
  }
  rows = [...rows].sort((a, b) => {
    switch (filters.sort) {
      case 'order':
        return dirMul * a.orderRef.localeCompare(b.orderRef)
      case 'creator':
        return dirMul * a.creatorLabel.localeCompare(b.creatorLabel)
      case 'channel':
        return dirMul * a.channelCode.localeCompare(b.channelCode)
      case 'appointment':
        // Nulls always last regardless of direction.
        if (a.appointmentAt === null && b.appointmentAt === null) return 0
        if (a.appointmentAt === null) return 1
        if (b.appointmentAt === null) return -1
        return dirMul * (a.appointmentAt.getTime() - b.appointmentAt.getTime())
      case 'status':
        return dirMul * (statusRank[a.status] - statusRank[b.status])
      case 'createdAt':
      default:
        return dirMul * (a.createdAt.getTime() - b.createdAt.getTime())
    }
  })

  // ---- Paginate (50/page) ----
  const totalFiltered = rows.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PLAN_PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const paged = rows.slice((page - 1) * PLAN_PAGE_SIZE, page * PLAN_PAGE_SIZE)

  return {
    filters: { ...filters, page },
    rows: paged,
    totalFiltered,
    totalPages,
    kpis,
    statusCounts,
    channelOrder,
    channelNames,
    channelCounts,
  }
}
