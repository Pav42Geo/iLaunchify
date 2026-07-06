// Print Capability RFQ — create + broadcast (docs/PRINT_PROVIDER_SELECTION.md
// §10.2, PS-8b). When a template's print coverage is 0, this generates ONE open
// PrintCapabilityRequest per uncovered requirement tuple and broadcasts it to a
// SMART SHORTLIST of onboarded printers (rankCapabilityShortlist, PS-8a). Zero
// admin: detection → shortlist → broadcast → re-broadcast are all automatic; the
// only manual touches downstream are offering verification and expiry escalation.
//
// Idempotent by construction: `notifiedServiceIds` is a broadcast ledger, so a
// re-run (weekly re-broadcast, or a second publish attempt) notifies only the
// NEXT band of un-notified printers — never re-emails the same shop.
//
// Layering: prisma writes here; the notification SEND uses a dynamic import of
// @ilaunchify/notifications (same pattern as routing.ts / reprint-dispatch.ts —
// keeps the heavy dep off the module's static graph and avoids any cycle).

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import {
  computeTemplatePrintCoverage,
  buildCapabilityTuples,
  loadCapabilityShortlist,
} from './print-coverage'

/** §10.2 default shortlist depth per broadcast (admin-tunable later). */
export const RFQ_SHORTLIST_SIZE = 10
/** Open window before an unclaimed request escalates to ops (§10.2). */
export const RFQ_EXPIRY_DAYS = 14
/** Partner-app landing for a claim — the capability inbox (PS-8c). */
const PARTNER_CLAIM_PATH = '/capability-requests'

export type RfqBroadcastReason = 'PUBLISH_GATE' | 'COVERAGE_DROP' | 'REBROADCAST'

export interface CapabilityBroadcastResult {
  /** False when sourcing is IN_HOUSE / template missing — RFQ doesn't apply. */
  applicable: boolean
  coverage: number
  /** OPEN requests after this run (created or already open). */
  requestsOpen: number
  /** New printer notifications sent this run (excludes already-notified). */
  notified: number
  requestIds: string[]
  /** True when coverage was ≥1 so any lingering OPEN requests were closed. */
  fulfilled: boolean
}

/**
 * Ensure capability requests exist for a template's uncovered tuples and
 * broadcast each to the next un-notified band. Safe to call repeatedly:
 * - coverage ≥ 1 → close any lingering OPEN/CLAIMED requests (FULFILLED) and stop.
 * - coverage = 0 → upsert an OPEN request per packaging type, notify the next
 *   `limit` shortlisted printers, extend the broadcast ledger.
 * Never throws — fails soft to `{ applicable:false }` (callers gate on results,
 * not exceptions; a notification hiccup must never abort a publish/cron).
 */
