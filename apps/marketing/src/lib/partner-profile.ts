// Public partner profile ("Front Face") — readers + visibility gate.
// design/partner-profile-prototype-v2.html · Pavel 2026-07-12.
//
// The orchestration thesis anonymizes manufacturers BY DEFAULT. A partner is
// named (and their profile reachable) only when EVERY gate passes:
//   1. PartnerProfileSetting.enabled (admin kill switch)
//   2. viewer's creator tier ≥ PartnerProfileSetting.minCreatorTier (admin dial:
//      maker = everyone, builder = Builder+Agency, agency = Agency only)
//   3. the partner runs a MANUFACTURING or COPACKING service (pure printers
//      keep their existing PDP provider cards — never this surface)
//   4. that service's disclosureLevel is FULL (the partner's own opt-in;
//      ANONYMOUS/CITY_STATE partners are never named)
//   5. partner is ACTIVE, participationMode PUBLIC, and has published a profile
//      (slug + profilePublishedAt) — for the profile route itself.
//
// All reads are fail-soft (pre-db:push clients render the anonymous badge).

import { getPartnerAccessContextBySlug, getPartnerAccessPolicy, prisma } from '@ilaunchify/db'
import {
  hasTier,
  normalizeTier,
  resolveNamedReviewsAudience,
  resolvePartnerOpportunity,
  type AccessLeverState,
  type AccessOverride,
  type AccessPolicy,
  type PartnerFacts,
  type TierKey,
} from '@ilaunchify/auth'

export interface PartnerProfileGate {
  enabled: boolean
  minCreatorTier: TierKey
}

/** Admin visibility switch (singleton, fail-soft default: enabled, Agency-only). */
export async function getPartnerProfileGate(): Promise<PartnerProfileGate> {
  try {
    const row = await prisma.partnerProfileSetting.findUnique({ where: { id: 'singleton' } })
    return {
      enabled: row?.enabled ?? true,
      minCreatorTier: normalizeTier(row?.minCreatorTier ?? 'agency'),
    }
  } catch {
    // Table pre-dates db:push — default to the conservative gate.
    return { enabled: true, minCreatorTier: 'agency' }
  }
}

/** Can this viewer tier see partner names/profiles at all? */
export function canViewPartnerProfiles(viewerTier: TierKey, gate: PartnerProfileGate): boolean {
  return gate.enabled && hasTier(viewerTier, gate.minCreatorTier)
}

// ---------------------------------------------------------------------------
// Resolver-driven access (Partner Access console) — the levers now GOVERN the
// public profile. docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md.
//   • PUBLIC_PROFILE lever   → whether the page renders at all (master switch,
//     per-partner override, and the PUBLIC+published+FULL prerequisites)
//   • NAMED_REVIEWS audience → whether real client names show (paid/any/anon)
//   • PROFILE_SHARING lever  → whether the Share control appears (paid only)
// ---------------------------------------------------------------------------

export interface ProfileAccess {
  /** PUBLIC_PROFILE lever effective — the profile route renders (else notFound). */
  visible: boolean
  /** Reviews show real client names (audience gate met for this viewer). */
  named: boolean
  /** Show the Share control (paid viewer + PROFILE_SHARING lever on). */
  canShare: boolean
}

export async function resolvePartnerProfileAccess(args: {
  slug: string
  viewerTier: TierKey
  isAuthenticated: boolean
}): Promise<ProfileAccess> {
  const [policy, ctx] = await Promise.all([
    getPartnerAccessPolicy(),
    getPartnerAccessContextBySlug(args.slug),
  ])
  if (!ctx) return { visible: false, named: false, canShare: false }

  const facts: PartnerFacts = {
    status: ctx.status,
    participationMode: ctx.participationMode === 'PUBLIC' ? 'PUBLIC' : 'INVITED_ONLY',
    profilePublished: ctx.profilePublished,
    hasFullDisclosureNameable: ctx.hasFullDisclosureNameable,
    isPurePrinter: ctx.isPurePrinter,
    onboardingComplete: ctx.onboardingComplete,
  }
  const override = (lever: AccessOverride['lever']): AccessOverride | null => {
    const r = ctx.overrides.find((o) => o.lever === lever)
    return r
      ? { lever, state: r.state as AccessLeverState, value: r.value, expiresAt: r.expiresAt }
      : null
  }

  const visible = resolvePartnerOpportunity(
    'PUBLIC_PROFILE',
    policy as AccessPolicy,
    facts,
    override('PUBLIC_PROFILE'),
  ).effective
  const sharingOn = resolvePartnerOpportunity(
    'PROFILE_SHARING',
    policy as AccessPolicy,
    facts,
    override('PROFILE_SHARING'),
  ).effective

  const audience = resolveNamedReviewsAudience(policy as AccessPolicy, override('NAMED_REVIEWS'))
  const isPaid = hasTier(args.viewerTier, normalizeTier(policy.minCreatorTierForIdentity))
  const named =
    audience === 'anonymous' ? false : audience === 'any' ? args.isAuthenticated : isPaid

  return { visible, named, canShare: named && isPaid && sharingOn }
}

const NAMEABLE_SERVICE_TYPES = ['MANUFACTURING', 'COPACKING'] as const

// ---------------------------------------------------------------------------
// PDP — manufacturer identity line ("Manufacturer: {name} [badge]")
// ---------------------------------------------------------------------------

export interface ManufacturerIdentity {
  /** Display name — only set when every gate passed. */
  name: string
  /** Public profile href (same-app) — only when the partner published one. */
  href: string | null
  badge: 'TRUSTED' | 'PREMIER' | null
}

/**
 * Resolve the named manufacturer for a template slug, or null when any gate
 * fails (caller falls back to the anonymous badge line). `viewerTier` comes
 * from the PDP's existing session read; anonymous visitors never see names.
 */
export async function getManufacturerIdentity(
  templateSlug: string,
  viewerTier: TierKey,
  isAuthenticated: boolean,
): Promise<ManufacturerIdentity | null> {
  if (!isAuthenticated) return null
  try {
    const gate = await getPartnerProfileGate()
    if (!canViewPartnerProfiles(viewerTier, gate)) return null

    const t = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        manufacturerService: {
          select: {
            type: true,
            disclosureLevel: true,
            partner: {
              select: {
                companyName: true,
                slug: true,
                tier: true,
                status: true,
                participationMode: true,
                profilePublishedAt: true,
              },
            },
          },
        },
      },
    })
    const svc = t?.manufacturerService
    const p = svc?.partner
    if (!svc || !p) return null
    if (!NAMEABLE_SERVICE_TYPES.includes(svc.type as (typeof NAMEABLE_SERVICE_TYPES)[number]))
      return null
    if (svc.disclosureLevel !== 'FULL') return null // partner's own opt-in wins
    if (p.status !== 'ACTIVE') return null
    const badge = p.tier === 'TRUSTED' || p.tier === 'PREMIER' ? p.tier : null
    const profileLive =
      p.participationMode === 'PUBLIC' && Boolean(p.slug) && Boolean(p.profilePublishedAt)
    return { name: p.companyName, href: profileLive ? `/partners/${p.slug}` : null, badge }
  } catch {
    return null // pre-push client / any read error → anonymous badge
  }
}

// ---------------------------------------------------------------------------
// Front Face — full profile read: moved to @ilaunchify/db (shared with the
// partner app's /profile preview, Pavel 2026-07-12). Re-exported for callers.
// ---------------------------------------------------------------------------

export {
  getPartnerProfile,
  type PartnerProfileVM,
  type ProfileServiceVM,
  type ProfileReviewVM,
} from '@ilaunchify/db'
