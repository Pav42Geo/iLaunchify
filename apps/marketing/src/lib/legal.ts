// Live legal-document resolver for the public marketing pages (Phase L2).
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.1.
//
// Single source of truth: reads the admin-managed, published legal version from
// the DB via @ilaunchify/legal. The renderer falls back to the legacy hardcoded
// content.ts when nothing is published yet, so pages never break during the
// transition (and unreviewed drafts don't go live prematurely).

import { prisma } from '@ilaunchify/db'
import { getPublishedLegalDocument, type PublishedLegalDocument } from '@ilaunchify/legal'

export function getLiveLegalDoc(slug: string): Promise<PublishedLegalDocument | null> {
  return getPublishedLegalDocument(prisma, slug)
}
