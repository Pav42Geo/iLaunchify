// P2 sample logistics (CO_CREATION_MARKETPLACE_SPEC §16 P2, 2026-07-10).
// The room's SAMPLE object carries a shipment block on its payload; the
// existing object FSM does the rest (submit = shipped → IN_REVIEW = inspect
// on arrival → APPROVED = sample accepted / CHANGES_REQUESTED = issues).
// PURE — runs in run-vitest-suites.mjs.

export const SAMPLE_CARRIERS = ['USPS', 'UPS', 'FEDEX', 'DHL', 'OTHER'] as const
export type SampleCarrier = (typeof SAMPLE_CARRIERS)[number]

export const CARRIER_LABELS: Record<SampleCarrier, string> = {
  USPS: 'USPS',
  UPS: 'UPS',
  FEDEX: 'FedEx',
  DHL: 'DHL',
  OTHER: 'Other carrier',
}

/** Official public tracking URL for a carrier + number; null when we can't
 *  build one honestly (unknown carrier / empty number) — the UI then shows
 *  the raw number instead of a fake link. */
export function carrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const tn = trackingNumber.trim()
  if (!tn) return null
  const enc = encodeURIComponent(tn)
  switch (carrier) {
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${enc}`
    case 'FEDEX':
      return `https://www.fedex.com/fedextrack/?trknbr=${enc}`
    case 'DHL':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${enc}`
    default:
      return null
  }
}

export interface SampleShipment {
  carrier: string
  trackingNumber: string
  /** ISO date the maker expects arrival (display only, maker's own estimate). */
  eta: string | null
  notes: string | null
}

/** Parse the shipment block off a SAMPLE object version payload. */
export function sampleShipmentFromPayload(payload: unknown): SampleShipment | null {
  const s =
    payload && typeof payload === 'object'
      ? (payload as { shipment?: Record<string, unknown> }).shipment
      : null
  if (!s || typeof s !== 'object') return null
  const carrier = String(s.carrier ?? '').trim()
  const trackingNumber = String(s.trackingNumber ?? '').trim()
  if (!carrier && !trackingNumber) return null
  return {
    carrier: carrier || 'OTHER',
    trackingNumber,
    eta: typeof s.eta === 'string' && s.eta.trim() ? s.eta.trim() : null,
    notes: typeof s.notes === 'string' && s.notes.trim() ? s.notes.trim() : null,
  }
}
