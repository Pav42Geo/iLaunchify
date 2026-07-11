import { describe, expect, it } from 'vitest'
import { buildAcceptanceRecord, verifyAcceptanceRecord } from './acceptance'
import { getPublishedLegalDocument, type LegalPrismaLike } from './document'
import { sha256Hex } from './hash'

const baseInput = {
  userId: 'user-1',
  actorType: 'CREATOR' as const,
  documentSlug: 'terms',
  documentVersion: 'v1.0',
  documentText: 'These are the Terms of Service. Be excellent to each other.',
  consentTextVersion: 'consent-1',
  method: 'clickwrap' as const,
  signerName: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  acceptedAt: new Date('2026-07-11T12:00:00.000Z'),
}

describe('buildAcceptanceRecord', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildAcceptanceRecord(baseInput)
    const b = buildAcceptanceRecord(baseInput)
    expect(a).toEqual(b)
  })

  it('binds the content hash to the exact document text', () => {
    const rec = buildAcceptanceRecord(baseInput)
    expect(rec.contentSha256).toBe(sha256Hex(baseInput.documentText))
    expect(rec.acceptedAtIso).toBe('2026-07-11T12:00:00.000Z')
  })

  it('changes the record hash when any field changes', () => {
    const a = buildAcceptanceRecord(baseInput)
    const b = buildAcceptanceRecord({ ...baseInput, ip: '198.51.100.9' })
    expect(a.recordSha256).not.toBe(b.recordSha256)
  })
})

describe('verifyAcceptanceRecord', () => {
  it('confirms an intact record and unchanged document', () => {
    const rec = buildAcceptanceRecord(baseInput)
    const res = verifyAcceptanceRecord(rec, baseInput.documentText)
    expect(res.recordIntact).toBe(true)
    expect(res.documentUnchanged).toBe(true)
  })

  it('detects a tampered record', () => {
    const rec = buildAcceptanceRecord(baseInput)
    const tampered = { ...rec, ip: '10.0.0.1' } // mutated after signing
    expect(verifyAcceptanceRecord(tampered).recordIntact).toBe(false)
  })

  it('detects a changed document body', () => {
    const rec = buildAcceptanceRecord(baseInput)
    const res = verifyAcceptanceRecord(rec, 'Different terms now.')
    expect(res.recordIntact).toBe(true)
    expect(res.documentUnchanged).toBe(false)
  })

  it('returns null documentUnchanged when no current text supplied', () => {
    const rec = buildAcceptanceRecord(baseInput)
    expect(verifyAcceptanceRecord(rec).documentUnchanged).toBeNull()
  })
})

describe('getPublishedLegalDocument', () => {
  const version = {
    id: 'ver-current',
    documentId: 'doc-1',
    version: 'v1.0',
    status: 'PUBLISHED',
    bodyHtml: '<p>Terms</p>',
    bodyText: 'Terms',
    contentSha256: sha256Hex('Terms'),
    summaryOfChanges: null,
    effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  }

  function fakePrisma(currentVersionId: string | null, versions = [version]): LegalPrismaLike {
    return {
      legalDocument: {
        async findUnique() {
          return {
            id: 'doc-1',
            slug: 'terms',
            title: 'Terms of Service',
            kind: 'POLICY',
            audience: 'ALL',
            requiresAcceptance: true,
            currentVersionId,
          }
        },
      },
      legalDocumentVersion: {
        async findMany() {
          return versions
        },
      },
    }
  }

  it('resolves the explicit current version pointer', async () => {
    const doc = await getPublishedLegalDocument(fakePrisma('ver-current'), 'terms')
    expect(doc?.currentVersion.id).toBe('ver-current')
    expect(doc?.slug).toBe('terms')
    expect(doc?.requiresAcceptance).toBe(true)
  })

  it('falls back to newest published when pointer is null', async () => {
    const doc = await getPublishedLegalDocument(fakePrisma(null), 'terms')
    expect(doc?.currentVersion.id).toBe('ver-current')
  })

  it('returns null when no published version exists', async () => {
    const doc = await getPublishedLegalDocument(fakePrisma(null, []), 'terms')
    expect(doc).toBeNull()
  })
})
