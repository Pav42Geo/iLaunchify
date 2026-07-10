// Print Coverage — computed, continuous, gating (docs/PRINT_PROVIDER_SELECTION.md
// §10.1). Coverage = the count of DISTINCT ACTIVE printers that pass the §7 hard
// ops filters for a template's requirement tuple. It is the number PS-8b gates
// activation on (a non-IN_HOUSE template can't PUBLISH at coverage 0) and the
// coverage-drop watch pauses ordering on.
//
// This mirrors the candidate derivation in apps/marketing/src/lib/print-providers.ts
// EXACTLY (same ops gates, same packaging-type match) so a template's card list
// and its coverage count never disagree. The difference is intent: cards render
// the survivors; coverage just counts them and, when zero, hands PS-8b the
// denormalized tuple to broadcast.
//
// Prisma-backed (like routing.ts / sample-print.ts); the ranking it feeds
// (rankCapabilityShortlist) is the PURE, tested half in capability-shortlist.ts.

import { prisma } from '@ilaunchify/db'
import { effectivePrintSourcing, type LabelingModeValue } from './print-sourcing'
import {
  rankCapabilityShortlist,
  type CapabilityRequirementTuple,
  type ShortlistCandidate,
  type ShortlistRanked,
} from './capability-shortlist'

export interface TemplatePrintCoverage {
  /** False when print sourcing is IN_HOUSE (or the template/manufacturer is
   *  missing) — coverage gating simply does not apply. */
  applicable: boolean
  mode: LabelingModeValue | null
  /** DISTINCT ops-gated printers with an ACTIVE offering on the template's types. */
  coverage: number
  coveredServiceIds: string[]
  /** True when applicable and coverage === 0 — PS-8b parks/pauses + broadcasts. */
  uncovered: boolean
  /** True when applicable and coverage === 1 — "fragile", deepen before churn. */
  fragile: boolean
  /** The packaging types the template requires (union across its systems). */
  packagingTypeIds: string[]
  /** Manufacturer region label (state/region code) for geo adjacency; null = unknown. */
  manufacturerRegion: string | null
}

/**
 * Compute print coverage for a template by id. Fails soft to
 * `{ applicable:false, coverage:0 }` on any missing datum — callers gate on
 * `applicable && uncovered`, never on a thrown error.
 */
export async function computeTemplatePrintCoverage(
  templateId: string,
): Promise<TemplatePrintCoverage> {
  const NA: TemplatePrintCoverage = {
    applicable: false,
    mode: null,
    coverage: 0,
    coveredServiceIds: [],
    uncovered: false,
    fragile: false,
    packagingTypeIds: [],
    manufacturerRegion: null,
  }

  try {
    const template = await prisma.productTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        manufacturerServiceId: true,
        packagingSystems: {
          select: { packagingSystem: { select: { packagingTypeId: true } } },
        },
      },
    })
    if (!template?.manufacturerServiceId) return NA

    const manufacturer = await prisma.partnerService.findUnique({
      where: { id: template.manufacturerServiceId },
      select: {
        labelingMode: true,
        partner: { select: { primaryRegion: { select: { code: true } } } },
      },
    })
    if (!manufacturer) return NA

    // §2 — the ONE signal. IN_HOUSE never needs external coverage.
    const mode = effectivePrintSourcing(null, manufacturer)
    if (mode === 'IN_HOUSE') return { ...NA, mode }

    const manufacturerRegion = manufacturer.partner?.primaryRegion?.code ?? null

    const packagingTypeIds = [
      ...new Set(
        template.packagingSystems
          .map((p) => p.packagingSystem.packagingTypeId)
          .filter((x): x is string => !!x),
      ),
    ]

    const now = new Date()
    // COVERAGE DETECTION — intentionally NOT gated by the pure-printer main-role
    // rule (LOCKED 2026-07-09, Pavel). This asks "does ANY printer cover this
    // spec", and a manufacturer/co-packer self-labeling its OWN products IS
    // legitimate coverage — excluding producers here would report false gaps and
    // fire needless RFQs. The main-role gate applies only to PUBLIC print work
    // (rotation pool + RFQ broadcast in loadCapabilityShortlist below), not to
    // whether coverage exists. Do not "fix" this to match the broadcast filter.
    const services = await prisma.partnerService.findMany({
      where: {
        type: 'LABEL_PRINTING',
        status: 'ACTIVE',
        partner: { status: 'ACTIVE', user: { stripeAccountStatus: 'ACTIVE' } },
        packagingOfferings: { some: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, take: 1 },
        packagingOfferings: {
          where: { status: 'ACTIVE' },
          select: { packagingTypeId: true },
        },
      },
    })

    const covered = services.filter((s) => {
      if (s.blackoutDates.length > 0) return false
      // Template packaging types unknown → any active printer counts (permissive,
      // matching print-providers.ts). Otherwise require a type overlap.
      if (packagingTypeIds.length === 0) return true
      return s.packagingOfferings.some((o) => packagingTypeIds.includes(o.packagingTypeId))
    })

    const coveredServiceIds = covered.map((s) => s.id)
    const coverage = coveredServiceIds.length

    return {
      applicable: true,
      mode,
      coverage,
      coveredServiceIds,
      uncovered: coverage === 0,
      fragile: coverage === 1,
      packagingTypeIds,
      manufacturerRegion,
    }
  } catch {
    return NA
  }
}

