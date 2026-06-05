// =============================================================================
// /admin/phrases/audit — data loader
// =============================================================================
//
// Aggregates PhraseAssignmentAudit rows for the admin audit feed. Mirrors
// niches/audit/niches-audit-data.ts.
//
// Filters: source (AUTO_RULE|MANUFACTURER|ADMIN) · applied (added|removed|all)
// · range (7d|30d|90d|all) · sort + dir · q (product search) · page.
//
// KPIs: rowsInRange · uniqueProducts · bySource · locksApplied · removalsByAdmin.
// "locksApplied" = source=AUTO_RULE rows whose phrase has at least one locked
// active rule.
//
// Reads only — no mutations, no AuditLog writes.

import { prisma } from '@ilaunchify/db'
import type { PhraseAssignmentSource } from '@ilaunchify/db'

const PAGE_SIZE = 50

export type PhrasesAuditSource = 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'
export type PhrasesAuditApplied = 'added' | 'removed' | 'all'
export type PhrasesAuditRange = '7d' | '30d' | '90d' | 'all'
export type PhrasesAuditSort = 'createdAt' | 'product' | 'phrase' | 'source'
export type PhrasesAuditDir = 'asc' | 'desc'

export interface PhrasesAuditKpis {
  rowsInRange: number
  uniqueProducts: number
  bySource: { auto: number; manufacturer: number; admin: number }
  locksApplied: number
  removalsByAdmin: number
}

export interface PhrasesAuditRow {
  id: string
  createdAt: Date
  product: { id: string; slug: string; name: string } | null
  phrase: {
    id: string
    slug: string
    title: string
    category: string
    requirement: string
  } | null
  source: PhrasesAuditSource
  applied: boolean
  rule: { id: string; slug: string; description: string } | null
  actor: { id: string; name: string | null; email: string } | null
}

export interface PhrasesAuditFilterOptions {
  phrases: Array<{ slug: string; title: string }>
}

export interface PhrasesAuditLoadResult {
  kpis: PhrasesAuditKpis
  rows: PhrasesAuditRow[]
  totalCount: number
  pageCount: number
  filterOptions: PhrasesAuditFilterOptions
}

export interface PhrasesAuditLoadParams {
  source?: PhrasesAuditSource
  phraseSlug?: string
  applied?: PhrasesAuditApplied
  range?: PhrasesAuditRange
  sort?: PhrasesAuditSort
  dir?: PhrasesAuditDir
  q?: string
  page?: number
}

// -----------------------------------------------------------------------------

function rangeStart(range: PhrasesAuditRange): Date | null {
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

function buildOrderBy(sort: PhrasesAuditSort, dir: PhrasesAuditDir) {
  switch (sort) {
    case 'createdAt':
      return { createdAt: dir }
    case 'product':
      return { productTemplate: { name: dir } }
    case 'phrase':
      return { mandatoryPhrase: { title: dir } }
    case 'source':
      return { source: dir }
  }
}

// -----------------------------------------------------------------------------

export async function loadPhrasesAuditData(
  params: PhrasesAuditLoadParams = {},
): Promise<PhrasesAuditLoadResult> {
  const range = params.range ?? '7d'
  const sort = params.sort ?? 'createdAt'
  const dir = params.dir ?? 'desc'
  const page = Math.max(1, params.page ?? 1)
  const skip = (page - 1) * PAGE_SIZE

  const since = rangeStart(range)

  // ---------- WHERE clause ------------------------------------------------
  const tableWhere: Record<string, unknown> = {}
  if (since) tableWhere.createdAt = { gte: since }
  if (params.source) tableWhere.source = params.source as PhraseAssignmentSource
  if (params.applied === 'added') tableWhere.applied = true
  if (params.applied === 'removed') tableWhere.applied = false
  if (params.phraseSlug) tableWhere.mandatoryPhrase = { slug: params.phraseSlug }
  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim()
    tableWhere.productTemplate = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ],
    }
  }

  // KPI where = same range, ignores other filters so KPIs reflect the window.
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
    phrases,
  ] = await Promise.all([
    prisma.phraseAssignmentAudit.count({ where: kpiWhere }),
    prisma.phraseAssignmentAudit
      .findMany({
        where: kpiWhere,
        select: { productTemplateId: true },
        distinct: ['productTemplateId'],
      })
      .then((rs) => rs.length),
    prisma.phraseAssignmentAudit.count({
      where: { ...kpiWhere, source: 'AUTO_RULE' as PhraseAssignmentSource },
    }),
    prisma.phraseAssignmentAudit.count({
      where: { ...kpiWhere, source: 'MANUFACTURER' as PhraseAssignmentSource },
    }),
    prisma.phraseAssignmentAudit.count({
      where: { ...kpiWhere, source: 'ADMIN' as PhraseAssignmentSource },
    }),
    prisma.phraseAssignmentAudit.count({
      where: {
        ...kpiWhere,
        source: 'ADMIN' as PhraseAssignmentSource,
        applied: false,
      },
    }),
    // Phrases that have ANY locked+active rule. Drives the "locks applied" KPI:
    // count of AUTO_RULE rows in the window assigned to one of these phrases.
    prisma.phraseRule.findMany({
      where: { isLocked: true, isActive: true },
      select: { mandatoryPhraseId: true },
    }),
    prisma.phraseAssignmentAudit.count({ where: tableWhere }),
    prisma.phraseAssignmentAudit.findMany({
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
        mandatoryPhrase: {
          select: {
            id: true,
            slug: true,
            title: true,
            category: true,
            requirement: true,
          },
        },
      },
    }),
    prisma.mandatoryPhrase.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
    }),
  ])

  const lockedPhraseIds = new Set(lockedRules.map((r) => r.mandatoryPhraseId))

  // Locks applied: AUTO_RULE rows in window whose phrase is locked.
  const locksApplied = await prisma.phraseAssignmentAudit.count({
    where: {
      ...kpiWhere,
      source: 'AUTO_RULE' as PhraseAssignmentSource,
      applied: true,
      mandatoryPhraseId: { in: [...lockedPhraseIds] },
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
      ? prisma.phraseRule.findMany({
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

  const rows: PhrasesAuditRow[] = rawRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    product: r.productTemplate
      ? {
          id: r.productTemplate.id,
          slug: r.productTemplate.slug,
          name: r.productTemplate.name,
        }
      : null,
    phrase: r.mandatoryPhrase
      ? {
          id: r.mandatoryPhrase.id,
          slug: r.mandatoryPhrase.slug,
          title: r.mandatoryPhrase.title,
          category: r.mandatoryPhrase.category,
          requirement: r.mandatoryPhrase.requirement,
        }
      : null,
    source: r.source as PhrasesAuditSource,
    applied: r.applied,
    rule: r.ruleId ? ruleById.get(r.ruleId) ?? null : null,
    actor: r.actorUserId ? actorById.get(r.actorUserId) ?? null : null,
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
    filterOptions: { phrases },
  }
}

export const PHRASES_AUDIT_PAGE_SIZE = PAGE_SIZE
