// Manufacturer merit → production-fee resolution (docs/MANUFACTURER_MERIT_ENGINE.md
// §6, MM-5). The BADGE a manufacturer holds sets the platform's production-fee cut
// on orders they fulfill: Verified 4.5% · Trusted 2.5% · Premier 0% (admin-tunable
// via MeritPolicy.feeBpsByBadge).
//
// SHADOW-SAFE by construction: until MeritPolicy.enabled is flipped on, this
// returns the base OrderSettings production fee UNCHANGED — badge economics are
// inert. When enabled, the fee resolves from the badge. Pure + reversible:
// flipping `enabled` back to false restores base pricing with no data migration.

import type { MeritBadge, MeritPolicy } from './merit'

export type FeeSource = 'BASE' | 'BADGE'

export interface ResolvedManufacturerFee {
  /** The production-fee rate to charge, in basis points. */
  bps: number
  /** Where it came from — BASE (engine off / unknown badge) or BADGE. */
  source: FeeSource
  badge: MeritBadge
  /** The OrderSettings base rate, for delta display. */
  baseBps: number
}

/**
 * Resolve the production-fee bps for an order leg fulfilled by a manufacturer.
 * `enabled` is MeritPolicy.enabled — the single kill switch that binds (or
 * unbinds) badge economics. Never throws; an unknown badge falls back to base.
 */
export function resolveManufacturerFeeBps(args: {
  baseProductionFeeBps: number
  badge: MeritBadge
  policy: Pick<MeritPolicy, 'feeBpsByBadge'>
  enabled: boolean
}): ResolvedManufacturerFee {
  const { baseProductionFeeBps, badge, policy, enabled } = args
  if (!enabled) {
    return { bps: baseProductionFeeBps, source: 'BASE', badge, baseBps: baseProductionFeeBps }
  }
  const badgeBps = policy.feeBpsByBadge?.[badge]
  const bps = typeof badgeBps === 'number' && Number.isFinite(badgeBps) ? badgeBps : baseProductionFeeBps
  return {
    bps,
    source: typeof badgeBps === 'number' && Number.isFinite(badgeBps) ? 'BADGE' : 'BASE',
    badge,
    baseBps: baseProductionFeeBps,
  }
}

/** bps → percent string, e.g. 450 → "4.5%", 500 → "5%", 0 → "0%". */
export function feeBpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`
}
