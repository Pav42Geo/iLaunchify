import { describe, it, expect } from 'vitest'
import { toPublicBriefProjection, type BriefProjectionInput } from './brief-projection'

const fullRow: BriefProjectionInput = {
  id: 'b1',
  title: 'Passion-fruit Protein Water',
  origin: 'HAVE_IDEA',
  status: 'INTEREST_OPEN',
  nicheSlug: 'energy-performance',
  category: 'BEVERAGE_FUNCTIONAL',
  categoryId: 'cat-fwb',
  claims: ['High-protein', 'No added sugar'],
  targetVolume: 5000,
  budgetLow: '1.20',
  budgetHigh: '1.80',
  timelineWeeks: 8,
  formulationMode: 'MAKER_FORMULATES',
  createdAt: new Date('2026-07-10T12:00:00Z'),
  privateFormula: { rows: [{ n: 'Whey isolate', a: '9g/serv' }] },
  privateNotes: 'Secret target taste profile',
  attachments: [
    { id: 'a1', isPrivate: true, assetId: 'asset-coa', kind: 'coa' },
    { id: 'a2', isPrivate: false, assetId: 'asset-moodboard', kind: 'inspiration' },
  ],
  creator: { displayName: 'Maria Vega', handle: '@mariamakes', audienceSize: 240000 },
}

describe('brief-projection — staged reveal (§9)', () => {
  it('never emits privateFormula or privateNotes, even when present on the input', () => {
    const pub = toPublicBriefProjection(fullRow) as unknown as Record<string, unknown>
    expect('privateFormula' in pub).toBe(false)
    expect('privateNotes' in pub).toBe(false)
    expect(JSON.stringify(pub)).not.toMatch(/Whey isolate|Secret target/)
  })

  it('filters attachments to isPrivate === false only', () => {
    const pub = toPublicBriefProjection(fullRow)
    expect(pub.attachments).toEqual([{ id: 'a2', assetId: 'asset-moodboard', kind: 'inspiration' }])
  })

  it('is an allowlist — unknown extra fields on the input do not leak', () => {
    const withExtra = { ...fullRow, secretColumnAddedLater: 'leak-me' } as BriefProjectionInput
    const pub = toPublicBriefProjection(withExtra) as unknown as Record<string, unknown>
    expect('secretColumnAddedLater' in pub).toBe(false)
  })

  it('carries the public commercial terms the pool card needs', () => {
    const pub = toPublicBriefProjection(fullRow)
    expect(pub.title).toBe('Passion-fruit Protein Water')
    expect(pub.nicheSlug).toBe('energy-performance')
    expect(pub.claims).toEqual(['High-protein', 'No added sugar'])
    expect(pub.targetVolume).toBe(5000)
    expect(pub.budgetLow).toBe('1.20')
    expect(pub.budgetHigh).toBe('1.80')
    expect(pub.timelineWeeks).toBe(8)
    expect(pub.creator?.handle).toBe('@mariamakes')
  })

  it('normalizes optionals: missing → null / empty, claims copied not aliased', () => {
    const pub = toPublicBriefProjection({
      id: 'b2',
      title: 'X',
      origin: 'HAVE_RECIPE',
      status: 'POSTED',
      nicheSlug: 'wellness',
      category: 'FOOD',
      claims: [],
      formulationMode: 'CREATOR_PROVIDED',
    })
    expect(pub.categoryId).toBeNull()
    expect(pub.targetVolume).toBeNull()
    expect(pub.budgetLow).toBeNull()
    expect(pub.createdAt).toBeNull()
    expect(pub.attachments).toEqual([])
    expect(pub.creator).toBeNull()
    const claims = ['Vegan']
    const pub2 = toPublicBriefProjection({ ...fullRow, claims })
    claims.push('Mutated')
    expect(pub2.claims).toEqual(['Vegan'])
  })
})
