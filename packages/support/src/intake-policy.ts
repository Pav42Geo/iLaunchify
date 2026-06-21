// Tier-aware intake policy (W2-SUP3.5 · Pavel 2026-06-20).
//
// Pure functions — given a creator's subscription tier + the admin-tuned
// SupportSettings, compute the priority floor + first-response SLA target to
// stamp on a new ticket. PARTNERS are intentionally NOT handled here: partner
// tier meaning is undecided, so partner tickets keep their category/priority
// defaults and are surfaced info-only. Creators are spec-backed (PLATFORM_SPEC
// §Tier 1).

import type { TicketPriority } from '@ilaunchify/db'
import type { SupportSettingsValues } from '@ilaunchify/db'

export type CreatorTier = 'MAKER' | 'BUILDER' | 'AGENCY'

const PRIORITY_RANK: Record<TicketPriority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
}

/** The higher-priority of two values (URGENT > HIGH > MEDIUM > LOW). */
export function maxPriority(a: TicketPriority, b: TicketPriority): TicketPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b
}

function tierResponseMinutes(tier: CreatorTier, s: SupportSettingsValues): number {
  switch (tier) {
    case 'AGENCY':
      return s.agencyResponseMinutes
    case 'BUILDER':
      return s.builderResponseMinutes
    case 'MAKER':
    default:
      return s.makerResponseMinutes
  }
}

function tierMinPriority(tier: CreatorTier, s: SupportSettingsValues): TicketPriority {
  switch (tier) {
    case 'AGENCY':
      return s.agencyMinPriority as TicketPriority
    case 'BUILDER':
      return s.builderMinPriority as TicketPriority
    case 'MAKER':
    default:
      return s.makerMinPriority as TicketPriority
  }
}

export interface IntakeResolution {
  /** Final priority — category default raised to the tier floor (if enabled). */
  priority: TicketPriority
  /** First-response SLA minutes to stamp on the ticket (null = use priority default). */
  slaResponseMinutes: number | null
}

/**
 * Resolve a CREATOR ticket's intake priority + SLA target.
 *
 * - `priorityFloorEnabled`: final priority = max(category default, tier floor).
 * - `slaTargetsEnabled`: SLA response target = tier minutes (overrides the
 *   priority/category default). When disabled → null (read-time priority default).
 *
 * Both switches independent; when both off this is a no-op (returns the category
 * priority + null SLA).
 */
export function resolveCreatorIntake(args: {
  tier: CreatorTier
  categoryPriority: TicketPriority
  settings: SupportSettingsValues
}): IntakeResolution {
  const { tier, categoryPriority, settings } = args
  const priority = settings.priorityFloorEnabled
    ? maxPriority(categoryPriority, tierMinPriority(tier, settings))
    : categoryPriority
  const slaResponseMinutes = settings.slaTargetsEnabled ? tierResponseMinutes(tier, settings) : null
  return { priority, slaResponseMinutes }
}
