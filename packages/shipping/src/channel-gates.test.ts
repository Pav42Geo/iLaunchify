import { describe, expect, it } from 'vitest'

import { decidePlacementSplits, evaluateChannelInboundGates, inMeltableAcceptanceWindow } from './channel-gates'
import type { ChannelGateInput } from './channel-gates'

const base: ChannelGateInput = {
  channel: 'AMAZON_FBA',
  storageClass: 'AMBIENT',
  hazmatClass: 'NONE',
  meltable: false,
  shelfLifeDays: 720,
  daysUntilCheckIn: 30,
  channelMinShelfLifeDays: 105,
  checkInDate: new Date('2026-12-01T12:00:00'),
  dgProgramApproved: false,
}

describe('evaluateChannelInboundGates', () => {
  it('ambient long-shelf-life product passes', () => {
    expect(evaluateChannelInboundGates(base).eligible).toBe(true)
  })

  it('frozen/chilled blocked on every channel', () => {
    for (const channel of ['AMAZON_FBA', 'WALMART_WFS', 'TIKTOK_FBT'] as const) {
      const r = evaluateChannelInboundGates({ ...base, channel, storageClass: 'FROZEN' })
      expect(r.eligible).toBe(false)
      expect(r.reasons[0]).toContain('refrigerated or frozen')
    }
  })

  it('meltable window: FBA blocked in July, allowed in December', () => {
    const july = evaluateChannelInboundGates({ ...base, meltable: true, checkInDate: new Date('2026-07-02T12:00:00') })
    expect(july.eligible).toBe(false)
    expect(july.reasons[0]).toContain('Oct 16')
    const dec = evaluateChannelInboundGates({ ...base, meltable: true, checkInDate: new Date('2026-12-01T12:00:00') })
    expect(dec.eligible).toBe(true)
    expect(inMeltableAcceptanceWindow(new Date('2026-04-14T12:00:00'))).toBe(true)
    expect(inMeltableAcceptanceWindow(new Date('2026-04-15T12:00:00'))).toBe(false)
  })

  it('WFS blocks meltables outright (no window)', () => {
    const r = evaluateChannelInboundGates({ ...base, channel: 'WALMART_WFS', meltable: true, checkInDate: new Date('2026-12-01T12:00:00') })
    expect(r.eligible).toBe(false)
    expect(r.reasons[0]).toContain('WFS')
  })

  it('shelf-life floor: 120-day product arriving after 30 days fails the 105-day gate', () => {
    const r = evaluateChannelInboundGates({ ...base, shelfLifeDays: 120 })
    expect(r.eligible).toBe(false)
    expect(r.reasons[0]).toContain('105 days')
    expect(evaluateChannelInboundGates({ ...base, shelfLifeDays: 120, daysUntilCheckIn: 10 }).eligible).toBe(true)
    expect(evaluateChannelInboundGates({ ...base, shelfLifeDays: null }).eligible).toBe(true) // unknown ⇒ gate doesn't bind
  })

  it('aerosols need the DG program; approved passes', () => {
    expect(evaluateChannelInboundGates({ ...base, hazmatClass: 'AEROSOL_2_1' }).eligible).toBe(false)
    expect(evaluateChannelInboundGates({ ...base, hazmatClass: 'AEROSOL_2_1', dgProgramApproved: true }).eligible).toBe(true)
  })

  it('collects multiple reasons', () => {
    const r = evaluateChannelInboundGates({ ...base, storageClass: 'FROZEN', shelfLifeDays: 60 })
    expect(r.reasons.length).toBe(2)
  })
})

describe('decidePlacementSplits', () => {
  it('small runs favor minimal splits (fee < extra freight legs)', () => {
    const d = decidePlacementSplits({ units: 500, minimalSplitFeePerUnitCents: 30, freightPerDestinationCents: 40000, optimizedDestinationCount: 4 })
    // minimal: 400 + 500×0.30 = $550 ; optimized: 400×(1+2.1) = $1240
    expect(d.choice).toBe('MINIMAL_SPLITS')
    expect(d.minimalTotalCents).toBe(55000)
    expect(d.optimizedTotalCents).toBe(124000)
  })

  it('large runs flip to optimized splits', () => {
    const d = decidePlacementSplits({ units: 20000, minimalSplitFeePerUnitCents: 30, freightPerDestinationCents: 80000, optimizedDestinationCount: 4 })
    // minimal: 800 + 6000 = $6800 ; optimized: 800×3.1 = $2480
    expect(d.choice).toBe('OPTIMIZED_SPLITS')
    expect(d.savingsCents).toBe(680000 - 248000)
  })
})
