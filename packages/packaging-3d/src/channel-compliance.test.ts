import { describe, it, expect } from 'vitest'
import { validateForChannel, normalizationPlan, type MockupImageFacts } from './channel-compliance'

const base: MockupImageFacts = {
  widthPx: 2048,
  heightPx: 2048,
  bytes: 500_000,
  format: 'jpeg',
  hasTransparency: false,
  background: 'WHITE',
  kind: 'STANDARD_RENDER',
  isMain: true,
}

describe('validateForChannel', () => {
  it('passes a clean compliant Amazon main image', () => {
    const r = validateForChannel('amazon', { ...base, widthPx: 1600, heightPx: 1600 })
    expect(r.ok).toBe(true)
    expect(r.issues).toHaveLength(0)
  })

  it('blocks a scene render as an Amazon main (hard error)', () => {
    const r = validateForChannel('amazon', { ...base, kind: 'AI_SCENE' })
    expect(r.ok).toBe(false)
    expect(r.issues.find((i) => i.code === 'MAIN_IMAGE_KIND')?.level).toBe('ERROR')
  })

  it('blocks below-minimum resolution (cannot invent pixels)', () => {
    const r = validateForChannel('walmart', { ...base, widthPx: 900, heightPx: 900 })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.code === 'TOO_SMALL' && i.level === 'ERROR')).toBe(true)
  })

  it('errors on Etsy transparency and oversize file', () => {
    const r = validateForChannel('etsy', { ...base, format: 'png', hasTransparency: true, background: 'TRANSPARENT', isMain: false, bytes: 3_000_000, widthPx: 2000, heightPx: 2000 })
    expect(r.issues.some((i) => i.code === 'TRANSPARENCY' && i.level === 'ERROR')).toBe(true)
    expect(r.issues.some((i) => i.code === 'TOO_HEAVY' && i.level === 'WARN')).toBe(true)
  })

  it('warns (not errors) on non-square and a transparent main needing white', () => {
    const r = validateForChannel('walmart', { ...base, widthPx: 2200, heightPx: 1600, background: 'TRANSPARENT', format: 'png' })
    expect(r.ok).toBe(true) // only warnings (paddable + white-compositable)
    expect(r.issues.some((i) => i.code === 'NOT_SQUARE' && i.level === 'WARN')).toBe(true)
    expect(r.issues.some((i) => i.code === 'BACKGROUND' && i.level === 'WARN')).toBe(true)
  })

  it('hard-errors a coloured (non-white) main on a white-required channel', () => {
    const r = validateForChannel('amazon', { ...base, widthPx: 1600, heightPx: 1600, background: 'OTHER' })
    expect(r.ok).toBe(false)
    expect(r.issues.find((i) => i.code === 'BACKGROUND')?.level).toBe('ERROR')
  })

  it('rejects an unaccepted format', () => {
    const r = validateForChannel('amazon', { ...base, widthPx: 1600, heightPx: 1600, format: 'webp' })
    expect(r.issues.some((i) => i.code === 'FORMAT' && i.level === 'ERROR')).toBe(true)
  })
})

describe('normalizationPlan', () => {
  it('is empty for an already-compliant image', () => {
    expect(normalizationPlan('amazon', { ...base, widthPx: 1600, heightPx: 1600 })).toEqual([])
  })

  it('orders colour → geometry → format → size', () => {
    const plan = normalizationPlan('amazon', {
      ...base,
      widthPx: 12000,
      heightPx: 9000,
      format: 'webp',
      hasTransparency: true,
      background: 'TRANSPARENT',
      bytes: 20_000_000,
    })
    const ops = plan.map((s) => s.op)
    expect(ops).toEqual(['FLATTEN_TRANSPARENCY', 'ADD_WHITE_BACKGROUND', 'PAD_TO_SQUARE', 'DOWNSCALE', 'CONVERT_FORMAT', 'COMPRESS'])
    const ds = plan.find((s) => s.op === 'DOWNSCALE')
    expect(ds && ds.op === 'DOWNSCALE' && ds.toLongEdgePx).toBe(10000)
  })

  it('marks CANNOT_FIX when below minimum resolution', () => {
    const plan = normalizationPlan('walmart', { ...base, widthPx: 900, heightPx: 900 })
    expect(plan[0]?.op).toBe('CANNOT_FIX')
  })
})
