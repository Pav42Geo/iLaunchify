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

export type FeeSource = 'BASE' | 'BADGE' | 'PROMO'

export interface ResolvedManufacturerFee {
  /** The production-fee rate to charge, in basis points. */
  bps: number
  /** Where it came from — BASE (engine off), BADGE (tier fee), or PROMO (grace/grant). */
  source: FeeSource
  badge: MeritBadge
  /** The OrderSettings base rate, for delta display. */
  baseBps: number
}

/**
 * Resolve the production-fee bps for an order leg fulfilled by a manufacturer.
 * Precedence (most generous / most explicit first):
 *   1. `promoFeeBps` — an active fee-grace/promo grant (MM-7). Overrides everything.
 *   2. badge fee — when `enabled` (MeritPolicy.enabled) binds tier economics.
 *   3. base — the OrderSettings production fee (shadow / engine off).
 * `enabled` is the single kill switch for badge economics. Never throws.
 */
export function resolveManufacturerFeeBps(args: {
  baseProductionFeeBps: number
  badge: MeritBadge
  policy: Pick<MeritPolicy, 'feeBpsByBadge'>
  enabled: boolean
  /** Active promo fee (from resolveActivePromo). null = no promo. Wins outright. */
  promoFeeBps?: number | null
}): ResolvedManufacturerFee {
  const { baseProductionFeeBps, badge, policy, enabled, promoFeeBps } = args
  if (typeof promoFeeBps === 'number' && Number.isFinite(promoFeeBps)) {
    return { bps: promoFeeBps, source: 'PROMO', badge, baseBps: baseProductionFeeBps }
  }
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

// ─── MM-7 · Fee grace / promotional grants ──────────────────────────────────
// A time-bound override that lets admins skip the merit fee for a manufacturer:
//  • GLOBAL grace — every manufacturer gets `months` from activation at
//    `feeBps` (default 0). Live-computed from activatedAt, so changing the
//    number instantly re-prices everyone (no minted rows). Toggle to disable.
//  • MANUAL grants — hand-picked manufacturers get an explicit window at an
//    editable %. Rows in ManufacturerFeeGrant. A manual grant WINS over grace.
// The badge stays Verified while a promo is active — they're skipping the
// engine, not climbing it.

export type PromoSource = 'MANUAL_GRANT' | 'GLOBAL_GRACE'

export type GraceUnit = 'DAYS' | 'MONTHS'

export interface GracePolicy {
  enabled: boolean
  /** Window length, interpreted per `unit`. */
  value: number
  unit: GraceUnit
  feeBps: number
}

export interface FeeGrantLike {
  feeBps: number
  startsAt: Date
  endsAt: Date
  revokedAt: Date | null
}

export interface ActivePromo {
  feeBps: number
  source: PromoSource
  endsAt: Date
}

/** Add whole months to a date (calendar-based, UTC; clamps to end-of-month). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime())
  const targetDay = out.getUTCDate()
  out.setUTCMonth(out.getUTCMonth() + months)
  // If the target month is shorter, setUTCMonth rolls over — clamp back.
  if (out.getUTCDate() < targetDay) out.setUTCDate(0)
  return out
}

/** Add whole days to a date (UTC). */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/** Add a duration expressed as a value + unit (DAYS or MONTHS). */
export function addDuration(d: Date, value: number, unit: GraceUnit): Date {
  return unit === 'DAYS' ? addDays(d, value) : addMonths(d, value)
}

/**
 * Resolve the active fee promo for a manufacturer, or null. A MANUAL grant
 * (explicit admin choice) takes precedence over GLOBAL grace; among concurrent
 * manual grants the most generous (lowest feeBps) wins, tie-broken by latest
 * end. Global grace applies only while `now` is within `months` of activation.
 */
export function resolveActivePromo(args: {
  now: Date
  activatedAt: Date | null
  grace: GracePolicy
  manualGrants: ReadonlyArray<FeeGrantLike>
}): ActivePromo | null {
  const { now, activatedAt, grace, manualGrants } = args
  const t = now.getTime()

  const active = manualGrants.filter(
    (g) => g.revokedAt == null && g.startsAt.getTime() <= t && g.endsAt.getTime() > t,
  )
  if (active.length > 0) {
    const best = active.reduce((a, b) =>
      b.feeBps < a.feeBps || (b.feeBps === a.feeBps && b.endsAt.getTime() > a.endsAt.getTime()) ? b : a,
    )
    return { feeBps: best.feeBps, source: 'MANUAL_GRANT', endsAt: best.endsAt }
  }

  if (grace.enabled && activatedAt && grace.value > 0) {
    const endsAt = addDuration(activatedAt, grace.value, grace.unit)
    if (t < endsAt.getTime()) return { feeBps: grace.feeBps, source: 'GLOBAL_GRACE', endsAt }
  }
  return null
}

/** bps → percent string, e.g. 450 → "4.5%", 500 → "5%", 0 → "0%". */
export function feeBpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`
}
