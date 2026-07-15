// Partner Access & Opportunity resolver — the ONE pure decider for "is this
// lever on for this partner, and why". docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md.
//
// Composition order (a later step can only SUBTRACT):
//   master kill switch → per-partner override → global default → hard prerequisite
//
// Pure + dependency-free (no prisma) so it unit-tests trivially and runs in any
// bundle. A thin reader in @ilaunchify/db fetches the policy/override/facts and
// calls this; the admin console and the marketing route both reuse it.

export type AccessLeverState = 'INHERIT' | 'ALLOW' | 'DENY'

export type PartnerAccessLever =
  // Group A — identity & disclosure
  | 'PUBLIC_PROFILE'
  | 'PROFILE_SHARING'
  | 'NAMED_REVIEWS'
  | 'RATINGS_VISIBLE'
  | 'CERTS_VISIBLE'
  | 'MERIT_BADGE_VISIBLE'
  // Group B — marketplace opportunities
  | 'DISCOVERABILITY'
  | 'BRIEF_INTAKE'
  | 'PRINT_ROTATION'
  | 'CAPABILITY_RFQ'
  | 'NOMINATION_ELIGIBLE'
  | 'SAMPLE_INTAKE'
  | 'QUOTE_MESSAGING'

export type NamedReviewsAudience = 'paid' | 'any' | 'anonymous'

/** Global defaults + master switches (mirrors the PartnerAccessPolicy singleton). */
export interface AccessPolicy {
  publicProfilesEnabled: boolean
  discoverabilityEnabled: boolean
  defaultProfileVisibility: 'public' | 'invited' | 'off'
  namedReviewsAudience: NamedReviewsAudience
  defaultProfileSharing: boolean
  defaultBriefIntake: boolean
  defaultDiscoverable: boolean
  defaultPrintRotation: boolean
  defaultSampleIntake: boolean
}

/** A per-partner override row (mirrors PartnerAccessOverride). */
export interface AccessOverride {
  lever: PartnerAccessLever
  state: AccessLeverState
  value?: string | null
  expiresAt?: Date | null
}

/** Partner facts the prerequisites read (subtract-only gates). */
export interface PartnerFacts {
  status: string // 'ACTIVE' | 'DRAFT' | 'SUSPENDED' | …
  participationMode: 'PUBLIC' | 'INVITED_ONLY'
  profilePublished: boolean
  /** At least one ACTIVE MANUFACTURING/COPACKING service with FULL disclosure. */
  hasFullDisclosureNameable: boolean
  /** Pure print provider (no mfr/co-pack service) — rotation eligibility (locked rule). */
  isPurePrinter: boolean
  onboardingComplete: boolean
}

export type LeverSource = 'master' | 'override' | 'default' | 'prerequisite'

export interface LeverResolution {
  lever: PartnerAccessLever
  effective: boolean
  source: LeverSource
  /** Present only when a prerequisite or master switch forced it off. */
  blockedReason?: string
}

/** Master kill switch reason for a lever, or null when no master governs it. */
function masterBlock(lever: PartnerAccessLever, policy: AccessPolicy): string | null {
  if ((lever === 'PUBLIC_PROFILE' || lever === 'PROFILE_SHARING') && !policy.publicProfilesEnabled)
    return 'Public partner profiles are disabled platform-wide'
  if (lever === 'DISCOVERABILITY' && !policy.discoverabilityEnabled)
    return 'Marketplace discoverability is disabled platform-wide'
  return null
}

/** The global default (boolean) for a lever. */
function leverDefault(lever: PartnerAccessLever, policy: AccessPolicy): boolean {
  switch (lever) {
    case 'PUBLIC_PROFILE':
      // PARTNER-CONTROLLED (Pavel 2026-07-14): the partner's own opt-in — the
      // PUBLIC + published + FULL-disclosure prerequisites — decides visibility.
      // Default ON so the admin only ever SUBTRACTS (per-partner DENY for cause,
      // or the platform master switch). Admin never has to "approve" a partner.
      // policy.defaultProfileVisibility seeds a NEW partner's participation choice,
      // it does NOT gate an already-published partner here.
      return true
    case 'PROFILE_SHARING':
      return policy.defaultProfileSharing
    case 'BRIEF_INTAKE':
      return policy.defaultBriefIntake
    case 'DISCOVERABILITY':
      return policy.defaultDiscoverable
    case 'PRINT_ROTATION':
      // Reconciled with the rotation engine (Pavel 2026-07-14): a public PURE
      // printer is in the pool BY DEFAULT (the prerequisite gates pure-printer +
      // active). Default ON so admin only SUBTRACTS via DENY — which the override
      // action mirrors onto the existing PartnerService.excludeFromAutoRotation
      // flag the routing engine reads. policy.defaultPrintRotation is vestigial.
      return true
    case 'SAMPLE_INTAKE':
      return policy.defaultSampleIntake
    case 'NAMED_REVIEWS':
      // Boolean proxy — "are client names ever shown". Audience is resolved by
      // resolveNamedReviewsAudience(); named reviews are still tier-gated at read.
      return policy.namedReviewsAudience !== 'anonymous'
    case 'RATINGS_VISIBLE':
    case 'CERTS_VISIBLE':
    case 'MERIT_BADGE_VISIBLE':
    case 'CAPABILITY_RFQ':
    case 'NOMINATION_ELIGIBLE':
    case 'QUOTE_MESSAGING':
      return true
  }
}

