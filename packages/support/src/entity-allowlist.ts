// Entity-link allow-list (docs/SUPPORT_TICKETING_PLAN.md Appendix).
//
// A ticket may optionally point at one platform entity ("this is about Order
// X"). We allow-list the entityType values at the service layer rather than
// accepting any string — an open entityType is an injection / data-leak vector
// (a crafted ticket could claim to be "about" an internal table).

export const LINKABLE_ENTITY_TYPES = [
  'Order',
  'OrderDispatch',
  'OrderItem',
  'Brand',
  'CreatorProfile',
  'Partner',
] as const

export type LinkableEntityType = (typeof LINKABLE_ENTITY_TYPES)[number]

export function isLinkableEntityType(value: string): value is LinkableEntityType {
  return (LINKABLE_ENTITY_TYPES as readonly string[]).includes(value)
}

export class EntityLinkError extends Error {
  constructor(public readonly entityType: string) {
    super(`Entity type "${entityType}" is not linkable to a support ticket`)
    this.name = 'EntityLinkError'
  }
}

/** Throws EntityLinkError if entityType isn't on the V1 allow-list. */
export function assertLinkableEntityType(value: string): asserts value is LinkableEntityType {
  if (!isLinkableEntityType(value)) {
    throw new EntityLinkError(value)
  }
}
