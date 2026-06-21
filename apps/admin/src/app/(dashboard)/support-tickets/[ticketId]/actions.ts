'use server'

// Admin mutations for a single support ticket. Thin wrappers over the
// @ilaunchify/support service — the service owns FSM validation, TicketEvent +
// AuditLog writes, and best-effort notifications. These actions add admin
// auth + path revalidation only.

import { requireRole } from '@ilaunchify/auth'
import type { TicketStatus } from '@ilaunchify/db'
import {
  replyToTicket,
  transitionTicket,
  assignTicket,
  TicketTransitionError,
  TicketNotFoundError,
} from '@ilaunchify/support'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

function revalidate(ticketId: string) {
  revalidatePath(`/support-tickets/${ticketId}`)
  revalidatePath('/support-tickets')
}

export async function replyTicketAction(input: {
  ticketId: string
  body: string
  isInternalNote?: boolean
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Reply cannot be empty.' }

  try {
    await replyToTicket({
      ticketId: input.ticketId,
      authorUserId: admin.id,
      authorRole: 'ADMIN',
      body,
      isInternalNote: !!input.isInternalNote,
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
