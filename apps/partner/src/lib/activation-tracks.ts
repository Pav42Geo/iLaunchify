// Activation Setup track engine — docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B.
//
// Post-approval, role-specific, SERVICE-COMPOSED capability setup. A partner's
// Activation Setup is the UNION of the responsibility tracks for every service
// they run (produce + pack + print → all three tracks), plus a shared tail
// (certifications, pricing, review). Each service's track completes and gates
// THAT service's go-live independently (D8: hard per-service gate) — a partner
// can be live on manufacturing while still finishing their print setup.
//
// Mirrors role-skins.ts: pure, dependency-free (its own string union), so it is
// client/server-safe and unit-testable. The UI groups the returned steps by
// `serviceType` and renders each step's `routesTo` as the "where this data
// lands" tags. The stores each step writes to already exist (PartnerService*
// substrate/material, PartnerPackagingOffering, PartnerCertificateInstance,
// die-line models, lead-time fields) — this engine only composes the FLOW.

// Mirrors Prisma ServiceType (string union — no runtime dep on @ilaunchify/db).
export type PartnerServiceType = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'

export type ActivationServiceKey = PartnerServiceType | 'SHARED'

export interface ActivationStep {
  /** Stable id — used as the per-service completeness key. Never renumber. */
  key: string
  title: string
  description: string
  /** Which service owns this step, or SHARED for the common tail. */
  serviceType: ActivationServiceKey
  /** Platform surfaces this step's data auto-routes to (for the UI tags). */
  routesTo: string[]
  /** Deep link to the real surface where this step's data is actually entered. */
  href?: string
}

// Stable service order so multi-service partners get a deterministic union.
export const ACTIVATION_SERVICE_ORDER: PartnerServiceType[] = [
  'MANUFACTURING',
  'COPACKING',
  'LABEL_PRINTING',
  'WAREHOUSE',
]

// ---------------------------------------------------------------------------
// Per-service tracks. Keep `key` stable — it's the completeness/go-live key.
// ---------------------------------------------------------------------------
const TRACKS: Record<PartnerServiceType, ActivationStep[]> = {
  MANUFACTURING: [
    { key: 'mfr.products', title: 'Product types & formats', description: 'What you make, per domain.', serviceType: 'MANUFACTURING', routesTo: ['Matching engine'], href: '/products' },
    { key: 'mfr.specs', title: 'Formulation & specs', description: 'Capabilities, constraints, sample capability.', serviceType: 'MANUFACTURING', routesTo: ['Product builder', 'Owner-pin eligibility'], href: '/products' },
    { key: 'mfr.moq', title: 'MOQ & lead times', description: 'Bands + blackout dates.', serviceType: 'MANUFACTURING', routesTo: ['Checkout ETA', 'Capacity gate'], href: '/services' },
  ],
  COPACKING: [
    { key: 'copack.formats', title: 'Packaging formats', description: 'Bottles, jars, pouches, sachets, cartons, blister, cans.', serviceType: 'COPACKING', routesTo: ['Matching engine'], href: '/packaging/offerings' },
    { key: 'copack.fill', title: 'Fill types', description: 'Powder, liquid, capsule/tablet, cream/gel, aerosol.', serviceType: 'COPACKING', routesTo: ['Routing'], href: '/packaging/offerings' },
    { key: 'copack.supply', title: 'Do you supply packaging?', description: 'Supply-or-not per format + lines & capacity.', serviceType: 'COPACKING', routesTo: ['Routing (packaging leg)'], href: '/packaging/offerings' },
  ],
  LABEL_PRINTING: [
    { key: 'print.materials', title: 'Materials & substrates', description: 'List every material you print on — one at a time.', serviceType: 'LABEL_PRINTING', routesTo: ['Matching engine', 'Marketplace facets'], href: '/packaging/offerings' },
    { key: 'print.specs', title: 'Print specs', description: 'Methods, color, finishes, max print area.', serviceType: 'LABEL_PRINTING', routesTo: ['Print-eligibility filter'], href: '/print-spec' },
    { key: 'print.dielines', title: 'Die-lines', description: 'Die-line templates you support or can produce.', serviceType: 'LABEL_PRINTING', routesTo: ['Design Studio', 'Dispatch docs'], href: '/packaging/dielines' },
    { key: 'print.runs', title: 'Run sizes & lead times', description: 'MOQ, production & sample lead time, cutoffs, blackout.', serviceType: 'LABEL_PRINTING', routesTo: ['Checkout ETA', 'Capacity gate'], href: '/print-spec' },
  ],
  WAREHOUSE: [
    { key: 'fc.storage', title: 'Storage classes', description: 'Ambient, cold, frozen, hazmat.', serviceType: 'WAREHOUSE', routesTo: ['FC selector'], href: '/services' },
    { key: 'fc.capacity', title: 'Capacity & geo', description: 'Weekly pallet capacity, location.', serviceType: 'WAREHOUSE', routesTo: ['FC scorer'], href: '/services' },
    { key: 'fc.vas', title: 'Value-added services', description: 'Kitting, returns, pick-pack fees.', serviceType: 'WAREHOUSE', routesTo: ['Manifest', 'Quote'], href: '/services' },
  ],
}