/** Hard prerequisite reason (subtract-only) for a lever, or null when met. */
function prerequisiteBlock(lever: PartnerAccessLever, facts: PartnerFacts): string | null {
  const active = facts.status === 'ACTIVE'
  const publicLive =
    active &&
    facts.participationMode === 'PUBLIC' &&
    facts.profilePublished &&
    facts.hasFullDisclosureNameable

  switch (lever) {
    case 'PUBLIC_PROFILE':
      if (!active) return 'Partner is not ACTIVE'
      if (facts.participationMode !== 'PUBLIC') return 'Partner has not opted into PUBLIC mode'
      if (!facts.profilePublished) return 'Profile not published'
      if (!facts.hasFullDisclosureNameable) return 'No ACTIVE service with FULL disclosure'
      return null
    case 'PROFILE_SHARING':
    case 'RATINGS_VISIBLE':
    case 'CERTS_VISIBLE':
    case 'MERIT_BADGE_VISIBLE':
      return publicLive ? null : 'Public profile is not live'
    case 'PRINT_ROTATION':
      if (!active) return 'Partner is not ACTIVE'
      if (!facts.isPurePrinter) return 'Not a pure print provider (locked rule)'
      return null
    case 'DISCOVERABILITY':
    case 'BRIEF_INTAKE':
    case 'CAPABILITY_RFQ':
    case 'NOMINATION_ELIGIBLE':
    case 'SAMPLE_INTAKE':
    case 'QUOTE_MESSAGING':
      if (!active) return 'Partner is not ACTIVE'
      if (!facts.onboardingComplete) return 'Onboarding not complete'
      return null
    case 'NAMED_REVIEWS':
      return null // audience-gated at read time; no partner-side prerequisite
  }
}

/** Is an override live (set to a decision, not expired)? */
function overrideLive(override: AccessOverride | null | undefined, now: Date): boolean {
  if (!override || override.state === 'INHERIT') return false
  if (override.expiresAt && override.expiresAt.getTime() <= now.getTime()) return false
  return true
}

/**
 * Resolve one lever for a partner. Order: master → override → default →
 * prerequisite (subtract-only). Returns the effective boolean, the winning
 * source, and — when forced off — a human blockedReason for the admin UI.
 */
export function resolvePartnerOpportunity(
  lever: PartnerAccessLever,
  policy: AccessPolicy,
  facts: PartnerFacts,
  override?: AccessOverride | null,
  now: Date = new Date(),
): LeverResolution {
  const master = masterBlock(lever, policy)
  if (master) return { lever, effective: false, source: 'master', blockedReason: master }

  let wants: boolean
  let source: LeverSource
  if (overrideLive(override, now)) {
    wants = override!.state === 'ALLOW'
    source = 'override'
  } else {
    wants = leverDefault(lever, policy)
    source = 'default'
  }

  if (wants) {
    const blocked = prerequisiteBlock(lever, facts)
    if (blocked) return { lever, effective: false, source: 'prerequisite', blockedReason: blocked }
  }
  return { lever, effective: wants, source }
}

/**
 * Enum-valued resolution for named-reviews audience. A DENY forces anonymous; an
 * ALLOW with a value overrides the policy default; otherwise the policy wins.
 */
export function resolveNamedReviewsAudience(
  policy: AccessPolicy,
  override?: AccessOverride | null,
  now: Date = new Date(),
): NamedReviewsAudience {
  if (override && override.lever === 'NAMED_REVIEWS' && overrideLive(override, now)) {
    if (override.state === 'DENY') return 'anonymous'
    const v = override.value
    if (v === 'paid' || v === 'any' || v === 'anonymous') return v
  }
  return policy.namedReviewsAudience
}
