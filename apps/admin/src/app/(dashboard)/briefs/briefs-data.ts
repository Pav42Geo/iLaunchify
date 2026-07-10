// =============================================================================
// /admin/briefs — data loader (co-creation oversight, spec §10/§16 P0)
// =============================================================================
//
// READ-ONLY oversight over creator-originated ProductBriefs
// (docs/CO_CREATION_MARKETPLACE_SPEC.md). Follows the partners-data.ts shape:
// one `loadBriefsData(sp)` returning KPI counts (independent of the active
// filter), chip counts, the niche dropdown options, and the paginated rows.
// No mutations live here or anywhere on the admin briefs surface.

import { prisma } from '@ilaunchify/db'
import type { BriefStatus, BriefOrigin } from '@ilaunchify/db'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const BRIEFS_PAGE_SIZE = 50

export const BRIEF_STATUS_ORDER: BriefStatus[] = [
  'DRAFT',
  'POSTED',
  'INTEREST_OPEN',
  'SHORTLISTING',
  'MATCHED',
  'IN_ROOM',
  'IN_PRODUCTION',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
]

export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  DRAFT: 'Draft',
  POSTED: 'Posted',
  INTEREST_OPEN: 'Interest open',
  SHORTLISTING: 'Shortlisting',
  MATCHED: 'Matched',
  IN_ROOM: 'In room',
  IN_PRODUCTION: 'In production',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

export const BRIEF_ORIGIN_LABEL: Record<BriefOrigin, string> = {
  HAVE_RECIPE: 'I have a recipe',
  HAVE_IDEA: 'I have an idea',
}

