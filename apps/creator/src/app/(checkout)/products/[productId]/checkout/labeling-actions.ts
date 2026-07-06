'use server'

// PS-3c — FC "Can finalize labeling here" offers for the checkout ship-to step
// (docs/PRINT_PROVIDER_SELECTION.md §8.1a).
//
// The rule this file exists to enforce: labels NEVER route to an FC because
// it's the destination. An FC becomes a labeling option ONLY when (a) this
// order actually needs application downstream of the manufacturer (applied
// decoration + external print + manufacturer doesn't apply), AND (b) the FC
// declared a RELABEL value-added service covering THIS decoration method,
// AND (c) an admin verified it (status ACTIVE). Everything else defaults to
// manufacturer-finalizes. Display data only — placeOrder re-derives the same
// eligibility server-side before charging the fee.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { effectivePrintSourcing, APPLIED_DECORATIONS } from '@ilaunchify/orders'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FcLabelingOffer {
  partnerServiceId: string // WAREHOUSE PartnerService.id
  feeCentsPerUnit: number
  minUnits: number
  leadTimeDays: number
}

export interface FcLabelingContext {
  /** True only when application must happen downstream of the manufacturer —
   *  the precondition for any FC labeling offer to render at all. */
  needsExternalApplication: boolean
  /** The applied decoration method driving the requirement (null when none). */
  decorationMethod: string | null
  /** Verified RELABEL offers, keyed by warehouse service — empty unless
   *  needsExternalApplication. */
  offers: FcLabelingOffer[]
}

const NONE: FcLabelingContext = {
  needsExternalApplication: false,
  decorationMethod: null,
  offers: [],
}

export async function loadFcLabelingOffers(
  productId: string,
): Promise<Result<FcLabelingContext>> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'NOT_A_CREATOR' }

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      id: true,
      printSourcingMode: true,
      productTemplate: { select: { manufacturerServiceId: true } },
    },
  })
  if (!product) return { ok: false, error: 'NOT_YOUR_PRODUCT' }

  const ctx = await computeFcLabelingContext({
    productId: product.id,
    printSourcingMode: product.printSourcingMode,
    manufacturerServiceId: product.productTemplate?.manufacturerServiceId ?? null,
  })
  return { ok: true, data: ctx }
}

/**
 * Shared derivation — the checkout UI (via the action above) and placeOrder
 * (fee re-validation) both call THIS, so the badge and the charge can never
 * disagree (§2 single-source discipline, applied to §8.1a).
 */
export async function computeFcLabelingContext(args: {
  productId: string
  printSourcingMode: string | null
  manufacturerServiceId: string | null
}): Promise<FcLabelingContext> {
  if (!args.manufacturerServiceId) return NONE

  // 1 — applied decoration? (Printed-in methods ship finished from the printer/
  //     manufacturer; no application step exists to place anywhere.)
  const primaryContainer = await prisma.packagingComponent.findFirst({
    where: {
      productId: args.productId,
      tier: 'PRIMARY',
      role: 'CONTAINER',
      partnerOfferingId: { not: null },
    },
    select: { decorationMethod: true },
  })
  const decorationMethod = primaryContainer?.decorationMethod ?? null
  if (!decorationMethod || !APPLIED_DECORATIONS.has(decorationMethod)) return NONE

  // 2 — external print + manufacturer can't apply?
  const manufacturer = await prisma.partnerService.findUnique({
    where: { id: args.manufacturerServiceId },
    select: { labelingMode: true, appliesLabels: true },
  })
  if (!manufacturer) return NONE
  const mode = effectivePrintSourcing(
    { printSourcingMode: args.printSourcingMode as 'IN_HOUSE' | 'EXTERNAL_ALLOWED' | 'EXTERNAL_REQUIRED' | null },
    manufacturer,
  )
  // IN_HOUSE = manufacturer prints AND applies; self-label needs no downstream
  // application. Manufacturer-applies is the default resolution (§8.2 step 1) —
  // FC labeling only matters when that first choice is off the table.
  if (mode === 'IN_HOUSE' || manufacturer.appliesLabels) {
    return { needsExternalApplication: false, decorationMethod, offers: [] }
  }

  // 3 — verified RELABEL offers covering THIS method, on live warehouses.
  const rows = await prisma.fcValueAddedService.findMany({
    where: {
      jobType: 'RELABEL',
      status: 'ACTIVE', // ACTIVE only ever set by admin verification (§8.1a)
      labelMethods: { has: decorationMethod as never },
      partnerService: {
        type: 'WAREHOUSE',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE' },
      },
    },
    select: {
      partnerServiceId: true,
      feeCentsPerUnit: true,
      minUnits: true,
      leadTimeDays: true,
    },
  })

  return {
    needsExternalApplication: true,
    decorationMethod,
    offers: rows.map((r) => ({
      partnerServiceId: r.partnerServiceId,
      feeCentsPerUnit: r.feeCentsPerUnit,
      minUnits: r.minUnits,
      leadTimeDays: r.leadTimeDays,
    })),
  }
}