// Shared tail — applied once across all services a partner runs.
export const ACTIVATION_SHARED_STEPS: ActivationStep[] = [
  { key: 'shared.certs', title: 'Certifications', description: 'Per-domain attestation + upload across all your services (food, baby, cosmetics, OTC, pet).', serviceType: 'SHARED', routesTo: ['Routing cert gate'], href: '/certifications' },
  { key: 'shared.pricing', title: 'Pricing & payout', description: 'Confirm price tiers and payout terms.', serviceType: 'SHARED', routesTo: ['Billing', 'Creator quote'], href: '/settings' },
  { key: 'shared.review', title: 'Review & go live', description: "Each service's completeness flips its own routing eligibility on.", serviceType: 'SHARED', routesTo: ['Rotation eligibility'] },
]

/** Steps for one service's track (no shared tail). */
export function trackFor(serviceType: PartnerServiceType): ActivationStep[] {
  return TRACKS[serviceType] ?? []
}

/**
 * The composed Activation Setup step list for a partner: the union of the
 * tracks for every selected service (in stable order), then the shared tail
 * once. Empty selection → shared tail only.
 */
export function activationStepsFor(serviceTypes: PartnerServiceType[]): ActivationStep[] {
  const selected = ACTIVATION_SERVICE_ORDER.filter((t) => serviceTypes.includes(t))
  const steps: ActivationStep[] = []
  for (const t of selected) steps.push(...TRACKS[t])
  steps.push(...ACTIVATION_SHARED_STEPS)
  return steps
}

/**
 * D8 go-live gate: a service is operational once EVERY step in its own track is
 * complete AND the shared steps are complete. `completedKeys` is the set of
 * step keys the partner has finished.
 */
export function isServiceActivationComplete(
  serviceType: PartnerServiceType,
  completedKeys: ReadonlySet<string>,
): boolean {
  const own = TRACKS[serviceType] ?? []
  const sharedDone = ACTIVATION_SHARED_STEPS.every((s) => completedKeys.has(s.key))
  return own.length > 0 && own.every((s) => completedKeys.has(s.key)) && sharedDone
}

export interface ActivationProgress {
  total: number
  done: number
  /** Per selected service: completed / total own-track steps + go-live flag. */
  perService: Record<string, { done: number; total: number; live: boolean }>
}

/** Progress summary for the Activation UI header (per-service + overall). */
export function activationProgress(
  serviceTypes: PartnerServiceType[],
  completedKeys: ReadonlySet<string>,
): ActivationProgress {
  const steps = activationStepsFor(serviceTypes)
  const done = steps.filter((s) => completedKeys.has(s.key)).length
  const perService: ActivationProgress['perService'] = {}
  for (const t of ACTIVATION_SERVICE_ORDER.filter((x) => serviceTypes.includes(x))) {
    const own = TRACKS[t]
    perService[t] = {
      done: own.filter((s) => completedKeys.has(s.key)).length,
      total: own.length,
      live: isServiceActivationComplete(t, completedKeys),
    }
  }
  return { total: steps.length, done, perService }
}
