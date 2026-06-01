// =============================================================================
// /admin/niches/audit — data loader (Slice 3D)
// =============================================================================
//
// Aggregates NicheAssignmentAudit rows for the admin audit feed.
//
// Filters: source (AUTO_RULE|MANUFACTURER|ADMIN) · niche (slug) · applied
// (added|removed|all) · range (7d|30d|90d|all) · sort + dir · q (product
// search) · page.
//
// KPIs: rowsInRange · uniqueProducts · bySource · locksApplied · removalsByAdmin.
// "locksApplied" = source=AUTO_RULE rows whose niche has at least one locked
// active rule (Pet Wellness on PET_PRODUCT being the canonical example).
//
// Reads only — no mutations, no AuditLog writes.

import { prisma } from '@ilaunchify/db'
import type { NicheAssignmentSource } from '@ilaunchify/db'

const PAGE_SIZE = 50

export type NichesAuditSource = 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'
export type NichesAuditApplied = 'added' | 'removed' | 'all'
export type NichesAuditRange = '7d' | '30d' | '90d' | 'all'
export type NichesAuditSort = 'createdAt' | 'product' | 'niche' | 'source'
export type NichesAuditDir = 'asc' | 'desc'

export interface NichesAuditKpis {
  rowsInRange: number
  uniqueProducts: number
  bySource: { auto: number; manufacturer: number; admin: number }
  locksApplied: number
  removalsByAdmin: number
}

export interface NichesAuditRow {
  id: string
  createdAt: Date
  product: { id: string; slug: string; name: string } | null
  niche: {
    id: string
    slug: string
    name: string
    iconEmoji: string | null
    accentHex: string | null
  } | null
  source: NichesAuditSource
  applied: boolean
  rule: { id: string; slug: string; description: string } | null
  actor: { id: string; name: string | null; email: string } | null
  reason: string | null
}

export interface NichesAuditFilterOptions {
  niches: Array<{ slug: string; name: string; iconEmoji: string | null }>
}

export interface NichesAuditLoadResult {
  kpis: NichesAuditKpis
  rows: NichesAuditRow[]
  totalCount: number
  pageCount: number
  filterOptions: NichesAuditFilterOptions
}

export interface NichesAuditLoadParams {
  source?: NichesAuditSource
  nicheSlug?: string
  applied?: NichesAuditApplied
  range?: NichesAuditRange
  sort?: NichesAuditSort
  dir?: NichesAuditDir
  q?: string
  page?: number
}

// -----------------------------------------------------------------------------

function rangeStart(range: NichesAuditRange): Date | null {
  const now = Date.now()
  switch (range) {
    case '7d':
      return new Date(now - 7 * 24 * 3600 * 1000)
    case '30d':
      return new Date(now - 30 * 24 * 3600 * 1000)
    case '90d':
      return new Date(now - 90 * 24 * 3600 * 1000)
    case 'all':
      return null
  }
}

function buildOrderBy(sort: NichesAuditSort, dir: NichesAuditDir) {
  switch (sort) {
    case 'createdAt':
      return { createdAt: dir }
    case 'product':
      return { productTemplate: { name: dir } }
    case 'niche':
      return { niche: { name: dir } }
    case 'source':
      return { source: dir }
  }
}

// -----------------------------------------------------------------------------

