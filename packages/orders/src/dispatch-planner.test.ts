import { describe, it, expect } from 'vitest'
import {
  isLive,
  estimateDispatchCosts,
  deriveItemDispatch,
  type PlannerLiveService,
  type ComponentLeg,
  type ItemRouting,
} from './dispatch-planner'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function svc(over: Partial<PlannerLiveService> & { id: string }): PlannerLiveService {
  return {
    type: 'LABEL_PRINTING',
    status: 'ACTIVE',
    ...over,
    partner: {
      status: 'ACTIVE',
      userId: `${over.id}-user`,
      user: { stripeAccountStatus: 'ACTIVE' },
      ...(over.partner ?? {}),
    },
  }
}

function comp(over: Partial<ComponentLeg> = {}): ComponentLeg {
  return {
    role: 'LABEL',
    decorationMethod: 'CMYK_DIGITAL',
    partnerService: null,
    ...over,
  }
}

const ROUTING: ItemRouting = {
  manufacturingServiceId: 'mfg-svc',
  manufacturingUserId: 'mfg-user',
  labelPrintingServiceId: 'own-label-svc',
  labelPrintingUserId: 'own-label-user',
}

const DEADLINE = new Date('2026-06-20T00:00:00Z')

// total = 1000 * 10 = 10_000 → mfg 3000 / print 800 / copack 700
const ITEM = { id: 'item-1', productId: 'prod-1', quantity: 10, unitPriceCents: 1000 }

function plan(components: ComponentLeg[], routing: ItemRouting = ROUTING) {
  return deriveItemDispatch({ orderId: 'order-1', item: ITEM, routing, components, acceptDeadlineAt: DEADLINE })
}

// -----------------------------------------------------------------------------
// isLive
// -----------------------------------------------------------------------------

