import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the DB so these suites are network-free (run in run-vitest-suites.mjs).
const createMock = vi.fn()
vi.mock('@ilaunchify/db', () => ({
  prisma: {
    analyticsEvent: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}))

import { emitEvent } from '../emit'
import { setAnalyticsSink } from '../sink'
import { ANALYTICS_EVENTS, ANALYTICS_EVENT_NAMES, P0_SERVER_EVENTS } from '../events'

afterEach(() => {
  vi.clearAllMocks()
  // reset to a benign sink between tests
  setAnalyticsSink({ capture: () => {} })
})

describe('emitEvent — fire-and-forget contract', () => {
  it('persists a valid event via the durable store', async () => {
    createMock.mockResolvedValueOnce({ id: 'evt_1' })
    await emitEvent({ name: ANALYTICS_EVENTS.ORDER_PAID, orderId: 'ord_1' })
    expect(createMock).toHaveBeenCalledOnce()
    expect(createMock.mock.calls[0]?.[0]?.data?.name).toBe('order_paid')
  })

  it('never throws when the durable store rejects', async () => {
    createMock.mockRejectedValueOnce(new Error('db down'))
    await expect(
      emitEvent({ name: ANALYTICS_EVENTS.ORDER_PAID }),
    ).resolves.toBeUndefined()
  })

  it('never throws when the sink rejects', async () => {
    createMock.mockResolvedValueOnce({ id: 'evt_2' })
    setAnalyticsSink({
      capture: () => {
        throw new Error('sink boom')
      },
    })
    await expect(
      emitEvent({ name: ANALYTICS_EVENTS.DISPATCH_ACCEPTED }),
    ).resolves.toBeUndefined()
  })

  it('rejects an unregistered name without hitting the store', async () => {
    await emitEvent({ name: 'not_a_real_event' as never })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('forwards the event to the active sink', async () => {
    createMock.mockResolvedValueOnce({ id: 'evt_3' })
    const capture = vi.fn()
    setAnalyticsSink({ capture })
    await emitEvent({ name: ANALYTICS_EVENTS.REFUND_ISSUED, properties: { amountCents: 500 } })
    expect(capture).toHaveBeenCalledOnce()
    expect(capture.mock.calls[0]?.[0]?.name).toBe('refund_issued')
  })
})

describe('event registry', () => {
  it('every P0 server event is a registered name', () => {
    for (const name of P0_SERVER_EVENTS) {
      expect(ANALYTICS_EVENT_NAMES.has(name)).toBe(true)
    }
  })
})
