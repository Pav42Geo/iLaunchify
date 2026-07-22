// On-demand full-service gate (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md).
//
// DECIDED (Pavel 2026-07-20): an ON_DEMAND channel order (meaning A2 of
// docs/ON_DEMAND_DISAMBIGUATION_2026-07-16.md) is executed by ONE partner, the
// pinned manufacturer, who covers the whole process in-house: manufacturing,
// printing/decoration, packing, and parcel shipping. It never routes to the
// print rotation, never spawns an external LABEL_PRINTING dispatch, and never
// involves a co-pack leg.
//
// This file is the SSOT predicate. Callers (the four fail-closed gates):
//   1. requestOnDemandEnablement (creator publish actions): pre-flight.
//   2. decideOnDemandEnablement (partner on-demand queue): re-check before ENABLED.
//   3. pushListing ON_DEMAND branch (creator publish actions): go-live gate.
//   4. Ingest readiness + the future C2.2 router (assert single-partner plan).
//
// Mirrors findRouting's print-leg resolution STATICALLY (routing.ts:266-461):
// nomination > creator pin > selection-bound offering > die-cut fallback >
// owner self-label. Anything that would resolve the label leg (or a co-pack
// leg) to a partner other than the pinned manufacturer makes the product
// ineligible. Fail-closed and dynamic-pool-safe: a die-cut with no owner press
// is ineligible even if no rival printer qualifies TODAY, because one may at
// order time.
//
// NOTE the one sanctioned crossing of meaning B into A2: `canShipParcel` on the
// manufacturer's MANUFACTURING service. Made-to-order means each consumer order
// ends in a parcel the manufacturer ships, so freight-only manufacturers are
// ineligible. Do not read `PartnerService.onDemandEnabled` here: that field is
// the ship-from-stock (pick/pack) offer, a different business.
//
// Never call findRouting speculatively for this check: rotation writes
// PrintAwardLog (no side-effect-free dry run). The pure core below is the
// prediction; the router-time assertion (gate 4) verifies the real plan.

import { prisma, getActiveNominatedServiceId } from '@ilaunchify/db'
import { effectivePrintSourcing, type LabelingModeValue } from './print-sourcing'
import { resolveOrderCoPackerServiceId } from './copack-order-pricing'

export type OnDemandIneligibleReason =
  | 'NO_PINNED_MANUFACTURER'
  | 'EXTERNAL_PRINT_REQUIRED'
  | 'EXTERNAL_PRINT_PIN'
  | 'EXTERNAL_PRINT_OFFERING'
  | 'ACTIVE_PRINT_NOMINATION'
  | 'DIE_CUT_WITHOUT_OWN_PRESS'
  | 'COPACK_LEG_PRESENT'
  | 'MANUFACTURER_CANNOT_SHIP_PARCEL'

export type OnDemandEligibility =
  | { eligible: true; manufacturerServiceId: string }
  | { eligible: false; reasons: OnDemandIneligibleReason[] }

/** Creator-facing copy per reason (one copy, every surface reads this map). */
export const ON_DEMAND_INELIGIBLE_COPY: Record<OnDemandIneligibleReason, string> = {
  NO_PINNED_MANUFACTURER: 'This product has no pinned manufacturer yet.',
  EXTERNAL_PRINT_REQUIRED:
    'The manufacturer requires an outside printer for this product; on-demand products must be printed in-house.',
  EXTERNAL_PRINT_PIN: 'You have pinned an outside print provider; unpin it to sell on-demand.',
  EXTERNAL_PRINT_OFFERING: 'This product’s decoration is configured with an outside print provider.',
  ACTIVE_PRINT_NOMINATION: 'The manufacturer currently directs printing to a partner press.',
  DIE_CUT_WITHOUT_OWN_PRESS:
    'This product’s die-cut needs a separate printer that the manufacturer does not operate.',
  COPACK_LEG_PRESENT: 'This product’s packaging runs through a co-packer.',
  MANUFACTURER_CANNOT_SHIP_PARCEL:
    'The manufacturer ships freight only; on-demand needs per-order parcel shipping.',
}

