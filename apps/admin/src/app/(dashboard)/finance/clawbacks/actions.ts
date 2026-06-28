'use server'

// Partner clawback lifecycle (docs/PAYMENTS.md — refund recoupment ledger).
//
// A PartnerClawback is created PENDING_APPROVAL by the refund executor whenever a
// refund recoups a partner's payout. In the COMMON case the funds are already
// pulled back at refund time via stripe.transfers.createReversal — so this ledger
// is the *record + decision trail*, not a parallel money path. It exists to make
// the obligation VISIBLE and to capture the admin's recoup decision for the cases
// the auto-reversal can't cover (the partner's balance was already paid out to
// their bank; the narrow transfer-vs-refund race where the transfer was sent but
// no reversal fired). V1 posture (operational-trust-first): the actual money move
// stays admin-controlled — deduct from the next payout, invoice, or waive — and is
// confirmed here as EXECUTED. No new automated money movement is introduced.
//
// Lifecycle: PENDING_APPROVAL --approve--> APPROVED --markExecuted--> EXECUTED
//                     └------------------ waive ------------------> WAIVED
// All transitions are capability-gated + audited.

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

async function loadClawback(id: string) {
  return prisma.partnerClawback.findUnique({
    where: { id },
    select: { id: true, partnerId: true, amountCents: true, status: true },
  })
}

/** PENDING_APPROVAL → APPROVED. The admin confirms the recoup obligation is valid. */
export async function approveClawback(input: { id: string }): Promise<Result> {
  const actor = await requireCapability('refunds:approve')
  const cb = await loadClawback(input.id)
  if (!cb) return { ok: false, error: 'Clawback not found.' }
  if (cb.status !== 'PENDING_APPROVAL') return { ok: false, error: `Already ${cb.status.toLowerCase().replace(/_/g, ' ')}.` }

  await prisma.partnerClawback.update({ where: { id: cb.id }, data: { status: 'APPROVED' } })
  await logAuditAs(actor, {
    entityType: 'Partner',
    entityId: cb.partnerId,
    action: 'CLAWBACK_APPROVED',
    toValue: String(cb.amountCents),
    payload: { clawbackId: cb.id },
  })
  revalidatePath('/finance/clawbacks')
  return { ok: true }
}

/** APPROVED → EXECUTED. Records that the money was actually recouped (how = note).
 *  Gated on refunds:execute — the same "moves money" capability as issuing refunds. */
export async function markClawbackExecuted(input: { id: string; note?: string }): Promise<Result> {
  const actor = await requireCapability('refunds:execute')
  const cb = await loadClawback(input.id)
  if (!cb) return { ok: false, error: 'Clawback not found.' }
  if (cb.status !== 'APPROVED') return { ok: false, error: 'Approve the clawback before marking it executed.' }

  await prisma.partnerClawback.update({
    where: { id: cb.id },
    data: { status: 'EXECUTED', resolvedAt: new Date() },
  })
  await logAuditAs(actor, {
    entityType: 'Partner',
    entityId: cb.partnerId,
    action: 'CLAWBACK_EXECUTED',
    toValue: String(cb.amountCents),
    payload: { clawbackId: cb.id, note: input.note?.trim() || null },
  })
  revalidatePath('/finance/clawbacks')
  return { ok: true }
}

/** PENDING_APPROVAL | APPROVED → WAIVED. The platform forgives the debt (goodwill,
 *  or the reversal already covered it and no further recoup is owed). */
export async function waiveClawback(input: { id: string; note?: string }): Promise<Result> {
  const actor = await requireCapability('refunds:approve')
  const cb = await loadClawback(input.id)
  if (!cb) return { ok: false, error: 'Clawback not found.' }
  if (cb.status === 'EXECUTED' || cb.status === 'WAIVED') {
    return { ok: false, error: `Already ${cb.status.toLowerCase()}.` }
  }

  await prisma.partnerClawback.update({
    where: { id: cb.id },
    data: { status: 'WAIVED', resolvedAt: new Date() },
  })
  await logAuditAs(actor, {
    entityType: 'Partner',
    entityId: cb.partnerId,
    action: 'CLAWBACK_WAIVED',
    toValue: String(cb.amountCents),
    payload: { clawbackId: cb.id, note: input.note?.trim() || null },
  })
  revalidatePath('/finance/clawbacks')
  return { ok: true }
}
