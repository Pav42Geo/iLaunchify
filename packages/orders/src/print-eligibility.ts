// eligiblePrintProviders — the capability pairing engine
// (docs/PRINT_PROVIDER_SELECTION.md §7.3). Pure: the caller fetches candidate
// data; this function applies EIGHT layered HARD filters and returns both the
// survivors and every rejection with a machine-readable reason — the cards
// page shows "3 can't print this (2: below MOQ…)", telemetry aggregates them,
// and pinning/auto-routing validate against the SAME function.
//
// Iron rule: rating ranks the survivors (§5); it NEVER rescues a failed filter.

// ---------------------------------------------------------------------------
// Inputs (plain data — no prisma)
// ---------------------------------------------------------------------------

export interface PrintJobRequirements {
  packagingTypeId: string
  containerCategory: string // e.g. CAN | BOTTLE | JAR — physics-matrix key
  decorationMethod: string // DecorationMethod
  quantity: number
  substrateId?: string | null // the component's substrate, when specified
  /** Dieline dims the job needs printed (mm). Null = unknown → skip envelope check. */
  printWidthMm?: number | null
  printHeightMm?: number | null
  /** Direct-food-contact packaging → foodContactSafe becomes a HARD filter. */
  requiresFoodContact: boolean
  /** Design demands (studio preflight, §7.2.6). Undefined = not yet known. */
  design?: {
    usesSpotColors?: boolean
    usesWhiteInk?: boolean
    minAssetDpi?: number | null
  }
}

export interface PrintProviderCandidate {
  serviceId: string
  /** Ops state (filter 8) */
  serviceActive: boolean
  partnerActive: boolean
  stripeActive: boolean
  inBlackout: boolean
  /** The candidate's ACTIVE offering for (packagingTypeId × decorationMethod), if any. */
  offering: {
    moq: number
    maxRunQty?: number | null
    foodContactSafe: boolean
    substrateIds: string[] // [] = not declared → permissive
    minPrintWidthMm?: number | null
    maxPrintWidthMm?: number | null
    minPrintHeightMm?: number | null
    maxPrintHeightMm?: number | null
    hasDieline: boolean
  } | null
  /** PartnerServiceSubstrate ids (service-level material support). */
  serviceSubstrateIds: string[]
  /** PartnerPrintOutputSpec bits the design preflight checks. */
  outputSpec?: {
    spotColorsAccepted: boolean
    supportsWhiteInk: boolean
    minDpi: number
  } | null
}