export function describeOnDemandIneligibility(reasons: readonly OnDemandIneligibleReason[]): string {
  return reasons.map((r) => ON_DEMAND_INELIGIBLE_COPY[r]).join(' ')
}

// ─── Pure core (network-free, unit-tested) ───────────────────────────────────

export interface OnDemandEligibilitySnapshot {
  /** ProductTemplate.manufacturerServiceId; null = no pinned manufacturer. */
  manufacturerServiceId: string | null
  /** The pinned MANUFACTURING service, if it resolved. */
  manufacturerService: {
    partnerId: string
    labelingMode: LabelingModeValue
    canShipParcel: boolean
  } | null
  /** Product.printSourcingMode (per-product override of labelingMode). */
  productPrintSourcingMode: LabelingModeValue | null
  /** The creator's ProductPrintSelection partner (owner of the pinned press), if any. */
  pinnedPrintPartnerId: string | null
  /** Partner ids owning any selection-bound LABEL_PRINTING offering on the product. */
  offeringPrintPartnerIds: string[]
  /** getActiveNominatedServiceId(mfrPartnerId, 'LABEL_PRINTING') result. */
  nominatedPrintServiceId: string | null
  /** Template.dieCutTemplateId (legacy print-leg fallback trigger). */
  dieCutTemplateId: string | null
  /** Whether the manufacturer's PARTNER runs its own ACTIVE press for that die-cut. */
  ownerHasDieCutPress: boolean
  /** resolveOrderCoPackerServiceId(template) result. */
  coPackerServiceId: string | null
}

export function evaluateOnDemandEligibility(snap: OnDemandEligibilitySnapshot): OnDemandEligibility {
  if (!snap.manufacturerServiceId || !snap.manufacturerService) {
    // A stale pin (service id set but service gone/inactive) reads the same as no
    // pin: nothing downstream can execute, so one reason covers both.
    return { eligible: false, reasons: ['NO_PINNED_MANUFACTURER'] }
  }
  const mfr = snap.manufacturerService
  const reasons: OnDemandIneligibleReason[] = []

  // Print sourcing: EXTERNAL_REQUIRED forbids the owner self-label fallback
  // entirely (print-sourcing.ts), so the order could never stay single-partner.
  // EXTERNAL_ALLOWED is fine BY ITSELF (routing self-labels when nothing external
  // is selected); the concrete external artifacts below are what disqualify.
  const sourcing = effectivePrintSourcing({ printSourcingMode: snap.productPrintSourcingMode }, mfr)
  if (sourcing === 'EXTERNAL_REQUIRED') reasons.push('EXTERNAL_PRINT_REQUIRED')

  // Creator's pinned print provider, when it belongs to a DIFFERENT partner than
  // the manufacturer (the owner's own press is a single-partner bind, allowed).
  if (snap.pinnedPrintPartnerId && snap.pinnedPrintPartnerId !== mfr.partnerId) {
    reasons.push('EXTERNAL_PRINT_PIN')
  }

  // Selection-bound LABEL_PRINTING offering owned by another partner.
  if (snap.offeringPrintPartnerIds.some((pid) => pid !== mfr.partnerId)) {
    reasons.push('EXTERNAL_PRINT_OFFERING')
  }

  // An ACTIVE nomination always points off-partner (a nomination cannot exist
  // for a leg the manufacturer services itself, routing.ts:267-275).
  if (snap.nominatedPrintServiceId) reasons.push('ACTIVE_PRINT_NOMINATION')

  // Legacy die-cut fallback: without the owner's own qualifying press, routing
  // may shop the rotation pool at order time. Fail closed on the possibility.
  if (snap.dieCutTemplateId && !snap.ownerHasDieCutPress) {
    reasons.push('DIE_CUT_WITHOUT_OWN_PRESS')
  }

  // A pinned co-packer means a second dispatch by construction.
  if (snap.coPackerServiceId) reasons.push('COPACK_LEG_PRESENT')

  // Meaning-B crossing (see header): parcel capability is required.
  if (!mfr.canShipParcel) reasons.push('MANUFACTURER_CANNOT_SHIP_PARCEL')

  return reasons.length === 0
    ? { eligible: true, manufacturerServiceId: snap.manufacturerServiceId }
    : { eligible: false, reasons }
}