// Status pill tones — shared by the list + detail pages (page files must not
// export arbitrary consts, so the presentation lookup lives here).
export const BRIEF_STATUS_PILL: Record<
  BriefStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  DRAFT: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
  POSTED: { bg: 'bg-info-100', text: 'text-info-700', border: 'border-info-200', dot: 'bg-info-500' },
  INTEREST_OPEN: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  SHORTLISTING: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  MATCHED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  IN_ROOM: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  IN_PRODUCTION: { bg: 'bg-info-100', text: 'text-info-700', border: 'border-info-200', dot: 'bg-info-500' },
  COMPLETED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  CANCELLED: { bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-200', dot: 'bg-danger-500' },
  EXPIRED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

export type BriefsSortKey = 'createdAt' | 'title' | 'interests'
export type SortDir = 'asc' | 'desc'

export interface BriefsSearchParams {
  q?: string
  status?: string
  niche?: string
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedBriefFilters {
  q: string
  status: BriefStatus | null
  niche: string | null
  sort: BriefsSortKey
  dir: SortDir
  page: number
}

export function isValidBriefStatus(s: string | undefined): s is BriefStatus {
  return !!s && (BRIEF_STATUS_ORDER as readonly string[]).includes(s)
}

export function isValidBriefsSort(s: string | undefined): s is BriefsSortKey {
  return s === 'createdAt' || s === 'title' || s === 'interests'
}

export function parseBriefFilters(sp: BriefsSearchParams): ParsedBriefFilters {
  return {
    q: sp.q?.trim() || '',
    status: isValidBriefStatus(sp.status) ? sp.status : null,
    niche: sp.niche?.trim() || null,
    sort: isValidBriefsSort(sp.sort) ? sp.sort : 'createdAt',
    dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row shape
// -----------------------------------------------------------------------------

export interface BriefRow {
  id: string
  title: string
  status: BriefStatus
  nicheSlug: string
  categoryName: string
  creatorId: string
  creatorName: string
  interestsCount: number
  roomId: string | null
  createdAt: Date
}

export interface NicheOption {
  slug: string
  name: string
}

export interface LoadedBriefsData {
  filters: ParsedBriefFilters
  kpis: {
    total: number
    openInPool: number
    inRooms: number
    interests7d: number
    /** IN_ROOM + IN_PRODUCTION + COMPLETED over all non-DRAFT briefs, 0–100. */
    conversionPct: number
    nonDraft: number
  }
  statusCounts: Record<BriefStatus, number>
  niches: NicheOption[]
  rows: BriefRow[]
  totalFiltered: number
  totalPages: number
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadBriefsData(
  sp: BriefsSearchParams,
): Promise<LoadedBriefsData> {
  const filters = parseBriefFilters(sp)

  const last7d = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  // Where clause for the table rows only — KPI + chip counts stay global.
  const where: Record<string, unknown> = {}
  if (filters.q) {
    where.title = { contains: filters.q, mode: 'insensitive' }
  }
  if (filters.status) {
    where.status = filters.status
  }
  if (filters.niche) {
    where.nicheSlug = filters.niche
  }

  const dir: 'asc' | 'desc' = filters.dir
  const orderBy =
    filters.sort === 'title'
      ? { title: dir }
      : filters.sort === 'interests'
        ? { interests: { _count: dir } }
        : { createdAt: dir }

  const [
    total,
    statusGroupCounts,
    interests7d,
    niches,
    totalFiltered,
    rawRows,
  ] = await Promise.all([
    prisma.productBrief.count(),
    prisma.productBrief.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.briefInterest.count({ where: { createdAt: { gte: last7d } } }),
    prisma.niche.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { slug: true, name: true },
    }),
    prisma.productBrief.count({ where: where as never }),
    prisma.productBrief.findMany({
      where: where as never,
      include: {
        creator: { select: { id: true, displayName: true } },
        categoryRef: { select: { name: true } },
        room: { select: { id: true } },
        _count: { select: { interests: true } },
      },
      orderBy: orderBy as never,
      skip: (filters.page - 1) * BRIEFS_PAGE_SIZE,
      take: BRIEFS_PAGE_SIZE,
    }),
  ])

  const statusCounts = Object.fromEntries(
    BRIEF_STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<BriefStatus, number>
  for (const c of statusGroupCounts) {
    statusCounts[c.status] = c._count._all
  }

  const openInPool = statusCounts.INTEREST_OPEN + statusCounts.SHORTLISTING
  const inRooms = statusCounts.MATCHED + statusCounts.IN_ROOM
  const nonDraft = total - statusCounts.DRAFT
  const converted =
    statusCounts.IN_ROOM + statusCounts.IN_PRODUCTION + statusCounts.COMPLETED
  const conversionPct = nonDraft > 0 ? Math.round((converted / nonDraft) * 100) : 0

  const rows: BriefRow[] = rawRows.map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
    nicheSlug: b.nicheSlug,
    categoryName: b.categoryRef?.name ?? b.category,
    creatorId: b.creator.id,
    creatorName: b.creator.displayName ?? '—',
    interestsCount: b._count.interests,
    roomId: b.room?.id ?? null,
    createdAt: b.createdAt,
  }))

  const totalPages = Math.max(1, Math.ceil(totalFiltered / BRIEFS_PAGE_SIZE))

  return {
    filters,
    kpis: { total, openInPool, inRooms, interests7d, conversionPct, nonDraft },
    statusCounts,
    niches,
    rows,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome
// -----------------------------------------------------------------------------

export function buildBriefsHref(
  current: ParsedBriefFilters,
  overrides: Partial<{
    q: string
    status: string
    niche: string
    sort: BriefsSortKey
    dir: SortDir
    page: number
  }>,
  // Mount point — the list section renders inside /product-builder (?view=briefs)
  // since Pavel 2026-07-10, so every filter/sort/page href builds on the mount
  // path and always carries the extra params (e.g. view=briefs).
  basePath: string = '/briefs',
  extraParams?: Record<string, string>,
): string {
  const q = overrides.q !== undefined ? overrides.q : current.q
  const status =
    overrides.status !== undefined ? overrides.status : current.status ?? ''
  const niche =
    overrides.niche !== undefined ? overrides.niche : current.niche ?? ''
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) params.set(key, value)
  }
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  if (niche) params.set('niche', niche)
  if (sort !== 'createdAt') params.set('sort', sort)
  if (dir !== 'desc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
