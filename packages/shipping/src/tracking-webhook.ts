/**
 * Phase L2 — EasyPost tracker webhook mapping (spec §6.3 webhooks/).
 * PURE mapping + HMAC verification helper; the Next.js route wires it up.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

// Local literal union kept in sync with the Prisma enum (prisma-free package).
export type LegStatusValue =
  | 'PLANNED' | 'QUOTE_REQUESTED' | 'QUOTED' | 'BOOKED' | 'PICKUP_SCHEDULED'
  | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'CANCELLED'

/** EasyPost tracker statuses → ShipmentLeg FSM values (null = ignore event). */
export function mapTrackerStatusToLegStatus(trackerStatus: string): LegStatusValue | null {
  switch (trackerStatus) {
    case 'pre_transit':
      return 'BOOKED'
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'available_for_pickup':
      return 'OUT_FOR_DELIVERY'
    case 'return_to_sender':
    case 'failure':
    case 'error':
      return 'EXCEPTION'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return null // 'unknown' etc. — keep current state
  }
}

/** Downstream dispatch-FSM echo for a leg change (single source of mapping). */
export function legStatusToDispatchStatus(leg: LegStatusValue): 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | null {
  if (leg === 'PICKED_UP') return 'SHIPPED'
  if (leg === 'IN_TRANSIT' || leg === 'OUT_FOR_DELIVERY') return 'IN_TRANSIT'
  if (leg === 'DELIVERED') return 'DELIVERED'
  return null
}

/**
 * EasyPost webhook signature check: HMAC-SHA256 of the raw body with the
 * webhook secret, hex-encoded, sent as `X-Hmac-Signature: hmac-sha256-hex=<sig>`.
 */
export function verifyEasyPostSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = header.replace(/^hmac-sha256-hex=/, '').trim()
  if (provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

export interface TrackerEvent {
  trackingNumber: string
  status: string
  carrier: string | null
  estDeliveryDate: string | null
}

/** Extracts the tracker payload from an EasyPost Event body (defensive). */
export function parseTrackerEvent(body: unknown): TrackerEvent | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as { description?: string; result?: Record<string, unknown> }
  if (!b.description?.startsWith('tracker.')) return null
  const r = b.result ?? {}
  const trackingNumber = typeof r.tracking_code === 'string' ? r.tracking_code : null
  const status = typeof r.status === 'string' ? r.status : null
  if (!trackingNumber || !status) return null
  return {
    trackingNumber,
    status,
    carrier: typeof r.carrier === 'string' ? r.carrier : null,
    estDeliveryDate: typeof r.est_delivery_date === 'string' ? r.est_delivery_date : null,
  }
}
