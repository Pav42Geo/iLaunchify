// Order production-fee resolver (MM-8 — the go-live seam for badge→fee).
//
// This is the ONE prisma-backed entry the checkout / transfer fee path calls to
// get the platform production-fee rate for an order, given the MANUFACTURER that
// fulfills it. It layers three things through the pure `resolveManufacturerFeeBps`:
//   1. an active fee-grace / promo grant (MM-7) — wins outright,
//   2. the manufacturer's badge fee — only when MeritPolicy.enabled (MM-5),
//   3. the OrderSettings base fee — the default / shadow rate.
//
// SHADOW-SAFE: with the engine disabled and no promo, it returns `baseFeeBps`
// unchanged — identical to the flat behavior before MM-8. So it is safe to wire
// into live checkout now; nothing moves until the platform flips `enabled`
// (or grants a promo).

import { prisma } from '@ilaunchify/db'
import {
  resolveManufacturerFeeBps,
  resolveActivePromo,
  type FeeSource,
  type GraceUnit,
  type FeeGrantLike,
} from './merit-fee'
import { DEFAULT_MERIT_POLICY, type MeritBadge } from './merit'

export interface ResolvedOrderFee {
  feeBps: number
  source: FeeSource // BASE | BADGE | PROMO
}

/**
 * Resolve the platform production-fee bps for an order fulfilled by
 * `manufacturerServiceId`. Never throws; any lookup failure falls back to
 * `baseFeeBps`. Pass the base you already resolved from OrderSettings.
 */
export async function resolveOrderProductionFeeBps(args: {
  manufacturerServiceId: string | null
  baseFeeBps: number
  now?: Date
}): Promise<ResolvedOrderFee> {
  const { manufacturerServiceId, baseFeeBps } = args
  const now = args.now ?? new Date()
  if (!manufacturerServiceId) return { feeBps: baseFeeBps, source: 'BASE' }

  try {
    const [policyRow, svc, grants] = await Promise.all([
      prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null),
      prisma.partnerService
        .findUnique({ where: { id: manufacturerServiceId }, select: { partner: { select: { tier: true, activatedAt: true } } } })
        .catch(() => null),
      prisma.manufacturerFeeGrant
        .findMany({ where: { partnerServiceId: manufacturerServiceId, revokedAt: null }, select: { feeBps: true, startsAt: true, endsAt: true, revokedAt: true } })
        .catch(() => [] as FeeGrantLike[]),
    ])

    const enabled = policyRow?.enabled ?? false
    const policy = policyRow
      ? { feeBpsByBadge: { VERIFIED: policyRow.verifiedFeeBps, TRUSTED: policyRow.trustedFeeBps, PREMIER: policyRow.premierFeeBps } }
      : DEFAULT_MERIT_POLICY
    const grace = {
      enabled: policyRow?.feeGraceEnabled ?? false,
      value: policyRow?.feeGraceValue ?? 0,
      unit: (policyRow?.feeGraceUnit ?? 'MONTHS') as GraceUnit,
      feeBps: policyRow?.feeGraceFeeBps ?? 0,
    }
    const badge = (svc?.partner.tier ?? 'VERIFIED') as MeritBadge
    const activePromo = resolveActivePromo({ now, activatedAt: svc?.partner.activatedAt ?? null, grace, manualGrants: grants as FeeGrantLike[] })

    const r = resolveManufacturerFeeBps({ baseProductionFeeBps: baseFeeBps, badge, policy, enabled, promoFeeBps: activePromo?.feeBps ?? null })
    return { feeBps: r.bps, source: r.source }
  } catch {
    return { feeBps: baseFeeBps, source: 'BASE' }
  }
}
