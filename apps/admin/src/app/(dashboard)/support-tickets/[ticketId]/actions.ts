'use server'

// Admin mutations for a single support ticket. Thin wrappers over the
// @ilaunchify/support service — the service owns FSM validation, TicketEvent +
// AuditLog writes, and best-effort notifications. These actions add admin
// auth + path revalidation only.

import { requireRole } from '@ilaunchify/auth'
import type { TicketStatus, TicketPriority } from '@ilaunchify/db'
import {
  replyToTicket,
  transitionTicket,
  assignTicket,
  setTicketPriority,
  TicketTransitionError,
  TicketNotFoundError,
  type AttachmentMeta,
} from '@ilaunchify/support'
import { uploadFile, ticketAttachmentKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const UPLOAD_MAX_BYTES = 15 * 1024 * 1024 // 15 MB / file
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
])

// Upload reply attachments to R2 and return their metadata. Called by the
// composer before sending the reply. Admin-gated; files are validated for size +
// type. (Creator/partner have their own scoped versions in /help.)
export async function uploadTicketAttachments(
  formData: FormData,
): Promise<{ ok: true; attachments: AttachmentMeta[] } | { ok: false; error: string }> {
  await requireRole('ADMIN')
  const ticketId = formData.get('ticketId')
  if (typeof ticketId !== 'string' || !ticketId) return { ok: false, error: 'Missing ticket.' }
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return { ok: true, attachments: [] }
  if (files.length > 5) return { ok: false, error: 'Up to 5 files per reply.' }

  const attachments: AttachmentMeta[] = []
  for (const file of files) {
    if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: `"${file.name}" is too large (max 15 MB).` }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return { ok: false, error: `"${file.name}": unsupported type (${file.type}).` }
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

function revalidate(ticketId: string) {
  revalidatePath(`/support-tickets/${ticketId}`)
  revalidatePath('/support-tickets')
}

export async function replyTicketAction(input: {
  ticketId: string
  body: string
  isInternalNote?: boolean
  attachments?: AttachmentMeta[]
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const body = input.body.trim()
  const attachments = input.attachments ?? []
  if (!body && attachments.length === 0) return { ok: false, error: 'Reply cannot be empty.' }

  try {
    await replyToTicket({
      ticketId: input.ticketId,
      authorUserId: admin.id,
      authorRole: 'ADMIN',
      body: body || '(see attachment)',
      isInternalNote: !!input.isInternalNote,
      attachments,
    })
    revalidate(input.ticketId)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}

export async function transitionTicketAction(input: {
  ticketId: string
  toStatus: TicketStatus
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    await transitionTicket({
      ticketId: input.ticketId,
      toStatus: input.toStatus,
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    })
    revalidate(input.ticketId)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketTransitionError) {
      return { ok: false, error: `Can't move ${err.from} → ${err.to}.` }
    }
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}

export async function assignTicketAction(input: {
  ticketId: string
  toUserId: string | null
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    await assignTicket({
      ticketId: input.ticketId,
      toUserId: input.toUserId,
      actorUserId: admin.id,
    })
    revalidate(input.ticketId)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}

export async function setPriorityAction(input: {
  ticketId: string
  priority: TicketPriority
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    await setTicketPriority({
      ticketId: input.ticketId,
      priority: input.priority,
      actorUserId: admin.id,
    })
    revalidate(input.ticketId)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}
