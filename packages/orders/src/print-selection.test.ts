import { describe, it, expect } from 'vitest'
import {
  effectivePrintSourcing,
  showsPrintProviderCards,
  allowsSelfLabelFallback,
} from './print-sourcing'
import {
  eligiblePrintProviders,
  type PrintJobRequirements,
  type PrintProviderCandidate,
} from './print-eligibility'
import {
  resolveApplicationPoint,
  validateGraphCompleteness,
  type ApplicationGraphInput,
} from './application-point'

// ---------------------------------------------------------------------------
// effectivePrintSourcing (§2)
// ---------------------------------------------------------------------------

describe('effectivePrintSourcing', () => {
  it('product override wins; else service default', () => {
    expect(effectivePrintSourcing({ printSourcingMode: 'IN_HOUSE' }, { labelingMode: 'EXTERNAL_REQUIRED' })).toBe('IN_HOUSE')
    expect(effectivePrintSourcing({ printSourcingMode: null }, { labelingMode: 'EXTERNAL_REQUIRED' })).toBe('EXTERNAL_REQUIRED')
    expect(effectivePrintSourcing(null, { labelingMode: 'EXTERNAL_ALLOWED' })).toBe('EXTERNAL_ALLOWED')
  })
  it('IN_HOUSE hides cards; EXTERNAL_REQUIRED forbids self-label fallback', () => {
    expect(showsPrintProviderCards('IN_HOUSE')).toBe(false)
    expect(showsPrintProviderCards('EXTERNAL_ALLOWED')).toBe(true)
    expect(allowsSelfLabelFallback('EXTERNAL_ALLOWED')).toBe(true)
    expect(allowsSelfLabelFallback('EXTERNAL_REQUIRED')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// eligiblePrintProviders (§7.3)
// ---------------------------------------------------------------------------

const MATRIX = [
  { containerCategory: 'CAN', decorationMethod: 'PRESSURE_SENSITIVE_LABEL' },
  { containerCategory: 'CAN', decorationMethod: 'DIRECT_PRINT' },
  { containerCategory: 'BOTTLE', decorationMethod: 'PRESSURE_SENSITIVE_LABEL' },
]

function job(overrides: Partial<PrintJobRequirements> = {}): PrintJobRequirements {
  return {
    packagingTypeId: 'pt-can',
    containerCategory: 'CAN',
    decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
    quantity: 500,
    requiresFoodContact: false,
    ...overrides,
  }
}

function candidate(overrides: Partial<PrintProviderCandidate> = {}): PrintProviderCandidate {
  return {
    serviceId: 'svc-1',
    serviceActive: true,
    partnerActive: true,
    stripeActive: true,
    inBlackout: false,
    offering: {
      moq: 250,
      maxRunQty: 10_000,
      foodContactSafe: true,
      substrateIds: [],
      hasDieline: true,
    },
    serviceSubstrateIds: [],
    outputSpec: { spotColorsAccepted: true, supportsWhiteInk: true, minDpi: 300 },
    ...overrides,
  }
}

describe('eligiblePrintProviders', () => {
  it('physics-invalid combo rejects EVERYONE and flags the job', () => {
    const r = eligiblePrintProviders(job({ decorationMethod: 'SHRINK_SLEEVE' }), [candidate()], MATRIX)
    expect(r.physicsValid).toBe(false)
    expect(r.eligible).toHaveLength(0)
    expect(r.rejected[0]!.reason).toBe('PHYSICS_INCOMPATIBLE')
  })

  it('happy path is eligible', () => {
    const r = eligiblePrintProviders(job(), [candidate()], MATRIX)
    expect(r.eligible).toEqual(['svc-1'])
    expect(r.rejected).toHaveLength(0)
  })

  it('quantity window: below MOQ and above max run both reject', () => {
    expect(eligiblePrintProviders(job({ quantity: 100 }), [candidate()], MATRIX).rejected[0]!.reason).toBe('BELOW_MOQ')
    expect(eligiblePrintProviders(job({ quantity: 100_000 }), [candidate()], MATRIX).rejected[0]!.reason).toBe('ABOVE_MAX_RUN')
  })

  it('a 100k order cannot land on a small digital shop, but an undeclared ceiling is permissive', () => {
    const noCeiling = candidate({ offering: { ...candidate().offering!, maxRunQty: null } })
    expect(eligiblePrintProviders(job({ quantity: 100_000 }), [noCeiling], MATRIX).eligible).toEqual(['svc-1'])
  })

  it('substrate: offering list wins, service list is the fallback, empty = permissive', () => {
    const offeringDeclared = candidate({ offering: { ...candidate().offering!, substrateIds: ['bopp'] } })
    expect(eligiblePrintProviders(job({ substrateId: 'paper' }), [offeringDeclared], MATRIX).rejected[0]!.reason).toBe('SUBSTRATE_UNSUPPORTED')
    const serviceDeclared = candidate({ serviceSubstrateIds: ['paper'] })
    expect(eligiblePrintProviders(job({ substrateId: 'paper' }), [serviceDeclared], MATRIX).eligible).toEqual(['svc-1'])
    expect(eligiblePrintProviders(job({ substrateId: 'paper' }), [candidate()], MATRIX).eligible).toEqual(['svc-1'])
  })

  it('dieline + dimensional envelope', () => {
    const noDieline = candidate({ offering: { ...candidate().offering!, hasDieline: false } })
    expect(eligiblePrintProviders(job(), [noDieline], MATRIX).rejected[0]!.reason).toBe('NO_DIELINE')
    const smallPress = candidate({ offering: { ...candidate().offering!, maxPrintWidthMm: 200 } })
    expect(eligiblePrintProviders(job({ printWidthMm: 300 }), [smallPress], MATRIX).rejected[0]!.reason).toBe('DIMS_OUT_OF_ENVELOPE')
    expect(eligiblePrintProviders(job({ printWidthMm: 150 }), [smallPress], MATRIX).eligible).toEqual(['svc-1'])
  })

  it('food contact is HARD — rating can never rescue it', () => {
    const notSafe = candidate({ offering: { ...candidate().offering!, foodContactSafe: false } })
    expect(eligiblePrintProviders(job({ requiresFoodContact: true }), [notSafe], MATRIX).rejected[0]!.reason).toBe('FOOD_CONTACT_REQUIRED')
  })

  it('design-vs-spec preflight: white ink + DPI demands', () => {
    const noWhite = candidate({ outputSpec: { spotColorsAccepted: true, supportsWhiteInk: false, minDpi: 300 } })
    expect(eligiblePrintProviders(job({ design: { usesWhiteInk: true } }), [noWhite], MATRIX).rejected[0]!.reason).toBe('DESIGN_SPEC_MISMATCH')
    expect(eligiblePrintProviders(job({ design: { minAssetDpi: 150 } }), [candidate()], MATRIX).rejected[0]!.reason).toBe('DESIGN_SPEC_MISMATCH')
  })

  it('ops state rejects before capability leaks', () => {
    expect(eligiblePrintProviders(job(), [candidate({ inBlackout: true })], MATRIX).rejected[0]!.reason).toBe('BLACKOUT')
    expect(eligiblePrintProviders(job(), [candidate({ stripeActive: false })], MATRIX).rejected[0]!.reason).toBe('STRIPE_INACTIVE')
  })

  it('mixed pool splits correctly', () => {
    const r = eligiblePrintProviders(
      job(),
      [candidate({ serviceId: 'ok' }), candidate({ serviceId: 'small', offering: { ...candidate().offering!, moq: 5000 } })],
      MATRIX,
    )
    expect(r.eligible).toEqual(['ok'])
    expect(r.rejected).toEqual([{ serviceId: 'small', reason: 'BELOW_MOQ' }])
  })
})

// ---------------------------------------------------------------------------
// resolveApplicationPoint + graph completeness (§8.2 / §8.4)
// ---------------------------------------------------------------------------

function graph(overrides: Partial<ApplicationGraphInput> = {}): ApplicationGraphInput {
  return {
    decorationMethod: 'PRESSURE_SENSITIVE_LABEL',
    manufacturer: { serviceId: 'mfr', appliesLabels: true },
    externalPrint: true,
    ...overrides,
  }
}

describe('resolveApplicationPoint', () => {
  it('printed-in decoration (DIRECT_PRINT) needs no application step', () => {
    expect(resolveApplicationPoint(graph({ decorationMethod: 'DIRECT_PRINT' }))).toEqual({ ok: true, node: null })
  })

  it('self-label = print + apply at one node, no label leg', () => {
    expect(resolveApplicationPoint(graph({ externalPrint: false }))).toEqual({ ok: true, node: null })
  })

  it('manufacturer applies at fill — the default (fewest hops)', () => {
    expect(resolveApplicationPoint(graph())).toEqual({ ok: true, node: { kind: 'MANUFACTURER', serviceId: 'mfr' } })
  })

  it('THE HONEY PROBLEM: no-apply producer falls to the co-packer, then to a qualified FC, else UNRESOLVED', () => {
    const noApply = graph({ manufacturer: { serviceId: 'mfr', appliesLabels: false } })
    expect(resolveApplicationPoint(noApply)).toEqual({ ok: false, reason: 'UNRESOLVED' })
    expect(
      resolveApplicationPoint({ ...noApply, coPacker: { serviceId: 'cop', appliesLabels: true } }),
    ).toEqual({ ok: true, node: { kind: 'COPACKER', serviceId: 'cop' } })
    expect(
      resolveApplicationPoint({ ...noApply, fc: { serviceId: 'fc', relabelMethods: ['PRESSURE_SENSITIVE_LABEL'] } }),
    ).toEqual({ ok: true, node: { kind: 'FC', serviceId: 'fc' } })
  })

  it('FC ship-to does NOT make the FC the application point without a verified matching RELABEL capability', () => {
    const noApply = graph({ manufacturer: { serviceId: 'mfr', appliesLabels: false } })
    // FC present (creator picked it as destination) but no relabel capability:
    expect(resolveApplicationPoint({ ...noApply, fc: { serviceId: 'fc', relabelMethods: [] } })).toEqual({ ok: false, reason: 'UNRESOLVED' })
    // FC can hand-apply PSL but this job is a shrink sleeve (steam tunnel):
    expect(
      resolveApplicationPoint({
        ...noApply,
        decorationMethod: 'SHRINK_SLEEVE',
        fc: { serviceId: 'fc', relabelMethods: ['PRESSURE_SENSITIVE_LABEL'] },
      }),
    ).toEqual({ ok: false, reason: 'UNRESOLVED' })
  })

  it('manufacturer-applies wins even when a qualified FC exists (labels never route to an FC by destination)', () => {
    const r = resolveApplicationPoint(graph({ fc: { serviceId: 'fc', relabelMethods: ['PRESSURE_SENSITIVE_LABEL'] } }))
    expect(r).toEqual({ ok: true, node: { kind: 'MANUFACTURER', serviceId: 'mfr' } })
  })
})

describe('validateGraphCompleteness', () => {
  it('complete graph resolves every component + assembly', () => {
    const r = validateGraphCompleteness({
      decoratedComponents: [{ componentId: 'c1', ...graph() }],
      assembly: { hasCartonComponents: true, manufacturerSelfAssembles: true, hasAssembler: false },
    })
    expect(r.complete).toBe(true)
    expect(r.applicationPoints[0]!.node?.kind).toBe('MANUFACTURER')
  })

  it('multi-printer order: both components resolve to the SAME application node', () => {
    const r = validateGraphCompleteness({
      decoratedComponents: [
        { componentId: 'label-a', ...graph() },
        { componentId: 'label-b', ...graph() },
      ],
    })
    expect(r.complete).toBe(true)
    const nodes = r.applicationPoints.map((p) => p.node?.serviceId)
    expect(nodes).toEqual(['mfr', 'mfr'])
  })

  it('flags unresolved application AND unresolved assembly (variety pack, §8.4)', () => {
    const r = validateGraphCompleteness({
      decoratedComponents: [
        { componentId: 'c1', ...graph({ manufacturer: { serviceId: 'mfr', appliesLabels: false } }) },
      ],
      assembly: { hasCartonComponents: true, manufacturerSelfAssembles: false, hasAssembler: false },
    })
    expect(r.complete).toBe(false)
    expect(r.problems).toEqual([
      { kind: 'APPLICATION_UNRESOLVED', componentId: 'c1' },
      { kind: 'ASSEMBLY_UNRESOLVED' },
    ])
  })
})
