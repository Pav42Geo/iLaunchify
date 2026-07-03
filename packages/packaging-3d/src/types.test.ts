import { describe, it, expect } from 'vitest'
import {
  STRUCTURAL_PACK_TYPES,
  PACKAGING_TOPOLOGIES,
  GEOMETRY_SOURCES,
  isStructuralPackType,
  isPackagingTopology,
  isGeometrySource,
} from './types'

describe('packaging-3d vocabulary', () => {
  it('locks the 6 structural pack types', () => {
    expect(STRUCTURAL_PACK_TYPES).toHaveLength(6)
  })

  it('locks the 10 packaging topologies', () => {
    expect(PACKAGING_TOPOLOGIES).toHaveLength(10)
  })

  it('exposes the three geometry sources', () => {
    expect(GEOMETRY_SOURCES).toEqual(['PARAMETRIC', 'FOLD_FROM_NET', 'GLTF'])
  })
})

describe('type guards', () => {
  it('accepts known structural pack types and rejects others', () => {
    expect(isStructuralPackType('SINGLE_UNIT')).toBe(true)
    expect(isStructuralPackType('CUSTOMIZABLE_PICK_N')).toBe(true)
    expect(isStructuralPackType('NOPE')).toBe(false)
    expect(isStructuralPackType(42)).toBe(false)
    expect(isStructuralPackType(undefined)).toBe(false)
  })

  it('accepts known topologies and rejects others', () => {
    expect(isPackagingTopology('POUCH_STAND_UP')).toBe(true)
    expect(isPackagingTopology('single_container')).toBe(false) // case-sensitive
  })

  it('accepts known geometry sources and rejects others', () => {
    expect(isGeometrySource('PARAMETRIC')).toBe(true)
    expect(isGeometrySource('GLTF')).toBe(true)
    expect(isGeometrySource('STL')).toBe(false)
  })
})
