// Helpers for computing overall verification status from section rows.
// Pure functions — testable in isolation.

import type {
  PartnerVerificationSection,
  VerificationSectionStatus,
  VerificationSectionType,
} from '@prisma/client'

export const ALL_SECTIONS: VerificationSectionType[] = [
  'BUSINESS',
  'FACILITY',
  'DOCUMENTS',
  'PUBLIC_PROFILE',
]

export const SECTION_LABEL: Record<VerificationSectionType, string> = {
  BUSINESS: 'Business identity',
  FACILITY: 'Facility & capabilities',
  DOCUMENTS: 'Compliance documents',
  PUBLIC_PROFILE: 'Public profile',
}

export const SECTION_DESCRIPTION: Record<VerificationSectionType, string> = {
  BUSINESS:
    'Legal name, registration, address, certificate of incorporation, business license.',
  FACILITY:
    'Production capabilities, MOQ, lead time, facility photos.',
  DOCUMENTS:
    'FDA / cGMP certificate, general liability insurance, supporting compliance docs.',
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
