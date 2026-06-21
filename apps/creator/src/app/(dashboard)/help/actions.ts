'use server'

// Creator-side support actions. Thin wrappers over @ilaunchify/support — the
// service owns category resolution, tier-aware intake, FSM, audit + notify.
// Scope is fixed to the signed-in creator (requesterRole CREATOR); a creator can
// only ever see/reply to their own tickets (enforced in the service).

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import type { TicketStatus } from '@ilaunchify/db'
import {
  createTicket,
  replyToTicket,
  getTicket,
  OPEN_STATUSES,
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

// Upload reply attachments for a ticket the creator owns. Ownership is verified
// via getTicket (throws if not theirs) before anything is written to R2.
export async function uploadTicketAttachments(
  formData: FormData,
): Promise<{ ok: true; attachments: AttachmentMeta[] } | { ok: false; error: string }> {
  const user = await requireUser()
  const ticketId = formData.get('ticketId')
  if (typeof ticketId !== 'string' || !ticketId) return { ok: false, error: 'Missing ticket.' }
  try {
    await getTicket(ticketId, { role: 'CREATOR', userId: user.id })
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

// Validate that the creator owns the entity they're attaching. Returns the
// link only when ownership checks out; an unowned/garbage id is silently
// dropped so the ticket still files. Only 'Order' and 'Product' are attachable
// by creators today.
async function resolveOwnedEntity(
  userId: string,
  entityType: string | undefined,
  entityId: string | undefined,
): Promise<{ entityType: string; entityId: string } | null> {
  if (!entityType || !entityId) return null
  if (entityType === 'Order') {
    const owned = await prisma.order.findFirst({
      where: { id: entityId, creatorUserId: userId },
      select: { id: true },
    })
    return owned ? { entityType, entityId } : null
  }
  if (entityType === 'Product') {
    const owned = await prisma.product.findFirst({
      where: { id: entityId, brand: { creatorProfile: { userId } } },
      select: { id: true },
    })
    return owned ? { entityType, entityId } : null
  }
  return null
}

export type EntityOpenTicket = { id: string; subject: string; status: TicketStatus; createdAt: Date }

// Deflection: when a creator attaches an order/product to a new ticket, surface
// any OPEN ticket they already have on that same entity (so they reuse the thread
// instead of opening a duplicate). Ownership-scoped — only the creator's own
// tickets, and only after confirming they own the entity.
export async function getEntityOpenTickets(input: {
  entityType: string
  entityId: string
}): Promise<EntityOpenTicket[]> {
  const user = await requireUser()
  const link = await resolveOwnedEntity(user.id, input.entityType, input.entityId)
  if (!link) return []
  const open = [...OPEN_STATUSES] as TicketStatus[]
  return prisma.ticket.findMany({
    where: {
      requesterUserId: user.id,
      entityType: link.entityType,
      entityId: link.entityId,
      status: { in: open },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, subject: true, status: true, createdAt: true },
  })
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
      requesterRole: 'CREATOR',
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
      authorRole: 'CREATOR',
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
