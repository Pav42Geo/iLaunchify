import { describe, it, expect } from 'vitest'
import {
  toBriefCardVM,
  fmtBudget,
  postedAgo,
  DAY_MS,
  type BriefRowInput,
  type BriefVmContext,
} from './brief-card-vm'

const NOW = Date.parse('2026-07-12T12:00:00Z')

function row(overrides: Partial<BriefRowInput> = {}): BriefRowInput {
  return {
    id: 'b1',
    title: 'Passion-fruit Protein Water',
    status: 'INTEREST_OPEN',
    createdAt: new Date(NOW - 2 * DAY_MS),
    targetVolume: 5000,
    budgetLow: 1.2,
    budgetHigh: 1.8,
    timelineWeeks: 6,
    categoryName: 'Functional Beverages',
    interestCreatedAts: [],
    room: null,
    ...overrides,
  }
}

function ctx(overrides: Partial<BriefVmContext> = {}): BriefVmContext {
  return {
    now: NOW,
    interestWindowDays: 14,
    nicheName: 'Fitness & Sports',
    emoji: '🥤',
    gradient: 'radial-gradient(x)',
    ...overrides,
  }
}

describe('bucket + journey mapping', () => {
  const cases: [string, string, number][] = [
    ['DRAFT', 'other', 0],
    ['POSTED', 'open', 1],
    ['INTEREST_OPEN', 'open', 1],
    ['SHORTLISTING', 'choosing', 2],
    ['MATCHED', 'room', 3],
    ['IN_ROOM', 'room', 3],
    ['IN_PRODUCTION', 'prod', 4],
    ['COMPLETED', 'prod', 5],
    ['CANCELLED', 'other', 1],
    ['EXPIRED', 'other', 1],
  ]
  it.each(cases)('%s → bucket %s, journey %i', (status, bucket, journey) => {
    const vm = toBriefCardVM(row({ status }), ctx())
    expect(vm.bucket).toBe(bucket)
    expect(vm.journey).toBe(journey)
  })

  it('unknown status falls back to other/0 (forward-compatible)', () => {
    const vm = toBriefCardVM(row({ status: 'SOMETHING_NEW' }), ctx())
    expect(vm.bucket).toBe('other')
    expect(vm.journey).toBe(0)
  })
})

describe('terms formatting', () => {
  it('formats volume/budget/lead from DB values', () => {
    const vm = toBriefCardVM(row(), ctx())
    expect(vm.vol).toBe('5,000')
    expect(vm.budget).toBe('$1.20–1.80')
    expect(vm.lead).toBe('6 wk')
    expect(vm.category).toBe('Functional Beverages')
  })

  it('missing terms are null (rendered as —), never invented', () => {
    const vm = toBriefCardVM(
      row({ targetVolume: null, budgetLow: null, budgetHigh: null, timelineWeeks: null, categoryName: null }),
      ctx(),
    )
    expect(vm.vol).toBeNull()
    expect(vm.budget).toBeNull()
    expect(vm.lead).toBeNull()
    expect(vm.category).toBeNull()
  })

  it('fmtBudget handles single-sided ranges and Decimal-like strings', () => {
    expect(fmtBudget('1.2', '1.8')).toBe('$1.20–1.80')
    expect(fmtBudget(0.9, null)).toBe('$0.90')
    expect(fmtBudget(null, 2.5)).toBe('$2.50')
    expect(fmtBudget(null, null)).toBeNull()
  })
})

describe('pool window (CoCreationSettings.interestWindowDays)', () => {
  it('counts down from createdAt + window', () => {
    // posted 2d ago, 14-day window → 12 days left
    expect(toBriefCardVM(row(), ctx()).poolDaysLeft).toBe(12)
  })

  it('clamps at 0 and only applies to pool statuses', () => {
    const old = row({ createdAt: new Date(NOW - 20 * DAY_MS) })
    expect(toBriefCardVM(old, ctx()).poolDaysLeft).toBe(0)
    expect(toBriefCardVM(row({ status: 'IN_ROOM' }), ctx()).poolDaysLeft).toBeNull()
    expect(toBriefCardVM(row({ status: 'SHORTLISTING' }), ctx()).poolDaysLeft).toBe(12)
  })

  it('respects the admin-tuned window length', () => {
    expect(toBriefCardVM(row(), ctx({ interestWindowDays: 30 })).poolDaysLeft).toBe(28)
  })
})

