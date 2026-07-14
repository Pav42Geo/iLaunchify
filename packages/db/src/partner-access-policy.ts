// Global Partner Access & Opportunity policy reader (Pavel 2026-07-14).
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md §4. The admin tunes the
// PartnerAccessPolicy singleton (defaults every partner inherits + master kill
// switches); the resolver (@ilaunchify/auth resolvePartnerOpportunity) composes
// it with per-partner overrides + prerequisites.
//
// Cast-guarded + fail-soft: the model lands on the generated client only after
// db:push/generate; a missing row falls back to the decided defaults — so this
// is always safe to call, even pre-migration.

import { prisma } from './index'

export type ProfileVisibility = 'public' | 'invited' | 'off'
export type NamedReviewsAudience = 'paid' | 'any' | 'anonymous'
export type IdentityTier = 'maker' | 'builder' | 'agency'

export interface PartnerAccessPolicyValues {
  // Master switches (platform-wide)
  publicProfilesEnabled: boolean
  discoverabilityEnabled: boolean
  // Group A — identity & disclosure defaults
  defaultProfileVisibility: ProfileVisibility
  namedReviewsAudience: NamedReviewsAudience
  minCreatorTierForIdentity: IdentityTier
  defaultProfileSharing: boolean
  // Group B — marketplace opportunity defaults
  defaultBriefIntake: boolean
  defaultDiscoverable: boolean
  defaultPrintRotation: boolean
  defaultSampleIntake: boolean
}

export const PARTNER_ACCESS_POLICY_DEFAULTS: PartnerAccessPolicyValues = {
  publicProfilesEnabled: true,
  discoverabilityEnabled: true,
  defaultProfileVisibility: 'invited',
  namedReviewsAudience: 'paid',
  minCreatorTierForIdentity: 'agency',
  defaultProfileSharing: true,
  defaultBriefIntake: true,
  defaultDiscoverable: true,
  defaultPrintRotation: false,
  defaultSampleIntake: true,
}

export async function getPartnerAccessPolicy(): Promise<PartnerAccessPolicyValues> {
  try {
    const row = await (
      prisma as unknown as {
        partnerAccessPolicy: {
          findUnique: (a: unknown) => Promise<Partial<PartnerAccessPolicyValues> | null>
        }
      }
    ).partnerAccessPolicy
      .findUnique({
        where: { id: 'singleton' },
        select: {
          publicProfilesEnabled: true,
          discoverabilityEnabled: true,
          defaultProfileVisibility: true,
          namedReviewsAudience: true,
          minCreatorTierForIdentity: true,
          defaultProfileSharing: true,
          defaultBriefIntake: true,
          defaultDiscoverable: true,
          defaultPrintRotation: true,
          defaultSampleIntake: true,
        },
      })
      .catch(() => null)
    return row ? { ...PARTNER_ACCESS_POLICY_DEFAULTS, ...row } : PARTNER_ACCESS_POLICY_DEFAULTS
  } catch {
    return PARTNER_ACCESS_POLICY_DEFAULTS
  }
}