export async function broadcastCapabilityRequestsForTemplate(
  templateId: string,
  opts: { limit?: number; reason?: RfqBroadcastReason } = {},
): Promise<CapabilityBroadcastResult> {
  const limit = opts.limit ?? RFQ_SHORTLIST_SIZE
  const reason = opts.reason ?? 'PUBLISH_GATE'
  const EMPTY: CapabilityBroadcastResult = {
    applicable: false,
    coverage: 0,
    requestsOpen: 0,
    notified: 0,
    requestIds: [],
    fulfilled: false,
  }

  try {
    const coverage = await computeTemplatePrintCoverage(templateId)
    if (!coverage.applicable) return EMPTY

    // Coverage restored (or never lost) → close lingering requests + unpark.
    if (coverage.coverage > 0) {
      const closed = await prisma.printCapabilityRequest.updateMany({
        where: { productTemplateId: templateId, status: { in: ['OPEN', 'CLAIMED'] } },
        data: { status: 'FULFILLED' },
      })
      if (closed.count > 0) {
        await logSystemAudit({
          entityType: 'PrintCapabilityRequest',
          entityId: templateId,
          action: 'CAPABILITY_REQUEST_FULFILLED',
          payload: { templateId, closed: closed.count, reason },
        })
      }
      return { ...EMPTY, applicable: true, coverage: coverage.coverage, fulfilled: closed.count > 0 }
    }

    // Uncovered → one request per required packaging type.
    const tuples = buildCapabilityTuples(coverage)
    const expiresAt = new Date(Date.now() + RFQ_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Human packaging labels for the broadcast copy (partial disclosure — spec
    // only, never designs/brand/manufacturer identity).
    const typeLabels = new Map<string, string>()
    if (tuples.length) {
      const types = await prisma.packagingType.findMany({
        where: { id: { in: tuples.map((t) => t.packagingTypeId) } },
        select: { id: true, displayName: true },
      })
      for (const t of types) typeLabels.set(t.id, t.displayName)
    }

    const { dispatchToPartnerService } = await import('@ilaunchify/notifications')

    const requestIds: string[] = []
    let notified = 0

    for (const tuple of tuples) {
      // Upsert the OPEN request (unique templateId+packagingTypeId). A prior
      // FULFILLED/EXPIRED row for the same tuple reopens (coverage dropped again).
      const request = await prisma.printCapabilityRequest.upsert({
        where: {
          productTemplateId_packagingTypeId: {
            productTemplateId: templateId,
            packagingTypeId: tuple.packagingTypeId,
          },
        },
        create: {
          productTemplateId: templateId,
          packagingTypeId: tuple.packagingTypeId,
          decorationMethod: null,
          manufacturerRegion: tuple.manufacturerRegion ?? null,
          runBandMin: 1,
          status: 'OPEN',
          notifiedServiceIds: [],
          expiresAt,
        },
        update: { status: 'OPEN', expiresAt },
        select: { id: true, notifiedServiceIds: true, runBandMin: true, runBandMax: true },
      })
      requestIds.push(request.id)

      // Next band: rank the pool, excluding anyone already notified for THIS
      // request. Take up to `limit` new printers.
      const shortlist = await loadCapabilityShortlist(tuple, {
        limit,
        excludeServiceIds: request.notifiedServiceIds,
      })
      if (shortlist.length === 0) continue

      const packagingLabel = typeLabels.get(tuple.packagingTypeId) ?? 'a packaging format'
      const runBand = request.runBandMax
        ? `${request.runBandMin}–${request.runBandMax}`
        : `${request.runBandMin}+`

      const newlyNotified: string[] = []
      for (const s of shortlist) {
        const count = await dispatchToPartnerService(s.serviceId, {
          event: 'PARTNER_CAPABILITY_RFQ',
          audience: 'partner',
          data: {
            packagingLabel,
            runBand,
            region: tuple.manufacturerRegion ?? undefined,
            href: PARTNER_CLAIM_PATH,
          },
        }).catch(() => 0)
        // Ledger the service whether or not it had a live recipient — we don't
        // re-target it next band regardless (avoids nagging an unstaffed shop).
        newlyNotified.push(s.serviceId)
        if (count > 0) notified += 1
      }

      if (newlyNotified.length) {
        await prisma.printCapabilityRequest.update({
          where: { id: request.id },
          data: { notifiedServiceIds: { push: newlyNotified } },
        })
      }
    }

    await logSystemAudit({
      entityType: 'PrintCapabilityRequest',
      entityId: templateId,
      action: 'CAPABILITY_REQUEST_BROADCAST',
      payload: { templateId, reason, requests: requestIds.length, notified },
    })

    return {
      applicable: true,
      coverage: 0,
      requestsOpen: requestIds.length,
      notified,
      requestIds,
      fulfilled: false,
    }
  } catch {
    return EMPTY
  }
}

// ─── Coverage restored — unpark + notify (PS-8 follow-up) ────────────────────

export interface CoverageRecoveryResult {
  /** Coverage is now ≥1 for the template (requests closed FULFILLED). */
  recovered: boolean
  /** A PAUSED-for-coverage template was re-listed PUBLISHED (and notified). */
  unparked: boolean
}

/** Notify the manufacturer + any creators mid-design that a paused-for-coverage
 *  template is orderable again (§10.1). One event, role-branched copy. Fail-soft. */
async function notifyCoverageRestored(templateId: string): Promise<void> {
  try {
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: templateId },
      select: { name: true, manufacturerServiceId: true },
    })
    if (!tpl) return

    const { dispatchNotification, dispatchToPartnerService } = await import('@ilaunchify/notifications')

    if (tpl.manufacturerServiceId) {
      await dispatchToPartnerService(tpl.manufacturerServiceId, {
        event: 'COVERAGE_RESTORED',
        audience: 'partner',
        data: { productName: tpl.name, role: 'manufacturer', href: '/products' },
      }).catch(() => 0)
    }

    // Waiting creators — anyone with an in-flight (not-yet-ordered) product on it.
    const products = await prisma.product.findMany({
      where: {
        productTemplateId: templateId,
        status: { in: ['DRAFT', 'IN_REVIEW', 'COMPLIANT'] },
      },
      select: { brand: { select: { creatorProfile: { select: { userId: true } } } } },
    })
    const userIds = [...new Set(products.map((p) => p.brand.creatorProfile.userId))]
    for (const userId of userIds) {
      await dispatchNotification({
        userId,
        event: 'COVERAGE_RESTORED',
        audience: 'creator',
        data: { productName: tpl.name, role: 'creator', href: '/products' },
      }).catch(() => {})
    }
  } catch {
    /* notification hiccup never blocks recovery */
  }
}

