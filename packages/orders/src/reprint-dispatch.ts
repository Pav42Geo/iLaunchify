// Reprint-dispatch resolution action (docs/PARTNER_ROLE_ACCOUNTS.md §3.3.C).
//
// When an admin resolves a creator's OrderDispute on a LABEL dispatch with the
// "reprint" outcome, we spin up a FRESH LABEL OrderDispatch on the SAME order —
// same printer, same manifest version, same artwork bundle — so the print
// partner reprints the exact spec. Cost defaults to 0 (goodwill reprint) or an
// admin-entered amount. The new dispatch re-enters the normal PENDING_ACCEPT
// flow, so the printer accepts + produces it like any other job.
//
// This helper owns dispatch creation + the printer ping only. The caller (the
// admin dispute-resolution action) owns the audit linkage payload — it has the
// admin actor — and the creator-facing notification (which rides the existing
// dispute-resolved event). See apps/admin/.../dispute-actions.ts.

import { prisma } from '@ilaunchify/db'
import { DEFAULT_ACCEPT_WINDOW_HOURS } from './dispatch-fsm'

export interface CreateReprintDispatchParams {
  /** The LABEL dispatch the reprint is for (the one under dispute). */
  originalDispatchId: string
  /** Reprint cost; goodwill reprints are 0. Clamped to ≥ 0. Default 0. */
  costCents?: number
  /** Override the 24h accept window if needed. */
  acceptWindowHours?: number
}

export type CreateReprintDispatchResult =
  | {
      ok: true
      dispatchId: string
      orderId: string
      /** Printer user (notified here) + creator user (caller notifies). */
      printerUserId: string | null
      creatorUserId: string | null
      manifestVersion: number
    }
  | { ok: false; error: string }

/**
 * Create a reprint LABEL dispatch cloned from `originalDispatchId` and notify the
 * printer. Pure creation + notify — no audit, no dispute mutation (the caller
 * owns those). Returns the new dispatch id + the actors for the caller to link
 * and notify.
 */
export async function createReprintDispatch(
  params: CreateReprintDispatchParams,
): Promise<CreateReprintDispatchResult> {
  const original = await prisma.orderDispatch.findUnique({
    where: { id: params.originalDispatchId },
    select: {
      id: true,
      type: true,
      orderId: true,
      orderItemId: true,
      partnerServiceId: true,
      manifestVersion: true,
      finishManifestJson: true,
      bundleStatus: true,
      bundleAssetId: true,
      order: {
        select: {
          creatorUserId: true,
          brand: { select: { name: true } },
        },
      },
      partnerService: { select: { partner: { select: { userId: true } } } },
    },
  })

  if (!original) return { ok: false, error: 'Original dispatch not found.' }
  if (original.type !== 'LABEL') {
    return { ok: false, error: 'Reprint applies only to LABEL (print) dispatches.' }
  }

  const acceptDeadlineAt = new Date(
    Date.now() + (params.acceptWindowHours ?? DEFAULT_ACCEPT_WINDOW_HOURS) * 60 * 60 * 1000,
  )
  const costCents = Math.max(0, Math.round(params.costCents ?? 0))

  // Clone the print leg: same printer, same manifest version, same artwork
  // bundle (so it reprints the exact spec, not a re-generated one). Fresh
  // PENDING_ACCEPT lifecycle — the printer accepts it like any new dispatch.
  const created = await prisma.orderDispatch.create({
    data: {
      orderId: original.orderId,
      orderItemId: original.orderItemId,
      type: 'LABEL',
      partnerServiceId: original.partnerServiceId,
      status: 'PENDING_ACCEPT',
      acceptDeadlineAt,
      costCents,
      manifestVersion: original.manifestVersion,
      finishManifestJson: original.finishManifestJson ?? undefined,
      bundleStatus: original.bundleStatus,
      bundleAssetId: original.bundleAssetId ?? undefined,
      // First-class reprint linkage (P3 scorecards count defect rates off this).
      // The audit payload keeps carrying the same key for the historical trail.
      reprintOfDispatchId: original.id,
    },
    select: { id: true },
  })

  const printerUserId = original.partnerService.partner.userId ?? null
  const creatorUserId = original.order.creatorUserId ?? null

  // Notify the print SERVICE that a new LABEL dispatch is waiting (same event the
  // normal routing flow fires) — role-routed fan-out (org admins + service members,
  // not just the founder pointer). Lazy import + best-effort so a notification
  // failure never rolls back the reprint.
  try {
    const { dispatchToPartnerService } = await import('@ilaunchify/notifications')
    await dispatchToPartnerService(original.partnerServiceId, {
      event: 'DISPATCH_RECEIVED',
      data: { orderId: original.orderId, brandName: original.order.brand?.name, type: 'LABEL' },
      audience: 'partner',
    })
  } catch {
    // best-effort — dispatch is created; the printer also sees it in their queue.
  }

  return {
    ok: true,
    dispatchId: created.id,
    orderId: original.orderId,
    printerUserId,
    creatorUserId,
    manifestVersion: original.manifestVersion,
  }
}
