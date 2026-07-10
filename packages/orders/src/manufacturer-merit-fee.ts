// Manufacturer merit-fee WITHHOLD resolver (docs/FEE_MODEL_RECONCILIATION_SPEC_2026-07-09).
//
// Decision (Pavel 2026-07-09): the merit fee (Verified 4.5% / Trusted 2.5% /
// Premier 0%) is withheld from the MANUFACTURER's payout — it "eats the
// manufacturer" — and is NOT part of the creator's platform fee (that is now the
// creator's subscription-tier rate, see @ilaunchify/plans creator-fee.ts).
//
// This reuses the existing prisma-backed resolver (production-fee-resolver.ts) with
// baseFeeBps = 0, so the returned bps is the STANDALONE merit component:
//   • 0 while MeritPolicy.enabled = false (SHADOW-SAFE — withholds nothing today),
//   • the badge bps (450 / 250 / 0) once enabled,
//   • a promo/grace bps when an active grant applies.
// Because it is 0 until the engine is flipped on, wiring the withhold into
// shipDispatch changes no money until the platform enables merit.
//
// The pure withhold math (meritWithholdCents) unit-tests without prisma.

import { resolveOrderProductionFeeBps } from './production-fee-resolver'

/**
 * Resolve the merit-fee bps withheld from a manufacturer's payout for the leg they
 * fulfill. 0 baseline; badge/promo bps only once the merit engine is enabled.
 * Never throws (the underlying resolver falls back to base = 0 on any lookup gap).
 *
 * Snapshot the result onto OrderDispatch.meritFeeBps at ROUTING time so the withhold
 * is frozen + auditable (the badge could change between routing and ship).
 */
export async function resolveManufacturerMeritFeeBps(manufacturerServiceId: string | null): Promise<number> {
  const { feeBps } = await resolveOrderProductionFeeBps({ manufacturerServiceId, baseFeeBps: 0 })
  return feeBps
}

/**
 * Pure: cents withheld from a manufacturer leg's payout = round(costCents × bps/10000).
 * ONE rounding function (Math.round), matching the creator-fee path. Clamped to
 * [0, costCents] so a payout can never go negative. Used at shipDispatch:
 *   Transfer.amountCents = dispatch.costCents − meritWithholdCents(costCents, meritBps)
 */
export function meritWithholdCents(costCents: number, meritBps: number): number {
  if (!Number.isFinite(costCents) || costCents <= 0) return 0
  if (!Number.isFinite(meritBps) || meritBps <= 0) return 0
  const withheld = Math.round((costCents * meritBps) / 10000)
  return Math.min(Math.max(withheld, 0), costCents)
}
