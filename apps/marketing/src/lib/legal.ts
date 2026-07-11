// Legal-document resolvers for the public marketing pages.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.1.
//
// Single source of truth: the admin-managed Legal CMS (DB). `getDisplayLegalDoc`
// returns the published version if one exists, otherwise the latest DRAFT (seeded
// from packages/db/prisma/legal-content.ts). Public pages render entirely from
// this — there are no hardcoded legal copies in the app.

import { prisma } from '@ilaunchify/db'
import {
  getPublishedLegalDocument,
  getLegalDocumentForDisplay,
  type PublishedLegalDocument,
  type DisplayLegalDocument,
} from '@ilaunchify/legal'

export function getLiveLegalDoc(slug: string): Promise<PublishedLegalDocument | null> {
  return getPublishedLegalDocument(prisma, slug)
}

export function getDisplayLegalDoc(slug: string): Promise<DisplayLegalDocument | null> {
  return getLegalDocumentForDisplay(prisma, slug)
}
