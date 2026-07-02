// Data layer for /logistics/carriers (Phase L2).
// CarrierServiceRule is the Stage-2 eligibility matrix + Stage-3 fallback chain
// (docs/LOGISTICS_AND_FULFILLMENT.md §6.2) — DB-driven condition rows, not a
// rules DSL. The matrix is small (a seeded starter set + admin additions), so
// we filter/sort/paginate in memory after one query, like fc-data.ts.

import { prisma, getLogisticsSettings } from '@ilaunchify/db'
import {
  SHIPMENT_MODES,
  STORAGE_CLASSES,
  type ShipmentModeKey,
  type StorageClassKey,
} from './carrier-enums'

// Re-export the client-safe enum lists so server consumers (page.tsx) can keep
// a single import; the CLIENT form imports ./carrier-enums directly (this file
// pulls in prisma and must never reach the client bundle).
export {
  SHIPMENT_MODES,
  STORAGE_CLASSES,
  HAZMAT_CLASSES,
  STORAGE_CLASS_LABEL,
  HAZMAT_LABEL,
} from './carrier-enums'
export type { ShipmentModeKey, StorageClassKey, HazmatClassKey } from './carrier-enums'

export const RULE_PAGE_SIZE = 50

export type ActiveFilter = '' | 'active' | 'inactive'
export type RuleSortKey = 'carrier' | 'service' | 'weight' | 'transit' | 'priority' | 'updatedAt'
export type SortDir = 'asc' | 'desc'

export interface ParsedRuleFilters {
  q: string
  mode: ShipmentModeKey | ''
  class: StorageClassKey | ''
  active: ActiveFilter
  sort: RuleSortKey
  dir: SortDir
  page: number
}

export interface RuleRow {
  id: string
  carrier: string
  serviceLevel: string
  modes: string[]
  storageClasses: string[]
  hazmatAllowed: string[]
  maxWeightLb: number | null
  maxTransitDays: number | null
  groundOnly: boolean
  priority: number
  active: boolean
  updatedAt: Date
}

/** Integration STATUS row — env configured yes/no only, never key values
 *  (integrations-registry rule, /developer pattern). */
export interface IntegrationStatusRow {
  name: string
  envVar: string
  configured: boolean
  gateKey: string
  gateEnabled: boolean
}

export interface RulePageData {
  filters: ParsedRuleFilters
  rows: RuleRow[]
  totalFiltered: number
  totalPages: number
  kpis: {
    total: number
    activeCount: number
    coldCapableCount: number
    groundOnlyCount: number
  }
  modeCounts: Record<ShipmentModeKey, number>
  classCounts: Record<StorageClassKey, number>
  activeCounts: { active: number; inactive: number }
  integrations: IntegrationStatusRow[]
}

const SORT_KEYS: RuleSortKey[] = ['carrier', 'service', 'weight', 'transit', 'priority', 'updatedAt']

export function parseRuleFilters(sp: {
  q?: string
  mode?: string
  class?: string
  active?: string
  sort?: string
  dir?: string
  page?: string
}): ParsedRuleFilters {
  const mode = (SHIPMENT_MODES as readonly string[]).includes(sp.mode ?? '')
    ? (sp.mode as ShipmentModeKey)
    : ''
  const cls = (STORAGE_CLASSES as readonly string[]).includes(sp.class ?? '')
    ? (sp.class as StorageClassKey)
    : ''
  const active: ActiveFilter =
    sp.active === 'active' ? 'active' : sp.active === 'inactive' ? 'inactive' : ''
  const sort = SORT_KEYS.includes(sp.sort as RuleSortKey) ? (sp.sort as RuleSortKey) : 'priority'
  const dir: SortDir = sp.dir === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  return { q: (sp.q ?? '').trim(), mode, class: cls, active, sort, dir, page }
}

