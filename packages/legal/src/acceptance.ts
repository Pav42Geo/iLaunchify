// Legal acceptance record — the tamper-evident consent evidence core.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §2 (ESIGN/UETA).
//
// Generalizes apps/partner/src/lib/agreement-signature.ts (Partner Agreement) to
// EVERY legal document (Terms, Privacy, Creator/Partner Agreement, …). Pure +
// deterministic given `acceptedAt`, so it's unit-testable and Prisma-free; the
// server action that persists a LegalAcceptance row shapes the record here first.
//
// It captures exactly what makes a DIY clickwrap/e-signature defensible under
// ESIGN/UETA: actor identity, server-side timestamp, IP + user-agent, the consent
// wording version, and a hash of the exact document body the user saw — plus a
// record hash so any later tampering with the stored evidence is detectable.
//
// SERVER-ONLY (uses node:crypto via ./hash).

import { canonicalJson, sha256Hex } from './hash'

// DESIGNER added 2026-07-13 (Shared Design Workspace D-W6 — the designer NDA
// acceptance rides this same tamper-evident ledger).
export type LegalActorType = 'CREATOR' | 'PARTNER' | 'ADMIN' | 'DESIGNER'
export type LegalAcceptanceMethod = 'clickwrap' | 'typed-signature'

export interface LegalAcceptanceInput {
  /** The accepting user's id (creator or partner). */
  userId: string
  actorType: LegalActorType
  /** Stable document identity, e.g. 'terms'. */
  documentSlug: string
  /** Version accepted, e.g. 'v1.0' | '2026-07-11'. */
  documentVersion: string
  /** The EXACT rendered body the user saw + agreed to (plain text used for hashing). */
  documentText: string
  /** Version of the "I agree" acknowledgement copy shown next to the control. */
  consentTextVersion: string
  /** How consent was captured. */
  method: LegalAcceptanceMethod
  /** Typed legal name — required for AGREEMENTs signed by typed signature. */
  signerName?: string | null
  /** Server-derived request context. Null when unavailable (still valid). */
  ip: string | null
  userAgent: string | null
  /** Defaults to now(); injectable for deterministic tests. */
  acceptedAt?: Date
}

export interface LegalAcceptanceRecord {
  userId: string
  actorType: LegalActorType
  documentSlug: string
  documentVersion: string
  consentTextVersion: string
  method: LegalAcceptanceMethod
  signerName: string | null
  ip: string | null
  userAgent: string | null
  /** ISO-8601 server timestamp (never the client clock). */
  acceptedAtIso: string
  /** SHA-256 of the exact document body accepted — the version binding. */
  contentSha256: string
  /** SHA-256 over the canonicalized record above — tamper-evidence. */
  recordSha256: string
}

/**
 * Build the tamper-evident acceptance record. Pure given `acceptedAt`. The
 * `recordSha256` is computed over a canonical (key-sorted) JSON of every field
 * except itself, so recomputing it later proves the stored evidence is unaltered.
 */
export function buildAcceptanceRecord(input: LegalAcceptanceInput): LegalAcceptanceRecord {
  const acceptedAtIso = (input.acceptedAt ?? new Date()).toISOString()
  const contentSha256 = sha256Hex(input.documentText)

  const core = {
    userId: input.userId,
    actorType: input.actorType,
    documentSlug: input.documentSlug,
    documentVersion: input.documentVersion,
    consentTextVersion: input.consentTextVersion,
    method: input.method,
    signerName: input.signerName ?? null,
    ip: input.ip,
    userAgent: input.userAgent,
    acceptedAtIso,
    contentSha256,
  }
  const recordSha256 = sha256Hex(canonicalJson(core))
  return { ...core, recordSha256 }
}

/** True if the stored record's hashes still match the record + (optionally) a current body. */
export function verifyAcceptanceRecord(
  record: LegalAcceptanceRecord,
  currentDocumentText?: string,
): { recordIntact: boolean; documentUnchanged: boolean | null } {
  const { recordSha256, ...core } = record
  const recordIntact = sha256Hex(canonicalJson(core)) === recordSha256
  const documentUnchanged =
    currentDocumentText === undefined
      ? null
      : sha256Hex(currentDocumentText) === record.contentSha256
  return { recordIntact, documentUnchanged }
}
