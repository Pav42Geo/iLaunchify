// Agreement e-signature record — the tamper-evident evidence core.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §4 + AUTH_ENTRANCE_SECURITY §4 +
// docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md Addendum (ESIGN/UETA).
//
// SERVER-ONLY (uses node:crypto). Called from the server action that persists a
// signature when a partner signs the Partner Agreement in the contract modal.
// It captures exactly what makes a DIY e-signature defensible under ESIGN/UETA:
// signer identity, server-side timestamp, IP + user-agent, consent record, and a
// document-version hash — plus a record hash so any post-signing tampering with
// the stored evidence is detectable. Persisted as PartnerAgreementSignature (a
// later schema slice); this module only SHAPES + HASHES the record, so it's pure
// and unit-testable.
//
// (Partner-app-local for now; promote to a shared package when the Creator
// Agreement needs the same builder.)

import { createHash } from 'node:crypto'

export interface AgreementSignatureInput {
  signerId: string
  signerName: string
  signerEmail: string
  /** Agreement version being signed, e.g. 'v1.0'. */
  agreementVersion: string
  /** The exact rendered agreement text the signer saw + agreed to. */
  documentText: string
  /** Version of the consent/acknowledgement copy shown next to the signature. */
  consentTextVersion: string
  /** How the signature was captured. */
  method: 'typed' | 'drawn'
  /** Server-derived request context. Null when unavailable (still valid). */
  ip: string | null
  userAgent: string | null
  /** Defaults to now(); injectable for deterministic tests. */
  signedAt?: Date
}

export interface AgreementSignatureRecord {
  signerId: string
  signerName: string
  signerEmail: string
  agreementVersion: string
  consentTextVersion: string
  method: 'typed' | 'drawn'
  ip: string | null
  userAgent: string | null
  /** ISO-8601 server timestamp (never the client clock). */
  signedAtIso: string
  /** SHA-256 of the exact document text signed — the version binding. */
  documentSha256: string
  /** SHA-256 over the canonicalized record above — tamper-evidence. */
  recordSha256: string
}

/** SHA-256 hex of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Build the tamper-evident signature record for a signed agreement. Pure given
 * `signedAt` — deterministic for the same inputs. The `recordSha256` is computed
 * over a canonical (key-sorted) JSON of every field except itself, so recomputing
 * it later proves the stored evidence is unaltered.
 */
export function buildAgreementSignatureRecord(
  input: AgreementSignatureInput,
): AgreementSignatureRecord {
  const signedAtIso = (input.signedAt ?? new Date()).toISOString()
  const documentSha256 = sha256Hex(input.documentText)

  const core = {
    signerId: input.signerId,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    agreementVersion: input.agreementVersion,
    consentTextVersion: input.consentTextVersion,
    method: input.method,
    ip: input.ip,
    userAgent: input.userAgent,
    signedAtIso,
    documentSha256,
  }
  const recordSha256 = sha256Hex(canonicalJson(core))
  return { ...core, recordSha256 }
}

/** True if the stored record's hashes still match the record + a current doc. */
export function verifyAgreementSignatureRecord(
  record: AgreementSignatureRecord,
  currentDocumentText?: string,
): { recordIntact: boolean; documentUnchanged: boolean | null } {
  const { recordSha256, ...core } = record
  const recordIntact = sha256Hex(canonicalJson(core)) === recordSha256
  const documentUnchanged =
    currentDocumentText === undefined ? null : sha256Hex(currentDocumentText) === record.documentSha256
  return { recordIntact, documentUnchanged }
}

/** Deterministic JSON with sorted keys, so the hash is stable across engines. */
function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  return JSON.stringify(obj, keys)
}
