import { describe, expect, it } from 'vitest'
import {
  selectRotatingProvider,
  validateRotationPolicy,
  isPublicPrintPoolEligible,
  type RotationCandidate,
  type RotationPolicyInput,
} from './rotation'

describe('isPublicPrintPoolEligible — main-role rule (public print pool = pure printers only)', () => {
  it('pure printer, public → eligible', () => {
    expect(isPublicPrintPoolEligible({ participationMode: 'PUBLIC', serviceTypes: ['LABEL_PRINTING'] })).toBe(true)
  })
  it('printer that also warehouses, public → still eligible (warehouse does not disqualify)', () => {
    expect(
      isPublicPrintPoolEligible({ participationMode: 'PUBLIC', serviceTypes: ['LABEL_PRINTING', 'WAREHOUSE'] }),
    ).toBe(true)
  })
  it('manufacturer that also prints → excluded from the public pool', () => {
    expect(
      isPublicPrintPoolEligible({ participationMode: 'PUBLIC', serviceTypes: ['MANUFACTURING', 'LABEL_PRINTING'] }),
    ).toBe(false)
  })
  it('co-packer that also prints → excluded from the public pool', () => {
    expect(
      isPublicPrintPoolEligible({ participationMode: 'PUBLIC', serviceTypes: ['COPACKING', 'LABEL_PRINTING'] }),
    ).toBe(false)
  })
  it('pure printer but INVITED_ONLY → not in the public pool (nomination-only)', () => {
    expect(isPublicPrintPoolEligible({ participationMode: 'INVITED_ONLY', serviceTypes: ['LABEL_PRINTING'] })).toBe(
      false,
    )
  })
})

const basePolicy: RotationPolicyInput = {
  enabled: true,
  poolSize: 3,
  mode: 'EQUAL',
  slotSharesPct: [],
  newProviderSharePct: 0,
  newProviderMaxOpen: 2,
  ratingFloor: null,
  locationBiasPct: 0,
  stickyReorders: true,
}

function cand(over: Partial<RotationCandidate> & { serviceId: string }): RotationCandidate {
  return {
    ratingBayesian: 4.0,
    ratingCount: 10,
    isNew: false,
    excludeFromAutoRotation: false,
    distanceMiles: null,
    openAwardCount: 0,
    lastAwardedAt: null,
    ...over,
  }
}

const ctx = (over: Partial<Parameters<typeof selectRotatingProvider>[1]> = {}) => ({
  policy: basePolicy,
  roll: 0.99, // above any diversion share by default
  poolRoll: 0,
  ...over,
})

