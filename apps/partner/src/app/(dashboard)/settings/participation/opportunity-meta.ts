// Group B marketplace opportunities a partner may REQUEST (plain data, no
// 'use server', so both the server action and the server page can import it).
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md. Group A identity/disclosure
// levers are partner-controlled elsewhere (publish + participation mode), so
// they are intentionally absent here.

import type { PartnerAccessLever } from '@ilaunchify/auth'

export interface OpportunityMeta {
  lever: PartnerAccessLever
  label: string
  desc: string
}

export const OPPORTUNITY_META: OpportunityMeta[] = [
  {
    lever: 'DISCOVERABILITY',
    label: 'Marketplace discoverability',
    desc: 'Be listed in marketplace search results.',
  },
  {
    lever: 'BRIEF_INTAKE',
    label: 'Creator brief intake',
    desc: 'Receive creator co-creation briefs in your opportunity pool.',
  },
  {
    lever: 'PRINT_ROTATION',
    label: 'Print rotation',
    desc: 'Be eligible for automated print-award rotation.',
  },
  {
    lever: 'CAPABILITY_RFQ',
    label: 'Capability RFQs & coverage',
    desc: 'Receive capability requests and print-coverage RFQs.',
  },
  {
    lever: 'NOMINATION_ELIGIBLE',
    label: 'Nomination eligibility',
    desc: 'Be nominated as a co-partner on other orders.',
  },
  {
    lever: 'SAMPLE_INTAKE',
    label: 'Sample order intake',
    desc: 'Accept sample orders from creators.',
  },
  {
    lever: 'QUOTE_MESSAGING',
    label: 'Quote requests & messaging',
    desc: 'Let creators request quotes and message you.',
  },
]

export const REQUESTABLE_LEVERS: PartnerAccessLever[] = OPPORTUNITY_META.map((m) => m.lever)