/** The admin-curated physics matrix rows relevant to this job's category. */
export interface DecorationCompatibilityRow {
  containerCategory: string
  decorationMethod: string
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type PrintIneligibilityReason =
  | 'PHYSICS_INCOMPATIBLE' // 1 — decoration invalid for the container category
  | 'NO_ACTIVE_OFFERING' // 2 — no ACTIVE offering for (type × decoration)
  | 'BELOW_MOQ' // 3a
  | 'ABOVE_MAX_RUN' // 3b
  | 'SUBSTRATE_UNSUPPORTED' // 4
  | 'NO_DIELINE' // 5a
  | 'DIMS_OUT_OF_ENVELOPE' // 5b
  | 'FOOD_CONTACT_REQUIRED' // 6 — HARD, never a weight
  | 'DESIGN_SPEC_MISMATCH' // 7 — spot/white/DPI demands exceed the output spec
  | 'SERVICE_INACTIVE' // 8a
  | 'PARTNER_INACTIVE' // 8b
  | 'STRIPE_INACTIVE' // 8c
  | 'BLACKOUT' // 8d

export interface PrintEligibilityResult {
  eligible: string[] // serviceIds, input order preserved (ranking is §5's job)
  rejected: Array<{ serviceId: string; reason: PrintIneligibilityReason }>
  /** The job itself is impossible (physics) — no provider could ever qualify. */
  physicsValid: boolean
}

// ---------------------------------------------------------------------------

export function eligiblePrintProviders(
  job: PrintJobRequirements,
  candidates: readonly PrintProviderCandidate[],
  compatibilityMatrix: readonly DecorationCompatibilityRow[],
): PrintEligibilityResult {
  // Filter 1 — physics: is this decoration valid on this container AT ALL?
  const physicsValid = compatibilityMatrix.some(
    (r) =>
      r.containerCategory === job.containerCategory &&
      r.decorationMethod === job.decorationMethod,
  )
  if (!physicsValid) {
    return {
      eligible: [],
      rejected: candidates.map((c) => ({ serviceId: c.serviceId, reason: 'PHYSICS_INCOMPATIBLE' })),
      physicsValid: false,
    }
  }

  const eligible: string[] = []
  const rejected: PrintEligibilityResult['rejected'] = []

  for (const c of candidates) {
    const reason = rejectionReason(job, c)
    if (reason) rejected.push({ serviceId: c.serviceId, reason })
    else eligible.push(c.serviceId)
  }

  return { eligible, rejected, physicsValid: true }
}

/** First failing filter, in the documented order — null when fully eligible. */
function rejectionReason(
  job: PrintJobRequirements,
  c: PrintProviderCandidate,
): PrintIneligibilityReason | null {
  // 8 — ops state first in practice (cheap + terminal), documented as last but
  // checked first so a paused partner never leaks a capability detail.
  if (!c.serviceActive) return 'SERVICE_INACTIVE'
  if (!c.partnerActive) return 'PARTNER_INACTIVE'
  if (!c.stripeActive) return 'STRIPE_INACTIVE'
  if (c.inBlackout) return 'BLACKOUT'

  // 2 — the pairing tuple must exist and be ACTIVE.
  const o = c.offering
  if (!o) return 'NO_ACTIVE_OFFERING'

  // 3 — quantity window.
  if (job.quantity < o.moq) return 'BELOW_MOQ'
  if (o.maxRunQty != null && job.quantity > o.maxRunQty) return 'ABOVE_MAX_RUN'

  // 4 — materials. Offering-level list wins when declared; else the
  // service-level substrate support; empty BOTH = permissive (undeclared).
  if (job.substrateId) {
    const declared = o.substrateIds.length > 0 ? o.substrateIds : c.serviceSubstrateIds
    if (declared.length > 0 && !declared.includes(job.substrateId)) {
      return 'SUBSTRATE_UNSUPPORTED'
    }
  }

  // 5 — dieline + dimensional envelope.
  if (!o.hasDieline) return 'NO_DIELINE'
  if (job.printWidthMm != null) {
    if (o.minPrintWidthMm != null && job.printWidthMm < Number(o.minPrintWidthMm)) return 'DIMS_OUT_OF_ENVELOPE'
    if (o.maxPrintWidthMm != null && job.printWidthMm > Number(o.maxPrintWidthMm)) return 'DIMS_OUT_OF_ENVELOPE'
  }
  if (job.printHeightMm != null) {
    if (o.minPrintHeightMm != null && job.printHeightMm < Number(o.minPrintHeightMm)) return 'DIMS_OUT_OF_ENVELOPE'
    if (o.maxPrintHeightMm != null && job.printHeightMm > Number(o.maxPrintHeightMm)) return 'DIMS_OUT_OF_ENVELOPE'
  }

  // 6 — food-contact compliance. HARD when the packaging demands it.
  if (job.requiresFoodContact && !o.foodContactSafe) return 'FOOD_CONTACT_REQUIRED'

  // 7 — design-vs-spec preflight (only for the demands actually known).
  if (job.design && c.outputSpec) {
    if (job.design.usesSpotColors && !c.outputSpec.spotColorsAccepted) return 'DESIGN_SPEC_MISMATCH'
    if (job.design.usesWhiteInk && !c.outputSpec.supportsWhiteInk) return 'DESIGN_SPEC_MISMATCH'
    if (
      job.design.minAssetDpi != null &&
      job.design.minAssetDpi < c.outputSpec.minDpi
    ) {
      return 'DESIGN_SPEC_MISMATCH'
    }
  }

  return null
}

/** Human copy for the cards page's filtered-out transparency line (§7.3). */
export const INELIGIBILITY_COPY: Record<PrintIneligibilityReason, string> = {
  PHYSICS_INCOMPATIBLE: 'decoration method not possible on this container',
  NO_ACTIVE_OFFERING: 'no active offering for this packaging + decoration',
  BELOW_MOQ: 'quantity below their minimum',
  ABOVE_MAX_RUN: 'quantity above their run ceiling',
  SUBSTRATE_UNSUPPORTED: "doesn't run this material",
  NO_DIELINE: 'no dieline for this format',
  DIMS_OUT_OF_ENVELOPE: 'print size outside their press range',
  FOOD_CONTACT_REQUIRED: 'no food-contact-safe ink system',
  DESIGN_SPEC_MISMATCH: "design needs exceed their output spec",
  SERVICE_INACTIVE: 'service not active',
  PARTNER_INACTIVE: 'partner not active',
  STRIPE_INACTIVE: 'payouts not set up',
  BLACKOUT: 'temporarily unavailable',
}
