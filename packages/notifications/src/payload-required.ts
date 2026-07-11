// Required-payload registry — in-app P1 (docs/IN_APP_NOTIFICATIONS_AUDIT.md §5 item 6).
//
// TemplateData shapes are compile-time only; a dispatch call built from a
// spread or `as` cast can pass the wrong keys and the template then renders
// "undefined" into user-facing copy without anyone noticing. This map lists
// the REQUIRED (non-optional) keys per event so the dispatcher can warn
// loudly at the seam. Validation never blocks delivery — notification
// plumbing must not break business operations (house policy).
//
// Keys are compile-checked against TemplateData (must exist on the payload
// shape); keep entries in sync when a template's required fields change.
// (zod was considered; not a dependency of this package, and existence checks
// at the dispatch seam catch the actual failure mode.)

import type { NotificationEvent } from '@ilaunchify/db'
import type { TemplateData } from './templates'

export const REQUIRED_PAYLOAD_KEYS: {
  [E in NotificationEvent]: readonly (keyof TemplateData[E] & string)[]
} = {
  ORDER_CANCELLATION_REQUESTED: ['orderId'],
  ORDER_DISPUTE_OPENED: ['orderId'],
  // Coverage batch 2026-07-06 (de-cast after push).
  PARTNER_TEAM_MEMBER_JOINED: ['memberName'],
  CREATOR_CHANNEL_CONNECTED: ['channelName'],
  CREATOR_CHANNEL_DISCONNECTED: ['channelName'],
  SECTION_VERIFIED: ['sectionType'],
  SECTION_NEEDS_CHANGES: ['sectionType'],
  PARTNER_ACTIVATED: [],
  PARTNER_INVITED: [],
  NOMINATION_SERVICE_MISMATCH: [],
  PARTNER_APPLICATION_RECEIVED: [],
  BRIEF_INTEREST_RECEIVED: ['briefId', 'briefTitle'],
  BRIEF_INTEREST_SHORTLISTED: ['briefTitle'],
  BRIEF_INTEREST_SELECTED: ['briefTitle'],
  BRIEF_INTEREST_PASSED: ['briefTitle'],
  BUILD_OBJECT_SUBMITTED: ['roomId', 'objectKind'],
  BUILD_OBJECT_CHANGES_REQUESTED: ['roomId', 'objectKind'],
  BUILD_OBJECT_APPROVED: ['roomId', 'objectKind'],
  MILESTONE_TERMS_PROPOSED: ['roomId', 'milestoneKind', 'amount'],
  MILESTONE_TERMS_AGREED: ['roomId', 'milestoneKind'],
  MILESTONE_TERMS_DECLINED: ['roomId', 'milestoneKind'],
  PACKAGING_APPROVED: ['name'],
  PACKAGING_REJECTED: ['name'],
  DISPATCH_RECEIVED: ['orderId', 'type'],
  DISPATCH_ACCEPT_REMINDER: ['dispatchId', 'hoursRemaining'],
  PARTNER_ORDER_DISPUTED: ['orderId'],
  CREATOR_PAYMENT_FAILED: ['graceUntil'],
  CREATOR_SUBSCRIPTION_DOWNGRADED: [],
  PARTNER_APPLIED: ['companyName', 'partnerEmail', 'partnerId'],
  PARTNER_SUBMITTED: ['companyName', 'partnerId'],
  ORDER_NEEDS_ATTENTION: ['orderId', 'status'],
  CREATOR_DISPATCH_ACCEPTED: ['orderId', 'partnerName', 'dispatchType'],
  CREATOR_DISPATCH_CHANGES_REQUESTED: ['orderId', 'partnerName', 'dispatchType', 'flaggedFieldCount'],
  CREATOR_DISPATCH_DECLINED: ['orderId', 'partnerName', 'dispatchType'],
  CREATOR_DISPATCH_WITHDRAWN: ['orderId', 'partnerName', 'dispatchType'],
  CREATOR_ORDER_FULLY_ACCEPTED: ['orderId', 'partnerCount'],
  CREATOR_ORDER_CANCELLED_BY_MANUFACTURER: ['orderId', 'partnerName'],
  ADMIN_ORDER_CANCELLED_BY_MANUFACTURER: ['orderId', 'manufacturerName'],
  ADMIN_DISPATCH_WITHDRAWN: ['orderId', 'dispatchId', 'partnerName', 'dispatchType'],
  CERT_EXPIRING_SOON: ['instanceId', 'certName', 'daysRemaining', 'expiryDate'],
  CERT_EXPIRED: ['instanceId', 'certName', 'expiryDate', 'affectedProductCount'],
  ADMIN_CERT_EXPIRED_ON_PUBLISHED: ['instanceId', 'certName', 'companyName', 'affectedProductCount', 'creatorNames'],
  CREATOR_ORDER_CANCELLED: ['orderId'],
  CREATOR_ORDER_DISPUTE_RESOLVED: ['orderId', 'decision'],
  PARTNER_CANCELLATION_REVIEWED: ['orderId', 'decision'],
  SUPPORT_TICKET_CREATED: ['ticketId', 'subject', 'href'],
  SUPPORT_TICKET_REPLIED: ['ticketId', 'subject', 'href'],
  SUPPORT_TICKET_RESOLVED: ['ticketId', 'subject', 'href'],
  SUPPORT_TICKET_REOPENED: ['ticketId', 'subject', 'href'],
  SUPPORT_SLA_BREACHED: ['ticketId', 'subject', 'href'],
  SUPPORT_REFUND_REQUESTED: ['orderId', 'amountCents', 'href'],
  INBOUND_ASSIGNED: ['dispatchId', 'orderRef'],
  INBOUND_DELIVERED_UNCONFIRMED: ['dispatchId', 'orderRef'],
  RECEIVING_DISCREPANCY_OPENED: ['orderRef', 'summary', 'href'],
  RECEIVING_DISCREPANCY_RESOLVED: ['orderRef', 'href'],
  DISPATCH_SLA_AT_RISK: ['dispatchId', 'hoursWaiting', 'hoursRemaining'],
  DOC_EXPIRING_SOON: ['docLabel', 'daysLeft', 'href'],
  DOC_EXPIRED: ['docLabel', 'href'],
  RELEASE_SHIP_SLA_AT_RISK: ['orderRef', 'daysWaiting'],
  CREATOR_PROOF_AWAITING: ['orderId', 'orderRef', 'version'],
  PROOF_APPROVED: ['dispatchId', 'orderRef', 'version'],
  PROOF_REJECTED: ['dispatchId', 'orderRef', 'version'],
  CREATOR_STOCK_ALERT: [],
  CREATOR_RATE_PARTNERS: ['orderId', 'partnerCount'],
  CREATOR_DISPATCH_PROGRESS: ['orderId', 'partnerName', 'kind', 'summary'],
  CREATOR_SAMPLE_VERDICT: ['orderId'],
  PARTNER_CAPABILITY_RFQ: ['packagingLabel', 'href'],
  COVERAGE_RESTORED: ['productName', 'href'],
  MANUFACTURER_FEE_GRANT_STARTED: ['feePct', 'endsAt', 'href'],
}

/**
 * Returns the missing required keys for an event's payload (empty = valid).
 * `undefined` and `null` both count as missing — templates would print them.
 */
export function missingPayloadKeys(
  event: NotificationEvent,
  data: Record<string, unknown>,
): string[] {
  const required = REQUIRED_PAYLOAD_KEYS[event] ?? []
  return required.filter((k) => data[k] === undefined || data[k] === null)
}
