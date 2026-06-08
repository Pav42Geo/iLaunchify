// Pure ownership decision logic — docs/SECURITY_ARCHITECTURE.md Tier 1.1.
//
// ZERO imports on purpose: this module holds the authorization decisions and
// nothing else, so ownership.test.ts can execute it standalone (no Prisma, no
// next/*) and the DB-bound guards in ownership.ts stay thin fetch wrappers.

export type PartnerActorReason = 'NOT_A_PARTNER' | 'PARTNER_NOT_FOUND'

export function decidePartnerActor(input: {
  role: string
  hasPartnerRow: boolean
}): { allowed: true } | { allowed: false; reason: PartnerActorReason } {
  if (input.role !== 'PARTNER') return { allowed: false, reason: 'NOT_A_PARTNER' }
  if (!input.hasPartnerRow) return { allowed: false, reason: 'PARTNER_NOT_FOUND' }
  return { allowed: true }
}

export type TemplateAccessReason =
  | PartnerActorReason
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_REJECTED'
  | 'NOT_YOUR_TEMPLATE'

export function decideTemplateAccess(input: {
  role: string
  requesterPartnerId: string | null
  template: {
    exists: boolean
    status: string | null
    /** PartnerId owning the manufacturerService; null when unresolvable. */
    ownerPartnerId: string | null
    /** Whether manufacturerServiceId is set at all. */
    hasManufacturerService: boolean
  }
}): { allowed: true } | { allowed: false; reason: TemplateAccessReason } {
  if (input.role !== 'PARTNER') return { allowed: false, reason: 'NOT_A_PARTNER' }
  if (!input.requesterPartnerId) return { allowed: false, reason: 'PARTNER_NOT_FOUND' }
  if (!input.template.exists) return { allowed: false, reason: 'TEMPLATE_NOT_FOUND' }
  if (input.template.status === 'REJECTED') {
    return { allowed: false, reason: 'TEMPLATE_REJECTED' }
  }
  // Historical card-actions semantics: a template with no manufacturerService
  // is editable (pre-routing draft); one with a service must belong to the
  // requester. A dangling service (set but owner unresolvable) DENIES —
  // fail closed when ownership can't be proven.
  if (
    input.template.hasManufacturerService &&
    input.template.ownerPartnerId !== input.requesterPartnerId
  ) {
    return { allowed: false, reason: 'NOT_YOUR_TEMPLATE' }
  }
  return { allowed: true }
}
