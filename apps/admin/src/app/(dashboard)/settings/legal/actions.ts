'use server'

// Admin Legal — draft-authoring server actions (Phase L1).
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §4.
//
// L1 is DRAFT-ONLY: edit/create DRAFT versions and document settings. Publishing,
// re-acceptance, and email fan-out land in L2/L3/L4 — none of these actions touch
// a PUBLISHED version or change what renders on public pages. Every mutation
// writes AuditLog via @ilaunchify/audit.
//
// Note: contentSha256 is computed inline with node:crypto here — the exact same
// algorithm as @ilaunchify/legal sha256Hex. When L2/L3 wire @ilaunchify/legal into
// the apps (getPublishedLegalDocument / buildAcceptanceRecord), this can import it
// directly; kept inline now to avoid a build-config change for a one-line hash.

import { createHash } from 'node:crypto'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const sha256Hex = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

/** Strip tags to a plain-text fallback used for search + hashing. */
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Edit an existing DRAFT version's body + changelog. Rejects non-DRAFT versions. */
export async function saveDraftVersion(input: {
  versionId: string
  bodyHtml: string
  summaryOfChanges?: string | null
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const version = await prisma.legalDocumentVersion.findUnique({
    where: { id: input.versionId },
    select: { id: true, status: true, document: { select: { slug: true } } },
  })
  if (!version) return { ok: false, error: 'Version not found.' }
  if (version.status !== 'DRAFT') {
    return { ok: false, error: 'Only DRAFT versions can be edited. Published versions are immutable — start a new draft.' }
  }

  const bodyHtml = input.bodyHtml
  const bodyText = toPlainText(bodyHtml)
  const contentSha256 = sha256Hex(bodyText)

  try {
    await prisma.legalDocumentVersion.update({
      where: { id: input.versionId },
      data: {
        bodyHtml,
        bodyText,
        contentSha256,
        summaryOfChanges: input.summaryOfChanges?.trim() || null,
      },
    })

    await logAuditAs(admin, {
      entityType: 'LegalDocumentVersion',
      entityId: input.versionId,
      action: 'LEGAL_VERSION_EDITED',
      payload: { chars: bodyText.length, contentSha256 },
    })

    revalidatePath(`/settings/legal/${version.document.slug}`)
    revalidatePath('/settings/legal')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save draft: ${(err as Error).message}` }
  }
}

/** Start a new DRAFT version, cloning the newest existing version's body. */
export async function createDraftVersion(input: { documentId: string }): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const doc = await prisma.legalDocument.findUnique({
    where: { id: input.documentId },
    select: {
      slug: true,
      versions: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, version: true, status: true, bodyHtml: true, bodyText: true },
      },
    },
  })
  if (!doc) return { ok: false, error: 'Document not found.' }

  const existingDraft = doc.versions.find((v) => v.status === 'DRAFT')
  if (existingDraft) {
    return { ok: false, error: 'A draft already exists for this document. Edit it instead.' }
  }

  const source = doc.versions[0]
  const bodyHtml = source?.bodyHtml ?? '<p></p>'
  const bodyText = source?.bodyText ?? ''
  const nextLabel = `v0.${doc.versions.length + 1}-draft`

  try {
    const created = await prisma.legalDocumentVersion.create({
      data: {
        documentId: input.documentId,
        version: nextLabel,
        status: 'DRAFT',
        bodyHtml,
        bodyText,
        contentSha256: sha256Hex(bodyText),
      },
      select: { id: true },
    })

    await logAuditAs(admin, {
      entityType: 'LegalDocumentVersion',
      entityId: created.id,
      action: 'LEGAL_VERSION_CREATED',
      payload: { version: nextLabel, clonedFrom: source?.version ?? null },
    })

    revalidatePath(`/settings/legal/${doc.slug}`)
    revalidatePath('/settings/legal')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not create draft: ${(err as Error).message}` }
  }
}