describe('isLive', () => {
  it('is true only when service + partner + stripe are all ACTIVE', () => {
    expect(isLive(svc({ id: 'a' }))).toBe(true)
  })
  it('is false when the service is not ACTIVE', () => {
    expect(isLive(svc({ id: 'a', status: 'PAUSED' }))).toBe(false)
  })
  it('is false when the partner org is not ACTIVE', () => {
    expect(isLive(svc({ id: 'a', partner: { status: 'SUSPENDED', userId: 'u', user: { stripeAccountStatus: 'ACTIVE' } } }))).toBe(false)
  })
  it('is false when the Stripe payout account is not ACTIVE', () => {
    expect(isLive(svc({ id: 'a', partner: { status: 'ACTIVE', userId: 'u', user: { stripeAccountStatus: 'PENDING' } } }))).toBe(false)
  })
  it('is false when the user (and thus stripe status) is null', () => {
    expect(isLive(svc({ id: 'a', partner: { status: 'ACTIVE', userId: 'u', user: null } }))).toBe(false)
  })
  it('is false for null / undefined', () => {
    expect(isLive(null)).toBe(false)
    expect(isLive(undefined)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// estimateDispatchCosts
// -----------------------------------------------------------------------------

describe('estimateDispatchCosts', () => {
  it('splits the order total 30 / 8 / 7 and floors', () => {
    const c = estimateDispatchCosts({ productId: 'p', quantity: 10, unitPriceCents: 1000 })
    expect(c).toEqual({ manufacturerCostCents: 3000, printProviderCostCents: 800, coPackerCostCents: 700 })
  })
  it('floors fractional cents rather than rounding', () => {
    const c = estimateDispatchCosts({ productId: 'p', quantity: 1, unitPriceCents: 333 })
    // 333 → 99.9 / 26.64 / 23.31
    expect(c).toEqual({ manufacturerCostCents: 99, printProviderCostCents: 26, coPackerCostCents: 23 })
  })
})

// -----------------------------------------------------------------------------
// deriveItemDispatch — the core
// -----------------------------------------------------------------------------

describe('deriveItemDispatch — simple product (no components)', () => {
  const p = plan([])

  it('emits exactly one PRODUCT + one LABEL dispatch, no COPACKING', () => {
    expect(p.rows.map((r) => r.type)).toEqual(['PRODUCT', 'LABEL'])
  })
  it('pays the manufacturer the REMAINDER after distinct-partner carve-outs, not 30%', () => {
    // Payout fix (2026-07-18): production = 10*1000 = 10,000. The label leg here is
    // 'own-label-user' — a DISTINCT payee from 'mfg-user' — so it carves out 800
    // (8% placeholder) and the manufacturer gets the remaining 9,200. NOT 3,000.
    const product = p.rows.find((r) => r.type === 'PRODUCT')!
    expect(product.partnerServiceId).toBe('mfg-svc')
    expect(product.costCents).toBe(9200)
  })
  it('carves the distinct self-label payee at the 8% placeholder', () => {
    const label = p.rows.find((r) => r.type === 'LABEL')!
    expect(label.partnerServiceId).toBe('own-label-svc')
    expect(label.costCents).toBe(800)
    expect(p.primaryPrintServiceId).toBe('own-label-svc')
  })
  it('INVARIANT: dispatch legs sum to the production (no platform spread)', () => {
    const sum = p.rows.reduce((a, r) => a + r.costCents, 0)
    expect(sum).toBe(10_000) // == item.unitPriceCents * item.quantity
  })
  it('reports the manufacturer user and no assembly', () => {
    expect(p.manufacturerUserId).toBe('mfg-user')
    expect(p.assemblyUserIds).toEqual([])
  })
  it('stamps every row with the orderItemId, PENDING_ACCEPT + the deadline', () => {
    for (const r of p.rows) {
      expect(r.orderId).toBe('order-1')
      expect(r.orderItemId).toBe('item-1')
      expect(r.status).toBe('PENDING_ACCEPT')
      expect(r.acceptDeadlineAt).toBe(DEADLINE)
    }
  })
})

describe('deriveItemDispatch — print legs', () => {
  it('routes the LABEL to a live decorated-component provider (not the owner)', () => {
    const p = plan([comp({ partnerService: svc({ id: 'printer-A' }) })])
    const label = p.rows.find((r) => r.type === 'LABEL')!
    expect(label.partnerServiceId).toBe('printer-A')
    expect(p.printUserIds).toEqual(['printer-A-user'])
  })

  it('collapses two components sharing a provider into ONE label leg', () => {
    const shared = svc({ id: 'printer-A' })
    const p = plan([
      comp({ role: 'CONTAINER', partnerService: shared }),
      comp({ role: 'LABEL', partnerService: shared }),
    ])
    expect(p.rows.filter((r) => r.type === 'LABEL')).toHaveLength(1)
  })

  it('emits one leg per distinct provider and splits the print cost evenly (floored)', () => {
    const p = plan([
      comp({ partnerService: svc({ id: 'printer-A' }) }),
      comp({ partnerService: svc({ id: 'printer-B' }) }),
    ])
    const labels = p.rows.filter((r) => r.type === 'LABEL')
    expect(labels).toHaveLength(2)
    expect(labels.map((l) => l.costCents)).toEqual([400, 400]) // floor(800/2)
    expect(new Set(p.printUserIds)).toEqual(new Set(['printer-A-user', 'printer-B-user']))
  })

  it('drops a non-live provider and falls back to owner self-label', () => {
    const p = plan([comp({ partnerService: svc({ id: 'printer-A', status: 'PAUSED' }) })])
    const label = p.rows.find((r) => r.type === 'LABEL')!
    expect(label.partnerServiceId).toBe('own-label-svc')
  })

  it('ignores an undecorated (NONE) component for print routing', () => {
    const p = plan([comp({ decorationMethod: 'NONE', partnerService: svc({ id: 'printer-A' }) })])
    expect(p.rows.find((r) => r.type === 'LABEL')!.partnerServiceId).toBe('own-label-svc')
  })

  it('ignores a decorated component whose provider is not a LABEL_PRINTING service', () => {
    const p = plan([comp({ partnerService: svc({ id: 'copack-X', type: 'COPACKING' }) })])
    expect(p.rows.find((r) => r.type === 'LABEL')!.partnerServiceId).toBe('own-label-svc')
  })
})

describe('deriveItemDispatch — assembly (co-pack) legs', () => {
  it('adds a COPACKING leg to a live assembler for a CARTON component', () => {
    const p = plan([comp({ role: 'CARTON', decorationMethod: 'NONE', partnerService: svc({ id: 'assembler-A', type: 'COPACKING' }) })])
    const copack = p.rows.find((r) => r.type === 'COPACKING')!
    expect(copack.partnerServiceId).toBe('assembler-A')
    expect(copack.costCents).toBe(700)
    expect(p.assemblyUserIds).toEqual(['assembler-A-user'])
  })

  it('SHIPPER role also triggers an assembly leg', () => {
    const p = plan([comp({ role: 'SHIPPER', decorationMethod: 'NONE', partnerService: svc({ id: 'assembler-A', type: 'COPACKING' }) })])
    expect(p.rows.some((r) => r.type === 'COPACKING')).toBe(true)
  })

  it('falls back to manufacturer self-assembly when the assembler is not live', () => {
    const p = plan([comp({ role: 'CARTON', decorationMethod: 'NONE', partnerService: svc({ id: 'assembler-A', type: 'COPACKING', status: 'PAUSED' }) })])
    const copack = p.rows.find((r) => r.type === 'COPACKING')!
    expect(copack.partnerServiceId).toBe('mfg-svc')
    expect(p.assemblyUserIds).toEqual(['mfg-user'])
  })

  it('emits NO copacking leg when there is no carton/shipper component', () => {
    const p = plan([comp({ role: 'LABEL', partnerService: svc({ id: 'printer-A' }) })])
    expect(p.rows.some((r) => r.type === 'COPACKING')).toBe(false)
    expect(p.assemblyUserIds).toEqual([])
  })
})

describe('deriveItemDispatch — full variety pack (the integration case)', () => {
  // 2 distinct decorated inner-unit printers + an outer carton assembled by a co-packer.
  const p = plan([
    comp({ role: 'CONTAINER', partnerService: svc({ id: 'printer-A' }) }),
    comp({ role: 'CONTAINER', partnerService: svc({ id: 'printer-B' }) }),
    comp({ role: 'CARTON', decorationMethod: 'NONE', partnerService: svc({ id: 'assembler-A', type: 'COPACKING' }) }),
  ])

  it('decomposes into 1 PRODUCT + 2 LABEL + 1 COPACKING', () => {
    const counts = p.rows.reduce<Record<string, number>>((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {})
    expect(counts).toEqual({ PRODUCT: 1, LABEL: 2, COPACKING: 1 })
  })

  it('every dispatch carries the correct cost slice', () => {
    // Payout fix (2026-07-18): the manufacturer gets the REMAINDER after the two
    // distinct printers (800) and the distinct co-packer (700) carve out, i.e.
    // 10,000 - 800 - 700 = 8,500. It used to be a flat 30% (3,000), which underpaid
    // the manufacturer and let the platform keep the spread.
    expect(p.rows.find((r) => r.type === 'PRODUCT')!.costCents).toBe(8500)
    expect(p.rows.filter((r) => r.type === 'LABEL').map((r) => r.costCents)).toEqual([400, 400])
    expect(p.rows.find((r) => r.type === 'COPACKING')!.costCents).toBe(700)
  })
  it('INVARIANT: even the full multi-partner graph sums to production (10,000)', () => {
    expect(p.rows.reduce((a, r) => a + r.costCents, 0)).toBe(10_000)
  })

  it('reports deduped print + assembly users and the primary printer', () => {
    expect(new Set(p.printUserIds)).toEqual(new Set(['printer-A-user', 'printer-B-user']))
    expect(p.assemblyUserIds).toEqual(['assembler-A-user'])
    expect(p.primaryPrintServiceId).toBe('printer-A')
  })
})
