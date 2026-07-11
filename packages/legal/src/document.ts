// Published-document resolution — the single source of truth for live legal text.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.1.
//
// Prisma-free by design: the caller injects a client matching LegalPrismaLike, so
// this stays testable and importable from any of the four apps. In L2 the public
// pages (marketing /terms, /privacy, partner footer modals) call this instead of
// reading the hardcoded content.ts / legal-docs.ts modules, killing the duplication.

export interface PublishedLegalVersion {
  id: string
  documentId: string
  version: string
  status: string
  bodyHtml: string
  bodyText: string
  contentSha256: string
  summaryOfChanges: string | null
  effectiveAt: Date | null
  publishedAt: Date | null
}

export interface PublishedLegalDocument {
  id: string
  slug: string
  title: string
  kind: string
  audience: string
  requiresAcceptance: boolean
  currentVersion: PublishedLegalVersion
}

/** Minimal structural slice of the Prisma client this module needs (DI seam). */
export interface LegalPrismaLike {
  legalDocument: {
    findUnique(args: {
      where: { slug: string }
      include?: unknown
    }): Promise<LegalDocumentRow | null>
  }
  legalDocumentVersion: {
    findMany(args: {
      where: Record<string, unknown>
      orderBy?: unknown
      take?: number
    }): Promise<PublishedLegalVersion[]>
  }
}

interface LegalDocumentRow {
  id: string
  slug: string
  title: string
  kind: string
  audience: string
  requiresAcceptance: boolean
  currentVersionId: string | null
}

/**
 * Resolve the live PUBLISHED version for a document slug, or null if the document
 * is missing / has no effective published version. Prefers the explicit
 * `currentVersionId` pointer; falls back to the newest published version whose
 * `effectiveAt` has passed (or is null). `now` is injectable for tests.
 */
export async function getPublishedLegalDocument(
  prisma: LegalPrismaLike,
  slug: string,
  now: Date = new Date(),
): Promise<PublishedLegalDocument | null> {
  const doc = await prisma.legalDocument.findUnique({ where: { slug } })
  if (!doc) return null

  const published = await prisma.legalDocumentVersion.findMany({
    where: {
      documentId: doc.id,
      status: 'PUBLISHED',
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
    },
    orderBy: [{ publishedAt: 'desc' }],
    take: 20,
  })

  const current =
    published.find((v) => v.id === doc.currentVersionId) ?? published[0] ?? null
  if (!current) return null

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    kind: doc.kind,
    audience: doc.audience,
    requiresAcceptance: doc.requiresAcceptance,
    currentVersion: current,
  }
}
