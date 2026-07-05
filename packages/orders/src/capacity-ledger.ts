// PartnerCapacityLedger writer — Risk Center M1 (docs/RISK_CENTER_IMPLEMENTATION_PLAN.md §5).
//
// The ledger is the "committed backlog" side of CapacityRiskPct:
//   accept  → committedUnits += dispatch units (booked into the dispatch's ETA month)
//   deliver → committedUnits −= units, completedUnits += units
//   cancel/withdraw from a committed state → committedUnits −= units
// Declines from PENDING_ACCEPT never touch the ledger (nothing was committed).
//
// All writers take the caller's transaction client so ledger rows move
// atomically with the FSM transition. Failures inside the tx propagate (the
// ledger must never silently drift from dispatch state).
//
// Pure helpers (monthKey/dispatchUnits/isCommittedStatus) are exported for the
// vitest suite; they never touch prisma.

import { Prisma, prisma } from '@ilaunchify/db'

type Tx = Prisma.TransactionClient

// ── pure helpers ─────────────────────────────────────────────────────────────

/** UTC "YYYY-MM" bucket. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Production units a dispatch books: packs × units-per-pack (1 for unit items). */
export function dispatchUnits(item: { quantity: number; packUnitsPerPack: number | null } | null | undefined): number {
  if (!item || item.quantity <= 0) return 0
  return item.quantity * Math.max(1, item.packUnitsPerPack ?? 1)
}

/** Statuses in which the dispatch's units are counted as committed backlog. */
const COMMITTED_STATUSES = new Set([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'FAILED_QC',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
])
export function isCommittedStatus(status: string): boolean {
  return COMMITTED_STATUSES.has(status)
}

/** The month a dispatch's units land in: ETA first, then accept deadline. */
export function dispatchLedgerMonth(d: {
  currentEtaAt: Date | null
  proposedDeadlineAt: Date | null
  acceptDeadlineAt: Date
}): string {
  return monthKey(d.currentEtaAt ?? d.proposedDeadlineAt ?? d.acceptDeadlineAt)
}

// ── prisma writers (call inside the FSM transaction) ─────────────────────────

interface LedgerDispatch {
  id: string
  partnerServiceId: string
  currentEtaAt: Date | null
  proposedDeadlineAt: Date | null
  acceptDeadlineAt: Date
  orderItem: { quantity: number; packUnitsPerPack: number | null } | null
}

async function declaredUnitsFor(tx: Tx, partnerServiceId: string): Promise<number> {
  const svc = await tx.partnerService.findUnique({
    where: { id: partnerServiceId },
    select: { partnerId: true },
  })
  if (!svc) return 0
  const cap = await tx.partnerOperationalCapability.findUnique({
    where: { partnerId: svc.partnerId },
    select: { monthlyCapacityUnits: true },
  })
  return cap?.monthlyCapacityUnits ?? 0
}

async function upsertLedgerRow(tx: Tx, partnerServiceId: string, month: string) {
  const existing = await tx.partnerCapacityLedger.findUnique({
    where: { partnerServiceId_month: { partnerServiceId, month } },
  })
  if (existing) return existing
  const declaredUnits = await declaredUnitsFor(tx, partnerServiceId)
  return tx.partnerCapacityLedger.create({
    data: { partnerServiceId, month, declaredUnits, committedUnits: 0, completedUnits: 0 },
  })
}

/** accept: book the dispatch's units as committed backlog for its ETA month. */
export async function bookDispatchCommitted(tx: Tx, dispatch: LedgerDispatch): Promise<void> {
  const units = dispatchUnits(dispatch.orderItem)
  if (units <= 0) return
  const month = dispatchLedgerMonth(dispatch)
  const row = await upsertLedgerRow(tx, dispatch.partnerServiceId, month)
  await tx.partnerCapacityLedger.update({
    where: { id: row.id },
    data: { committedUnits: { increment: units } },
  })
}

/** cancel/withdraw from a committed state: release the backlog. */
export async function releaseDispatchCommitted(tx: Tx, dispatch: LedgerDispatch, priorStatus: string): Promise<void> {
  if (!isCommittedStatus(priorStatus)) return
  const units = dispatchUnits(dispatch.orderItem)
  if (units <= 0) return
  const month = dispatchLedgerMonth(dispatch)
  const row = await upsertLedgerRow(tx, dispatch.partnerServiceId, month)
  await tx.partnerCapacityLedger.update({
    where: { id: row.id },
    data: { committedUnits: Math.max(0, row.committedUnits - units) },
  })
}

/** deliver: committed → completed (demonstrated-capacity raw material). */
export async function completeDispatchUnits(tx: Tx, dispatch: LedgerDispatch, priorStatus: string): Promise<void> {
  const units = dispatchUnits(dispatch.orderItem)
  if (units <= 0) return
  const month = dispatchLedgerMonth(dispatch)
  const row = await upsertLedgerRow(tx, dispatch.partnerServiceId, month)
  await tx.partnerCapacityLedger.update({
    where: { id: row.id },
    data: {
      committedUnits: isCommittedStatus(priorStatus) ? Math.max(0, row.committedUnits - units) : row.committedUnits,
      completedUnits: { increment: units },
    },
  })
}

/** Read helper for checkout: current + future month inputs for a partner service. */
export async function loadCapacityMonths(
  partnerServiceId: string,
  months: string[],
): Promise<Map<string, { declaredUnits: number; demonstratedUnits: number | null; committedUnits: number }>> {
  const rows = await prisma.partnerCapacityLedger.findMany({
    where: { partnerServiceId, month: { in: months } },
  })
  const declaredFallback = await declaredUnitsFor(prisma as unknown as Tx, partnerServiceId)
  const map = new Map<string, { declaredUnits: number; demonstratedUnits: number | null; committedUnits: number }>()
  for (const m of months) {
    const row = rows.find((r) => r.month === m)
    map.set(m, {
      declaredUnits: row?.declaredUnits ?? declaredFallback,
      demonstratedUnits: row?.demonstratedUnits ?? null,
      committedUnits: row?.committedUnits ?? 0,
    })
  }
  return map
}
