'use server'

// P2 proof loop, printer side (docs/PARTNER_ROLE_ACCOUNTS.md §3.3.B, D3
// LOCKED: proofs OFF by default, REQUIRED automatically on the FIRST order
// per creator×printer pair; when required, the latest round must be APPROVED
// before markReady). Rounds are immutable — a rejection spawns the next
// version, approval locks the record.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { uploadFile, partnerFileKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'
import { serviceOwnedBy } from '@/lib/partner-context'

type Result = { ok: true } | { ok: false; error: string }

const PROOF_MAX_BYTES = 20 * 1024 * 1024
const PROOF_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
// Proofs make sense from acceptance until the job is READY.
const PROOF_UPLOAD_STATUSES = new Set(['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK'])

/**
 * D3 rule: proof REQUIRED iff this is the first order between this creator
 * and this print service — i.e. no OTHER delivered LABEL dispatch exists for
 * the pair. Pure read; both the panel and the markReady gate call it.
 */
export async function isProofRequired(dispatch: {
  id: string
  type: string
  partnerServiceId: string
  order: { creatorUserId: string }
}): Promise<boolean> {
  if (dispatch.type !== 'LABEL') return false
  const prior = await prisma.orderDispatch.count({
    where: {
      id: { not: dispatch.id },
      type: 'LABEL',
      partnerServiceId: dispatch.partnerServiceId,
      status: 'DELIVERED',
      order: { creatorUserId: dispatch.order.creatorUserId },
    },
  })
  return prior === 0
}

export async function uploadProofRound(formData: FormData): Promise<Result> {
  const user = await requireUser()
  const dispatchId = String(formData.get('dispatchId') ?? '')
  const file = formData.get('file')

  const dispatch = await prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: serviceOwnedBy(user.id) },
    select: {
      id: true,
      type: true,
      status: true,
      orderId: true,
      partnerServiceId: true,
      partnerService: { select: { partner: { select: { id: true, companyName: true } } } },
      order: { select: { orderNumber: true, creatorUserId: true } },
      proofRounds: { orderBy: { version: 'desc' }, take: 1, select: { version: true, status: true } },
    },
  })
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.type !== 'LABEL') return { ok: false, error: 'Proofs apply to print jobs only.' }
  if (!PROOF_UPLOAD_STATUSES.has(dispatch.status)) {
    return { ok: false, error: `Cannot upload a proof from ${dispatch.status}.` }
  }
  const latest = dispatch.proofRounds[0]
  if (latest?.status === 'PENDING') {
    return { ok: false, error: 'The current proof is still awaiting the creator — wait for their decision.' }
  }
  if (latest?.status === 'APPROVED') {
    return { ok: false, error: 'The approved proof is locked — proceed to production.' }
  }

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Pick a proof file.' }
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: 'File too large (max 20 MB).' }
  if (!PROOF_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type}". Use PDF, PNG, JPEG, or WebP.` }
  }

  // R2 first (no orphan rows), then PartnerFile → ProofRound (ship-doc pattern).
  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: partnerFileKey({
        partnerId: dispatch.partnerService.partner.id,
        section: 'documents',
        filename: file.name,
      }),
      body: buffer,
      contentType: file.type,
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '_')}"`,
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const partnerFile = await prisma.partnerFile.create({
    data: {
      partnerId: dispatch.partnerService.partner.id,
      sectionType: 'DOCUMENTS',
      kind: 'OTHER',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  const version = (latest?.version ?? 0) + 1
  const round = await prisma.proofRound.create({
    data: {
      orderDispatchId: dispatch.id,
      version,
      assetId: partnerFile.id,
      filename: file.name,
      uploadedById: user.id,
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'PROOF_UPLOADED',
    payload: { orderId: dispatch.orderId, proofRoundId: round.id, version, filename: file.name },
  })

  await dispatchNotification({
    userId: dispatch.order.creatorUserId,
    // Cast until `pnpm db:generate` picks up the P2 enum additions.
    event: 'CREATOR_PROOF_AWAITING' as NotificationEvent,
    data: {
      orderId: dispatch.orderId,
      orderRef: dispatch.order.orderNumber ?? `#${dispatch.orderId.slice(-8)}`,
      version,
      partnerName: dispatch.partnerService.partner.companyName,
    },
    audience: 'creator',
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}
