import { describe, it, expect } from 'vitest'
import {
  buildAgreementSignatureRecord,
  verifyAgreementSignatureRecord,
  sha256Hex,
  type AgreementSignatureInput,
} from './agreement-signature'

const base: AgreementSignatureInput = {
  signerId: 'u_1',
  signerName: 'Jane Partner',
  signerEmail: 'jane@northwind.example',
  agreementVersion: 'v1.0',
  documentText: 'iLaunchify Partner Agreement …',
  consentTextVersion: 'consent-1',
  method: 'typed',
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  signedAt: new Date('2026-07-07T12:00:00.000Z'),
}

describe('agreement-signature', () => {
  it('captures the ESIGN/UETA evidence fields + a server timestamp', () => {
    const r = buildAgreementSignatureRecord(base)
    expect(r.signerEmail).toBe('jane@northwind.example')
    expect(r.signedAtIso).toBe('2026-07-07T12:00:00.000Z')
    expect(r.ip).toBe('203.0.113.7')
    expect(r.documentSha256).toBe(sha256Hex(base.documentText))
    expect(r.recordSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for identical inputs', () => {
    expect(buildAgreementSignatureRecord(base)).toEqual(buildAgreementSignatureRecord(base))
  })

  it('verifies an intact record', () => {
    const r = buildAgreementSignatureRecord(base)
    const v = verifyAgreementSignatureRecord(r, base.documentText)
    expect(v.recordIntact).toBe(true)
    expect(v.documentUnchanged).toBe(true)
  })

  it('detects tampering with the stored record', () => {
    const r = buildAgreementSignatureRecord(base)
    const tampered = { ...r, signerEmail: 'attacker@evil.example' }
    expect(verifyAgreementSignatureRecord(tampered).recordIntact).toBe(false)
  })

  it('detects a changed document (post-signing edit)', () => {
    const r = buildAgreementSignatureRecord(base)
    const v = verifyAgreementSignatureRecord(r, base.documentText + ' (edited)')
    expect(v.documentUnchanged).toBe(false)
  })

  it('remains valid with null request context', () => {
    const r = buildAgreementSignatureRecord({ ...base, ip: null, userAgent: null })
    expect(r.ip).toBeNull()
    expect(verifyAgreementSignatureRecord(r).recordIntact).toBe(true)
  })
})
