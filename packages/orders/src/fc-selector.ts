// Phase L1 — V1 fulfillment-center selection (docs/LOGISTICS_AND_FULFILLMENT.md §5).
// V1 = Phase-1 HARD eligibility + nearest-to-manufacturer + admin confirm.
// The Phase-2 weighted scorer / Phase-3 rotation band activate in V1.5 once
// ≥3 nodes are eligible per storage class (weights already live in OrderSettings).
//
// PURE ranking here; the prisma wrapper lives in the caller (apps) or the
// thin helper below. Every award is logged to FcAssignmentLog for explainability.

export interface FcCandidate {
  partnerServiceId: string
  partnerName: string
  city: string | null
  state: string | null
  /** Typed capability fields from PartnerService (L0). */
  storageClasses: string[]
  hazmatAccepted: string[]
  fcCertifications: string[]
  weeklyPalletCapacity: number | null
  facilityLat: number | null
  facilityLng: number | null
  /** P1 (PARTNER_ROLE_ACCOUNTS §3.1.E) — facility inside a declared blackout
   *  window as of selection time. HARD filter, like temp/hazmat — never traded
   *  for cost. Optional so pre-P1 callers/tests stay valid (default false). */
  blackedOut?: boolean
}

export interface FcSelectionInput {
  storageClass: string
  hazmatClass: string
  domain: string
  /** Shipment size in pallets (0/unknown = skip the capacity filter). */
  pallets: number
  /** Manufacturer facility coordinates; null = fall back to state adjacency. */
  originLat: number | null
  originLng: number | null
  originState: string | null
}

export interface FcRanked {
  candidate: FcCandidate
  eligible: boolean
  /** Why an ineligible node was excluded (admin visibility). */
  exclusionReason: string | null
  /** Miles to origin (haversine); null when either side lacks coordinates. */
  distanceMiles: number | null
}

const FOOD_DOMAINS = ['FOOD', 'BEVERAGE', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'BABY_NUTRITION']

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Phase-1 eligibility (HARD — never traded for cost) + nearest ordering.
 * Returns ALL candidates annotated (eligible + excluded) so the admin
 * confirm screen can show the full picture; eligible ones sorted nearest-first.
 */
export function rankFulfillmentCenters(candidates: FcCandidate[], input: FcSelectionInput): FcRanked[] {
  const ranked: FcRanked[] = candidates.map((c) => {
    let reason: string | null = null
    if (c.blackedOut === true) {
      reason = 'facility blackout window (partner-declared unavailability)'
    } else if (!c.storageClasses.includes(input.storageClass)) {
      reason = `cannot hold ${input.storageClass}`
    } else if (input.hazmatClass !== 'NONE' && !c.hazmatAccepted.includes(input.hazmatClass)) {
      reason = `does not accept ${input.hazmatClass}`
    } else if (FOOD_DOMAINS.includes(input.domain) && !c.fcCertifications.includes('FDA_REGISTERED')) {
      reason = 'not FDA-registered (required for food/pet/supplement storage)'
    } else if (
      input.pallets > 0 &&
      c.weeklyPalletCapacity !== null &&
      c.weeklyPalletCapacity < input.pallets
    ) {
      reason = `receiving capacity ${c.weeklyPalletCapacity} pallets/wk < shipment ${input.pallets}`
    }

    const distanceMiles =
      input.originLat !== null && input.originLng !== null && c.facilityLat !== null && c.facilityLng !== null
        ? Math.round(haversineMiles(input.originLat, input.originLng, c.facilityLat, c.facilityLng))
        : null

    return { candidate: c, eligible: reason === null, exclusionReason: reason, distanceMiles }
  })

  return ranked.sort((a, b) => {
    // eligible first
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    // nearest first; unknown distance after known — tie-broken by same-state,
    // then stable by partnerServiceId for determinism.
    if (a.distanceMiles !== null && b.distanceMiles !== null && a.distanceMiles !== b.distanceMiles)
      return a.distanceMiles - b.distanceMiles
    if ((a.distanceMiles === null) !== (b.distanceMiles === null)) return a.distanceMiles === null ? 1 : -1
    const aState = a.candidate.state === input.originState ? 0 : 1
    const bState = b.candidate.state === input.originState ? 0 : 1
    if (aState !== bState) return aState - bState
    return a.candidate.partnerServiceId.localeCompare(b.candidate.partnerServiceId)
  })
}

/** The V1 pick = first eligible in rank order; null when nothing qualifies. */
export function selectNearestEligibleFc(
  candidates: FcCandidate[],
  input: FcSelectionInput,
): { winner: FcRanked | null; ranked: FcRanked[] } {
  const ranked = rankFulfillmentCenters(candidates, input)
  const winner = ranked.find((r) => r.eligible) ?? null
  return { winner, ranked }
}

/** FcAssignmentLog.scoreJson payload — keep the shape stable (admin reads it). */
export function buildAwardLogPayload(result: { winner: FcRanked | null; ranked: FcRanked[] }) {
  return {
    algorithm: 'V1_NEAREST_ELIGIBLE',
    winner: result.winner?.candidate.partnerServiceId ?? null,
    candidates: result.ranked.map((r) => ({
      partnerServiceId: r.candidate.partnerServiceId,
      eligible: r.eligible,
      exclusionReason: r.exclusionReason,
      distanceMiles: r.distanceMiles,
    })),
  }
}
