'use server'

// Partner → On-demand requests (CHANNEL_MANAGEMENT_SPEC §3.3 gate #1, C2.3).
//
// The LOCKED rule: a channel order in ON_DEMAND mode may only route to
// production once THIS manufacturer has ENABLED on-demand for that creator
// product (branding snapshot reviewed). These actions power the review queue.
// Ownership is verified against the partner's own service ids on every decision.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { loadOnDemandEligibility, describeOnDemandIneligibility } from '@ilaunchify/orders'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'

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
  /** Frozen branding (Pavel 2026-07-22): the design version under review and a
   *  viewable export when one exists. Null design = creator hasn't designed yet;
   *  the card says so explicitly instead of showing nothing. */
  designLabel: string | null
  designUrl: string | null
}

/** The partner's queue: pending first, then recent decisions. */
export async function loadOnDemandRequests(): Promise<{ rows: OnDemandRequestRow[] }> {
  const user = await requireUser()
  const serviceIds = await partnerServiceIds(user.id)
  if (serviceIds.length === 0) return { rows: [] }

  const rows = await prisma.onDemandEnablement.findMany({
    where: { manufacturerServiceId: { in: serviceIds } },
    orderBy: [{ decidedAt: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })

  // Soft FKs: resolve names in bulk.
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

  type Snapshot = {
    note?: string
    designVersion?: number | string | null
    exportedPdfAssetId?: string | null
  } | null
  const snapshots = rows.map((r) => (r.brandingSnapshotJson ?? null) as Snapshot)
  // Resolve the frozen export assets to viewable URLs in one batch (same
  // storage-backed helper the dispatch cards use for product images).
  const pdfUrls = await resolveCertBadgeUrls(snapshots.map((s) => s?.exportedPdfAssetId ?? null)).catch(
    () => new Map<string, string>(),
  )

  return {
    rows: rows.map((r, i) => {
      const snap = snapshots[i]
      return {
        id: r.id,
        status: r.status,
        productName: productName.get(r.productId) ?? r.productId,
        creatorLabel: creatorLabel.get(r.creatorUserId) ?? r.creatorUserId,
        requestedAtIso: r.createdAt.toISOString(),
        decidedAtIso: r.decidedAt?.toISOString() ?? null,
        partnerNote: r.partnerNote,
        capacityPerDay: r.capacityPerDay,
        snapshotSummary: snap?.note ?? null,
        designLabel: snap?.designVersion != null ? `Label design v${snap.designVersion} (frozen at request)` : null,
        designUrl: snap?.exportedPdfAssetId ? (pdfUrls.get(snap.exportedPdfAssetId) ?? null) : null,
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
  const serviceIds = await partnerServiceIds(user.id)
  const row = await prisma.onDemandEnablement.findFirst({
    where: { id: input.enablementId, manufacturerServiceId: { in: serviceIds } },
  })
  if (!row) return { ok: false, error: 'Request not found.' }
  if (row.status === 'ENABLED' && input.decision === 'ENABLED') return { ok: true }

  // Full-service gate #2 (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md):
  // re-check at decision time. The creator's pre-flight ran at REQUEST time,
  // but the product can change in between (an outside printer pinned, a
  // co-packer added), and ENABLED is standing consent. Scoped to the ROW's
  // creator: this action decides on that creator's product, not the caller's.
  // DECLINE is always allowed.
  if (input.decision === 'ENABLED') {
    const eligibility = await loadOnDemandEligibility(row.productId, row.creatorUserId).catch(() => null)
    if (!eligibility) return { ok: false, error: 'Could not verify on-demand eligibility. Try again.' }
    if (!eligibility.eligible) {
      return {
        ok: false,
        error: `This product no longer qualifies for on-demand (must run fully in-house): ${describeOnDemandIneligibility(eligibility.reasons)}`,
      }
    }
    if (eligibility.manufacturerServiceId !== row.manufacturerServiceId) {
      // The creator re-pinned since the request. This row's consent would attach
      // to a manufacturer that no longer owns the product: refuse, fail-closed.
      return { ok: false, error: 'The product is now pinned to a different manufacturer. Ask the creator to re-request.' }
    }
  }

  const capacity =
    input.capacityPerDay != null && Number.isFinite(input.capacityPerDay) && input.capacityPerDay > 0
      ? Math.floor(input.capacityPerDay)
      : null

  await prisma.onDemandEnablement.update({
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
  const serviceIds = await partnerServiceIds(user.id)
  const row = await prisma.onDemandEnablement.findFirst({
    where: { id: enablementId, manufacturerServiceId: { in: serviceIds } },
  })
  if (!row) return { ok: false, error: 'Request not found.' }
  await prisma.onDemandEnablement.update({
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
