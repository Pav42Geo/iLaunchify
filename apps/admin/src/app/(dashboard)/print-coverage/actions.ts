'use server'

// Admin Print Coverage actions (docs/PRINT_PROVIDER_SELECTION.md §10.4, PS-8d).
// The admin's only two levers over the otherwise-automatic RFQ loop: push a
// request to the next printer band now (re-broadcast), and extend an expiring
// request's window. Both admin-gated + audited.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { broadcastCapabilityRequestsForTemplate, RFQ_EXPIRY_DAYS } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; message: string } | { ok: false; error: string }

/** Push a template's open request(s) to the next un-notified printer band now. */
export async function rebroadcastCoverageRequest(templateId: string): Promise<Result> {
  const admin = await requireCapability('reviews:write')
  try {
    const rfq = await broadcastCapabilityRequestsForTemplate(templateId, { reason: 'REBROADCAST' })
    await logAuditAs(admin, {
      entityType: 'PrintCapabilityRequest',
      entityId: templateId,
      action: 'CAPABILITY_REQUEST_REBROADCAST_MANUAL',
      payload: { templateId, notified: rfq.notified, requestsOpen: rfq.requestsOpen },
    })
    revalidatePath('/print-coverage')
    return {
      ok: true,
      message:
        rfq.notified > 0
          ? `Re-broadcast to ${rfq.notified} more printer${rfq.notified === 1 ? '' : 's'}.`
          : rfq.fulfilled
            ? 'Coverage is already restored — request closed.'
            : 'No further printers to notify right now.',
    }
  } catch (err) {
    return { ok: false, error: `Re-broadcast failed: ${(err as Error).message}` }
  }
}

/** Extend an expiring request's window (and reopen it if it had expired). */
export async function extendCoverageRequest(requestId: string): Promise<Result> {
  const admin = await requireCapability('reviews:write')
  try {
    const req = await prisma.printCapabilityRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    })
    if (!req) return { ok: false, error: 'Request not found.' }
    if (req.status === 'FULFILLED') return { ok: false, error: 'That request is already fulfilled.' }

    const expiresAt = new Date(Date.now() + RFQ_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await prisma.printCapabilityRequest.update({
      where: { id: requestId },
      data: { expiresAt, ...(req.status === 'EXPIRED' ? { status: 'OPEN' } : {}) },
    })
    await logAuditAs(admin, {
      entityType: 'PrintCapabilityRequest',
      entityId: requestId,
      action: 'CAPABILITY_REQUEST_EXTENDED',
      fromValue: req.status,
      toValue: req.status === 'EXPIRED' ? 'OPEN' : req.status,
      payload: { extendedDays: RFQ_EXPIRY_DAYS },
    })
    revalidatePath('/print-coverage')
    return { ok: true, message: `Extended ${RFQ_EXPIRY_DAYS} days${req.status === 'EXPIRED' ? ' and reopened' : ''}.` }
  } catch (err) {
    return { ok: false, error: `Extend failed: ${(err as Error).message}` }
  }
}