/**
 * Compute a template's coverage AND persist it to the denormalized
 * `ProductTemplate.printCoverage` cache (§10.1). Returns the fresh coverage so
 * callers that also need the value (publish gate, cron) don't double-compute.
 * The column powers the admin dashboard's exact "fragile" (coverage 1) count and
 * lets other surfaces read coverage without re-scanning. `printCoverage = null`
 * when not applicable (IN_HOUSE / template missing). Best-effort — a failed cache
 * write never fails the caller (e.g. a deleted template mid-recompute).
 */
export async function recomputeTemplateCoverage(
  templateId: string,
): Promise<TemplatePrintCoverage> {
  const cov = await computeTemplatePrintCoverage(templateId)
  try {
    await prisma.productTemplate.update({
      where: { id: templateId },
      data: {
        printCoverage: cov.applicable ? cov.coverage : null,
        printCoverageAt: new Date(),
      },
    })
  } catch {
    /* cache write best-effort */
  }
  return cov
}

/**
 * Build the denormalized RFQ tuple(s) for a template (§10.2). One tuple per
 * required packaging type (the PrintCapabilityRequest unique key is
 * templateId+packagingTypeId). decorationMethod/substrate/dieline stay null at
 * the template level — those are per-component facts a claimer declares. PS-8b
 * persists these; PS-8a just derives them.
 */
export function buildCapabilityTuples(
  coverage: Pick<TemplatePrintCoverage, 'packagingTypeIds' | 'manufacturerRegion'>,
): CapabilityRequirementTuple[] {
  return coverage.packagingTypeIds.map((packagingTypeId) => ({
    packagingTypeId,
    decorationMethod: null,
    printProcessHint: null,
    manufacturerRegion: coverage.manufacturerRegion,
  }))
}

/**
 * Load the onboarded LABEL_PRINTING pool and rank it for an RFQ broadcast
 * (§10.2 shortlist). Ops-gated (ACTIVE service+partner, Stripe live) — an
 * inactive shop can't claim work — then handed to the PURE
 * `rankCapabilityShortlist`. `excludeServiceIds` drops printers who already
 * cover (or were already notified) so re-broadcasts walk the next band.
 */
export async function loadCapabilityShortlist(
  tuple: CapabilityRequirementTuple,
  opts: { limit?: number; excludeServiceIds?: readonly string[] } = {},
): Promise<ShortlistRanked[]> {
  const exclude = new Set(opts.excludeServiceIds ?? [])
  const now = new Date()

  const services = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      // MAIN-ROLE RULE (Pavel 2026-07-09): an RFQ broadcast is an invitation into
      // public print work, so it goes ONLY to partners whose main role is Print
      // Provider — pure printers. A manufacturer/co-packer that also prints closes
      // its own cycle and is never broadcast to. (Mirrors isPublicPrintPoolEligible.)
      partner: {
        status: 'ACTIVE',
        user: { stripeAccountStatus: 'ACTIVE' },
        services: { none: { type: { in: ['MANUFACTURING', 'COPACKING'] } } },
      },
    },
    select: {
      id: true,
      ratingBayesian: true,
      partner: { select: { primaryRegion: { select: { code: true } } } },
      blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, take: 1 },
      packagingOfferings: {
        where: { status: 'ACTIVE' },
        select: { packagingTypeId: true, decorationMethod: true, printProcess: true },
      },
    },
  })

  const candidates: ShortlistCandidate[] = services
    .filter((s) => !exclude.has(s.id) && s.blackoutDates.length === 0)
    .map((s) => ({
      serviceId: s.id,
      region: s.partner?.primaryRegion?.code ?? null,
      ratingBayesian: s.ratingBayesian != null ? Number(s.ratingBayesian) : null,
      offerings: s.packagingOfferings.map((o) => ({
        packagingTypeId: o.packagingTypeId,
        decorationMethod: o.decorationMethod as string,
        printProcess: o.printProcess as string | null,
      })),
    }))

  return rankCapabilityShortlist(candidates, tuple, { limit: opts.limit })
}
