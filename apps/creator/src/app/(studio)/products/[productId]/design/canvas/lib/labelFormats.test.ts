import { describe, it, expect } from 'vitest'
import { rankLabelFormats, trimSurfaceAreaSqIn, type FormatRuleLite } from './labelFormats'

function rule(over: Partial<FormatRuleLite> = {}): FormatRuleLite {
  return {
    format: 'FDA_VERTICAL',
    minSurfaceAreaSqIn: 5,
    minLabelWidthMm: 40,
    minLabelHeightMm: 55,
    supportsMultiColumn: false,
    supportsAggregate: false,
    preferenceScore: 100,
    ...over,
  }
}

const bigLabel = { trimSurfaceAreaSqIn: 30, widthMm: 100, heightMm: 120, flavorCount: 1 }

describe('trimSurfaceAreaSqIn', () => {
  it('converts mm² to in² (25.4mm square = 1 sq in)', () => {
    expect(trimSurfaceAreaSqIn(25.4, 25.4)).toBeCloseTo(1, 5)
  })
  it('scales with both dimensions', () => {
    expect(trimSurfaceAreaSqIn(50.8, 25.4)).toBeCloseTo(2, 5)
  })
})

describe('rankLabelFormats — fit gating', () => {
  it('drops formats that need more surface/width/height than the label has', () => {
    const fits = rule({ format: 'FITS', minSurfaceAreaSqIn: 5 })
    const tooBig = rule({ format: 'TOO_BIG', minSurfaceAreaSqIn: 100 })
    const { recommended, alternatives } = rankLabelFormats([fits, tooBig], bigLabel)
    expect(recommended?.format).toBe('FITS')
    expect(alternatives.map((a) => a.format)).not.toContain('TOO_BIG')
  })

  it('returns null recommended when nothing fits', () => {
    const { recommended } = rankLabelFormats([rule({ minLabelWidthMm: 999 })], bigLabel)
    expect(recommended).toBeNull()
  })
})

describe('rankLabelFormats — flavorCount > 1 requires multi-column/aggregate', () => {
  it('excludes single-column formats and keeps aggregate ones', () => {
    const single = rule({ format: 'SINGLE' })
    const aggregate = rule({ format: 'AGG', supportsAggregate: true, preferenceScore: 50 })
    const multi = rule({ format: 'MULTI', supportsMultiColumn: true, preferenceScore: 40 })
    const { recommended, alternatives } = rankLabelFormats([single, aggregate, multi], {
      ...bigLabel,
      flavorCount: 3,
    })
    const formats = [recommended?.format, ...alternatives.map((a) => a.format)]
    expect(formats).toContain('AGG')
    expect(formats).toContain('MULTI')
    expect(formats).not.toContain('SINGLE')
  })
})

describe('rankLabelFormats — ranking', () => {
  it('recommends the highest preferenceScore, rest are alternatives', () => {
    const low = rule({ format: 'LOW', preferenceScore: 30 })
    const high = rule({ format: 'HIGH', preferenceScore: 90 })
    const { recommended, alternatives } = rankLabelFormats([low, high], bigLabel)
    expect(recommended?.format).toBe('HIGH')
    expect(alternatives.map((a) => a.format)).toEqual(['LOW'])
  })

  it('breaks ties deterministically by format name', () => {
    const b = rule({ format: 'B_FMT', preferenceScore: 50 })
    const a = rule({ format: 'A_FMT', preferenceScore: 50 })
    const { recommended } = rankLabelFormats([b, a], bigLabel)
    expect(recommended?.format).toBe('A_FMT')
  })
})
