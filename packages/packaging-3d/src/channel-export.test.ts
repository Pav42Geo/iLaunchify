import { describe, it, expect } from 'vitest'
import {
  EXPORT_CHANNELS,
  CHANNEL_IMAGE_SPECS,
  getChannelImageSpec,
  isExportChannel,
  mainImageEligibility,
  isCleanStudioRender,
  pickPrimaryRender,
  exportTargetFor,
  exportPlan,
} from './channel-export'

describe('channel spec coverage', () => {
  it('has a spec for every channel, self-consistent', () => {
    for (const ch of EXPORT_CHANNELS) {
      const s = getChannelImageSpec(ch)
      expect(s.channel).toBe(ch)
      expect(s.formats.length).toBeGreaterThan(0)
      expect(s.recommendedLongEdgePx).toBeGreaterThanOrEqual(s.minLongEdgePx)
      expect(s.maxBytes).toBeGreaterThan(0)
    }
  })

  it('encodes the white-main-image channels', () => {
    expect(CHANNEL_IMAGE_SPECS.amazon.background).toBe('WHITE_REQUIRED')
    expect(CHANNEL_IMAGE_SPECS.amazon.mainImageProductOnly).toBe(true)
    expect(CHANNEL_IMAGE_SPECS.walmart.mainImageProductOnly).toBe(true)
    expect(CHANNEL_IMAGE_SPECS.tiktok.mainImageProductOnly).toBe(true)
    // Shopify/Etsy let a lifestyle shot lead.
    expect(CHANNEL_IMAGE_SPECS.shopify.mainImageProductOnly).toBe(false)
    expect(CHANNEL_IMAGE_SPECS.etsy.mainImageProductOnly).toBe(false)
  })

  it('flags login-gated specs as unverified', () => {
    expect(CHANNEL_IMAGE_SPECS.amazon.verified).toBe(false)
    expect(CHANNEL_IMAGE_SPECS.tiktok.verified).toBe(false)
    expect(CHANNEL_IMAGE_SPECS.walmart.verified).toBe(true)
    expect(CHANNEL_IMAGE_SPECS.shopify.verified).toBe(true)
  })

  it('carries Etsy tight constraints (1MB, no transparency)', () => {
    expect(CHANNEL_IMAGE_SPECS.etsy.maxBytes).toBe(1024 * 1024)
    expect(CHANNEL_IMAGE_SPECS.etsy.allowsTransparency).toBe(false)
  })

  it('isExportChannel guards', () => {
    expect(isExportChannel('shopify')).toBe(true)
    expect(isExportChannel('ebay')).toBe(false)
  })
})

describe('main-image legality guardrail', () => {
  it('blocks lifestyle/scene renders as the main on white-main channels', () => {
    expect(mainImageEligibility('amazon', 'SCENE_2D').eligible).toBe(false)
    expect(mainImageEligibility('amazon', 'AI_SCENE').eligible).toBe(false)
    expect(mainImageEligibility('amazon', 'STANDARD_RENDER').eligible).toBe(true)
    expect(mainImageEligibility('walmart', 'SCENE_3D_VIDEO').eligible).toBe(false)
  })

  it('allows any kind to lead on Shopify/Etsy/Google', () => {
    expect(mainImageEligibility('shopify', 'SCENE_2D').eligible).toBe(true)
    expect(mainImageEligibility('etsy', 'AI_SCENE').eligible).toBe(true)
    expect(mainImageEligibility('google', 'SCENE_2D').eligible).toBe(true)
  })

  it('a blocked verdict explains why', () => {
    expect(mainImageEligibility('tiktok', 'AI_SCENE').reason).toMatch(/product-only/)
  })

  it('isCleanStudioRender only for STANDARD_RENDER', () => {
    expect(isCleanStudioRender('STANDARD_RENDER')).toBe(true)
    expect(isCleanStudioRender('AI_SCENE')).toBe(false)
  })
})

describe('pickPrimaryRender', () => {
  it('always prefers a clean studio render', () => {
    const picked = pickPrimaryRender('amazon', [
      { id: 'scene1', kind: 'SCENE_2D' },
      { id: 'studio1', kind: 'STANDARD_RENDER' },
    ])
    expect(picked).toBe('studio1')
  })

  it('returns null on a white-main channel when only scenes exist', () => {
    expect(pickPrimaryRender('amazon', [{ id: 's', kind: 'SCENE_2D' }])).toBeNull()
  })

  it('lets a scene lead where the channel allows it', () => {
    expect(pickPrimaryRender('shopify', [{ id: 's', kind: 'SCENE_2D' }])).toBe('s')
  })

  it('returns null for an empty candidate set', () => {
    expect(pickPrimaryRender('shopify', [])).toBeNull()
  })
})

describe('export targets', () => {
  it('produces a square target at the recommended edge', () => {
    const t = exportTargetFor('walmart')
    expect(t.widthPx).toBe(2200)
    expect(t.heightPx).toBe(2200)
    expect(t.background).toBe('WHITE_REQUIRED')
    expect(t.format).toBe('jpeg')
  })

  it('exportPlan maps many channels', () => {
    const plan = exportPlan(['shopify', 'amazon'])
    expect(plan.map((p) => p.channel)).toEqual(['shopify', 'amazon'])
    expect(plan[0]?.widthPx).toBe(2048)
  })
})
