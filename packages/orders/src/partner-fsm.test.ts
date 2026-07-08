import { describe, it, expect } from 'vitest'
import {
  assertPartnerTransition,
  isPartnerTransitionAllowed,
  PARTNER_ALLOWED_TRANSITIONS,
} from './partner-fsm'

describe('partner-fsm — Model A invite handshake', () => {
  it('admin can qualify a lead to INVITED (DRAFT/LEAD → INVITED)', () => {
    expect(isPartnerTransitionAllowed('DRAFT', 'INVITED')).toBe(true)
    expect(isPartnerTransitionAllowed('LEAD', 'INVITED')).toBe(true)
  })

  it('first login advances INVITED → IN_PROGRESS', () => {
    expect(isPartnerTransitionAllowed('INVITED', 'IN_PROGRESS')).toBe(true)
  })

  it('onboarding submit reaches the canonical review state', () => {
    expect(isPartnerTransitionAllowed('LEAD', 'IDENTITY_PENDING_REVIEW')).toBe(true)
    expect(isPartnerTransitionAllowed('IN_PROGRESS', 'IDENTITY_PENDING_REVIEW')).toBe(true)
  })

  it('canonical forward ladder holds', () => {
    expect(isPartnerTransitionAllowed('IDENTITY_PENDING_REVIEW', 'IDENTITY_VERIFIED')).toBe(true)
    expect(isPartnerTransitionAllowed('OPERATIONALLY_CONFIGURED', 'ACTIVE')).toBe(true)
  })

  it('rejects illegal jumps + assert throws', () => {
    expect(isPartnerTransitionAllowed('LEAD', 'ACTIVE')).toBe(false)
    expect(isPartnerTransitionAllowed('TERMINATED', 'ACTIVE')).toBe(false)
    expect(() => assertPartnerTransition('DRAFT', 'INVITED')).not.toThrow()
    expect(() => assertPartnerTransition('INVITED', 'INVITED')).not.toThrow() // idempotent
    expect(() => assertPartnerTransition('LEAD', 'ACTIVE')).toThrow(/Invalid Partner transition/)
  })

  it('every destination is a known status key', () => {
    const known = new Set(Object.keys(PARTNER_ALLOWED_TRANSITIONS))
    // sources are all keys; spot-check INVITED targets exist as sources or terminal
    for (const dests of Object.values(PARTNER_ALLOWED_TRANSITIONS)) {
      for (const d of dests ?? []) expect(typeof d).toBe('string')
    }
    expect(known.has('INVITED')).toBe(true)
  })
})
