import { describe, it, expect } from 'vitest'
import { evaluatePublishReadiness, type SelectedRender } from './publish-readiness'
import type { MockupImageFacts } from './channel-compliance'

const facts = (over: Partial<MockupImageFacts>): MockupImageFacts => ({
  widthPx: 2048,
  heightPx: 2048,
  bytes: 400_000,
  format: 'jpeg',
  hasTransparency: false,
  background: 'WHITE',
  kind: 'STANDARD_RENDER',
  isMain: false,
  ...over,
})

const studio: SelectedRender = { id: 'studio', facts: facts({ kind: 'STANDARD_RENDER', widthPx: 2200, heightPx: 2200 }) }
const scene: SelectedRender = { id: 'scene', facts: facts({ kind: 'SCENE_2D', widthPx: 2200, heightPx: 2200 }) }

describe('evaluatePublishReadiness', () => {
  it('is ready when a compliant studio render leads on a white-main channel', () => {
    const rep = evaluatePublishReadiness(['walmart'], [studio, scene])
    const wm = rep.channels[0]!
    expect(wm.primaryRenderId).toBe('studio')
    expect(wm.ready).toBe(true)
    expect(wm.blockers).toHaveLength(0)
  })

  it('blocks a white-main channel when only scenes are selected', () => {
    const rep = evaluatePublishReadiness(['amazon'], [scene])
    const az = rep.channels[0]!
    expect(az.primaryRenderId).toBeNull()
    expect(az.ready).toBe(false)
    expect(az.blockers.some((b) => b.includes('no eligible main image'))).toBe(true)
    expect(rep.overallReady).toBe(false)
  })

  it('lets a scene lead on Shopify and is ready', () => {
    const rep = evaluatePublishReadiness(['shopify'], [scene])
    const sh = rep.channels[0]!
    expect(sh.primaryRenderId).toBe('scene')
    expect(sh.ready).toBe(true)
  })

  it('marks exactly one primary per channel', () => {
    const rep = evaluatePublishReadiness(['shopify'], [studio, scene])
    const primaries = rep.channels[0]!.renders.filter((r) => r.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0]!.id).toBe('studio')
  })

  it('surfaces a hard compliance error as a blocker (e.g. too small)', () => {
    const tiny: SelectedRender = { id: 'tiny', facts: facts({ widthPx: 400, heightPx: 400 }) }
    const rep = evaluatePublishReadiness(['walmart'], [tiny])
    expect(rep.channels[0]!.ready).toBe(false)
    expect(rep.channels[0]!.blockers.some((b) => b.includes('tiny'))).toBe(true)
  })

  it('overallReady requires every channel ready', () => {
    const rep = evaluatePublishReadiness(['shopify', 'amazon'], [scene])
    expect(rep.channels.find((c) => c.channel === 'shopify')!.ready).toBe(true)
    expect(rep.channels.find((c) => c.channel === 'amazon')!.ready).toBe(false)
    expect(rep.overallReady).toBe(false)
  })

  it('is not ready with an empty channel set', () => {
    expect(evaluatePublishReadiness([], [studio]).overallReady).toBe(false)
  })
})
