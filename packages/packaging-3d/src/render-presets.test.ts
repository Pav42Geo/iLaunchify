import { describe, it, expect } from 'vitest'
import {
  CAMERA_PRESETS,
  HERO_CAMERA_ID,
  DEFAULT_INTAKE_ANGLES,
  isCameraPreset,
  getCameraPreset,
  pickDefaultThumbnail,
  type ThumbnailCandidate,
} from './render-presets'

describe('camera catalog', () => {
  it('has exactly one primary/hero preset, matching HERO_CAMERA_ID', () => {
    const primaries = CAMERA_PRESETS.filter((c) => c.primary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0]?.id).toBe(HERO_CAMERA_ID)
  })

  it('has unique ids', () => {
    const ids = CAMERA_PRESETS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('intake angles all exist in the catalog', () => {
    for (const a of DEFAULT_INTAKE_ANGLES) expect(isCameraPreset(a)).toBe(true)
  })

  it('getCameraPreset resolves and returns null for unknowns', () => {
    expect(getCameraPreset('front-3q')?.azimuthDeg).toBe(35)
    expect(getCameraPreset('nope')).toBeNull()
  })
})

describe('pickDefaultThumbnail (§9.7)', () => {
  const c = (id: string, kind: ThumbnailCandidate['kind'], cameraPreset?: string): ThumbnailCandidate => ({ id, kind, cameraPreset })

  it('prefers a studio render on the hero camera', () => {
    const picked = pickDefaultThumbnail([
      c('scene', 'SCENE_2D', 'front-3q'),
      c('studioFront', 'STANDARD_RENDER', 'front'),
      c('studioHero', 'STANDARD_RENDER', 'front-3q'),
    ])
    expect(picked).toBe('studioHero')
  })

  it('falls back to a front studio render, then any studio render', () => {
    expect(pickDefaultThumbnail([c('a', 'STANDARD_RENDER', 'front'), c('b', 'STANDARD_RENDER', 'side')])).toBe('a')
    expect(pickDefaultThumbnail([c('only', 'STANDARD_RENDER', 'top')])).toBe('only')
  })

  it('falls back to any candidate so a thumbnail always exists', () => {
    expect(pickDefaultThumbnail([c('x', 'AI_SCENE')])).toBe('x')
  })

  it('returns null only for an empty set', () => {
    expect(pickDefaultThumbnail([])).toBeNull()
  })
})
