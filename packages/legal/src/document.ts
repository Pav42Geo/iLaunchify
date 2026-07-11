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

/**
 * Minimal structural slice of the Prisma client this module needs (DI seam).
 * Returns are typed `PromiseLike` (not `Promise`) so the real Prisma client —
 * whose `findUnique` returns a thenable `Prisma__…Client`, not a native Promise —
 * is structurally assignable without a cast at the call site.
 */
export interface LegalPrismaLike {
  legalDocument: {
    // args typed `any` at this adapter seam: Prisma's generated method signatures
    // (SelectSubset generics, specific include/where types) can't be matched by a
    // hand-written structural type, so we constrain only the RETURN shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): PromiseLike<LegalDocumentRow | null>
  }
  legalDocumentVersion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): PromiseLike<PublishedLegalVersion[]>
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

export interface DisplayLegalDocument extends PublishedLegalDocument {
  /** true = the current version is PUBLISHED; false = falling back to the latest DRAFT. */
  isPublished: boolean
}

/**
 * Resolve a document for public display: the live PUBLISHED version if one exists,
 * otherwise the latest DRAFT. This makes the DB the single source of truth — public
 * pages render the seeded/edited draft (with a draft banner) until it is published,
 * then the published version automatically. Returns null only if the document or
 * any version is entirely absent.
 */
export async function getLegalDocumentForDisplay(
  prisma: LegalPrismaLike,
  slug: string,
  now: Date = new Date(),
): Promise<DisplayLegalDocument | null> {
  const published = await getPublishedLegalDocument(prisma, slug, now)
  if (published) return { ...published, isPublished: true }

  const doc = await prisma.legalDocument.findUnique({ where: { slug } })
  if (!doc) return null
  const rows = await prisma.legalDocumentVersion.findMany({
    where: { documentId: doc.id, status: 'DRAFT' },
    orderBy: [{ createdAt: 'desc' }],
    take: 1,
  })
  const draft = rows[0]
  if (!draft) return null

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    kind: doc.kind,
    audience: doc.audience,
    requiresAcceptance: doc.requiresAcceptance,
    currentVersion: draft,
    isPublished: false,
  }
}
