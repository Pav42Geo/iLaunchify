// =============================================================================
// /admin/rooms — data loader (co-creation oversight, spec §10/§16 P0)
// =============================================================================
//
// READ-ONLY oversight over CoCreationRooms. Same shape as briefs-data.ts:
// one `loadRoomsData(sp)` returning KPI counts (independent of the active
// filter), status chip counts, and the paginated rows. Privacy posture: we
// surface room METADATA (objects, milestones, decision log, message COUNT) —
// never chat message bodies.

import { prisma } from '@ilaunchify/db'
import type { RoomStatus } from '@ilaunchify/db'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const ROOMS_PAGE_SIZE = 50

export const ROOM_STATUS_ORDER: RoomStatus[] = [
  'ACTIVE',
  'PAUSED',
  'CLOSED_WON',
  'CLOSED_CANCELLED',
]

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  CLOSED_WON: 'Closed · won',
  CLOSED_CANCELLED: 'Closed · cancelled',
}

// Status pill tones — shared by the list + detail pages (page files must not
// export arbitrary consts, so the presentation lookup lives here).
export const ROOM_STATUS_PILL: Record<
  RoomStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  PAUSED: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  CLOSED_WON: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  CLOSED_CANCELLED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

export type RoomsSortKey = 'createdAt' | 'title'
export type SortDir = 'asc' | 'desc'

export interface RoomsSearchParams {
  q?: string
  status?: string
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedRoomFilters {
  q: string
  status: RoomStatus | null
  sort: RoomsSortKey
  dir: SortDir
  page: number
}

export function isValidRoomStatus(s: string | undefined): s is RoomStatus {
  return !!s && (ROOM_STATUS_ORDER as readonly string[]).includes(s)
}

export function isValidRoomsSort(s: string | undefined): s is RoomsSortKey {
  return s === 'createdAt' || s === 'title'
}

export function parseRoomFilters(sp: RoomsSearchParams): ParsedRoomFilters {
  return {
    q: sp.q?.trim() || '',
    status: isValidRoomStatus(sp.status) ? sp.status : null,
    sort: isValidRoomsSort(sp.sort) ? sp.sort : 'createdAt',
    dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row shape
// -----------------------------------------------------------------------------

export interface RoomRow {
  id: string
  status: RoomStatus
  briefId: string
  briefTitle: string
  creatorId: string
  creatorName: string
  partnerId: string
  partnerName: string
  objectsInReview: number
  milestonesReleased: number
  milestonesTotal: number
  ndaSignedAt: Date | null
  createdAt: Date
}

export interface LoadedRoomsData {
  filters: ParsedRoomFilters
  kpis: {
    activeRooms: number
    objectsAwaitingReview: number
    changesRequested: number
    milestonesReleased: number
    closedWon: number
  }
  statusCounts: Record<RoomStatus, number>
  rows: RoomRow[]
  totalFiltered: number
  totalPages: number
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadRoomsData(
  sp: RoomsSearchParams,
): Promise<LoadedRoomsData> {
  const filters = parseRoomFilters(sp)

  // Where clause for the table rows only — KPI + chip counts stay global.
  const where: Record<string, unknown> = {}
  if (filters.q) {
    where.brief = { title: { contains: filters.q, mode: 'insensitive' } }
  }
  if (filters.status) {
    where.status = filters.status
  }

  const dir: 'asc' | 'desc' = filters.dir
  const orderBy =
    filters.sort === 'title'
      ? { brief: { title: dir } }
      : { createdAt: dir }

  const [
    statusGroupCounts,
    objectsAwaitingReview,
    changesRequested,
    milestonesReleased,
    totalFiltered,
    rawRows,
  ] = await Promise.all([
    prisma.coCreationRoom.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.buildObject.count({ where: { status: 'IN_REVIEW' } }),
    prisma.buildObject.count({ where: { status: 'CHANGES_REQUESTED' } }),
    prisma.roomMilestone.count({ where: { status: 'RELEASED' } }),
    prisma.coCreationRoom.count({ where: where as never }),
    prisma.coCreationRoom.findMany({
      where: where as never,
      include: {
        brief: {
          select: {
            id: true,
            title: true,
            creator: { select: { id: true, displayName: true } },
          },
        },
        partner: { select: { id: true, companyName: true } },
        objects: { select: { status: true } },
        milestones: { select: { status: true } },
      },
      orderBy: orderBy as never,
      skip: (filters.page - 1) * ROOMS_PAGE_SIZE,
      take: ROOMS_PAGE_SIZE,
    }),
  ])

  const statusCounts = Object.fromEntries(
    ROOM_STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<RoomStatus, number>
  for (const c of statusGroupCounts) {
    statusCounts[c.status] = c._count._all
  }

  const rows: RoomRow[] = rawRows.map((r) => ({
    id: r.id,
    status: r.status,
    briefId: r.brief.id,
    briefTitle: r.brief.title,
    creatorId: r.brief.creator.id,
    creatorName: r.brief.creator.displayName ?? '—',
    partnerId: r.partner.id,
    partnerName: r.partner.companyName,
    objectsInReview: r.objects.filter((o) => o.status === 'IN_REVIEW').length,
    milestonesReleased: r.milestones.filter((m) => m.status === 'RELEASED').length,
    milestonesTotal: r.milestones.length,
    ndaSignedAt: r.ndaSignedAt,
    createdAt: r.createdAt,
  }))

  const totalPages = Math.max(1, Math.ceil(totalFiltered / ROOMS_PAGE_SIZE))

  return {
    filters,
    kpis: {
      activeRooms: statusCounts.ACTIVE,
      objectsAwaitingReview,
      changesRequested,
      milestonesReleased,
      closedWon: statusCounts.CLOSED_WON,
    },
    statusCounts,
    rows,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome
// -----------------------------------------------------------------------------

export function buildRoomsHref(
  current: ParsedRoomFilters,
  overrides: Partial<{
    q: string
    status: string
    sort: RoomsSortKey
    dir: SortDir
    page: number
  }>,
  // Mount point — the list section renders inside /product-builder (?view=rooms)
  // since Pavel 2026-07-10, so every filter/sort/page href builds on the mount
  // path and always carries the extra params (e.g. view=rooms).
  basePath: string = '/rooms',
  extraParams?: Record<string, string>,
): string {
  const q = overrides.q !== undefined ? overrides.q : current.q
  const status =
    overrides.status !== undefined ? overrides.status : current.status ?? ''
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) params.set(key, value)
  }
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  if (sort !== 'createdAt') params.set('sort', sort)
  if (dir !== 'desc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
