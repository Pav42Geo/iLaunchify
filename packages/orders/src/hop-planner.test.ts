import { describe, expect, it } from 'vitest'

import { planShipmentHops, type HopPlanInput } from './hop-planner'

const COSTS = { labelHopCents: 1500, goodsTransferCents: 4000, finishedGoodsCents: 8610 }

function base(overrides: Partial<HopPlanInput> = {}): HopPlanInput {
  return {
    applicationPoint: { ok: true, node: { kind: 'MANUFACTURER', serviceId: 'mfr' } },
    externalPrint: true,
    printerServiceId: 'prn',
    manufacturerServiceId: 'mfr',
    coPackerServiceId: null,
    destination: { kind: 'WAREHOUSE_PARTNER', fcServiceId: 'fc1' },
    costs: COSTS,
    platformPaysInterPartnerFreight: false,
    ...overrides,
  }
}

describe('planShipmentHops', () => {
  it('common case: printer→manufacturer labels hop + manufacturer→FC finished goods, creator pays both', () => {
    const plan = planShipmentHops(base())
    expect(plan.hops).toEqual([
      {
        kind: 'LABELS',
        from: { kind: 'PRINTER', serviceId: 'prn' },
        to: { kind: 'MANUFACTURER', serviceId: 'mfr' },
        costCents: 1500,
        billTo: 'CREATOR',
      },
      {
        kind: 'FINISHED_GOODS',
        from: { kind: 'MANUFACTURER', serviceId: 'mfr' },
        to: { kind: 'FC', serviceId: 'fc1' },
        costCents: 8610,
        billTo: 'CREATOR',
      },
    ])
    expect(plan.labelShipToServiceId).toBe('mfr')
    expect(plan.creatorShippingCents).toBe(10110)
    expect(plan.platformAbsorbedCents).toBe(0)
  })

  it('no application step (self-label / printed-in): single finished-goods hop, no label leg', () => {
    const plan = planShipmentHops(
      base({ applicationPoint: { ok: true, node: null }, externalPrint: false, printerServiceId: null }),
    )
    expect(plan.hops).toEqual([
      {
        kind: 'FINISHED_GOODS',
        from: { kind: 'MANUFACTURER', serviceId: 'mfr' },
        to: { kind: 'FC', serviceId: 'fc1' },
        costCents: 8610,
        billTo: 'CREATOR',
      },
    ])
    expect(plan.labelShipToServiceId).toBe(null)
  })

  it('co-packer application: labels→copacker + mfr→copacker goods transfer + copacker→creator', () => {
    const plan = planShipmentHops(
      base({
        applicationPoint: { ok: true, node: { kind: 'COPACKER', serviceId: 'cop' } },
        coPackerServiceId: 'cop',
        destination: { kind: 'CREATOR_ADDRESS' },
      }),
    )
    expect(plan.hops.map((h) => h.kind)).toEqual(['LABELS', 'GOODS_TRANSFER', 'FINISHED_GOODS'])
    expect(plan.hops[0]!.to).toEqual({ kind: 'COPACKER', serviceId: 'cop' })
    expect(plan.hops[1]!.from).toEqual({ kind: 'MANUFACTURER', serviceId: 'mfr' })
    expect(plan.hops[2]!.to).toEqual({ kind: 'CREATOR_ADDRESS', serviceId: null })
    expect(plan.labelShipToServiceId).toBe('cop')
    expect(plan.creatorShippingCents).toBe(1500 + 4000 + 8610)
  })

  it('FC-finalize at the destination FC: labels→FC, goods mfr→FC, NO redundant final hop', () => {
    const plan = planShipmentHops(
      base({
        applicationPoint: { ok: true, node: { kind: 'FC', serviceId: 'fc1' } },
        destination: { kind: 'WAREHOUSE_PARTNER', fcServiceId: 'fc1' },
      }),
    )
    // Labels go printer→FC; the unlabeled goods travel mfr→FC (that move IS the
    // destination freight); application point = destination → no third hop.
    expect(plan.hops).toEqual([
      {
        kind: 'LABELS',
        from: { kind: 'PRINTER', serviceId: 'prn' },
        to: { kind: 'FC', serviceId: 'fc1' },
        costCents: 1500,
        billTo: 'CREATOR',
      },
      {
        kind: 'FINISHED_GOODS',
        from: { kind: 'MANUFACTURER', serviceId: 'mfr' },
        to: { kind: 'FC', serviceId: 'fc1' },
        costCents: 8610,
        billTo: 'CREATOR',
      },
    ])
    expect(plan.labelShipToServiceId).toBe('fc1')
    expect(plan.creatorShippingCents).toBe(1500 + 8610)
  })

  it('HOLD_AT_MANUFACTURER with manufacturer application: no finished-goods hop at all', () => {
    const plan = planShipmentHops(base({ destination: { kind: 'HOLD_AT_MANUFACTURER' } }))
    expect(plan.hops).toEqual([
      {
        kind: 'LABELS',
        from: { kind: 'PRINTER', serviceId: 'prn' },
        to: { kind: 'MANUFACTURER', serviceId: 'mfr' },
        costCents: 1500,
        billTo: 'CREATOR',
      },
    ])
  })

  it('HOLD_AT_MANUFACTURER with co-packer application: goods ship BACK to the manufacturer (§8.4)', () => {
    const plan = planShipmentHops(
      base({
        applicationPoint: { ok: true, node: { kind: 'COPACKER', serviceId: 'cop' } },
        coPackerServiceId: 'cop',
        destination: { kind: 'HOLD_AT_MANUFACTURER' },
      }),
    )
    const last = plan.hops[plan.hops.length - 1]!
    expect(last.kind).toBe('FINISHED_GOODS')
    expect(last.from).toEqual({ kind: 'COPACKER', serviceId: 'cop' })
    expect(last.to).toEqual({ kind: 'MANUFACTURER', serviceId: 'mfr' })
  })

  it('bearer flip: platform absorbs inter-partner hops, finished goods stay on the creator', () => {
    const plan = planShipmentHops(
      base({
        applicationPoint: { ok: true, node: { kind: 'COPACKER', serviceId: 'cop' } },
        coPackerServiceId: 'cop',
        destination: { kind: 'CREATOR_ADDRESS' },
        platformPaysInterPartnerFreight: true,
      }),
    )
    expect(plan.hops[0]!.billTo).toBe('PLATFORM') // labels
    expect(plan.hops[1]!.billTo).toBe('PLATFORM') // goods transfer
    expect(plan.hops[2]!.billTo).toBe('CREATOR') // finished goods
    expect(plan.platformAbsorbedCents).toBe(1500 + 4000)
    expect(plan.creatorShippingCents).toBe(8610)
  })

  it('CHANNEL_INBOUND destination: finished goods address the channel node', () => {
    const plan = planShipmentHops(base({ destination: { kind: 'CHANNEL_INBOUND' } }))
    expect(plan.hops[1]!.to).toEqual({ kind: 'CHANNEL', serviceId: null })
  })

  it('throws on an UNRESOLVED graph — hops must never be planned around an incomplete graph', () => {
    let threw = false
    try {
      planShipmentHops(base({ applicationPoint: { ok: false, reason: 'UNRESOLVED' } }))
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
