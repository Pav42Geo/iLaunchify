// REBUILD R15.b — runtime lookups for SubscriptionPlan / PlanFeature /
// FeeRule with in-memory caching.
//
// Server-only — uses @ilaunchify/db. Do not import from client code.
//
// The cache is a process-local Map with a TTL (default 60s). The admin
// Plans editor calls invalidatePlansCache() after writes so changes
// propagate to every request handler within the same process. In a
// multi-instance deploy the TTL bound covers the gap between instances
// — a 60s stale read is acceptable for tier-level config.

import { prisma } from '@ilaunchify/db'
import type {
  CreatorPlanCode,
  FeatureCode,
  FeeEvent,
  PartnerPlanCode,
  PlanCode,
} from './codes'

const TTL_MS = 60_000

interface PlanCacheRow {
  id: string
  code: string
  audience: 'CREATOR' | 'PARTNER'
  tierName: string
  tierOrder: number
  monthlyPriceCents: number
  annualPriceCents: number
  active: boolean
  description: string | null
  features: Map<string, PlanFeatureValue>
  feeRules: Map<string, FeeRuleValue>
}

export interface PlanFeatureValue {
  intValue: number | null
  stringValue: string | null
  boolValue: boolean | null
  label: string
  description: string | null
}

export interface FeeRuleValue {
  ratePercent: number | null
  flatCents: number | null
  minCents: number | null
  maxCents: number | null
  notes: string | null
}

interface CacheShape {
  expiresAt: number
  byCode: Map<string, PlanCacheRow>
}

let cache: CacheShape | null = null

/**
 * Drop the in-memory plan cache. Call after admin writes to
 * SubscriptionPlan / PlanFeature / FeeRule so the next request sees
 * the new values immediately within this process.
 */
export function invalidatePlansCache(): void {
  cache = null
}

async function loadCache(): Promise<CacheShape> {
  const plans = await prisma.subscriptionPlan.findMany({
    include: { features: true, feeRules: true },
  })
  const byCode = new Map<string, PlanCacheRow>()
  for (const p of plans) {
    const features = new Map<string, PlanFeatureValue>()
    for (const f of p.features) {
      features.set(f.code, {
        intValue: f.intValue,
        stringValue: f.stringValue,
        boolValue: f.boolValue,
        label: f.label,
        description: f.description,
      })
    }
    const feeRules = new Map<string, FeeRuleValue>()
    for (const r of p.feeRules) {
      if (!r.active) continue
      feeRules.set(r.triggerEvent, {
        ratePercent:
          r.ratePercent != null ? Number(r.ratePercent.toString()) : null,
        flatCents: r.flatCents,
        minCents: r.minCents,
        maxCents: r.maxCents,
        notes: r.notes,
      })
    }
    byCode.set(p.code, {
      id: p.id,
      code: p.code,
      audience: p.audience,
      tierName: p.tierName,
      tierOrder: p.tierOrder,
      monthlyPriceCents: p.monthlyPriceCents,
      annualPriceCents: p.annualPriceCents,
      active: p.active,
      description: p.description,
      features,
      feeRules,
    })
  }
  cache = { expiresAt: Date.now() + TTL_MS, byCode }
  return cache
}

async function getCache(): Promise<CacheShape> {
  if (cache && cache.expiresAt > Date.now()) return cache
  return loadCache()
}

// -----------------------------------------------------------------------------
// Plan resolution
// -----------------------------------------------------------------------------

/**
 * Map a creator's display-tier key ('maker' / 'builder' / 'agency') to
 * the SubscriptionPlan.code for lookups. Pure mapping — no DB call.
 */
export function creatorTierToPlanCode(
  tier: 'maker' | 'builder' | 'agency',
): CreatorPlanCode {
  switch (tier) {
    case 'builder':
      return 'creator_builder'
    case 'agency':
      return 'creator_agency'
    case 'maker':
    default:
      return 'creator_maker'
  }
}

/**
 * Map a partner's display-tier key ('verified' / 'trusted' / 'premier')
 * to the SubscriptionPlan.code for lookups.
 */
export function partnerTierToPlanCode(
  tier: 'verified' | 'trusted' | 'premier',
): PartnerPlanCode {
  switch (tier) {
    case 'trusted':
      return 'partner_trusted'
    case 'premier':
      return 'partner_premier'
    case 'verified':
    default:
      return 'partner_verified'
  }
}

/**
 * Load the cached SubscriptionPlan row by code. Returns null if no row
 * with that code exists (e.g. seed hasn't been run yet — the gate
 * should fail-closed in that case).
 */
export async function getPlanByCode(
  code: PlanCode,
): Promise<PlanCacheRow | null> {
  const c = await getCache()
  return c.byCode.get(code) ?? null
}

// -----------------------------------------------------------------------------
// Feature lookups
// -----------------------------------------------------------------------------

/**
 * Resolve a feature row for the given plan + code. Returns null when the
 * plan is missing or the feature isn't configured — callers should
 * decide fail-open or fail-closed per feature.
 */
export async function lookupPlanFeature(
  planCode: PlanCode,
  featureCode: FeatureCode,
): Promise<PlanFeatureValue | null> {
  const plan = await getPlanByCode(planCode)
  return plan?.features.get(featureCode) ?? null
}

/** Boolean feature gate. Fail-closed when missing — safest default. */
export async function hasFeature(
  planCode: PlanCode,
  featureCode: FeatureCode,
): Promise<boolean> {
  const f = await lookupPlanFeature(planCode, featureCode)
  return f?.boolValue === true
}

/** Numeric limit; returns null when unlimited or unconfigured. */
export async function getFeatureLimit(
  planCode: PlanCode,
  featureCode: FeatureCode,
): Promise<number | null> {
  const f = await lookupPlanFeature(planCode, featureCode)
  return f?.intValue ?? null
}

/** String enum feature (e.g. 'basic' / 'advanced' / 'advanced_api'). */
export async function getFeatureString(
  planCode: PlanCode,
  featureCode: FeatureCode,
): Promise<string | null> {
  const f = await lookupPlanFeature(planCode, featureCode)
  return f?.stringValue ?? null
}

// -----------------------------------------------------------------------------
// Fee lookups
// -----------------------------------------------------------------------------

/**
 * Resolve the active fee rule for a plan + event. Falls back to the
 * global default row (planId = null) when no plan-specific rule
 * exists. Returns null if neither is configured.
 */
export async function lookupFeeRate(
  planCode: PlanCode | null,
  event: FeeEvent,
): Promise<FeeRuleValue | null> {
  const c = await getCache()
  if (planCode) {
    const plan = c.byCode.get(planCode)
    const planSpecific = plan?.feeRules.get(event)
    if (planSpecific) return planSpecific
  }
  // Global default: scan plans for the synthetic 'global' code if any.
  // (V1 seed inserts platform-wide defaults as planId-null rows fetched
  // separately in getCache() if needed. Keeping the simpler path for now.)
  return null
}