/**
 * Recompute a template's coverage and, if it's back, close its requests and
 * re-list it if it was PAUSED for coverage (notifying manufacturer + creators).
 * The SINGLE unpark path — reached from a claim's offering activating (below) AND
 * the nightly cron recovery sweep, so coverage restored by ANY printer (not only
 * a claimer) re-lists the product. Never throws.
 */
export async function recoverTemplateCoverage(templateId: string): Promise<CoverageRecoveryResult> {
  try {
    // coverage ≥1 closes OPEN/CLAIMED requests FULFILLED via the broadcast's ≥1 path.
    const cov = await broadcastCapabilityRequestsForTemplate(templateId, { reason: 'REBROADCAST' })
    if (!cov.applicable || cov.coverage === 0) return { recovered: false, unparked: false }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: templateId },
      select: { status: true, name: true },
    })
    if (tpl?.status !== 'PAUSED') return { recovered: true, unparked: false }

    await prisma.productTemplate.update({
      where: { id: templateId },
      data: { status: 'PUBLISHED' },
    })
    await logSystemAudit({
      entityType: 'ProductTemplate',
      entityId: templateId,
      action: 'PRODUCT_TEMPLATE_UNPARKED_COVERAGE_RESTORED',
      fromValue: 'PAUSED',
      toValue: 'PUBLISHED',
      payload: { name: tpl.name },
    })
    await notifyCoverageRestored(templateId)
    return { recovered: true, unparked: true }
  } catch {
    return { recovered: false, unparked: false }
  }
}

export interface ClaimResolutionResult {
  /** True when the activated offering belonged to a capability claim. */
  wasClaim: boolean
  /** True when coverage is now ≥1 (request FULFILLED, template unparked). */
  coverageRestored: boolean
  /** True when a PAUSED-for-coverage template was re-listed (PUBLISHED). */
  unparked: boolean
}

/**
 * Called when a PartnerPackagingOffering reaches ACTIVE (PS-8c). If that offering
 * fulfils a capability claim, close the loop: claim VERIFIED → coverage recomputes
 * (request FULFILLED via the ≥1 path) → a template PAUSED for coverage is re-listed.
 * No-op for ordinary offerings. Never throws — a notification/coverage hiccup must
 * never fail the partner's "activate offering" action.
 *
 * Unpark caveat (V1): we re-list any PAUSED template whose coverage returns through
 * this claim path. A template an admin paused for an UNRELATED reason and that also
 * had an open request could be re-listed early — acceptable at V1 volume; a
 * distinct "paused reason" flag would remove the ambiguity later.
 */
export async function resolveCapabilityClaimOnOfferingActivated(
  offeringId: string,
): Promise<ClaimResolutionResult> {
  const NONE: ClaimResolutionResult = { wasClaim: false, coverageRestored: false, unparked: false }
  try {
    const claim = await prisma.printCapabilityClaim.findFirst({
      where: { offeringId },
      select: { id: true, requestId: true, status: true },
    })
    if (!claim) return NONE

    const request = await prisma.printCapabilityRequest.findUnique({
      where: { id: claim.requestId },
      select: { productTemplateId: true },
    })
    if (!request) return NONE

    if (claim.status !== 'VERIFIED') {
      await prisma.printCapabilityClaim.update({
        where: { id: claim.id },
        data: { status: 'VERIFIED' },
      })
    }

    // Recompute coverage + unpark/notify through the SINGLE recovery path.
    const recovery = await recoverTemplateCoverage(request.productTemplateId)

    await logSystemAudit({
      entityType: 'PrintCapabilityClaim',
      entityId: claim.id,
      action: 'CAPABILITY_CLAIM_VERIFIED',
      payload: {
        offeringId,
        templateId: request.productTemplateId,
        coverageRestored: recovery.recovered,
        unparked: recovery.unparked,
      },
    })

    return { wasClaim: true, coverageRestored: recovery.recovered, unparked: recovery.unparked }
  } catch {
    return NONE
  }
}
