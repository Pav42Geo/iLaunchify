// Pure coverage for the publish-time honey-problem gate (PS-7 §8.2.4). The
// prisma wrapper validateTemplateGraph needs a DB; this locks its pure core
// (templatePublishGraphInputs) composed with the already-pinned validator, which
// is exactly the resolution logic the publish gate blocks on. Shim-compatible.
import { describe, it, expect } from 'vitest'
import { templatePublishGraphInputs } from './template-graph'
import { validateGraphCompleteness } from './application-point'

const MFR = 'mfr-1'
const COPACK = 'copack-1'

// The gate's decision = validateGraphCompleteness over the inputs the template builds.
function gate(args: Parameters<typeof templatePublishGraphInputs>[0]) {
  return validateGraphCompleteness({ decoratedComponents: templatePublishGraphInputs(args) })
}

describe('publish gate — application-point resolution', () => {
  it('in-house print (externalPrint false) → nothing to gate, complete', () => {
    const r = gate({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL'],
      manufacturer: { serviceId: MFR, appliesLabels: false },
      coPacker: null,
      externalPrint: false,
    })
    expect(templatePublishGraphInputs({ appliedMethods: ['PRESSURE_SENSITIVE_LABEL'], manufacturer: { serviceId: MFR, appliesLabels: false }, coPacker: null, externalPrint: false })).toEqual([])
    expect(r.complete).toBe(true)
  })

  it('external print + manufacturer self-applies → resolved (complete)', () => {
    const r = gate({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL', 'SHRINK_SLEEVE'],
      manufacturer: { serviceId: MFR, appliesLabels: true },
      coPacker: null,
      externalPrint: true,
    })
    expect(r.complete).toBe(true)
  })

  it('Option 2 — no-apply manufacturer BUT a co-pack node applies → resolved', () => {
    const r = gate({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL'],
      manufacturer: { serviceId: MFR, appliesLabels: false },
      coPacker: { serviceId: COPACK, appliesLabels: true },
      externalPrint: true,
    })
    expect(r.complete).toBe(true)
  })

  it('Option 1 — no-apply manufacturer, co-pack gated OFF (coPacker null) → UNRESOLVED (blocks publish)', () => {
    const r = gate({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL'],
      manufacturer: { serviceId: MFR, appliesLabels: false },
      coPacker: null,
      externalPrint: true,
    })
    expect(r.complete).toBe(false)
    expect(r.problems[0]?.kind).toBe('APPLICATION_UNRESOLVED')
  })

  it('no-apply manufacturer AND a co-packer that also cannot apply → UNRESOLVED', () => {
    const r = gate({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL'],
      manufacturer: { serviceId: MFR, appliesLabels: false },
      coPacker: { serviceId: COPACK, appliesLabels: false },
      externalPrint: true,
    })
    expect(r.complete).toBe(false)
  })

  it('one graph input per applied decoration method', () => {
    const inputs = templatePublishGraphInputs({
      appliedMethods: ['PRESSURE_SENSITIVE_LABEL', 'SHRINK_SLEEVE', 'HEAT_TRANSFER'],
      manufacturer: { serviceId: MFR, appliesLabels: true },
      coPacker: null,
      externalPrint: true,
    })
    expect(inputs.length).toBe(3)
    expect(inputs.every((i) => i.fc === null && i.externalPrint === true)).toBe(true)
  })
})
