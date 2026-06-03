// P10 GDPR foundation — the single choke-point for reading a sensitive partner
// document (cert PDFs today). EVERY signed-URL handed out for a private partner
// file must go through here so a DocumentAccessLog row is written with a
// required reason. C5 extends this function (retention checks, legal hold,
// breach-window flags); keep all reads funneling through it.

import 'server-only'
import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import type { DocumentAccessReason } from '@ilaunchify/db'

export interface ReadDocumentInput {
  /** PartnerFile id (the cert instance's pdfFileId). */
  fileId: string
  /** The User reading the document (admin, support, etc.). */
  actorUserId: string
  /** Why — required for GDPR accountability. */
  reason: DocumentAccessReason
  /** Optional product context, when the read happens from a product surface. */
  productTemplateId?: string | null
  /** Signed-URL lifetime; defaults to the storage default (5 min). */
  expiresInSeconds?: number
}

export type ReadDocumentResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Resolve a private partner document to a short-lived signed URL, logging the
 * access. Returns a friendly error rather than throwing so callers can toast it.
 */
export async function readPartnerDocument(input: ReadDocumentInput): Promise<ReadDocumentResult> {
  const file = await prisma.partnerFile.findUnique({
    where: { id: input.fileId },
    select: { id: true, r2Key: true, originalFilename: true },
  })
  if (!file || !file.r2Key) {
    return { ok: false, error: 'Document not found.' }
  }

  let url: string
  try {
    url = await getSignedReadUrl(file.r2Key, { expiresInSeconds: input.expiresInSeconds })
  } catch (err) {
    return { ok: false, error: `Could not generate a download link: ${(err as Error).message}` }
  }

  // Accountability record — written for every read, success path only (a failed
  // signed-URL generation is not an access). Best-effort: never block the read
  // on a logging hiccup, but surface it in the server logs.
  try {
    await prisma.documentAccessLog.create({
      data: {
        actorUserId: input.actorUserId,
        fileId: file.id,
        accessReason: input.reason,
        productTemplateId: input.productTemplateId ?? null,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[document-access] failed to write DocumentAccessLog', err)
  }

  return { ok: true, url }
}
