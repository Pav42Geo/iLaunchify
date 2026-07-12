import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock posthog-node so the suite is network-free.
const captureImmediate = vi.fn().mockResolvedValue(undefined)
const capture = vi.fn()
const shutdown = vi.fn().mockResolvedValue(undefined)
vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({ captureImmediate, capture, shutdown })),
}))

import { PostHogSink } from '../posthog'

const sink = new PostHogSink({ apiKey: 'phc_test' })

afterEach(() => vi.clearAllMocks())

describe('PostHogSink mapping', () => {
  it('maps a creator event to an identified person', async () => {
    await sink.capture({
      name: 'order_paid',
      role: 'CREATOR',
      actorId: 'usr_1',
      tenantId: 'cp_1',
      orderId: 'ord_1',
      properties: { totalCents: 4200 },
      occurredAt: new Date('2026-07-09T00:00:00Z'),
    })
    expect(captureImmediate).toHaveBeenCalledOnce()
    const p = captureImmediate.mock.calls[0]![0]
    expect(p.distinctId).toBe('usr_1')
    expect(p.event).toBe('order_paid')
    expect(p.properties.$process_person_profile).toBe(true)
    expect(p.properties.tenant_id).toBe('cp_1')
    expect(p.properties.order_id).toBe('ord_1')
    expect(p.properties.totalCents).toBe(4200)
  })

  it('suppresses person profile for SYSTEM events and uses the sentinel id', async () => {
    await sink.capture({
      name: 'refund_issued',
      role: 'SYSTEM',
      occurredAt: new Date(),
    })
    const p = captureImmediate.mock.calls[0]![0]
    expect(p.distinctId).toBe('system')
    expect(p.properties.$process_person_profile).toBe(false)
  })

  it('falls back to sessionId for anonymous events', async () => {
    await sink.capture({
      name: 'checkout_started',
      role: 'ANON',
      sessionId: 'sess_9',
      occurredAt: new Date(),
    })
    const p = captureImmediate.mock.calls[0]![0]
    expect(p.distinctId).toBe('sess_9')
    expect(p.properties.$process_person_profile).toBe(false)
  })

  it('omits tenant groups unless enabled', async () => {
    await sink.capture({
      name: 'order_paid',
      role: 'CREATOR',
      actorId: 'usr_2',
      tenantId: 'cp_2',
      occurredAt: new Date(),
    })
    const p = captureImmediate.mock.calls[0]![0]
    expect(p.groups).toBeUndefined()

    const grouped = new PostHogSink({ apiKey: 'phc_test', enableTenantGroups: true })
    await grouped.capture({
      name: 'order_paid',
      role: 'CREATOR',
      actorId: 'usr_3',
      tenantId: 'cp_3',
      occurredAt: new Date(),
    })
    const g = captureImmediate.mock.calls.at(-1)![0]
    expect(g.groups).toEqual({ tenant: 'cp_3' })
  })
})
