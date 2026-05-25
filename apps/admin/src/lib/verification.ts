// Helpers for computing overall verification status from section rows.
// Pure functions — testable in isolation.

import type {
  PartnerVerificationSection,
  VerificationSectionStatus,
  VerificationSectionType,
} from '@prisma/client'

// 5-section model — extended 2026-05-25 with OPERATIONAL_STANDARDS for the
// 5-layer onboarding model (docs/PARTNER_ONBOARDING.md §2 + §7.4).
// Order matters: the queue UI renders sections in this order, matching the
// partner accordion's section order (Your business → Your company → What you
// can do → Payment & contract).
export const ALL_SECTIONS: VerificationSectionType[] = [
  'BUSINESS',
  'FACILITY',
  'DOCUMENTS',
  'OPERATIONAL_STANDARDS',
  'PUBLIC_PROFILE',
]

export const SECTION_LABEL: Record<VerificationSectionType, string> = {
  BUSINESS: 'Business identity',
  FACILITY: 'Capabilities & facility',
  DOCUMENTS: 'Compliance documents',
  OPERATIONAL_STANDARDS: 'Operational standards & contract',
  PUBLIC_PROFILE: 'Public profile',
}

export const SECTION_DESCRIPTION: Record<VerificationSectionType, string> = {
  BUSINESS:
    'Legal name, registration, address, certificate of incorporation, business license.',
  FACILITY:
    'Production capabilities, MOQ, lead time, facility photos.',
  DOCUMENTS:
    'FDA / cGMP certificate, general liability insurance, supporting compliance docs.',
  OPERATIONAL_STANDARDS:
    'Contract version + signer, payout terms, Stripe Connect status, V1 default standards.',
  PUBLIC_PROFILE:
    'Logo, public-facing brand info, verified badge readiness.',
}

export type OverallStatus = 'PENDING' | 'VERIFIED' | 'NEEDS_CHANGES' | 'REJECTED'

/**
 * Compute overall verification status from per-section statuses.
 * Precedence (matches FOD's `computeOverallStatus`):
 *   - any REJECTED      → REJECTED
 *   - any NEEDS_CHANGES → NEEDS_CHANGES
 *   - all sections VERIFIED → VERIFIED
 *   - else → PENDING
 *
 * Sections that don't exist in the DB yet are treated as PENDING.
 */
export function computeOverallStatus(
  sections: Pick<PartnerVerificationSection, 'type' | 'status'>[],
): OverallStatus {
  const byType = new Map<VerificationSectionType, VerificationSectionStatus>()
  for (const s of sections) byType.set(s.type, s.status)

  // Fill in defaults
  for (const t of ALL_SECTIONS) if (!byType.has(t)) byType.set(t, 'PENDING')

  const statuses = [...byType.values()]
  if (statuses.includes('REJECTED')) return 'REJECTED'
  if (statuses.includes('NEEDS_CHANGES')) return 'NEEDS_CHANGES'
  if (statuses.every((s) => s === 'VERIFIED')) return 'VERIFIED'
  return 'PENDING'
}

/**
 * Tailwind class snippets for status badges.
 */
export function statusBadgeClass(status: VerificationSectionStatus | OverallStatus): string {
  switch (status) {
    case 'VERIFIED':
      return 'bg-green-50 text-green-700 ring-1 ring-green-200'
    case 'NEEDS_CHANGES':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'REJECTED':
      return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    case 'PENDING':
    default:
      return 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200'
  }
}
