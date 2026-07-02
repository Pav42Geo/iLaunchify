// L1.2b — shared FC-ranking recompute for the admin order-detail logistics
// panels (docs/LOGISTICS_AND_FULFILLMENT.md §5 + §9 admin + L8 override rights).
// Server-only module (NOT a 'use server' file): imported by both the page (to
// annotate the override <select> with live eligible/ineligible) and the
// override server action (to re-validate the pick — never trust the client).
//
// Candidate + origin construction mirrors the creator checkout resolveShipTo
// (apps/creator .../checkout/cart-actions.ts): candidates = ACTIVE WAREHOUSE
// PartnerService rows with the typed L0 capability fields; origin = the
// owner-pinned manufacturer facility from the order's ProductTemplate;
// pallets = 0 (unknown pre-manifest → capacity filter skipped).

import 'server-only'
import { prisma } from '@ilaunchify/db'
import {
  rankFulfillmentCenters,
  type FcCandidate,
  type FcRanked,
  type FcSelectionInput,
} from '@ilaunchify/orders'

export interface FcRankingContext {
  /** ALL ACTIVE WAREHOUSE services, annotated eligible/ineligible, nearest-first. */
  ranked: FcRanked[]
  /** The selector input used (surfaced on the panel for admin explainability). */
  input: FcSelectionInput
  /** False when the order has no template binding — ranking fell back to defaults. */
  hasTemplate: boolean
}

export async function rankWarehousesForOrder(orderId: string): Promise<FcRankingContext> {
  // The order's product template drives the hard-eligibility inputs. V1 orders
  // are single-product; the first line item's template is authoritative.
  const item = await prisma.orderItem.findFirst({
    where: { orderId },
    orderBy: { id: 'asc' },
    select: {
      product: {
        select: {
          productTemplate: {
            select: {
              storageClass: true,
              hazmatClass: true,
              labelingType: true,
              manufacturerServiceId: true,
            },
          },
        },
      },
    },
  })
  const template = item?.product.productTemplate ?? null

  const [origin, warehouses] = await Promise.all([
    template?.manufacturerServiceId
      ? prisma.partnerService.findUnique({
          where: { id: template.manufacturerServiceId },
          select: {
            facilityLat: true,
            facilityLng: true,
            partner: { select: { state: true } },
          },
        })
      : Promise.resolve(null),
    prisma.partnerService.findMany({
      where: { type: 'WAREHOUSE', status: 'ACTIVE' },
      select: {
        id: true,
        storageClasses: true,
        hazmatAccepted: true,
        fcCertifications: true,
        weeklyPalletCapacity: true,
        facilityLat: true,
        facilityLng: true,
        partner: { select: { companyName: true, city: true, state: true } },
      },
    }),
  ])

  const candidates: FcCandidate[] = warehouses.map((w) => ({
    partnerServiceId: w.id,
    partnerName: w.partner.companyName,
    city: w.partner.city,
    state: w.partner.state,
    storageClasses: w.storageClasses,
    hazmatAccepted: w.hazmatAccepted,
    fcCertifications: w.fcCertifications,
    weeklyPalletCapacity: w.weeklyPalletCapacity,
    facilityLat: w.facilityLat,
    facilityLng: w.facilityLng,
  }))

  const input: FcSelectionInput = {
    storageClass: template?.storageClass ?? 'AMBIENT',
    hazmatClass: template?.hazmatClass ?? 'NONE',
    domain: template?.labelingType ?? 'FOOD',
    pallets: 0, // pallet count unknown pre-manifest — skip the capacity filter
    originLat: origin?.facilityLat ?? null,
    originLng: origin?.facilityLng ?? null,
    originState: origin?.partner.state ?? null,
  }

  return {
    ranked: rankFulfillmentCenters(candidates, input),
    input,
    hasTemplate: template !== null,
  }
}
