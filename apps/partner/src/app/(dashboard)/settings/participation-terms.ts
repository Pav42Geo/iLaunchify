// Public Operator Terms — version + warning copy (plain module, importable by
// both the server action and the client UI). NOT a 'use server' file, so it can
// export constants. The terms themselves live in the signed partner agreement
// (docs/legal/PARTNER_AGREEMENT_DRAFT_v1.md §Public Operator Terms); this is just
// the version tag the clickwrap records + the warning shown at the switch.

/** Bump when the Public Operator Terms materially change. */
export const PUBLIC_OPERATOR_TERMS_VERSION = 'public-operator-v1-2026-07'

/** Plain-language warning shown before a partner enters open-market rotation. */
export const PUBLIC_MODE_WARNING_POINTS = [
  'Orders will be automatically assigned to you through rotation — you don’t choose each one.',
  'You’re expected to accept and fulfill assigned orders on time.',
  'Declines and missed/failed orders lower your standing and may carry penalties.',
  'Make sure your MOQ, monthly capacity, and lead times are accurate before continuing.',
  'You can switch back to Invited-only anytime — in-flight orders are still honored.',
] as const
