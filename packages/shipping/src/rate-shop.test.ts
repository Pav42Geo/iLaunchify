import { describe, expect, it } from 'vitest'

import { classifyShipment } from './classifier'
import { dollarsToCents, EasyPostParcelGateway } from './gateway'
import type { EasyPostHttp, RateQuote } from './gateway'
import { applyFirstLegMargin, quoteMatchesRule, shopRates } from './rate-shop'
import { legStatusToDispatchStatus, mapTrackerStatusToLegStatus, parseTrackerEvent, verifyEasyPostSignature } from './tracking-webhook'
import type { CarrierServiceRuleRow } from './types'

const rule = (over: Partial<CarrierServiceRuleRow>): CarrierServiceRuleRow => ({
  id: over.id ?? 'r', carrier: 'UPS', serviceLevel: 'GROUND', modes: ['PARCEL'],
  storageClasses: ['AMBIENT'], hazmatAllowed: [], maxWeightLb: 150, maxTransitDays: 5,
  groundOnly: true, seasonalWindowJson: null, priority: 100, active: true, ...over,
})

const quote = (over: Partial<RateQuote>): RateQuote => ({
  provider: 'easypost', externalShipmentId: 'shp_1', externalRateId: over.externalRateId ?? 'rate_1',
  carrier: 'UPS', service: 'Ground', rateCents: 1000, transitDays: 4, ...over,
})

const ambientParcel = classifyShipment({
  domain: 'FOOD', storageClass: 'AMBIENT', hazmatClass: 'NONE', meltable: false,
  cartons: [{ lengthIn: 12, widthIn: 12, heightIn: 12, weightLb: 20 }],
})

describe('quoteMatchesRule', () => {
  it('matches UPS Ground and FedEx 2Day naming variants', () => {
    expect(quoteMatchesRule(quote({}), rule({}))).toBe(true)
    expect(quoteMatchesRule(quote({ carrier: 'FedEx', service: 'FEDEX_2_DAY' }), rule({ carrier: 'FedEx', serviceLevel: '2DAY' }))).toBe(true)
    expect(quoteMatchesRule(quote({ service: '2ndDayAir' }), rule({ serviceLevel: '2ND_DAY_AIR' }))).toBe(true)
    expect(quoteMatchesRule(quote({ carrier: 'USPS' }), rule({}))).toBe(false)
  })
})

describe('shopRates', () => {
  it('cheapest eligible quote wins; unmatched carriers rejected with reason', () => {
    const quotes = [
      quote({ externalRateId: 'expensive', rateCents: 1500 }),
      quote({ externalRateId: 'cheap', rateCents: 900 }),
      quote({ externalRateId: 'dhl', carrier: 'DHL', rateCents: 100 }),
    ]
    const r = shopRates(quotes, [rule({})], ambientParcel)
    expect(r.chosen!.externalRateId).toBe('cheap')
    expect(r.rejected.find((x) => x.quote.carrier === 'DHL')!.reason).toContain('no eligible')
  })

  it('SLA-violating quotes rejected (frozen ≤2 days)', () => {
    const frozen = classifyShipment({
      domain: 'FOOD', storageClass: 'FROZEN', hazmatClass: 'NONE', meltable: false,
      cartons: [{ lengthIn: 12, widthIn: 12, heightIn: 12, weightLb: 20 }],
    })
    const rules = [rule({ id: '2day', serviceLevel: '2DAY', storageClasses: ['FROZEN'], maxTransitDays: 2, groundOnly: false })]
    const r = shopRates(
      [quote({ service: '2ndDayAir', transitDays: 3, rateCents: 500 }), quote({ externalRateId: 'ok', service: '2ndDayAir', transitDays: 2, rateCents: 2000 })],
      rules,
      frozen,
    )
    expect(r.chosen!.externalRateId).toBe('ok')
    expect(r.rejected[0]!.reason).toContain('SLA')
  })

  it('margin math (L5)', () => {
    expect(applyFirstLegMargin(1000, 500)).toBe(1050)
    expect(applyFirstLegMargin(1000, 0)).toBe(1000)
  })
})

describe('EasyPostParcelGateway (fake http)', () => {
  const fake: EasyPostHttp = {
    async request(method, path) {
      if (path === '/v2/shipments') {
        return { id: 'shp_9', rates: [
          { id: 'rate_a', carrier: 'UPS', service: 'Ground', rate: '10.55', delivery_days: 4 },
          { id: 'bad' }, // dropped — incomplete
        ] }
      }
      if (path.endsWith('/buy')) {
        return { id: 'shp_9', tracking_code: '1Z999', selected_rate: { carrier: 'UPS', service: 'Ground', rate: '10.55' }, postage_label: { label_url: 'https://l' }, tracker: { public_url: 'https://t' } }
      }
      throw new Error(`unexpected ${method} ${path}`)
    },
  }

  it('rates: ounces conversion + cents + drops malformed rates', async () => {
    const gw = new EasyPostParcelGateway(fake, 'key')
    const r = await gw.rate({
      from: { name: 'A', street1: 's', city: 'c', zip: '1', country: 'US' },
      to: { name: 'B', street1: 's', city: 'c', zip: '2', country: 'US' },
      parcels: [{ lengthIn: 10, widthIn: 8, heightIn: 6, weightLb: 5 }],
    })
    expect(r.quotes).toHaveLength(1)
    expect(r.quotes[0]!.rateCents).toBe(1055)
    expect(dollarsToCents('10.55')).toBe(1055)
  })

  it('buy returns normalized label', async () => {
    const gw = new EasyPostParcelGateway(fake, 'key')
    const label = await gw.buy({ externalShipmentId: 'shp_9', externalRateId: 'rate_a' })
    expect(label.trackingNumber).toBe('1Z999')
    expect(label.costCents).toBe(1055)
  })
})

describe('tracking webhook mapping', () => {
  it('tracker statuses map to leg FSM; unknown ignored', () => {
    expect(mapTrackerStatusToLegStatus('in_transit')).toBe('IN_TRANSIT')
    expect(mapTrackerStatusToLegStatus('delivered')).toBe('DELIVERED')
    expect(mapTrackerStatusToLegStatus('return_to_sender')).toBe('EXCEPTION')
    expect(mapTrackerStatusToLegStatus('unknown')).toBeNull()
  })

  it('leg → dispatch echo', () => {
    expect(legStatusToDispatchStatus('DELIVERED')).toBe('DELIVERED')
    expect(legStatusToDispatchStatus('OUT_FOR_DELIVERY')).toBe('IN_TRANSIT')
    expect(legStatusToDispatchStatus('EXCEPTION')).toBeNull()
  })

  it('parses tracker events; rejects non-tracker bodies', () => {
    const ev = parseTrackerEvent({ description: 'tracker.updated', result: { tracking_code: '1Z', status: 'in_transit', carrier: 'UPS' } })
    expect(ev!.trackingNumber).toBe('1Z')
    expect(parseTrackerEvent({ description: 'batch.created' })).toBeNull()
  })

  it('HMAC verification round-trips and rejects tampering', () => {
    const body = '{"a":1}'
    const { createHmac } = require('node:crypto') as typeof import('node:crypto')
    const sig = 'hmac-sha256-hex=' + createHmac('sha256', 'secret').update(body, 'utf8').digest('hex')
    expect(verifyEasyPostSignature(body, sig, 'secret')).toBe(true)
    expect(verifyEasyPostSignature(body + ' ', sig, 'secret')).toBe(false)
    expect(verifyEasyPostSignature(body, null, 'secret')).toBe(false)
  })
})
