// REBUILD R16.c — partner promotion-criteria evaluator.
//
// Tells admin at a glance whether a partner has earned promotion to the
// next tier. V1 keeps the criteria intentionally short and HONEST: every
// row maps to a number we can actually compute today. Rows we cannot
// compute yet carry a `caveat` and `status: 'unknown'` instead of being
// faked — that's the operational-trust philosophy.
//
// Sources used (all today's schema):
//   - OrderDispatch.deliveredAt          → delivered count
//   - OrderDispatch.qualityCheckFailedAt → quality-failure count
//   - Partner.tierChangedAt              → time at current tier
//
// V1.1+ rows wired in once the data lands:
//   - Open dispute count (no Dispute model yet)
//   - True on-time-delivery rate (no quoted delivery deadline yet —
//     only acceptDeadlineAt which is for partner accept, not delivery)
//
// Final promotion is still a human decision — this card is decision
// support, not an auto-promoter.

import { prisma } from '@ilaunchify/db'

export type CriterionStatus = 'met' | 'almost' | 'far' | 'unknown'

export interface Criterion {
  /** Short label, e.g. "Delivered dispatches". */
  label: string
  /** Pretty-printed current value. "—" when the metric isn't tracked yet. */
  currentDisplay: string
  /** Pretty-printed target, e.g. "≥ 10". */
  targetDisplay: string
  status: CriterionStatus
  /** Optional one-liner shown under the row (e.g. data-source caveat). */
  caveat?: string
}

export interface PromotionCriteriaResult {
  /** Next tier the partner could earn — null when already at top. */
  nextTier: 'TRUSTED' | 'PREMIER' | null
  criteria: Criterion[]
  metCount: number
  trackedCount: number
}

interface CriteriaSpec {
  minDelivered: number
  maxQcFailures: number
  minDaysAtTier: number | null // null = ignore for this tier
}

const SPEC: Record<'TRUSTED' | 'PREMIER', CriteriaSpec> = {
  TRUSTED: {
    minDelivered: 10,
    maxQcFailures: 1,
    minDaysAtTier: 30,
  },
  PREMIER: {
    minDelivered: 50,
    maxQcFailures: 0,
    minDaysAtTier: 90,
  },
}

export async function computePartnerPromotionCriteria(
  partnerId: string,
  currentTier: 'VERIFIED' | 'TRUSTED' | 'PREMIER',
  tierChangedAt: Date | null,
): Promise<PromotionCriteriaResult> {
  const nextTier: 'TRUSTED' | 'PREMIER' | null =
    currentTier === 'VERIFIED' ? 'TRUSTED' : currentTier === 'TRUSTED' ? 'PREMIER' : null

  if (!nextTier) {
    return { nextTier: null, criteria: [], metCount: 0, trackedCount: 0 }
  }

  const spec = SPEC[nextTier]

  // -- Delivered count + QC-failure count, scoped to this partner's
  //    PartnerService rows so multi-service partners aggregate correctly.
  const [deliveredCount, qcFailedCount] = await Promise.all([
    prisma.orderDispatch.count({
      where: {
        partnerService: { partnerId },
        deliveredAt: { not: null },
      },
    }),
    prisma.orderDispatch.count({
      where: {
        partnerService: { partnerId },
        qualityCheckFailedAt: { not: null },
      },
    }),
  ])

  const daysAtTier =
    tierChangedAt != null
      ? Math.floor((Date.now() - tierChangedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null

  const criteria: Criterion[] = [
    deliveredCriterion(deliveredCount, spec.minDelivered),
    qcFailureCriterion(qcFailedCount, spec.maxQcFailures),
  ]

  if (spec.minDaysAtTier != null) {
    criteria.push(daysAtTierCriterion(daysAtTier, spec.minDaysAtTier, currentTier))
  }

  // V1 forward-pointers — surfaced so admin knows what's coming.
  criteria.push({
    label: 'Open disputes',
    currentDisplay: '—',
    targetDisplay: '0 open',
    status: 'unknown',
    caveat: 'Tracking lands with the Dispute module (V1.1+).',
  })

  const metCount = criteria.filter((c) => c.status === 'met').length
  const trackedCount = criteria.filter((c) => c.status !== 'unknown').length

  return { nextTier, criteria, metCount, trackedCount }
}

// -----------------------------------------------------------------------------
// Individual criterion builders
// -----------------------------------------------------------------------------

function deliveredCriterion(current: number, threshold: number): Criterion {
  const status = bandFor(current, threshold)
  return {
    label: 'Delivered dispatches',
    currentDisplay: `${current}`,
    targetDisplay: `≥ ${threshold}`,
    status,
  }
}

function qcFailureCriterion(current: number, maxAllowed: number): Criterion {
  // Inverted band — lower is better. "Met" if at-or-below threshold,
  // "almost" within +1, otherwise "far".
  let status: CriterionStatus
  if (current <= maxAllowed) status = 'met'
  else if (current <= maxAllowed + 1) status = 'almost'
  else status = 'far'
  return {
    label: 'Quality-check failures',
    currentDisplay: `${current}`,
    targetDisplay: maxAllowed === 0 ? '0 failures' : `≤ ${maxAllowed}`,
    status,
  }
}

function daysAtTierCriterion(
  current: number | null,
  threshold: number,
  currentTier: string,
): Criterion {
  if (current == null) {
    return {
      label: `Time at ${currentTier.toLowerCase()}`,
      currentDisplay: '—',
      targetDisplay: `≥ ${threshold} days`,
      status: 'unknown',
      caveat: 'No tier-change timestamp recorded yet.',
    }
  }
  const status = bandFor(current, threshold)
  return {
    label: `Time at ${currentTier.toLowerCase()}`,
    currentDisplay: `${current} day${current === 1 ? '' : 's'}`,
    targetDisplay: `≥ ${threshold} days`,
    status,
  }
}

// "Met" once the value reaches the threshold; "almost" within 80%;
// "far" otherwise. Keeps the colour grammar consistent across rows.
function bandFor(current: number, threshold: number): CriterionStatus {
  if (current >= threshold) return 'met'
  if (current >= threshold * 0.8) return 'almost'
  return 'far'
}
