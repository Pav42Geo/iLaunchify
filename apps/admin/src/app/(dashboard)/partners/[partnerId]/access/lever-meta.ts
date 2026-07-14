// Lever catalog metadata for the per-partner Access & Opportunity tab.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md §2. Plain data (no 'use client',
// no server deps) so both the server page and the client controls can import it.

import type { PartnerAccessLever } from '@ilaunchify/auth'

export type LeverKind = 'bool' | 'audience'

export interface LeverMeta {
  lever: PartnerAccessLever
  label: string
  desc: string
  group: 'A' | 'B'
  kind: LeverKind
  superOnly?: boolean
}

export const LEVERS: LeverMeta[] = [
  // Group A — identity & disclosure
  {
    lever: 'PUBLIC_PROFILE',
    label: 'Public profile',
    desc: 'Profile is publicly viewable & shareable (partner opt-in).',
    group: 'A',
    kind: 'bool',
    superOnly: true,
  },
  {
    lever: 'PROFILE_SHARING',
    label: 'Profile sharing',
    desc: 'Share button + public link active for the partner.',
    group: 'A',
    kind: 'bool',
  },
  {
    lever: 'NAMED_REVIEWS',
    label: 'Named reviews audience',
    desc: 'Who sees the real client name on reviews.',
    group: 'A',
    kind: 'audience',
  },
  {
    lever: 'RATINGS_VISIBLE',
    label: 'Ratings & reviews visible',
    desc: 'Show the reviews block publicly.',
    group: 'A',
    kind: 'bool',
  },
  {
    lever: 'CERTS_VISIBLE',
    label: 'Certifications visible',
    desc: 'Show certifications publicly.',
    group: 'A',
    kind: 'bool',
  },
  {
    lever: 'MERIT_BADGE_VISIBLE',
    label: 'Merit badge visible',
    desc: 'Show the earned tier badge (never the fee).',
    group: 'A',
    kind: 'bool',
  },
  // Group B — marketplace opportunities
  {
    lever: 'DISCOVERABILITY',
    label: 'Discoverability',
    desc: 'Listed in marketplace search.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'BRIEF_INTAKE',
    label: 'Creator brief intake',
    desc: 'Eligible for the co-creation Brief opportunity pool.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'PRINT_ROTATION',
    label: 'Print rotation',
    desc: 'Eligible for Smart Rotation awards.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'CAPABILITY_RFQ',
    label: 'Capability RFQ / coverage',
    desc: 'Eligible for capability RFQs + print coverage.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'NOMINATION_ELIGIBLE',
    label: 'Nomination eligibility',
    desc: 'Can be nominated as a co-partner.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'SAMPLE_INTAKE',
    label: 'Sample order intake',
    desc: 'Accepts sample orders.',
    group: 'B',
    kind: 'bool',
  },
  {
    lever: 'QUOTE_MESSAGING',
    label: 'Quote requests / messaging',
    desc: 'Creators may request a quote / message.',
    group: 'B',
    kind: 'bool',
  },
]
