// Nomination (D7) terms version + consent copy (plain module — importable by the
// server action and the client UI; NOT a 'use server' file). The binding terms
// live in the partner agreement §6 (docs/legal/PARTNER_AGREEMENT_DRAFT_v1.md);
// this is the version the clickwrap consent records + the responsibility notice.

/** Bump when the nomination-responsibility terms materially change. */
export const NOMINATION_TERMS_VERSION = 'nomination-v1-2026-07'

/** Plain-language responsibility notice shown before a manufacturer nominates. */
export const NOMINATION_CONSENT_POINTS = [
  'You are directing a specific partner for this leg, overriding automated routing.',
  'You accept responsibility for your directed choice to the extent a defect stems from that choice.',
  'The nominated partner is still independently bound by all platform compliance, quality, and insurance requirements.',
  'iLaunchify may reject or reroute the nomination for capacity, compliance, quality, risk, or legal reasons.',
] as const
