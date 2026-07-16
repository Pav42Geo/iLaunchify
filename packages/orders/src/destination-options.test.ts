import { describe, expect, it } from 'vitest'

import { resolveDestinationOptions, recommendDestination } from './destination-options'
import type { DestinationContext, DestinationOption } from './destination-options'

describe('recommendDestination — AFE Level-1 default (order-type gated)', () => {
  const all: DestinationOption[] = [
    { type: 'CREATOR_ADDRESS', enabled: true, disabledReason: null },
    { type: 'WAREHOUSE_PARTNER', enabled: true, disabledReason: null },
    { type: 'HOLD_AT_MANUFACTURER', enabled: true, disabledReason: null },
    { type: 'CHANNEL_INBOUND', enabled: true, disabledReason: null },
  ]

  it('bulk: prefers the platform FC when enabled', () => {
    expect(recommendDestination(all, { orderType: 'BULK' }).type).toBe('WAREHOUSE_PARTNER')
  })
  it('bulk: falls to channel-inbound when no FC eligible', () => {
    const noFc = all.map((o) => (o.type === 'WAREHOUSE_PARTNER' ? { ...o, enabled: false } : o))
    expect(recommendDestination(noFc, { orderType: 'BULK' }).type).toBe('CHANNEL_INBOUND')
  })
  it('bulk: CREATOR_ADDRESS is the always-available fallback', () => {
    const onlySelf: DestinationOption[] = [
      { type: 'CREATOR_ADDRESS', enabled: true, disabledReason: null },
      { type: 'WAREHOUSE_PARTNER', enabled: false, disabledReason: 'x' },
      { type: 'HOLD_AT_MANUFACTURER', enabled: false, disabledReason: 'x' },
      { type: 'CHANNEL_INBOUND', enabled: false, disabledReason: 'x' },
    ]
    expect(recommendDestination(onlySelf, { orderType: 'BULK' }).type).toBe('CREATOR_ADDRESS')
  })
  it('sample: no fulfillment center (Level-0 gate)', () => {
    expect(recommendDestination(all, { orderType: 'SAMPLE' }).type).toBeNull()
  })
  it('on-demand: no fulfillment center (Level-0 gate)', () => {
    expect(recommendDestination(all, { orderType: 'MADE_TO_ORDER' }).type).toBeNull()
  })
  it('no order type given → treated as bulk', () => {
    expect(recommendDestination(all).type).toBe('WAREHOUSE_PARTNER')
  })
})

const gatesOn = {
  'destination:HOLD_AT_MANUFACTURER': true,
  'destination:CHANNEL_INBOUND': true,
}

const base: DestinationContext = {
  product: { storageClass: 'AMBIENT', hazmatClass: 'NONE', domain: 'DIETARY_SUPPLEMENT' },
  manufacturer: {
    offersStorage: true,
    storageClasses: ['AMBIENT', 'PROTECT_HEAT'],
    maxDwellDays: 180,
    productShelfLifeDays: 720,
  },
  gates: gatesOn,
  eligibleWarehouseCount: 2,
  hasConnectedChannel: true,
}

const byType = (ctx: DestinationContext) =>
  Object.fromEntries(resolveDestinationOptions(ctx).map((o) => [o.type, o]))

describe('resolveDestinationOptions', () => {
  it('happy path: all four destinations enabled', () => {
    const o = byType(base)
    expect(o.CREATOR_ADDRESS!.enabled).toBe(true)
    expect(o.WAREHOUSE_PARTNER!.enabled).toBe(true)
    expect(o.HOLD_AT_MANUFACTURER!.enabled).toBe(true)
    expect(o.CHANNEL_INBOUND!.enabled).toBe(true)
  })

  it('gates OFF disable hold + channel with copy (build-ready, admin-gated)', () => {
    const o = byType({ ...base, gates: {} })
    expect(o.HOLD_AT_MANUFACTURER!.enabled).toBe(false)
    expect(o.CHANNEL_INBOUND!.enabled).toBe(false)
    expect(o.CHANNEL_INBOUND!.disabledReason).toContain('coming soon')
  })

  it('hold requires the manufacturer to offer storage for THIS temp class', () => {
    const o = byType({
      ...base,
      product: { ...base.product, storageClass: 'CHILLED' },
      eligibleWarehouseCount: 0,
    })
    expect(o.HOLD_AT_MANUFACTURER!.enabled).toBe(false)
    expect(o.HOLD_AT_MANUFACTURER!.disabledReason).toContain('temperature class')
    expect(o.WAREHOUSE_PARTNER!.enabled).toBe(false)
    expect(o.WAREHOUSE_PARTNER!.disabledReason).toContain('cold-storage')
  })

  it('shelf life shorter than the dwell policy blocks hold', () => {
    const o = byType({
      ...base,
      manufacturer: { ...base.manufacturer!, maxDwellDays: 365, productShelfLifeDays: 90 },
    })
    expect(o.HOLD_AT_MANUFACTURER!.enabled).toBe(false)
    expect(o.HOLD_AT_MANUFACTURER!.disabledReason).toContain('shelf life')
  })

  it('frozen product cannot go channel-inbound (no 3P cold path on any US channel)', () => {
    const o = byType({ ...base, product: { ...base.product, storageClass: 'FROZEN' } })
    expect(o.CHANNEL_INBOUND!.enabled).toBe(false)
    expect(o.CHANNEL_INBOUND!.disabledReason).toContain('refrigerated or frozen')
  })

  it('no connected channel → actionable copy', () => {
    const o = byType({ ...base, hasConnectedChannel: false })
    expect(o.CHANNEL_INBOUND!.disabledReason).toContain('Settings → Channels')
  })

  it('creator address is always available', () => {
    const o = byType({ ...base, gates: {}, eligibleWarehouseCount: 0, manufacturer: null })
    expect(o.CREATOR_ADDRESS!.enabled).toBe(true)
  })
})
