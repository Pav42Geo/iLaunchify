import { describe, it, expect } from 'vitest'
import { materialTakesDesign, materialsForDesign } from './gltf-design-binding'
import type { BindableSurface } from './gltf-surface-binding'

describe('materialTakesDesign', () => {
  it('body target: labels/body yes, caps/base no', () => {
    expect(materialTakesDesign('body_wrap', 'body')).toBe(true)
    expect(materialTakesDesign('Front', 'body')).toBe(true)
    expect(materialTakesDesign('Lid', 'body')).toBe(false)
    expect(materialTakesDesign('base', 'body')).toBe(false)
    expect(materialTakesDesign('mystery', 'body')).toBe(true) // safe default
  })

  it('top target: only caps/lids', () => {
    expect(materialTakesDesign('Lid', 'top')).toBe(true)
    expect(materialTakesDesign('cap_top', 'top')).toBe(true)
    expect(materialTakesDesign('body', 'top')).toBe(false)
  })
})

const surfaces: BindableSurface[] = [
  { key: 'front', label: 'Front label', part: 'body' },
  { key: 'lid', label: 'Lid', part: 'lid' },
]

describe('materialsForDesign — exact binding', () => {
  it('body design → the material bound to the front/body surface', () => {
    const binding = { Wrap: 'front', Cap: 'lid' }
    expect(materialsForDesign(['Wrap', 'Cap'], binding, surfaces, 'body')).toEqual(['Wrap'])
  })

  it('lid sticker → the material bound to the lid surface', () => {
    const binding = { Wrap: 'front', Cap: 'lid' }
    expect(materialsForDesign(['Wrap', 'Cap'], binding, surfaces, 'top')).toEqual(['Cap'])
  })
})

describe('materialsForDesign — fallbacks', () => {
  it('falls back to the name heuristic when binding yields nothing', () => {
    // No binding entries → exact stage empty → heuristic picks the body-ish names.
    const out = materialsForDesign(['body_1', 'Lid'], {}, surfaces, 'body')
    expect(out).toContain('body_1')
    expect(out).not.toContain('Lid')
  })

  it('falls back to ALL when nothing matches (never blank)', () => {
    // top target, but no cap-like names and no bound cap material.
    const out = materialsForDesign(['plainA', 'plainB'], {}, [], 'top')
    expect(out).toEqual(['plainA', 'plainB'])
  })

  it('with no surfaces, uses the heuristic directly', () => {
    expect(materialsForDesign(['front_panel', 'foot'], {}, [], 'body')).toEqual(['front_panel'])
  })
})