/** Update document-level settings (audience, acceptance requirement, cadence, active). */
export async function updateDocumentSettings(input: {
  documentId: string
  audience: 'PUBLIC' | 'CREATOR' | 'PARTNER' | 'DESIGNER' | 'ALL'
  requiresAcceptance: boolean
  reconsentIntervalDays: number | null
  isActive: boolean
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const doc = await prisma.legalDocument.findUnique({
    where: { id: input.documentId },
    select: { slug: true },
  })
  if (!doc) return { ok: false, error: 'Document not found.' }

  const reconsent =
    input.reconsentIntervalDays != null && input.reconsentIntervalDays > 0
      ? Math.floor(input.reconsentIntervalDays)
      : null

  try {
    await prisma.legalDocument.update({
      where: { id: input.documentId },
      data: {
        audience: input.audience,
        requiresAcceptance: input.requiresAcceptance,
        reconsentIntervalDays: reconsent,
        isActive: input.isActive,
      },
    })

    await logAuditAs(admin, {
      entityType: 'LegalDocument',
      entityId: input.documentId,
      action: 'LEGAL_DOCUMENT_SETTINGS_UPDATED',
      payload: {
        audience: input.audience,
        requiresAcceptance: input.requiresAcceptance,
        reconsentIntervalDays: reconsent,
        isActive: input.isActive,
      },
    })

    revalidatePath(`/settings/legal/${doc.slug}`)
    revalidatePath('/settings/legal')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not update settings: ${(err as Error).message}` }
  }
}

/**
 * Publish a DRAFT version → make it the live version (L2). Archives the prior
 * live version, points the document at the new one, and stamps the change type +
 * effective date. Requires the editor-mirrors-file attestation (§9 decision 4).
 *
 * Publishing DOES flip what public pages render (they read the current version).
 * The material-change re-acceptance gate (L3) and notice email (L4) hook off this
 * published version + `changeType` — not wired here, so this is a safe cutover.
 * L5 moves this behind a dedicated `legal:publish` capability.
 */
export async function publishVersion(input: {
  versionId: string
  changeType: 'MATERIAL' | 'MINOR'
  effectiveAt: string | null
  attestMatchesFile: boolean
}): Promise<Result> {
  // Publishing is admins-only (§9-3): a dedicated capability, distinct from the
  // platform:admin used for drafting/editing. SUPER_ADMIN holds it by default.
  const admin = await requireCapability('legal:publish')

  if (!input.attestMatchesFile) {
    return { ok: false, error: 'Confirm the published text matches the authoritative source before publishing.' }
  }

  const version = await prisma.legalDocumentVersion.findUnique({
    where: { id: input.versionId },
    select: {
      id: true,
      status: true,
      version: true,
      documentId: true,
      contentSha256: true,
      summaryOfChanges: true,
      document: { select: { slug: true, title: true, audience: true, currentVersionId: true } },
    },
  })
  if (!version) return { ok: false, error: 'Version not found.' }
  if (version.status !== 'DRAFT') {
    return { ok: false, error: 'Only DRAFT versions can be published.' }
  }

  const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : new Date()
  if (Number.isNaN(effectiveAt.getTime())) {
    return { ok: false, error: 'Invalid effective date.' }
  }
  const priorLiveId = version.document.currentVersionId

  try {
    await prisma.$transaction(async (tx) => {
      if (priorLiveId && priorLiveId !== version.id) {
        await tx.legalDocumentVersion.update({
          where: { id: priorLiveId },
          data: { status: 'ARCHIVED' },
        })
      }
      await tx.legalDocumentVersion.update({
        where: { id: version.id },
        data: {
          status: 'PUBLISHED',
          changeType: input.changeType,
          effectiveAt,
          publishedAt: new Date(),
          publishedByUserId: admin.id,
        },
      })
      await tx.legalDocument.update({
        where: { id: version.documentId },
        data: { currentVersionId: version.id },
      })
    })

    await logAuditAs(admin, {
      entityType: 'LegalDocumentVersion',
      entityId: version.id,
      action: 'LEGAL_VERSION_PUBLISHED',
      payload: {
        version: version.version,
        changeType: input.changeType,
        effectiveAt: effectiveAt.toISOString(),
        contentSha256: version.contentSha256,
        archivedPriorVersionId: priorLiveId ?? null,
      },
    })

    // L4: MATERIAL changes fan out a mandatory notice email + in-app to the
    // document's audience. Best-effort — a notify failure must not fail the
    // (already-committed, audited) publish. MINOR changes send nothing.
    if (input.changeType === 'MATERIAL') {
      try {
        await notifyLegalAudience({
          audience: version.document.audience,
          slug: version.document.slug,
          title: version.document.title,
          version: version.version,
          effectiveAt,
          summary: version.summaryOfChanges,
        })
      } catch {
        // swallow — publish already succeeded
      }
    }

    revalidatePath(`/settings/legal/${version.document.slug}`)
    revalidatePath('/settings/legal')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not publish: ${(err as Error).message}` }
  }
}

/**
 * Fan out the LEGAL_DOCUMENT_UPDATED notice to every user in the doc's audience.
 * Mandatory `legal` category (bypasses opt-outs); immediate (no digest). The
 * deep link points at the public policy page (marketing host from env; relative
 * fallback), and the re-acceptance gate catches acceptance-required docs in-app.
 */
async function notifyLegalAudience(input: {
  // DESIGNER added 2026-07-13 (Shared Design Workspace D-W6 — the designer NDA
  // publishes to audience=DESIGNER).
  audience: 'PUBLIC' | 'CREATOR' | 'PARTNER' | 'DESIGNER' | 'ALL'
  slug: string
  title: string
  version: string
  effectiveAt: Date
  summary: string | null
}): Promise<void> {
  // PUBLIC + ALL notices reach every creator + partner; role-scoped docs their role.
  const roleIn: Array<'CREATOR' | 'PARTNER' | 'DESIGNER'> =
    input.audience === 'CREATOR'
      ? ['CREATOR']
      : input.audience === 'PARTNER'
        ? ['PARTNER']
        : input.audience === 'DESIGNER'
          ? ['DESIGNER']
          : ['CREATOR', 'PARTNER']

  const users = await prisma.user.findMany({ where: { role: { in: roleIn } }, select: { id: true } })
  if (users.length === 0) return

  const base = process.env.NEXT_PUBLIC_MARKETING_URL ?? process.env.MARKETING_URL ?? ''
  const href = base ? `${base.replace(/\/$/, '')}/${input.slug}` : `/${input.slug}`
  const data = {
    title: input.title,
    version: input.version,
    effectiveAt: input.effectiveAt.toISOString(),
    summary: input.summary ?? undefined,
    href,
  }

  // Batch to avoid a thundering herd on large audiences.
  const BATCH = 50
  for (let i = 0; i < users.length; i += BATCH) {
    await Promise.allSettled(
      users
        .slice(i, i + BATCH)
        .map((u) => dispatchNotification({ userId: u.id, event: 'LEGAL_DOCUMENT_UPDATED', data })),
    )
  }
}
