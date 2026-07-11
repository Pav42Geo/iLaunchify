import { describe, it, expect } from 'vitest'
import { carrierTrackingUrl, sampleShipmentFromPayload } from './sample-shipment'

describe('carrierTrackingUrl', () => {
  it('builds official URLs per carrier', () => {
    expect(carrierTrackingUrl('USPS', '9400 1000')).toContain('tools.usps.com')
    expect(carrierTrackingUrl('UPS', '1Z999')).toContain('ups.com/track')
    expect(carrierTrackingUrl('FEDEX', '123456789012')).toContain('fedex.com')
    expect(carrierTrackingUrl('DHL', '1234567890')).toContain('dhl.com')
  })

  it('URL-encodes the tracking number', () => {
    expect(carrierTrackingUrl('UPS', '1Z 999&x')).toContain('1Z%20999%26x')
  })

  it('returns null for unknown carriers or empty numbers — no fake links', () => {
    expect(carrierTrackingUrl('OTHER', '123')).toBeNull()
    expect(carrierTrackingUrl('USPS', '   ')).toBeNull()
  })
})

describe('sampleShipmentFromPayload', () => {
  it('parses a full shipment block', () => {
    expect(
      sampleShipmentFromPayload({
        shipment: { carrier: 'UPS', trackingNumber: '1Z1', eta: '2026-07-15', notes: '2 flavors' },
      }),
    ).toEqual({ carrier: 'UPS', trackingNumber: '1Z1', eta: '2026-07-15', notes: '2 flavors' })
  })

  it('null for payloads without a shipment block (old SAMPLE versions)', () => {
    expect(sampleShipmentFromPayload({ fields: [] })).toBeNull()
    expect(sampleShipmentFromPayload(null)).toBeNull()
    expect(sampleShipmentFromPayload({ shipment: { carrier: '', trackingNumber: '' } })).toBeNull()
  })

  it('defaults blank carrier to OTHER when a tracking number exists', () => {
    expect(sampleShipmentFromPayload({ shipment: { trackingNumber: 'X1' } })?.carrier).toBe('OTHER')
  })
})