/** URL builder — merges overrides into the current filters, dropping defaults. */
export function buildRuleHref(
  filters: ParsedRuleFilters,
  overrides: Partial<{
    q: string
    mode: string
    class: string
    active: string
    sort: RuleSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.mode) params.set('mode', next.mode)
  if (next.class) params.set('class', next.class)
  if (next.active) params.set('active', next.active)
  if (next.sort !== 'priority') params.set('sort', next.sort)
  if (next.dir !== 'asc') params.set('dir', next.dir)
  if (next.page > 1) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/logistics/carriers?${qs}` : '/logistics/carriers'
}

export async function loadRuleData(sp: {
  q?: string
  mode?: string
  class?: string
  active?: string
  sort?: string
  dir?: string
  page?: string
}): Promise<RulePageData> {
  const filters = parseRuleFilters(sp)

  const [ruleRows, gates] = await Promise.all([
    prisma.carrierServiceRule.findMany({
      orderBy: [{ priority: 'asc' }, { carrier: 'asc' }],
    }),
    getLogisticsSettings(),
  ])

  const all: RuleRow[] = ruleRows.map((r) => ({
    id: r.id,
    carrier: r.carrier,
    serviceLevel: r.serviceLevel,
    modes: r.modes,
    storageClasses: r.storageClasses,
    hazmatAllowed: r.hazmatAllowed,
    maxWeightLb: r.maxWeightLb,
    maxTransitDays: r.maxTransitDays,
    groundOnly: r.groundOnly,
    priority: r.priority,
    active: r.active,
    updatedAt: r.updatedAt,
  }))

  // ---- Integration status (env configured yes/no only — never values) ----
  const integrations: IntegrationStatusRow[] = [
    {
      name: 'EasyPost (parcel)',
      envVar: 'EASYPOST_API_KEY',
      configured: Boolean(process.env.EASYPOST_API_KEY),
      gateKey: 'carrier:easypost',
      gateEnabled: gates['carrier:easypost'] === true,
    },
    {
      name: 'ShipEngine (dry LTL)',
      envVar: 'SHIPENGINE_API_KEY',
      configured: Boolean(process.env.SHIPENGINE_API_KEY),
      gateKey: 'carrier:shipengine_ltl',
      gateEnabled: gates['carrier:shipengine_ltl'] === true,
    },
  ]

  // ---- KPIs + chip counts over the FULL set (not the filtered slice) ----
  const modeCounts: Record<ShipmentModeKey, number> = { PARCEL: 0, LTL: 0, FTL: 0 }
  const classCounts: Record<StorageClassKey, number> = {
    AMBIENT: 0,
    PROTECT_HEAT: 0,
    CHILLED: 0,
    FROZEN: 0,
  }
  let activeCount = 0
  let coldCapableCount = 0
  let groundOnlyCount = 0
  for (const row of all) {
    if (row.active) activeCount += 1
    if (row.groundOnly) groundOnlyCount += 1
    if (row.storageClasses.includes('CHILLED') || row.storageClasses.includes('FROZEN')) {
      coldCapableCount += 1
    }
    for (const m of SHIPMENT_MODES) if (row.modes.includes(m)) modeCounts[m] += 1
    for (const c of STORAGE_CLASSES) if (row.storageClasses.includes(c)) classCounts[c] += 1
  }
  const kpis = {
    total: all.length,
    activeCount,
    coldCapableCount,
    groundOnlyCount,
  }
  const activeCounts = { active: activeCount, inactive: all.length - activeCount }

  // ---- Filter ----
  let rows = all
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(
      (r) => r.carrier.toLowerCase().includes(q) || r.serviceLevel.toLowerCase().includes(q),
    )
  }
  if (filters.mode) rows = rows.filter((r) => r.modes.includes(filters.mode))
  if (filters.class) rows = rows.filter((r) => r.storageClasses.includes(filters.class))
  if (filters.active === 'active') rows = rows.filter((r) => r.active)
  if (filters.active === 'inactive') rows = rows.filter((r) => !r.active)

  // ---- Sort ----
  const dirMul = filters.dir === 'asc' ? 1 : -1
  rows = [...rows].sort((a, b) => {
    switch (filters.sort) {
      case 'carrier':
        return dirMul * (a.carrier.localeCompare(b.carrier) || a.priority - b.priority)
      case 'service':
        return dirMul * a.serviceLevel.localeCompare(b.serviceLevel)
      case 'weight':
        return dirMul * ((a.maxWeightLb ?? -1) - (b.maxWeightLb ?? -1))
      case 'transit':
        return dirMul * ((a.maxTransitDays ?? -1) - (b.maxTransitDays ?? -1))
      case 'updatedAt':
        return dirMul * (a.updatedAt.getTime() - b.updatedAt.getTime())
      case 'priority':
      default:
        return dirMul * (a.priority - b.priority)
    }
  })

  // ---- Paginate (50/page) ----
  const totalFiltered = rows.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / RULE_PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const paged = rows.slice((page - 1) * RULE_PAGE_SIZE, page * RULE_PAGE_SIZE)

  return {
    filters: { ...filters, page },
    rows: paged,
    totalFiltered,
    totalPages,
    kpis,
    modeCounts,
    classCounts,
    activeCounts,
    integrations,
  }
}
