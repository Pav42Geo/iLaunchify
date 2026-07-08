import { describe, it, expect } from 'vitest'
import {
  activationStepsFor,
  isServiceActivationComplete,
  activationProgress,
  ACTIVATION_SHARED_STEPS,
  trackFor,
  type PartnerServiceType,
} from './activation-tracks'

const allKeys = (types: PartnerServiceType[]) =>
  new Set(activationStepsFor(types).map((s) => s.key))

describe('activation-tracks', () => {
  it('composes the union of selected service tracks + shared tail once', () => {
    const steps = activationStepsFor(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'])
    const keys = steps.map((s) => s.key)
    // one of each service's steps present
    expect(keys).toContain('mfr.products')
    expect(keys).toContain('copack.formats')
    expect(keys).toContain('print.materials')
    // shared tail appears exactly once
    expect(keys.filter((k) => k === 'shared.review')).toHaveLength(1)
    // shared steps come last
    expect(keys.slice(-3)).toEqual(['shared.certs', 'shared.pricing', 'shared.review'])
  })

  it('is deterministic regardless of input order', () => {
    const a = activationStepsFor(['LABEL_PRINTING', 'MANUFACTURING']).map((s) => s.key)
    const b = activationStepsFor(['MANUFACTURING', 'LABEL_PRINTING']).map((s) => s.key)
    expect(a).toEqual(b)
  })

  it('empty selection → shared tail only', () => {
    expect(activationStepsFor([]).map((s) => s.key)).toEqual(ACTIVATION_SHARED_STEPS.map((s) => s.key))
  })

  it('per-service go-live gates independently (D8)', () => {
    const types: PartnerServiceType[] = ['MANUFACTURING', 'LABEL_PRINTING']
    // finish manufacturing + shared, but not print
    const done = new Set([...trackFor('MANUFACTURING').map((s) => s.key), ...ACTIVATION_SHARED_STEPS.map((s) => s.key)])
    expect(isServiceActivationComplete('MANUFACTURING', done)).toBe(true)
    expect(isServiceActivationComplete('LABEL_PRINTING', done)).toBe(false)
    const p = activationProgress(types, done)
    expect(p.perService.MANUFACTURING.live).toBe(true)
    expect(p.perService.LABEL_PRINTING.live).toBe(false)
  })

  it('a service is not live until the shared tail is done too', () => {
    const onlyOwn = new Set(trackFor('MANUFACTURING').map((s) => s.key))
    expect(isServiceActivationComplete('MANUFACTURING', onlyOwn)).toBe(false)
  })

  it('progress counts all composed steps', () => {
    const p = activationProgress(['COPACKING'], allKeys(['COPACKING']))
    expect(p.done).toBe(p.total)
    expect(p.perService.COPACKING.live).toBe(true)
  })
})
