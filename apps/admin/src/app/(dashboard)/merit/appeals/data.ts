// Rating appeal inbox — data (MM-4b). Lists appeals with the contested rating +
// manufacturer + SLA health, oldest-open first (the queue an admin works down).

import { prisma } from '@ilaunchify/db'
import { appealSlaState, isOpenAppeal, type RatingAppealStatus, type AppealSlaState } from '@ilaunchify/orders'

export interface AppealRow {
  id: string
  companyName: string
  ratingOverall: number | null
  ratingRole: string
  reason: string
  status: RatingAppealStatus
  sla: AppealSlaState
  ageDays: number
  acknowledged: boolean
  adminNote: string | null
}

export interface AppealInbox {
  rows: AppealRow[]
  open: number
  ackOverdue: number
  resolveOverdue: number
  resolved: number
}

export async function loadAppealInbox(): Promise<AppealInbox> {
  const now = new Date()
  const appeals = await prisma.ratingAppeal
    .findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: { id: true, ratingId: true, partnerServiceId: true, reason: true, status: true, adminNote: true, acknowledgedAt: true, createdAt: true },
    })
    .catch(() => [])
  if (appeals.length === 0) return { rows: [], open: 0, ackOverdue: 0, resolveOverdue: 0, resolved: 0 }

  const [ratings, services] = await Promise.all([
    prisma.partnerRating.findMany({ where: { id: { in: appeals.map((a) => a.ratingId) } }, select: { id: true, overall: true, role: true } }),
    prisma.partnerService.findMany({ where: { id: { in: appeals.map((a) => a.partnerServiceId) } }, select: { id: true, partner: { select: { companyName: true } } } }),
  ])
  const ratingById = new Map(ratings.map((r) => [r.id, r]))
  const svcById = new Map(services.map((s) => [s.id, s]))

  let open = 0, ackOverdue = 0, resolveOverdue = 0, resolved = 0
  const rows: AppealRow[] = appeals.map((a) => {
    const sla = appealSlaState(now, a.createdAt, a.acknowledgedAt, a.status as RatingAppealStatus)
    if (isOpenAppeal(a.status as RatingAppealStatus)) open += 1
    else resolved += 1
    if (sla === 'ACK_OVERDUE') ackOverdue += 1
    if (sla === 'RESOLVE_OVERDUE') resolveOverdue += 1
    const rt = ratingById.get(a.ratingId)
    return {
      id: a.id,
      companyName: svcById.get(a.partnerServiceId)?.partner.companyName ?? '(unknown)',
      ratingOverall: rt?.overall == null ? null : Number(rt.overall),
      ratingRole: rt?.role ?? '—',
      reason: a.reason,
      status: a.status as RatingAppealStatus,
      sla,
      ageDays: Math.floor((now.getTime() - a.createdAt.getTime()) / 86_400_000),
      acknowledged: a.acknowledgedAt != null,
      adminNote: a.adminNote,
    }
  })

  return { rows, open, ackOverdue, resolveOverdue, resolved }
}
