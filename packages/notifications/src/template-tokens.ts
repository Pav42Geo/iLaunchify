// `{{token}}` substitution + the per-event token palette
// (docs/EMAIL_NOTIFICATION_CENTER.md — the Liquid-variable equivalent).
//
// Admin-authored subject/body overrides reference typed payload keys as
// `{{orderRef}}`-style tokens. The palette tells the admin editor which tokens
// each event supports (click-to-insert); substitution fills them at send time.
// Pure module — no I/O.

import type { NotificationEvent } from '@ilaunchify/db'
import type { TemplateData } from './templates'

const TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

/** Render one payload value for embedding in text. */
function stringify(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(stringify).join(', ')
  return JSON.stringify(v)
}

/**
 * Replace every `{{key}}` with the payload value (missing/null keys → '').
 * Values are inserted as plain text — HTML-escaping is the renderer's job
 * (the resolver escapes AFTER substitution, so payload values can never
 * inject markup).
 */
export function substituteTokens(
  template: string,
  payload: Record<string, unknown>,
): string {
  return template.replace(TOKEN_RE, (_m, key: string) => stringify(payload[key]))
}

/** List the distinct token names referenced by a template string, in order. */
export function extractTokens(template: string): string[] {
  const seen = new Set<string>()
  for (const m of template.matchAll(TOKEN_RE)) {
    if (m[1]) seen.add(m[1])
  }
  return [...seen]
}

/** Token names in `template` that the event's payload does NOT provide. */
export function unknownTokens(template: string, event: NotificationEvent): string[] {
  const palette = new Set<string>(tokenPaletteForEvent(event))
  return extractTokens(template).filter((t) => !palette.has(t))
}

/**
 * Per-event token palette. The mapped type ties every entry to the REAL payload
 * keys of that event (`keyof TemplateData[E]`) — a typo or a key that no longer
 * exists fails the type-check. Keep each list complete: it drives the admin
 * editor's click-to-insert palette.
 */
export const EVENT_TOKEN_PALETTE: {
  [E in NotificationEvent]: readonly (keyof TemplateData[E] & string)[]
} = {
  SECTION_VERIFIED: ['sectionType', 'companyName'],
  SECTION_NEEDS_CHANGES: ['sectionType', 'companyName', 'notes'],
  PARTNER_ACTIVATED: ['companyName'],
  PACKAGING_APPROVED: ['name', 'category'],
  PACKAGING_REJECTED: ['name', 'notes'],
  DISPATCH_RECEIVED: ['orderId', 'brandName', 'type'],
  DISPATCH_ACCEPT_REMINDER: ['dispatchId', 'hoursRemaining'],
  PARTNER_ORDER_DISPUTED: ['orderId'],
  CREATOR_PAYMENT_FAILED: ['graceUntil'],
  CREATOR_SUBSCRIPTION_DOWNGRADED: [],
  PARTNER_APPLIED: ['companyName', 'partnerEmail', 'partnerId'],
  PARTNER_SUBMITTED: ['companyName', 'partnerId'],
  ORDER_NEEDS_ATTENTION: ['orderId', 'status'],
  CREATOR_DISPATCH_ACCEPTED: ['orderId', 'productName', 'partnerName', 'dispatchType'],
  CREATOR_DISPATCH_CHANGES_REQUESTED: [
    'orderId',
    'productName',
    'partnerName',
    'dispatchType',
    'flaggedFieldCount',
  ],
  CREATOR_DISPATCH_DECLINED: ['orderId', 'productName', 'partnerName', 'dispatchType', 'reason'],
  CREATOR_DISPATCH_WITHDRAWN: ['orderId', 'productName', 'partnerName', 'dispatchType', 'reason'],
  CREATOR_ORDER_FULLY_ACCEPTED: ['orderId', 'productName', 'partnerCount'],
  CREATOR_ORDER_CANCELLED_BY_MANUFACTURER: ['orderId', 'productName', 'partnerName', 'reason'],
  ADMIN_ORDER_CANCELLED_BY_MANUFACTURER: ['orderId', 'manufacturerName', 'reason'],
  ADMIN_DISPATCH_WITHDRAWN: ['orderId', 'dispatchId', 'partnerName', 'dispatchType', 'reason'],
  CERT_EXPIRING_SOON: ['instanceId', 'certName', 'daysRemaining', 'expiryDate'],
  CERT_EXPIRED: ['instanceId', 'certName', 'expiryDate', 'affectedProductCount'],
  ADMIN_CERT_EXPIRED_ON_PUBLISHED: [
    'instanceId',
    'certName',
    'companyName',
    'affectedProductCount',
    'creatorNames',
  ],
  CREATOR_ORDER_CANCELLED: ['orderId', 'refundCents'],
  CREATOR_ORDER_DISPUTE_RESOLVED: ['orderId', 'decision', 'outcome'],
  PARTNER_CANCELLATION_REVIEWED: ['orderId', 'decision'],
  SUPPORT_TICKET_CREATED: ['ticketId', 'subject', 'categorySlug', 'href'],
  SUPPORT_TICKET_REPLIED: ['ticketId', 'subject', 'href'],
  SUPPORT_TICKET_RESOLVED: ['ticketId', 'subject', 'href'],
  SUPPORT_TICKET_REOPENED: ['ticketId', 'subject', 'href'],
  SUPPORT_SLA_BREACHED: ['ticketId', 'subject', 'href'],
  SUPPORT_REFUND_REQUESTED: ['orderId', 'amountCents', 'href'],
  INBOUND_ASSIGNED: ['dispatchId', 'orderRef', 'brandName', 'trackingCarrier', 'trackingNumber'],
  INBOUND_DELIVERED_UNCONFIRMED: ['dispatchId', 'orderRef'],
  RECEIVING_DISCREPANCY_OPENED: ['orderRef', 'summary', 'href'],
  RECEIVING_DISCREPANCY_RESOLVED: ['orderRef', 'resolutionNote', 'href'],
  DISPATCH_SLA_AT_RISK: ['dispatchId', 'hoursWaiting', 'hoursRemaining'],
  DOC_EXPIRING_SOON: ['docLabel', 'daysLeft', 'href'],
  DOC_EXPIRED: ['docLabel', 'suspendedCapability', 'href'],
  RELEASE_SHIP_SLA_AT_RISK: ['orderRef', 'daysWaiting'],
  CREATOR_PROOF_AWAITING: ['orderId', 'orderRef', 'version', 'partnerName'],
  PROOF_APPROVED: ['dispatchId', 'orderRef', 'version'],
  PROOF_REJECTED: ['dispatchId', 'orderRef', 'version', 'annotation'],
  CREATOR_STOCK_ALERT: ['title', 'body', 'productName', 'alertState'],
  // F — job progress
  CREATOR_DISPATCH_PROGRESS: ['orderId', 'partnerName', 'kind', 'summary', 'note'],
}

// Feedback module — CAST-GUARDED ASSIGNMENT until db:generate adds
// CREATOR_RATE_PARTNERS to the generated enum (then move into the literal
// above and drop the cast — POST_PUSH_CASTGUARD pattern).
;(EVENT_TOKEN_PALETTE as unknown as Record<string, readonly string[]>)['CREATOR_RATE_PARTNERS'] =
  ['orderId', 'productName', 'partnerCount', 'reminder']

/** Tokens the admin can insert for one event (the editor's palette). */
export function tokenPaletteForEvent(event: NotificationEvent): readonly string[] {
  return EVENT_TOKEN_PALETTE[event]
}
