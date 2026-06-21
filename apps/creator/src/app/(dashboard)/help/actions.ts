'use server'

// Creator-side support actions. Thin wrappers over @ilaunchify/support — the
// service owns category resolution, tier-aware intake, FSM, audit + notify.
// Scope is fixed to the signed-in creator (requesterRole CREATOR); a creator can
// only ever see/reply to their own tickets (enforced in the service).

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { createTicket, replyToTicket, TicketNotFoundError } from '@ilaunchify/support'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type Result = { ok: true } | { ok: false; error: string }

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

export async function replyTicketAction(input: { ticketId: string; body: string }): Promise<Result> {
  const user = await requireUser()
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Reply cannot be empty.' }

  try {
    await replyToTicket({
      ticketId: input.ticketId,
      authorUserId: user.id,
      authorRole: 'CREATOR',
      body,
    })
    revalidatePath(`/help/${input.ticketId}`)
    return { ok: true }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket not found.' }
    return { ok: false, error: (err as Error).message }
  }
}
