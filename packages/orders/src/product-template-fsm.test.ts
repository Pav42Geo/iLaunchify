import { describe, it, expect } from 'vitest'
import {
  assertProductTemplateTransition,
  isProductTemplateTransitionAllowed,
  PRODUCT_TEMPLATE_TRANSITIONS,
} from './product-template-fsm'

describe('product-template-fsm', () => {
  it('allows the canonical partner lifecycle edges', () => {
    expect(isProductTemplateTransitionAllowed('DRAFT', 'PENDING_REVIEW')).toBe(true)
    expect(isProductTemplateTransitionAllowed('DRAFT', 'REJECTED')).toBe(true)
    expect(isProductTemplateTransitionAllowed('PUBLISHED', 'PAUSED')).toBe(true)
    expect(isProductTemplateTransitionAllowed('PAUSED', 'PUBLISHED')).toBe(true)
    expect(isProductTemplateTransitionAllowed('PENDING_REVIEW', 'PUBLISHED')).toBe(true)
  })

  it('rejects illegal jumps', () => {
    expect(isProductTemplateTransitionAllowed('DRAFT', 'PUBLISHED')).toBe(false)
    expect(isProductTemplateTransitionAllowed('PUBLISHED', 'DRAFT')).toBe(false)
    expect(isProductTemplateTransitionAllowed('ARCHIVED', 'PUBLISHED')).toBe(false)
  })

  it('assert throws on invalid, passes on valid + idempotent', () => {
    expect(() => assertProductTemplateTransition('DRAFT', 'PENDING_REVIEW')).not.toThrow()
    expect(() => assertProductTemplateTransition('PAUSED', 'PAUSED')).not.toThrow() // idempotent
    expect(() => assertProductTemplateTransition('DRAFT', 'PUBLISHED')).toThrow(/Invalid ProductTemplate transition/)
  })

  it('every mapped source lists only known statuses', () => {
    const known = new Set(Object.keys(PRODUCT_TEMPLATE_TRANSITIONS))
    for (const dests of Object.values(PRODUCT_TEMPLATE_TRANSITIONS)) {
      for (const d of dests ?? []) expect(typeof d).toBe('string')
    }
    expect(known.has('DRAFT')).toBe(true)
  })
})
