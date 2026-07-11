// Pure coverage for resolveOrderApplication — the checkout-time honey-problem
// gate (PS-7 §8.4). Locks the resolution the placeOrder pre-flight blocks on.
// Shim-compatible (describe/it/expect only).
import { describe, it, expect } from 'vitest'
import { resolveOrderApplication } from './application-point'

describe('resolveOrderApplication — checkout application resolution', () => {
  it('resolves when no external application is needed (mfr/co-packer self-applies)', () => {
    expect(
      resolveOrderApplication({
        needsExternalApplication: false,
        decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
        shipToFcRelabelMethods: [],
        allowFcRelabel: true,
      }).resolved,
    ).toBe(true)
  })

  it('resolves via the chosen ship-to FC when it relabels THIS method (gate ON)', () => {
    expect(
      resolveOrderApplication({
        needsExternalApplication: true,
        decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
        shipToFcRelabelMethods: ['PRESSURE_SENSITIVE_LABEL', 'SHRINK_SLEEVE'],
        allowFcRelabel: true,
      }).resolved,
    ).toBe(true)
  })

  it('UNRESOLVED when the FC does not cover this method', () => {
    expect(
      resolveOrderApplication({
        needsExternalApplication: true,
        decorationMethod: 'HEAT_TRANSFER',
        shipToFcRelabelMethods: ['PRESSURE_SENSITIVE_LABEL'],
        allowFcRelabel: true,
      }).resolved,
    ).toBe(false)
  })

  it('UNRESOLVED when the FC could relabel but the admin gate is OFF', () => {
    expect(
      resolveOrderApplication({
        needsExternalApplication: true,
        decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
        shipToFcRelabelMethods: ['PRESSURE_SENSITIVE_LABEL'],
        allowFcRelabel: false,
      }).resolved,
    ).toBe(false)
  })

  it('UNRESOLVED when the destination is not an FC (no relabel methods)', () => {
    expect(
      resolveOrderApplication({
        needsExternalApplication: true,
        decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
        shipToFcRelabelMethods: [],
        allowFcRelabel: true,
      }).resolved,
    ).toBe(false)
  })
})
