// REBUILD R14.c — shared subscription-tier helpers.
//
// One source of truth for tier comparisons across every surface that
// gates on creator plan (Studio Export, checkout Subscribe & save, order
// detail Get product support, future Stripe Subscription wiring).
//
// Tier shape mirrors the @ilaunchify/ui pricing-tier-data file so
// upgrade overlays + pricing pages render the same labels. Server-safe
// (no React, no client-only imports) so it can be called from server
// components, server actions, and middleware.

import { prisma } from '@ilaunchify/db'

/**
 * Display-tier keys — lowercase to match @ilaunchify/ui's `TierKey`. The
 * database stores the equivalent values as UPPERCASE enum members
 * (`SubscriptionTier`), so callers should map at the boundary.
 */
export type TierKey = 'maker' | 'builder' | 'agency'

/**
 * Rank order — higher number = more powerful tier. Comparators below
 * use this to answer "does this user meet at least tier X?".
 */
export const TIER_RANK: Record<TierKey, number> = {
  maker: 0,
  builder: 1,
  agency: 2,
}

/** All tier keys in ascending rank order. */
export const TIERS: readonly TierKey[] = ['maker', 'builder', 'agency'] as const

/**
 * Normalise a database `SubscriptionTier` enum value (UPPER) to the
 * display-tier key (lower). Falls back to 'maker' on unknown input so
 * callers never see an undefined tier.
 */
export function normalizeTier(
  dbValue: string | null | undefined,
): TierKey {
  switch ((dbValue ?? '').toUpperCase()) {
    case 'BUILDER':
      return 'builder'
    case 'AGENCY':
      return 'agency'
    case 'MAKER':
    default:
      return 'maker'
  }
}

/**
 * `true` when `current` meets or exceeds `required`. Use to gate
 * features without throwing — the call site decides how to render the
 * upgrade prompt (overlay, disabled button, hidden card, etc.).
 *
 * @example
 *   if (!hasTier(creatorTier, 'builder')) {
 *     return <UpgradeOverlay blockedAction="export" />
 *   }
 */
export function hasTier(current: TierKey, required: TierKey): boolean {
  return TIER_RANK[current] >= TIER_RANK[required]
}

/**
 * The next tier up from `current`, or `null` if the user is already on
 * the highest tier. Drives "Upgrade to X" CTAs without hard-coding the
 * ladder at each call site.
 */
export function nextTier(current: TierKey): TierKey | null {
  const idx = TIERS.indexOf(current)
  if (idx < 0 || idx >= TIERS.length - 1) return null
  return TIERS[idx + 1]!
}

/**
 * Load the subscription tier for a given creator user. Returns 'maker'
 * for users who haven't completed creator-profile onboarding (admin
 * impersonators, mid-signup users), keeping the gates honest without
 * crashing on missing rows.
 */
export async function getCreatorTier(userId: string): Promise<TierKey> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: { subscriptionTier: true },
  })
  return normalizeTier(profile?.subscriptionTier ?? null)
}