describe('interests + attention', () => {
  const interests = [
    new Date(NOW - 1 * DAY_MS), // new (<48h)
    new Date(NOW - 3 * DAY_MS),
    new Date(NOW - 5 * DAY_MS),
  ]

  it('counts interests and flags <48h ones as new', () => {
    const vm = toBriefCardVM(row({ interestCreatedAts: interests }), ctx())
    expect(vm.interested).toBe(3)
    expect(vm.newInterests).toBe(1)
  })

  it('open/choosing with interests → compare & pick attention', () => {
    expect(toBriefCardVM(row({ interestCreatedAts: interests }), ctx()).attention).toBe(
      '3 interests — compare & pick',
    )
    expect(
      toBriefCardVM(row({ status: 'SHORTLISTING', interestCreatedAts: [interests[0]!] }), ctx())
        .attention,
    ).toBe('1 interest — compare & pick')
    expect(toBriefCardVM(row(), ctx()).attention).toBeNull() // 0 interests
  })

  it('room with a partner submission awaiting review → review attention + meta line', () => {
    const vm = toBriefCardVM(
      row({
        status: 'IN_ROOM',
        room: {
          id: 'r1',
          materializedProductId: null,
          partnerName: 'VitaForm Labs',
          review: { kind: 'RECIPE', currentVersion: 2 },
        },
      }),
      ctx(),
    )
    expect(vm.attention).toBe('recipe v2 — your review')
    expect(vm.roomLine).toBe('recipe v2 needs your review')
    expect(vm.makerName).toBe('VitaForm Labs')
    expect(vm.roomId).toBe('r1')
  })

  it('room with nothing pending → no attention', () => {
    const vm = toBriefCardVM(
      row({
        status: 'IN_ROOM',
        room: { id: 'r1', materializedProductId: null, partnerName: 'VitaForm Labs', review: null },
      }),
      ctx(),
    )
    expect(vm.attention).toBeNull()
    expect(vm.roomLine).toBeNull()
  })

  it('SPEC_SHEET kind humanizes the underscore', () => {
    const vm = toBriefCardVM(
      row({
        status: 'IN_ROOM',
        room: {
          id: 'r1',
          materializedProductId: null,
          partnerName: 'X',
          review: { kind: 'SPEC_SHEET', currentVersion: 1 },
        },
      }),
      ctx(),
    )
    expect(vm.attention).toBe('spec sheet v1 — your review')
  })
})

describe('fresh + maker + product wiring', () => {
  it('fresh only when open and <24h old', () => {
    expect(toBriefCardVM(row({ createdAt: new Date(NOW - 6 * 3600_000) }), ctx()).fresh).toBe(true)
    expect(toBriefCardVM(row(), ctx()).fresh).toBe(false) // 2d old
    expect(
      toBriefCardVM(
        row({ status: 'IN_ROOM', createdAt: new Date(NOW - 3600_000) }),
        ctx(),
      ).fresh,
    ).toBe(false)
  })

  it('maker name only surfaces once matched (room/prod buckets)', () => {
    const roomData = { id: 'r1', materializedProductId: null, partnerName: 'Golden Leaf', review: null }
    expect(toBriefCardVM(row({ room: roomData }), ctx()).makerName).toBeNull() // still open
    expect(toBriefCardVM(row({ status: 'IN_PRODUCTION', room: roomData }), ctx()).makerName).toBe(
      'Golden Leaf',
    )
  })

  it('materialized product id passes through for the View-product CTA', () => {
    const vm = toBriefCardVM(
      row({
        status: 'COMPLETED',
        room: { id: 'r1', materializedProductId: 'p9', partnerName: 'X', review: null },
      }),
      ctx(),
    )
    expect(vm.productId).toBe('p9')
  })
})

describe('postedAgo', () => {
  it('renders prototype-style buckets', () => {
    expect(postedAgo(new Date(NOW - 5 * 60_000), NOW)).toBe('5m ago')
    expect(postedAgo(new Date(NOW - 6 * 3600_000), NOW)).toBe('6h ago')
    expect(postedAgo(new Date(NOW - 2 * DAY_MS), NOW)).toBe('2d ago')
    expect(postedAgo(new Date(NOW - 42 * DAY_MS), NOW)).toBe('6w ago')
    expect(postedAgo(new Date(NOW), NOW)).toBe('1m ago')
  })
})