export async function loadNichesAuditData(
  params: NichesAuditLoadParams = {},
): Promise<NichesAuditLoadResult> {
  const range = params.range ?? '7d'
  const sort = params.sort ?? 'createdAt'
  const dir = params.dir ?? 'desc'
  const page = Math.max(1, params.page ?? 1)
  const skip = (page - 1) * PAGE_SIZE

  const since = rangeStart(range)

  // ---------- WHERE clause ------------------------------------------------
  // Base where for the filtered table query (respects every filter).
  const tableWhere: Record<string, unknown> = {}
  if (since) tableWhere.createdAt = { gte: since }
  if (params.source) tableWhere.source = params.source as NicheAssignmentSource
  if (params.applied === 'added') tableWhere.applied = true
  if (params.applied === 'removed') tableWhere.applied = false
  if (params.nicheSlug) tableWhere.niche = { slug: params.nicheSlug }
  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim()
    tableWhere.productTemplate = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ],
    }
  }

  // KPI where = same range, but ignores all other filters so the KPIs reflect
  // the window, not the current chip drill-down.
  const kpiWhere: Record<string, unknown> = since
    ? { createdAt: { gte: since } }
    : {}

  // ---------- Parallel fetch ---------------------------------------------
  const [
    rowsInRange,
    uniqueProductIds,
    autoCount,
    manufacturerCount,
    adminCount,
    removalsByAdmin,
    lockedRules,
    totalCount,
    rawRows,
    niches,
  ] = await Promise.all([
    prisma.nicheAssignmentAudit.count({ where: kpiWhere }),
    prisma.nicheAssignmentAudit
      .findMany({
        where: kpiWhere,
        select: { productTemplateId: true },
        distinct: ['productTemplateId'],
      })
      .then((rs) => rs.length),
    prisma.nicheAssignmentAudit.count({
      where: { ...kpiWhere, source: 'AUTO_RULE' as NicheAssignmentSource },
    }),
    prisma.nicheAssignmentAudit.count({
      where: { ...kpiWhere, source: 'MANUFACTURER' as NicheAssignmentSource },
    }),
    prisma.nicheAssignmentAudit.count({
      where: { ...kpiWhere, source: 'ADMIN' as NicheAssignmentSource },
    }),
    prisma.nicheAssignmentAudit.count({
      where: {
        ...kpiWhere,
        source: 'ADMIN' as NicheAssignmentSource,
        applied: false,
      },
    }),
    // Niches that have ANY locked+active rule. Drives the "locks applied"
    // KPI: count of AUTO_RULE rows in the window assigned to one of these.
    prisma.nicheRule.findMany({
      where: { isLocked: true, isActive: true },
      select: { nicheId: true },
    }),
    prisma.nicheAssignmentAudit.count({ where: tableWhere }),
    prisma.nicheAssignmentAudit.findMany({
      where: tableWhere,
      orderBy: buildOrderBy(sort, dir),
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        source: true,
        applied: true,
        ruleId: true,
        actorUserId: true,
        productTemplate: {
          select: { id: true, slug: true, name: true },
        },
        niche: {
          select: {
            id: true,
            slug: true,
            name: true,
            iconEmoji: true,
            accentHex: true,
          },
        },
      },
    }),
    prisma.niche.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, iconEmoji: true },
    }),
  ])

  const lockedNicheIds = new Set(lockedRules.map((r) => r.nicheId))

  // Locks applied: count AUTO_RULE rows in the window whose niche is locked.
  const locksApplied = await prisma.nicheAssignmentAudit.count({
    where: {
      ...kpiWhere,
      source: 'AUTO_RULE' as NicheAssignmentSource,
      applied: true,
      nicheId: { in: [...lockedNicheIds] },
    },
  })

  // ---------- Resolve rule + actor side-tables in two batch queries ------
  const ruleIds = [
    ...new Set(rawRows.map((r) => r.ruleId).filter((v): v is string => !!v)),
  ]
  const actorIds = [
    ...new Set(
      rawRows.map((r) => r.actorUserId).filter((v): v is string => !!v),
    ),
  ]

  const [rules, actors] = await Promise.all([
    ruleIds.length
      ? prisma.nicheRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, slug: true, description: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; slug: string; description: string }>,
        ),
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; name: string | null; email: string }>,
        ),
  ])

  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const actorById = new Map(actors.map((u) => [u.id, u]))

  // The schema doesn't ship a `reason` column on NicheAssignmentAudit (V1).
  // Surface null until/unless that field lands. Memory note +
  // ilaunchify-admin-surface-pattern.md still expects the column in the row
  // shape, so we keep it nullable on the wire and render "—" in the UI.
  const rows: NichesAuditRow[] = rawRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    product: r.productTemplate
      ? {
          id: r.productTemplate.id,
          slug: r.productTemplate.slug,
          name: r.productTemplate.name,
        }
      : null,
    niche: r.niche
      ? {
          id: r.niche.id,
          slug: r.niche.slug,
          name: r.niche.name,
          iconEmoji: r.niche.iconEmoji,
          accentHex: r.niche.accentHex,
        }
      : null,
    source: r.source as NichesAuditSource,
    applied: r.applied,
    rule: r.ruleId ? ruleById.get(r.ruleId) ?? null : null,
    actor: r.actorUserId ? actorById.get(r.actorUserId) ?? null : null,
    reason: null,
  }))

  return {
    kpis: {
      rowsInRange,
      uniqueProducts: uniqueProductIds,
      bySource: {
        auto: autoCount,
        manufacturer: manufacturerCount,
        admin: adminCount,
      },
      locksApplied,
      removalsByAdmin,
    },
    rows,
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    filterOptions: { niches },
  }
}

export const NICHES_AUDIT_PAGE_SIZE = PAGE_SIZE
