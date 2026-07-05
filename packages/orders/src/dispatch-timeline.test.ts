import { describe, it, expect } from 'vitest'
import {
  buildDispatchTimeline,
  buildOrderTimeline,
  effectiveEta,
  humanizeMilestone,
  type DispatchTimelineSource,
  type DispatchProgressUpdateData,
} from './dispatch-timeline'

const T = (h: number) => `2026-07-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00:00.000Z`

function src(overrides: Partial<DispatchTimelineSource> = {}): DispatchTimelineSource {
  return {
    dispatchId: 'disp_1',
    dispatchType: 'PRODUCT',
    partnerName: 'Acme Mfg',
    createdAt: T(0),
    ...overrides,
  }
}

function update(overrides: Partial<DispatchProgressUpdateData> = {}): DispatchProgressUpdateData {
  return {
    id: 'u1',
    kind: 'NOTE',
    body: 'Batch mixed.',
    etaAt: null,
    photoAssetId: null,
    milestone: null,
    authorName: 'Jo at Acme',
    createdAt: T(5),
    ...overrides,
  }
}

describe('buildDispatchTimeline', () => {
  it('renders only present timestamps, in order', () => {
    const out = buildDispatchTimeline(
      src({ acceptedAt: T(2), productionStartedAt: T(4), readyAt: T(30) }),
    )
    expect(out.map((e) => e.kind)).toEqual(['STATE', 'STATE', 'STATE', 'STATE'])
    expect(out.map((e) => e.at)).toEqual([T(0), T(2), T(4), T(30)])
    expect(out[0]!.label).toContain('Acme Mfg received the job')
    expect(out[3]!.label).toBe('Ready to ship')
  })

  it('falls back to "Your partner" when partnerName is absent', () => {
    const out = buildDispatchTimeline(src({ partnerName: null, acceptedAt: T(1) }))
    expect(out[1]!.label).toBe('Your partner accepted the job')
  })

  it('skips invalid timestamps rather than throwing', () => {
    const out = buildDispatchTimeline(src({ acceptedAt: 'not-a-date' }))
    expect(out).toHaveLength(1)
  })

  it('interleaves progress updates chronologically', () => {
    const out = buildDispatchTimeline(
      src({
        acceptedAt: T(2),
        productionStartedAt: T(4),
        readyAt: T(40),
        progressUpdates: [
          update({ id: 'u1', createdAt: T(5), body: 'Batch mixed.' }),
          update({ id: 'u2', kind: 'PHOTO', photoAssetId: 'asset_9', createdAt: T(8), body: 'Fill line' }),
        ],
      }),
    )
    expect(out.map((e) => e.kind)).toEqual(['STATE', 'STATE', 'STATE', 'NOTE', 'PHOTO', 'STATE'])
    const note = out[3]!
    expect(note.label).toBe('Acme Mfg posted an update')
    expect(note.detail).toBe('Batch mixed.')
    expect(note.author).toBe('Jo at Acme')
    expect(out[4]!.photoAssetId).toBe('asset_9')
  })

  it('STATE wins ties at the same instant', () => {
    const out = buildDispatchTimeline(
      src({ acceptedAt: T(2), progressUpdates: [update({ createdAt: T(2) })] }),
    )
    expect(out.map((e) => e.kind)).toEqual(['STATE', 'STATE', 'NOTE'])
  })

  it('ETA updates read as a revised estimate', () => {
    const out = buildDispatchTimeline(
      src({
        progressUpdates: [update({ kind: 'ETA', etaAt: '2026-07-20T00:00:00.000Z', body: null })],
      }),
    )
    expect(out[1]!.label).toContain('updated the delivery estimate to Jul 20, 2026')
  })

  it('milestones humanize their slug', () => {
    const out = buildDispatchTimeline(
      src({ progressUpdates: [update({ kind: 'MILESTONE', milestone: 'plates-made', body: null })] }),
    )
    expect(out[1]!.label).toBe('Milestone: Plates made')
  })

  it('flags attention rows (declined / withdrawn / QC failed)', () => {
    const declined = buildDispatchTimeline(src({ declinedAt: T(3) }))
    expect(declined[1]!.attention).toBe(true)
    const qc = buildDispatchTimeline(src({ qualityCheckFailedAt: T(3) }))
    expect(qc[1]!.attention).toBe(true)
  })

  it('shipped carries tracking detail', () => {
    const out = buildDispatchTimeline(
      src({ shippedAt: T(50), trackingCarrier: 'UPS', trackingNumber: '1Z999' }),
    )
    expect(out[1]!.detail).toBe('UPS · 1Z999')
  })

  it('caps note detail at 500 chars', () => {
    const out = buildDispatchTimeline(
      src({ progressUpdates: [update({ body: 'x'.repeat(900) })] }),
    )
    expect(out[1]!.detail).toHaveLength(500)
  })
})

describe('buildOrderTimeline', () => {
  it('merges dispatches into one chronological stream with stable ids', () => {
    const out = buildOrderTimeline([
      src({ dispatchId: 'disp_a', createdAt: T(0), acceptedAt: T(6) }),
      src({ dispatchId: 'disp_b', partnerName: 'PrintCo', createdAt: T(1), acceptedAt: T(3) }),
    ])
    expect(out.map((e) => e.dispatchId)).toEqual(['disp_a', 'disp_b', 'disp_b', 'disp_a'])
    expect(new Set(out.map((e) => e.id)).size).toBe(4)
  })
})

describe('effectiveEta', () => {
  it('prefers currentEtaAt', () => {
    const s = src({
      currentEtaAt: '2026-07-25T00:00:00.000Z',
      progressUpdates: [update({ kind: 'ETA', etaAt: '2026-07-20T00:00:00.000Z' })],
    })
    expect(effectiveEta(s)).toBe('2026-07-25T00:00:00.000Z')
  })

  it('falls back to the latest ETA update', () => {
    const s = src({
      progressUpdates: [
        update({ id: 'u1', kind: 'ETA', etaAt: '2026-07-20T00:00:00.000Z', createdAt: T(2) }),
        update({ id: 'u2', kind: 'ETA', etaAt: '2026-07-22T00:00:00.000Z', createdAt: T(9) }),
      ],
    })
    expect(effectiveEta(s)).toBe('2026-07-22T00:00:00.000Z')
  })

  it('null when nothing is known', () => {
    expect(effectiveEta(src())).toBeNull()
  })
})

describe('humanizeMilestone', () => {
  it('handles kebab, snake, and upper-case', () => {
    expect(humanizeMilestone('plates-made')).toBe('Plates made')
    expect(humanizeMilestone('FINAL_INSPECTION')).toBe('Final inspection')
  })
})
