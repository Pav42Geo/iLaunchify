// @ilaunchify/legal — shared legal-document core.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md
//
// Prisma-free by design (pure evidence + hashing; DI'd document resolution).
// Persistence + rendering live in the apps; this package shapes, hashes, verifies,
// and resolves — the reusable substrate the Partner Agreement code anticipated.

export { sha256Hex, canonicalJson } from './hash'
export {
  buildAcceptanceRecord,
  verifyAcceptanceRecord,
  type LegalActorType,
  type LegalAcceptanceMethod,
  type LegalAcceptanceInput,
  type LegalAcceptanceRecord,
} from './acceptance'
export {
  getPublishedLegalDocument,
  type LegalPrismaLike,
  type PublishedLegalDocument,
  type PublishedLegalVersion,
} from './document'
