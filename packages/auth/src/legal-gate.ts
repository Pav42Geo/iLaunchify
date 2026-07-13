// Legal re-acceptance gate — the enforcement half of the Legal CMS (Phase L3).
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.2.
//
// getOutstandingLegalDocs: the docs a signed-in user must accept — active,
// acceptance-required, audience-matched, currently PUBLISHED + effective, and not
// yet accepted at the live version. The authed dashboard layouts call this and
// render a blocking interstitial when it's non-empty.
//
// recordLegalAcceptances: writes the per-version LegalAcceptance rows with the
// ESIGN/UETA evidence (buildAcceptanceRecord) + an AuditLog per acceptance. Also
// serves as the capture point for brand-new users (their first dashboard load
// gates them through Terms/Privacy once those are published).

import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { buildAcceptanceRecord } from '@ilaunchify/legal'
import type { Role } from './types'

/** Wording version of the re-acceptance acknowledgement copy (evidence field). */
export const LEGAL_CONSENT_TEXT_VERSION = 'reaccept-1'

export interface OutstandingLegalDoc {
  documentId: string
  slug: string
  title: string
  versionId: string
  version: string
  bodyHtml: string
  summaryOfChanges: string | null
  /** ISO string; null = effective immediately. Used for the grace-window UI. */
  effectiveAt: string | null
}

/**
 * The published, acceptance-required documents for this user's audience that the
 * user has NOT yet accepted at the current live version. Empty = nothing to gate.
 */
export async function getOutstandingLegalDocs(
  userId: string,
  actorType: Role,
): Promise<OutstandingLegalDoc[]> {
  const now = new Date()
  const audiences: Array<'PUBLIC' | 'CREATOR' | 'PARTNER' | 'DESIGNER' | 'ALL'> =
    actorType === 'ADMIN' ? ['ALL'] : [actorType, 'ALL']

  const docs = await prisma.legalDocument.findMany({
    where: {
      isActive: true,
      requiresAcceptance: true,
      currentVersionId: { not: null },
      audience: { in: audiences },
    },
    select: { id: true, slug: true, title: true, currentVersionId: true },
  })
  if (docs.length === 0) return []

  const versionIds = docs
    .map((d) => d.currentVersionId)
    .filter((v): v is string => typeof v === 'string')

  const [accepted, versions] = await Promise.all([
    prisma.legalAcceptance.findMany({
      where: { userId, documentVersionId: { in: versionIds } },
      select: { documentVersionId: true },
    }),
    prisma.legalDocumentVersion.findMany({
      where: { id: { in: versionIds }, status: 'PUBLISHED' },
      select: { id: true, version: true, bodyHtml: true, summaryOfChanges: true, effectiveAt: true },
    }),
  ])
  const acceptedSet = new Set(accepted.map((a) => a.documentVersionId))
  const vById = new Map(versions.map((v) => [v.id, v]))

  const out: OutstandingLegalDoc[] = []
  for (const d of docs) {
    const vid = d.currentVersionId
    if (!vid || acceptedSet.has(vid)) continue
    const v = vById.get(vid)
    if (!v) continue
    // Future-dated versions aren't enforced until their effective date passes.
    if (v.effectiveAt && v.effectiveAt > now) continue
    out.push({
      documentId: d.id,
      slug: d.slug,
      title: d.title,
      versionId: v.id,
      version: v.version,
      bodyHtml: v.bodyHtml,
      summaryOfChanges: v.summaryOfChanges,
      effectiveAt: v.effectiveAt ? v.effectiveAt.toISOString() : null,
    })
  }
  return out
}

/**
 * Record acceptance of the given published versions for a user (idempotent per
 * version via the @@unique). Builds the tamper-evident record + writes AuditLog.
 */
export async function recordLegalAcceptances(
  user: { id: string; email: string; role: Role },
  versionIds: string[],
  ip: string | null,
  userAgent: string | null,
): Promise<{ accepted: number }> {
  if (versionIds.length === 0) return { accepted: 0 }

  const versions = await prisma.legalDocumentVersion.findMany({
    where: { id: { in: versionIds }, status: 'PUBLISHED' },
    select: {
      id: true,
      version: true,
      bodyText: true,
      document: { select: { id: true, slug: true } },
    },
  })

  let accepted = 0
  for (const v of versions) {
    const already = await prisma.legalAcceptance.findUnique({
      where: { userId_documentVersionId: { userId: user.id, documentVersionId: v.id } },
      select: { id: true },
    })
    if (already) continue

    const record = buildAcceptanceRecord({
      userId: user.id,
      actorType: user.role,
      documentSlug: v.document.slug,
      documentVersion: v.version,
      documentText: v.bodyText,
      consentTextVersion: LEGAL_CONSENT_TEXT_VERSION,
      method: 'clickwrap',
      ip,
      userAgent,
    })

    await prisma.legalAcceptance.create({
      data: {
        documentId: v.document.id,
        documentVersionId: v.id,
        userId: user.id,
        actorType: user.role,
        method: 'clickwrap',
        consentTextVersion: LEGAL_CONSENT_TEXT_VERSION,
        contentSha256: record.contentSha256,
        recordSha256: record.recordSha256,
        ipAddress: ip,
        userAgent,
      },
    })

    await logAuditAs(user, {
      entityType: 'LegalAcceptance',
      entityId: v.id,
      action: 'LEGAL_ACCEPTED',
      payload: { slug: v.document.slug, version: v.version },
    })
    accepted++
  }

  return { accepted }
}
