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

import { prisma } from '@ilaunchify/db'
import { hasTier, normalizeTier, type TierKey } from '@ilaunchify/auth'

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
