'use server'

// Partner → On-demand requests (CHANNEL_MANAGEMENT_SPEC §3.3 gate #1, C2.3).
//
// The LOCKED rule: a channel order in ON_DEMAND mode may only route to
// production once THIS manufacturer has ENABLED on-demand for that creator
// product (branding snapshot reviewed). These actions power the review queue.
// OnDemandEnablement is cast-guarded (degrades before db:push); ownership is
// verified against the partner's own service ids on every decision.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type EnablementRow = {
  id: string
  creatorUserId: string
  productId: string
  manufacturerServiceId: string
  status: string
  brandingSnapshotJson: unknown
  partnerNote: string | null
  capacityPerDay: number | null
  createdAt: Date
  decidedAt: Date | null
}
type EnablementDelegate = {
  findMany: (a: unknown) => Promise<EnablementRow[]>
  findFirst: (a: unknown) => Promise<EnablementRow | null>
  update: (a: unknown) => Promise<unknown>
}
const enablementDelegate = () =>
  (prisma as unknown as { onDemandEnablement?: EnablementDelegate }).onDemandEnablement ?? null

async function partnerServiceIds(userId: string): Promise<string[]> {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { services: { select: { id: true } } },
  })
  return partner?.services.map((s) => s.id) ?? []
}

export interface OnDemandRequestRow {
  id: string
  status: string
  productName: string
  creatorLabel: string
  requestedAtIso: string
  decidedAtIso: string | null
  partnerNote: string | null
  capacityPerDay: number | null
  snapshotSummary: string | null
}

/** The partner's queue: pending first, then recent decisions. */
export async function loadOnDemandRequests(): Promise<{ migrated: boolean; rows: OnDemandRequestRow[] }> {
  const user = await requireUser()
  const delegate = enablementDelegate()
  if (!delegate) return { migrated: false, rows: [] }
  const serviceIds = await partnerServiceIds(user.id)
  if (serviceIds.length === 0) return { migrated: true, rows: [] }

  const rows = await delegate
    .findMany({
      where: { manufacturerServiceId: { in: serviceIds } },
      orderBy: [{ decidedAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    })
    .catch(() => [] as EnablementRow[])

  // Soft FKs → resolve names in bulk.
  const [products, creators] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.creatorUserId) } },
      select: { id: true, name: true, email: true },
    }),
  ])
  const productName = new Map(products.map((p) => [p.id, p.name]))
  const creatorLabel = new Map(creators.map((c) => [c.id, c.name ?? c.email ?? c.id]))

  return {
    migrated: true,
    rows: rows.map((r) => {
      const snap = (r.brandingSnapshotJson ?? null) as { note?: string; designVersion?: string } | null
      return {
        id: r.id,
        status: r.status,
        productName: productName.get(r.productId) ?? r.productId,
        creatorLabel: creatorLabel.get(r.creatorUserId) ?? r.creatorUserId,
        requestedAtIso: r.createdAt.toISOString(),
        decidedAtIso: r.decidedAt?.toISOString() ?? null,
        partnerNote: r.partnerNote,
        capacityPerDay: r.capacityPerDay,
        snapshotSummary: snap?.note ?? (snap?.designVersion ? `design ${snap.designVersion}` : null),
      }
    }),
  }
}

export type DecisionResult = { ok: true } | { ok: false; error: string }

/** Approve or decline an on-demand enablement (ownership-verified + audited). */
export async function decideOnDemandEnablement(input: {
  enablementId: string
  decision: 'ENABLED' | 'DECLINED'
  note?: string
  capacityPerDay?: number | null
}): Promise<DecisionResult> {
  const user = await requireUser()
  const delegate = enablementDelegate()
  if (!delegate) return { ok: false, error: 'On-demand tables not migrated yet.' }

  const serviceIds = await partnerServiceIds(user.id)
  const row = await delegate
    .findFirst({ where: { id: input.enablementId, manufacturerServiceId: { in: serviceIds } } })
    .catch(() => null)
  if (!row) return { ok: false, error: 'Request not found.' }
  if (row.status === 'ENABLED' && input.decision === 'ENABLED') return { ok: true }

  const capacity =
    input.capacityPerDay != null && Number.isFinite(input.capacityPerDay) && input.capacityPerDay > 0
      ? Math.floor(input.capacityPerDay)
      : null

  await delegate.update({
    where: { id: row.id },
    data: {
      status: input.decision,
      partnerNote: input.note?.trim().slice(0, 500) || null,
      capacityPerDay: capacity,
      decidedAt: new Date(),
    },
  })
  await logAuditAs(user, {
    entityType: 'OnDemandEnablement',
    entityId: row.id,
    action: input.decision === 'ENABLED' ? 'ON_DEMAND_ENABLED' : 'ON_DEMAND_DECLINED',
    payload: { productId: row.productId, creatorUserId: row.creatorUserId, capacityPerDay: capacity },
  })
  return { ok: true }
}

/** Pause a previously enabled product (partner-side kill switch). */
export async function suspendOnDemandEnablement(enablementId: string, note?: string): Promise<DecisionResult> {
  const user = await requireUser()
  const delegate = enablementDelegate()
  if (!delegate) return { ok: false, error: 'On-demand tables not migrated yet.' }
  const serviceIds = await partnerServiceIds(user.id)
  const row = await delegate.findFirst({ where: { id: enablementId, manufacturerServiceId: { in: serviceIds } } }).catch(() => null)
  if (!row) return { ok: false, error: 'Request not found.' }
  await delegate.update({
    where: { id: row.id },
    data: { status: 'SUSPENDED', partnerNote: note?.trim().slice(0, 500) || row.partnerNote, decidedAt: new Date() },
  })
  await logAuditAs(user, {
    entityType: 'OnDemandEnablement',
    entityId: row.id,
    action: 'ON_DEMAND_SUSPENDED',
    payload: { productId: row.productId },
  })
  return { ok: true }
}
