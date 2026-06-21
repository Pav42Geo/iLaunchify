'use server'

// Partner-side support actions. Thin wrappers over @ilaunchify/support; scope is
// fixed to the signed-in partner user (requesterRole PARTNER). Partner tickets are
// info-only re: tier — the service never auto-prioritizes them.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import {
  createTicket,
  replyToTicket,
  getTicket,
  TicketNotFoundError,
  type AttachmentMeta,
} from '@ilaunchify/support'
import { uploadFile, ticketAttachmentKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type Result = { ok: true } | { ok: false; error: string }

const UPLOAD_MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
])

// Upload reply attachments for a ticket the partner owns. Ownership is verified
// via getTicket (throws if not theirs) before anything is written to R2.
export async function uploadTicketAttachments(
  formData: FormData,
): Promise<{ ok: true; attachments: AttachmentMeta[] } | { ok: false; error: string }> {
  const user = await requireUser()
  const ticketId = formData.get('ticketId')
  if (typeof ticketId !== 'string' || !ticketId) return { ok: false, error: 'Missing ticket.' }
  try {
    await getTicket(ticketId, { role: 'PARTNER', userId: user.id })
  } catch {
    return { ok: false, error: 'Ticket not found.' }
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return { ok: true, attachments: [] }
  if (files.length > 5) return { ok: false, error: 'Up to 5 files per reply.' }

  const attachments: AttachmentMeta[] = []
  for (const file of files) {
    if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: `"${file.name}" is too large (max 15 MB).` }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return { ok: false, error: `"${file.name}": unsupported type.` }
    }
    const key = ticketAttachmentKey({ ticketId, filename: file.name })
    await uploadFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
      contentDisposition: `attachment; filename="${file.name.replace(/"/g, '')}"`,
    })
    attachments.push({ key, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
  }
  return { ok: true, attachments }
}

// Validate the partner owns the entity they're attaching. Partners attach an
// OrderDispatch (their work unit); an unowned id is silently dropped.
async function resolveOwnedEntity(
  userId: string,
  entityType: string | undefined,
  entityId: string | undefined,
): Promise<{ entityType: string; entityId: string } | null> {
  if (!entityType || !entityId) return null
  if (entityType === 'OrderDispatch') {
    const owned = await prisma.orderDispatch.findFirst({
      where: { id: entityId, partnerService: { partner: { userId } } },
      select: { id: true },
    })
    return owned ? { entityType, entityId } : null
  }
  return null
}

export async function createTicketAction(input: {
  categorySlug: string
  subject: string
  body: string
  entityType?: string
  entityId?: string
}): Promise<Result & { ticketId?: string }> {
  const user = await requireUser()
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (subject.length < 4) return { ok: false, error: 'Please add a short subject (4+ characters).' }
  if (body.length < 10) return { ok: false, error: 'Please describe the issue (10+ characters).' }

  const link = await resolveOwnedEntity(user.id, input.entityType, input.entityId)

  let ticketId: string
  try {
    const ticket = await createTicket({
      requesterUserId: user.id,
      requesterRole: 'PARTNER',
      categorySlug: input.categorySlug || 'other',
      subject,
      body,
      ...(link ? { entityType: link.entityType, entityId: link.entityId } : {}),
    })
    ticketId = ticket.id
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  revalidatePath('/help')
  redirect(`/help/${ticketId}`)
}

export async function replyTicketAction(input: {
  ticketId: string
  body: string
  attachments?: AttachmentMeta[]
}): Promise<Result> {
  const user = await requireUser()
  const body = input.body.trim()
  const attachments = input.attachments ?? []
  if (!body && attachments.length === 0) return { ok: false, error: 'Add a message or an attachment.' }

  try {
    await replyToTicket({
      ticketId: input.ticketId,
      authorUserId: user.id,
      authorRole: 'PARTNER',
      body: body || '(see attachment)',
      attachments,
    })
    revalidatePath(`/help/${input.ticketId}`)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}