describe('selectRotatingProvider', () => {
  it('returns NO_CANDIDATES on empty input', () => {
    const d = selectRotatingProvider([], ctx())
    expect(d.winnerServiceId).toBeNull()
    expect(d.path).toBe('NO_CANDIDATES')
  })

  it('disabled engine = first candidate in caller order (pre-SR behavior)', () => {
    const d = selectRotatingProvider(
      [cand({ serviceId: 'b', ratingBayesian: 1 }), cand({ serviceId: 'a', ratingBayesian: 5 })],
      ctx({ policy: { ...basePolicy, enabled: false } }),
    )
    expect(d.winnerServiceId).toBe('b')
    expect(d.path).toBe('DISABLED_FIRST_CANDIDATE')
  })

  it('sticky reorder wins when the previous provider is still a candidate', () => {
    const d = selectRotatingProvider(
      [cand({ serviceId: 'a', ratingBayesian: 5 }), cand({ serviceId: 'prev', ratingBayesian: 2 })],
      ctx({ previousProviderServiceId: 'prev' }),
    )
    expect(d.winnerServiceId).toBe('prev')
    expect(d.path).toBe('STICKY_REORDER')
  })

  it('sticky reorder is skipped when disabled in policy', () => {
    const d = selectRotatingProvider(
      [cand({ serviceId: 'a', ratingBayesian: 5 }), cand({ serviceId: 'prev', ratingBayesian: 2 })],
      ctx({
        policy: { ...basePolicy, stickyReorders: false, mode: 'BEST_ONLY' },
        previousProviderServiceId: 'prev',
      }),
    )
    expect(d.winnerServiceId).toBe('a')
  })

  it('new-provider diversion fires under the share roll, capped by open awards', () => {
    const policy = { ...basePolicy, newProviderSharePct: 20 }
    const newbie = cand({ serviceId: 'new1', ratingBayesian: null, isNew: true })
    const capped = cand({
      serviceId: 'new2',
      ratingBayesian: null,
      isNew: true,
      openAwardCount: 2,
    })
    const vet = cand({ serviceId: 'vet', ratingBayesian: 4.8 })

    const diverted = selectRotatingProvider([vet, capped, newbie], ctx({ policy, roll: 0.1 }))
    expect(diverted.path).toBe('NEW_PROVIDER_DIVERSION')
    expect(diverted.winnerServiceId).toBe('new1') // capped one skipped

    const notDiverted = selectRotatingProvider([vet, newbie], ctx({ policy, roll: 0.5 }))
    expect(notDiverted.path).not.toBe('NEW_PROVIDER_DIVERSION')
  })

  it('rating floor removes low-rated providers from the pool', () => {
    const d = selectRotatingProvider(
      [
        cand({ serviceId: 'low', ratingBayesian: 2.0 }),
        cand({ serviceId: 'high', ratingBayesian: 4.5 }),
      ],
      ctx({ policy: { ...basePolicy, ratingFloor: 3.0, mode: 'EQUAL' } }),
    )
    expect(d.pool.map((p) => p.serviceId)).toEqual(['high'])
    expect(d.winnerServiceId).toBe('high')
  })

  it('poolSize caps the pool at top-N by rating', () => {
    const d = selectRotatingProvider(
      [
        cand({ serviceId: 'a', ratingBayesian: 5 }),
        cand({ serviceId: 'b', ratingBayesian: 4 }),
        cand({ serviceId: 'c', ratingBayesian: 3 }),
        cand({ serviceId: 'd', ratingBayesian: 2 }),
      ],
      ctx({ policy: { ...basePolicy, poolSize: 2 } }),
    )
    expect(d.pool.map((p) => p.serviceId)).toEqual(['a', 'b'])
  })

  it('EQUAL rotates to the least-recently-awarded pool member', () => {
    const d = selectRotatingProvider(
      [
        cand({ serviceId: 'a', ratingBayesian: 5, lastAwardedAt: new Date('2026-07-01') }),
        cand({ serviceId: 'b', ratingBayesian: 4.5, lastAwardedAt: new Date('2026-06-01') }),
        cand({ serviceId: 'c', ratingBayesian: 4, lastAwardedAt: null }),
      ],
      ctx(),
    )
    expect(d.winnerServiceId).toBe('c') // never-awarded first
    expect(d.path).toBe('POOL_EQUAL')
  })

  it('RANDOM picks by uniform poolRoll', () => {
    const cands = [
      cand({ serviceId: 'a', ratingBayesian: 5 }),
      cand({ serviceId: 'b', ratingBayesian: 4 }),
      cand({ serviceId: 'c', ratingBayesian: 3 }),
    ]
    const policy = { ...basePolicy, mode: 'RANDOM' as const }
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0 })).winnerServiceId).toBe('a')
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.5 })).winnerServiceId).toBe('b')
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.99 })).winnerServiceId).toBe('c')
  })

  it('WEIGHTED_EXACT honors exact slot percentages (50/30/20)', () => {
    const cands = [
      cand({ serviceId: 'a', ratingBayesian: 5 }),
      cand({ serviceId: 'b', ratingBayesian: 4 }),
      cand({ serviceId: 'c', ratingBayesian: 3 }),
    ]
    const policy = { ...basePolicy, mode: 'WEIGHTED_EXACT' as const, slotSharesPct: [50, 30, 20] }
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.49 })).winnerServiceId).toBe('a')
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.51 })).winnerServiceId).toBe('b')
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.79 })).winnerServiceId).toBe('b')
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.81 })).winnerServiceId).toBe('c')
  })

  it('WEIGHTED_EXACT renormalizes when the pool is smaller than the slots', () => {
    const cands = [
      cand({ serviceId: 'a', ratingBayesian: 5 }),
      cand({ serviceId: 'b', ratingBayesian: 4 }),
    ]
    const policy = { ...basePolicy, mode: 'WEIGHTED_EXACT' as const, slotSharesPct: [50, 30, 20] }
    // total over 2 slots = 80; roll 0.7 → target 56 > 50 → slot b.
    expect(selectRotatingProvider(cands, ctx({ policy, poolRoll: 0.7 })).winnerServiceId).toBe('b')
  })

  it('BEST_ONLY always takes the top-rated', () => {
    const d = selectRotatingProvider(
      [
        cand({ serviceId: 'b', ratingBayesian: 4, lastAwardedAt: null }),
        cand({ serviceId: 'a', ratingBayesian: 5, lastAwardedAt: new Date() }),
      ],
      ctx({ policy: { ...basePolicy, mode: 'BEST_ONLY' } }),
    )
    expect(d.winnerServiceId).toBe('a')
    expect(d.path).toBe('POOL_BEST_ONLY')
  })

  it('kill switch removes a provider from the auto pool but never strands the order', () => {
    const excludedOnly = selectRotatingProvider(
      [cand({ serviceId: 'x', excludeFromAutoRotation: true })],
      ctx(),
    )
    expect(excludedOnly.winnerServiceId).toBe('x') // sole candidate — order still routes

    const withAlternative = selectRotatingProvider(
      [
        cand({ serviceId: 'x', ratingBayesian: 5, excludeFromAutoRotation: true }),
        cand({ serviceId: 'y', ratingBayesian: 3 }),
      ],
      ctx(),
    )
    expect(withAlternative.winnerServiceId).toBe('y')
  })

  it('location bias pulls a closer, slightly lower-rated provider up the pool', () => {
    const cands = [
      cand({ serviceId: 'far', ratingBayesian: 4.6, distanceMiles: 900 }),
      cand({ serviceId: 'near', ratingBayesian: 4.3, distanceMiles: 10 }),
    ]
    const unbiased = selectRotatingProvider(cands, ctx({ policy: { ...basePolicy, mode: 'BEST_ONLY' } }))
    expect(unbiased.winnerServiceId).toBe('far')
    const biased = selectRotatingProvider(
      cands,
      ctx({ policy: { ...basePolicy, mode: 'BEST_ONLY', locationBiasPct: 40 } }),
    )
    expect(biased.winnerServiceId).toBe('near')
  })
})

describe('validateRotationPolicy', () => {
  it('accepts a sane default policy', () => {
    expect(validateRotationPolicy(basePolicy)).toBeNull()
  })
  it('rejects WEIGHTED_EXACT shares that do not sum to 100', () => {
    expect(
      validateRotationPolicy({
        ...basePolicy,
        mode: 'WEIGHTED_EXACT',
        slotSharesPct: [60, 30],
      }),
    ).toMatch(/sum to exactly 100/)
  })
  it('rejects more slots than the pool', () => {
    expect(
      validateRotationPolicy({
        ...basePolicy,
        poolSize: 2,
        mode: 'WEIGHTED_EXACT',
        slotSharesPct: [50, 30, 20],
      }),
    ).toMatch(/More slot shares/)
  })
  it('rejects out-of-range knobs', () => {
    expect(validateRotationPolicy({ ...basePolicy, poolSize: 0 })).toBeTruthy()
    expect(validateRotationPolicy({ ...basePolicy, newProviderSharePct: 101 })).toBeTruthy()
    expect(validateRotationPolicy({ ...basePolicy, locationBiasPct: -1 })).toBeTruthy()
  })
})
