// Characterization tests for the audit vocabulary (H4 — packages/audit had 0 tests).
// Pure: types.ts imports only TYPES from @ilaunchify/db (erased at runtime), so the
// two hand-maintained string lists are plain data. These lists are exactly the kind
// of thing the 2026-07-09 audit warned drifts — a copy-pasted duplicate action or a
// dropped core entity is a silent forensic gap. This locks them.
import { describe, it, expect } from 'vitest'
import { AUDIT_ENTITY_TYPES, AUDIT_ACTIONS } from './types'

const duplicates = (arr: readonly string[]): string[] => {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const v of arr) (seen.has(v) ? dups : seen).add(v)
  return [...dups]
}

describe('AUDIT_ENTITY_TYPES', () => {
  it('has no duplicate entries (copy-paste guard)', () => {
    expect(duplicates(AUDIT_ENTITY_TYPES)).toEqual([])
  })
  it('is non-empty', () => {
    expect(AUDIT_ENTITY_TYPES.length).toBeGreaterThan(0)
  })
  it('includes the core money/lifecycle entities every mutation path audits', () => {
    for (const e of ['Order', 'OrderDispatch', 'Charge', 'Transfer', 'FeeRule', 'Partner', 'ProductTemplate']) {
      expect(AUDIT_ENTITY_TYPES as readonly string[]).toContain(e)
    }
  })
})

describe('AUDIT_ACTIONS', () => {
  it('has no duplicate entries (copy-paste guard)', () => {
    expect(duplicates(AUDIT_ACTIONS as readonly string[])).toEqual([])
  })
  it('is non-empty', () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0)
  })
  it('includes the core audited actions (money + tier paths)', () => {
    for (const a of ['ORDER_CREATED', 'CHARGE_SUCCEEDED', 'FEE_RULE_UPDATE', 'CREATOR_TIER_CHANGE', 'PARTNER_TIER_CHANGE']) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(a)
    }
  })
})
