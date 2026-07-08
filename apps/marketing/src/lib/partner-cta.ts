// Partner CTA resolver — docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §7.
//
// The public-facing "join as a partner" call-to-action swaps its label + target
// based on the admin PartnerAccessMode switch:
//   PRIVATE (invite-only beta) → "Become a partner — talk to our team" → the
//     application form (creates a LEAD in /admin/leads; no account created)
//   PUBLIC (open signup)        → "Sign up" / "Start onboarding" → /signup
//
// Pure + dependency-free so it's shared/testable and safe in any bundle. The
// mode comes from the `PartnerAccessMode` admin setting (wired separately); this
// module only maps mode + placement → the CTA. Keeping the copy here means every
// button/link stays consistent when the switch flips.

export type PartnerAccessMode = 'PRIVATE' | 'PUBLIC'

/** Where the CTA renders — affects wording + visual weight, not the destination logic. */
export type PartnerCtaPlacement = 'primary' | 'nav' | 'footer'

export interface PartnerCta {
  label: string
  href: string
  /** Render hint for the design system: a black/pink pill vs a plain text link. */
  style: 'pill' | 'link'
  /** True in PRIVATE mode — callers can show a subtle "invite-only" affordance. */
  inviteOnly: boolean
}

// Route targets (relative; wrap with marketingUrl() at the call site if crossing apps).
export const PARTNER_APPLY_HREF = '/partners/apply' // PRIVATE → application form → LEAD
export const PARTNER_SIGNUP_HREF = '/signup' // PUBLIC → real signup

const LABELS: Record<PartnerAccessMode, Record<PartnerCtaPlacement, string>> = {
  PRIVATE: {
    primary: 'Become a partner — talk to our team',
    nav: 'Become a partner',
    footer: 'Apply to join',
  },
  PUBLIC: {
    primary: 'Start onboarding',
    nav: 'Sign up',
    footer: 'Sign up',
  },
}

/**
 * Resolve the partner CTA for a given access mode + placement. Deterministic and
 * total — every (mode, placement) yields a valid CTA.
 */
export function partnerCta(
  mode: PartnerAccessMode,
  placement: PartnerCtaPlacement = 'primary',
): PartnerCta {
  const isPrivate = mode === 'PRIVATE'
  return {
    label: LABELS[mode][placement],
    href: isPrivate ? PARTNER_APPLY_HREF : PARTNER_SIGNUP_HREF,
    style: placement === 'footer' ? 'link' : 'pill',
    inviteOnly: isPrivate,
  }
}

/** Safe default until the admin setting is loaded (fails closed to invite-only). */
export const DEFAULT_PARTNER_ACCESS_MODE: PartnerAccessMode = 'PRIVATE'