// ─── Prisma loader ───────────────────────────────────────────────────────────

/**
 * Load + evaluate for one (product, creator). `creatorUserId` scopes the pinned
 * print pick (ProductPrintSelection is per creator × template); pass the
 * enablement row's creatorUserId when checking on behalf of a partner decision.
 */
export async function loadOnDemandEligibility(
  productId: string,
  creatorUserId: string,
): Promise<OnDemandEligibility> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      printSourcingMode: true,
      productTemplateId: true,
      productTemplate: { select: { manufacturerServiceId: true } },
      template: { select: { dieCutTemplateId: true } },
      packagingComponents: {
        where: { partnerOfferingId: { not: null } },
        select: {
          partnerOffering: {
            select: { partnerService: { select: { type: true, partnerId: true, status: true } } },
          },
        },
      },
    },
  })
  if (!product) return { eligible: false, reasons: ['NO_PINNED_MANUFACTURER'] }

  const manufacturerServiceId = product.productTemplate?.manufacturerServiceId ?? null
  const mfrService = manufacturerServiceId
    ? await prisma.partnerService.findFirst({
        where: { id: manufacturerServiceId, type: 'MANUFACTURING', status: 'ACTIVE' },
        select: { partnerId: true, labelingMode: true, canShipParcel: true },
      })
    : null

  // Short-circuit: without a live pinned manufacturer nothing else is meaningful.
  if (!manufacturerServiceId || !mfrService) {
    return { eligible: false, reasons: ['NO_PINNED_MANUFACTURER'] }
  }

  const [pinnedPick, nominatedPrintServiceId, coPackerServiceId] = await Promise.all([
    product.productTemplateId
      ? prisma.productPrintSelection.findUnique({
          where: {
            creatorUserId_productTemplateId: {
              creatorUserId,
              productTemplateId: product.productTemplateId,
            },
          },
          select: { partnerServiceId: true },
        })
      : Promise.resolve(null),
    getActiveNominatedServiceId(mfrService.partnerId, 'LABEL_PRINTING'),
    product.productTemplateId
      ? resolveOrderCoPackerServiceId(product.productTemplateId)
      : Promise.resolve(null),
  ])

  // ProductPrintSelection is a soft FK: resolve the pinned service's OWNER so the
  // owner's-own-press case (same partner as the manufacturer) stays eligible.
  const pinnedPrintPartnerId = pinnedPick?.partnerServiceId
    ? ((
        await prisma.partnerService.findUnique({
          where: { id: pinnedPick.partnerServiceId },
          select: { partnerId: true },
        })
      )?.partnerId ?? null)
    : null

  const dieCutTemplateId = product.template?.dieCutTemplateId ?? null
  const ownerHasDieCutPress = dieCutTemplateId
    ? (await prisma.partnerService.count({
        where: {
          type: 'LABEL_PRINTING',
          status: 'ACTIVE',
          partnerId: mfrService.partnerId,
          dieCutSupport: { some: { dieCutTemplateId } },
        },
      })) > 0
    : false

  return evaluateOnDemandEligibility({
    manufacturerServiceId,
    manufacturerService: mfrService,
    productPrintSourcingMode: product.printSourcingMode ?? null,
    pinnedPrintPartnerId,
    offeringPrintPartnerIds: product.packagingComponents
      .map((c) => c.partnerOffering?.partnerService)
      .filter(
        (svc): svc is NonNullable<typeof svc> => !!svc && svc.type === 'LABEL_PRINTING' && svc.status === 'ACTIVE',
      )
      .map((svc) => svc.partnerId),
    nominatedPrintServiceId,
    dieCutTemplateId,
    ownerHasDieCutPress,
    coPackerServiceId,
  })
}
