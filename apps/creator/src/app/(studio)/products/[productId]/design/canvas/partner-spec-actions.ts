'use server'

// C9 — resolve the bound print partner's PartnerPrintOutputSpec for the
// Studio export pre-flight engine.
//
// The export modal runs runPreflight() against the partner the product is
// actually routed to. That partner is reachable through the product's PRIMARY
// PackagingComponent → its selected PartnerPackagingOffering → the offering's
// PartnerService → that service's PartnerPrintOutputSpec.
//
// MOST products today have no PRIMARY component bound to an offering (let alone
// one with a print-output spec), so this returns null and the Studio simply
// skips pre-flight — the export gate behaves exactly as before. Pre-flight only
// engages once the marketplace has routed the product to a real printer with a
// declared output spec.
//
// Auth-scoped to the signed-in creator's brand, mirroring resolveProductPhrases
// in phrase-actions.ts.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

/**
 * Resolved partner print spec — the subset of PartnerPrintOutputSpec the
 * pre-flight engine (PreflightPartnerSpec) needs. Structurally compatible with
 * @ilaunchify/ui's PreflightPartnerSpec; defined here so the server action +
 * the client modal share one shape without the action importing client code.
 */
export interface PreflightPartnerSpecResolved {
  minDpi: number
  bleedMm: number
  colorSpace: string
  fontPolicy: 'EMBED' | 'OUTLINE_TO_PATHS' | 'EITHER'
  spotColorLibrary: string
  partnerName?: string
}

/**
 * Resolve the print-output spec of the partner producing this product's PRIMARY
 * packaging component. Returns null when there's no PRIMARY component, no bound
 * offering, or no print-output spec on that partner's service.
 */
export async function resolvePartnerPrintSpec(
  productId: string,
): Promise<PreflightPartnerSpecResolved | null> {
  const user = await requireUser()

  // Auth gate — the product must belong to the signed-in creator's brand.
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true },
  })
  if (!product) return null

  const component = await prisma.packagingComponent.findFirst({
    where: {
      productId,
      tier: 'PRIMARY',
      partnerOfferingId: { not: null },
    },
    select: {
      partnerOffering: {
        select: {
          partnerService: {
            select: {
              partner: { select: { companyName: true } },
              printOutputSpec: {
                select: {
                  minDpi: true,
                  colorSpace: true,
                  fontPolicy: true,
                  spotColorLibrary: true,
                  bleedMm: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const service = component?.partnerOffering?.partnerService
  const spec = service?.printOutputSpec
  if (!spec) return null

  return {
    minDpi: spec.minDpi,
    bleedMm: Number(spec.bleedMm),
    colorSpace: spec.colorSpace,
    fontPolicy: spec.fontPolicy,
    spotColorLibrary: spec.spotColorLibrary,
    partnerName: service?.partner?.companyName,
  }
}
