// Sample payloads for admin template preview + test-send
// (docs/EMAIL_NOTIFICATION_CENTER.md — Templates surface). Pure: derives a
// plausible value for every token in the event's palette, so previews render
// with realistic copy regardless of which event is being edited.

import type { NotificationEvent } from '@ilaunchify/db'
import { tokenPaletteForEvent } from './template-tokens'

const FIXED: Record<string, unknown> = {
  orderId: 'ord_sample12345678',
  orderRef: 'ORD-4821',
  dispatchId: 'dsp_sample12345678',
  partnerName: 'Acme Foods Co.',
  manufacturerName: 'Acme Foods Co.',
  companyName: 'Acme Foods Co.',
  brandName: 'Peak Performance',
  productName: 'Daily Greens Powder',
  partnerEmail: 'ops@acmefoods.example',
  partnerId: 'ptr_sample12345678',
  sectionType: 'FOOD_SAFETY',
  type: 'PRODUCT',
  dispatchType: 'PRODUCT',
  status: 'ON_HOLD',
  kind: 'ETA',
  summary: 'updated the delivery estimate to Jul 20, 2026',
  note: 'Batch mixed and moving to fill line tomorrow.',
  notes: 'Please refresh the expired document.',
  reason: 'Capacity conflict this week.',
  annotation: 'Logo color is off — use the brand pink.',
  subject: 'Question about my last order',
  categorySlug: 'orders',
  href: '/orders',
  certName: 'USDA Organic',
  docLabel: 'Certificate of Insurance',
  instanceId: 'cert_sample12345678',
  ticketId: 'tkt_sample12345678',
  filename: 'proof-v2.pdf',
  milestone: 'plates-made',
  resolutionNote: 'Replacement units shipped.',
  suspendedCapability: 'cold-chain fulfillment',
  decision: 'APPROVED',
  outcome: undefined,
  graceUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  trackingCarrier: 'UPS',
  trackingNumber: '1Z999AA10123456784',
  title: 'Stock alert · Daily Greens Powder',
  body: 'Amazon FBA pool dropped to 12 units (LOW).',
  alertState: 'LOW',
  creatorNames: ['Jordan Lee', 'Sam Rivera'],
}

function heuristic(token: string): unknown {
  if (FIXED[token] !== undefined) return FIXED[token]
  const t = token.toLowerCase()
  if (t.includes('count')) return 3
  if (t.includes('cents')) return 12999
  if (t.includes('hours')) return 6
  if (t.includes('days')) return 7
  if (t.includes('version')) return 2
  if (t.endsWith('at') || t.includes('date')) {
    return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  }
  if (t.endsWith('id')) return `${token.slice(0, 3)}_sample12345678`
  if (t.includes('name')) return 'Acme Foods Co.'
  if (t.includes('email')) return 'sample@acmefoods.example'
  return `[${token}]`
}

/** A complete, plausible payload for one event (every palette token filled). */
export function samplePayloadForEvent(event: NotificationEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const token of tokenPaletteForEvent(event)) {
    const v = heuristic(token)
    if (v !== undefined) out[token] = v
  }
  return out
}
