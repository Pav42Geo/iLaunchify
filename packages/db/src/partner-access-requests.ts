// Partner-initiated Access requests reader: the Inbox approval queue.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md (phase-2 request queue).
//
// A partner asks the admin to unlock a lever that is currently INHERIT/DENY
// (e.g. request print rotation, request nomination eligibility). Admin approves
// (→ writes an ALLOW override) or denies. This module is READ-ONLY; the decide
// action lives in the admin app.
//
// Cast-guarded + fail-soft so it works before PartnerAccessRequest lands on the
// generated client (matches the sibling access-context / slug modules).

import { prisma } from './index'

export interface PartnerAccessRequestRow {
  id: string
  partnerId: string
  companyName: string
  slug: string | null
  lever: string
  requested: string | null
  note: string | null
  status: string // 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN'
  createdAt: Date
  decidedAt: Date | null
}

type RawRequest = {
  id: string
  partnerId: string
  lever: string
  requested: string | null
  note: string | null
  status: string
  createdAt: Date
  decidedAt: Date | null
  partner: { companyName: string | null; slug: string | null } | null
}

const requestModel = () =>
  (
    prisma as unknown as {
      partnerAccessRequest: {
        findMany: (a: unknown) => Promise<RawRequest[]>
        count: (a: unknown) => Promise<number>
      }
    }
  ).partnerAccessRequest

function shape(r: RawRequest): PartnerAccessRequestRow {
  return {
    id: r.id,
    partnerId: r.partnerId,
    companyName: r.partner?.companyName ?? 'Unknown partner',
    slug: r.partner?.slug ?? null,
    lever: r.lever,
    requested: r.requested,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
  }
}

/** List access requests, newest first. `status` filters; omit for all. */
export async function listPartnerAccessRequests({
  status,
  take = 50,
  skip = 0,
}: {
  status?: 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN'
  take?: number
  skip?: number
} = {}): Promise<PartnerAccessRequestRow[]> {
  try {
    const rows = await requestModel().findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take,
      skip,
      include: { partner: { select: { companyName: true, slug: true } } },
    })
    return rows.map(shape)
  } catch {
    return []
  }
}

/** All requests for ONE partner (partner-facing surface), newest first. */
export async function listPartnerAccessRequestsByPartner(
  partnerId: string,
): Promise<PartnerAccessRequestRow[]> {
  try {
    const rows = await requestModel().findMany({
      where: { partnerId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: { partner: { select: { companyName: true, slug: true } } },
    })
    return rows.map(shape)
  } catch {
    return []
  }
}

/** Count of PENDING requests: the Inbox pink-pill badge. Fail-soft to 0. */
export async function countPendingPartnerAccessRequests(): Promise<number> {
  try {
    return await requestModel().count({ where: { status: 'PENDING' } })
  } catch {
    return 0
  }
}

/** Load one request by id (used by the decide action to read lever/requested). */
export async function getPartnerAccessRequest(
  id: string,
): Promise<PartnerAccessRequestRow | null> {
  try {
    const rows = await requestModel().findMany({
      where: { id },
      take: 1,
      include: { partner: { select: { companyName: true, slug: true } } },
    })
    return rows[0] ? shape(rows[0]) : null
  } catch {
    return null
  }
}
