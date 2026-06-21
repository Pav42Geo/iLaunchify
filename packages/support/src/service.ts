// @ilaunchify/support — the single data-access store for support tickets.
//
// All three apps (creator/partner/admin) import from here; none touch
// prisma.ticket* directly. Every mutation: (1) FSM/allow-list-validated,
// (2) writes a TicketEvent row for the in-ticket activity log, (3) writes an
// AuditLog row via @ilaunchify/audit, (4) best-effort fires a notification.
//
// Scope: a creator/partner viewer only ever sees their own tickets and never
// sees admin-internal notes. Admin sees everything. Scope is enforced HERE,
// not in the app layer, so it can't be forgotten on a new surface.

import { prisma, Prisma, getSupportSettings } from '@ilaunchify/db'
import type {
  Ticket,
  TicketReply,
  TicketStatus,
  TicketPriority,
  TicketRequesterRole,
  TicketAuthorRole,
  TicketEventKind,
} from '@ilaunchify/db'
import { logAudit } from '@ilaunchify/audit'
import { assertTicketTransition, eventKindForTransition, isTerminalStatus } from './ticket-fsm'
import { assertLinkableEntityType } from './entity-allowlist'
import { resolveCreatorIntake, type CreatorTier } from './intake-policy'
import { notifySupport } from './notify'

// ---------------------------------------------------------------------------
// Viewer scope
// ---------------------------------------------------------------------------

export type ViewerScope =
  | { role: 'ADMIN' }
  | { role: 'CREATOR' | 'PARTNER'; userId: string }

function isAdmin(scope: ViewerScope): scope is { role: 'ADMIN' } {
  return scope.role === 'ADMIN'
}

/** Audit actorRole is a fixed union; map a viewer/author role onto it. */
type ActorRole = 'ADMIN' | 'CREATOR' | 'PARTNER' | 'SYSTEM'

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Ticket ${ticketId} not found or not visible to this viewer`)
    this.name = 'TicketNotFoundError'
  }
}

// Recipient-correct deep links. The notification dispatcher resolves the host
// from the recipient's audience, so the PATH must match where that audience
// reads tickets: admins at /support-tickets (the locked sidebar href),
// requesters in their app's /help.
const adminTicketHref = (id: string) => `/support-tickets/${id}`
const requesterTicketHref = (id: string) => `/help/${id}`

// ---------------------------------------------------------------------------
// recordTicketEvent — TicketEvent + AuditLog in one call
// ---------------------------------------------------------------------------

export async function recordTicketEvent(args: {
  ticketId: string
  kind: TicketEventKind
  actorUserId: string | null
  actorRole: ActorRole
  payload?: Record<string, unknown>
  auditAction?: string
  fromValue?: string | null
  toValue?: string | null
}): Promise<void> {
  await prisma.ticketEvent.create({
    data: {
      ticketId: args.ticketId,
      kind: args.kind,
      actorUserId: args.actorUserId,
      payload: (args.payload ?? {}) as Prisma.InputJsonValue,
    },
  })
  await logAudit({
    actorId: args.actorUserId,
    actorRole: args.actorRole,
    entityType: 'Ticket',
    entityId: args.ticketId,
    action: args.auditAction ?? `TICKET_${args.kind}`,
    fromValue: args.fromValue ?? null,
    toValue: args.toValue ?? null,
    payload: args.payload,
  })
}

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

export interface CreateTicketInput {
  requesterUserId: string
  requesterRole: TicketRequesterRole
  /** Pass exactly one of categoryId / categorySlug. */
  categoryId?: string
  categorySlug?: string
  subject: string
  body: string
  priority?: TicketPriority
  entityType?: string
  entityId?: string
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  if (input.entityType) {
    // Throws EntityLinkError if not on the V1 allow-list.
    assertLinkableEntityType(input.entityType)
  }

  const category = await prisma.ticketCategory.findFirst({
    where: input.categoryId
      ? { id: input.categoryId }
      : { slug: input.categorySlug ?? 'other' },
  })
  if (!category) {
    throw new Error(
      `Unknown ticket category (${input.categoryId ?? input.categorySlug ?? 'other'})`,
    )
  }

  const basePriority = input.priority ?? category.defaultPriority
  const assigneeUserId = category.defaultAssigneeUserId ?? null

  // Tier-aware intake (W2-SUP3.5). CREATORS get a tier-driven priority floor +
  // first-response SLA target from the admin-tuned SupportSettings. PARTNERS are
  // intentionally untouched (tier meaning undecided → info-only); they keep the
  // category override / priority default.
  let priority = basePriority
  let slaResponseMinutes: number | null = category.slaResponseMinutes ?? null
  const slaResolveMinutes: number | null = category.slaResolveMinutes ?? null
  let appliedTier: CreatorTier | null = null

  if (input.requesterRole === 'CREATOR') {
    const profile = await prisma.creatorProfile
      .findFirst({
        where: { userId: input.requesterUserId },
        select: { subscriptionTier: true },
      })
      .catch(() => null)
    if (profile) {
      appliedTier = profile.subscriptionTier as CreatorTier
      const settings = await getSupportSettings()
      const intake = resolveCreatorIntake({
        tier: appliedTier,
        categoryPriority: basePriority,
        settings,
      })
      priority = intake.priority
      // Tier SLA target wins over the category override when enabled.
      if (intake.slaResponseMinutes !== null) slaResponseMinutes = intake.slaResponseMinutes
    }
  }

  // SUPPORT-SLA-CAST — slaResponseMinutes/slaResolveMinutes are pending the
  // db push; the generated client doesn't know them yet. Intermediate const +
  // single cast avoids the object-literal excess-property check. Drop the cast
  // after `db generate`.
  const createData = {
    requesterUserId: input.requesterUserId,
    requesterRole: input.requesterRole,
    categoryId: category.id,
    assigneeUserId,
    subject: input.subject.slice(0, 180),
    body: input.body,
    priority,
    status: 'NEW' as TicketStatus,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    slaResponseMinutes,
    slaResolveMinutes,
  }
  const ticket = await prisma.ticket.create({
    data: createData as unknown as Prisma.TicketCreateInput,
  })

  await recordTicketEvent({
    ticketId: ticket.id,
    kind: 'CREATED',
    actorUserId: input.requesterUserId,
    actorRole: input.requesterRole,
    auditAction: 'TICKET_CREATED',
    payload: {
      categorySlug: category.slug,
      priority,
      ...(appliedTier ? { tier: appliedTier, slaResponseMinutes } : {}),
    },
  })

  // Notify the owner: explicit category assignee, else every admin.
  if (assigneeUserId) {
    await notifySupport({
      userId: assigneeUserId,
      event: 'SUPPORT_TICKET_CREATED',
      data: {
        ticketId: ticket.id,
        subject: ticket.subject,
        categorySlug: category.slug,
        href: adminTicketHref(ticket.id),
      },
      audience: 'admin',
    })
  } else {
    await notifyAllAdmins('SUPPORT_TICKET_CREATED', {
      ticketId: ticket.id,
      subject: ticket.subject,
      categorySlug: category.slug,
      href: adminTicketHref(ticket.id),
    })
  }

  return ticket
}

async function notifyAllAdmins(
  event: Parameters<typeof notifySupport>[0]['event'],
  data: Record<string, unknown>,
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })
  await Promise.allSettled(
    admins.map((a) => notifySupport({ userId: a.id, event, data, audience: 'admin' })),
  )
}

// ---------------------------------------------------------------------------
// listTickets — scope-aware
// ---------------------------------------------------------------------------

export interface ListTicketFilters {
  status?: TicketStatus[]
  priority?: TicketPriority[]
  categoryId?: string
  assigneeUserId?: string
  /** Substring match on subject (case-insensitive). */
  search?: string
  /** Only tickets whose SLA has been flagged breached by the cron. */
  slaBreachedOnly?: boolean
  take?: number
  skip?: number
}

export async function listTickets(filters: ListTicketFilters, scope: ViewerScope) {
  const where: Prisma.TicketWhereInput = {}

  // Hard scope gate — non-admins only ever see their own tickets.
  if (!isAdmin(scope)) {
    where.requesterUserId = scope.userId
  }

  if (filters.status?.length) where.status = { in: filters.status }
  if (filters.priority?.length) where.priority = { in: filters.priority }
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.assigneeUserId) where.assigneeUserId = filters.assigneeUserId
  if (filters.slaBreachedOnly) where.slaBreachedAt = { not: null }
  if (filters.search) {
    where.subject = { contains: filters.search, mode: 'insensitive' }
  }

  const take = Math.min(filters.take ?? 50, 100)
  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take,
      skip: filters.skip ?? 0,
      include: {
        category: { select: { id: true, slug: true, name: true } },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            // Info-only tier surfacing (W2-SUP3.5): creator subscription tier +
            // partner tier. Partners are badge-only; never auto-prioritized.
            creatorProfile: { select: { subscriptionTier: true } },
            partner: { select: { tier: true } },
          },
        },
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ])

  return { rows, total, take, skip: filters.skip ?? 0 }
}

// ---------------------------------------------------------------------------
// getTicket — scope-checked, internal-note-filtered
// ---------------------------------------------------------------------------

export async function getTicket(ticketId: string, scope: ViewerScope) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      category: true,
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          creatorProfile: { select: { subscriptionTier: true } },
          partner: { select: { tier: true } },
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      events: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  })

  if (!ticket) throw new TicketNotFoundError(ticketId)

  // Non-admin viewer: must own it, and never sees internal notes / scratchpad.
  if (!isAdmin(scope)) {
    if (ticket.requesterUserId !== scope.userId) throw new TicketNotFoundError(ticketId)
    return {
      ...ticket,
      internalNotes: null,
      replies: ticket.replies.filter((r) => !r.isInternalNote),
    }
  }

  return ticket
}

// ---------------------------------------------------------------------------
// replyToTicket
// ---------------------------------------------------------------------------

export interface ReplyInput {
  ticketId: string
  authorUserId: string
  authorRole: TicketAuthorRole
  body: string
  isInternalNote?: boolean
  attachments?: Array<{ key: string; name: string; mimeType: string; size: number }>
}

export async function replyToTicket(input: ReplyInput): Promise<TicketReply> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      status: true,
      requesterUserId: true,
      assigneeUserId: true,
      categoryId: true,
      firstResponseAt: true,
      subject: true,
    },
  })
  if (!ticket) throw new TicketNotFoundError(input.ticketId)

  // Only admins may post internal notes; coerce away an accidental flag.
  const isInternalNote = input.authorRole === 'ADMIN' ? !!input.isInternalNote : false

  if (isTerminalStatus(ticket.status) && !isInternalNote) {
    throw new Error('Cannot post a public reply to a CLOSED ticket; reopen it first.')
  }

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: input.ticketId,
      authorUserId: input.authorUserId,
      authorRole: input.authorRole,
      body: input.body,
      isInternalNote,
      attachments: (input.attachments ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })

  // First non-internal admin reply stamps the response-SLA clock.
  const stampFirstResponse =
    input.authorRole === 'ADMIN' && !isInternalNote && !ticket.firstResponseAt
  if (stampFirstResponse) {
    await prisma.ticket.update({
      where: { id: input.ticketId },
      data: { firstResponseAt: new Date() },
    })
  }

  await recordTicketEvent({
    ticketId: input.ticketId,
    kind: isInternalNote ? 'INTERNAL_NOTE_ADDED' : 'REPLIED',
    actorUserId: input.authorUserId,
    actorRole: input.authorRole,
    auditAction: isInternalNote ? 'TICKET_INTERNAL_NOTE' : 'TICKET_REPLIED',
    payload: { replyId: reply.id },
  })

  // Notify the OTHER side (internal notes notify nobody).
  if (!isInternalNote) {
    if (input.authorRole === 'ADMIN') {
      await notifySupport({
        userId: ticket.requesterUserId,
        event: 'SUPPORT_TICKET_REPLIED',
        data: { ticketId: ticket.id, subject: ticket.subject, href: requesterTicketHref(ticket.id) },
      })
    } else if (ticket.assigneeUserId) {
      await notifySupport({
        userId: ticket.assigneeUserId,
        event: 'SUPPORT_TICKET_REPLIED',
        data: { ticketId: ticket.id, subject: ticket.subject, href: adminTicketHref(ticket.id) },
        audience: 'admin',
      })
    } else {
      await notifyAllAdmins('SUPPORT_TICKET_REPLIED', {
        ticketId: ticket.id,
        subject: ticket.subject,
        href: adminTicketHref(ticket.id),
      })
    }
  }

  return reply
}

// ---------------------------------------------------------------------------
// transitionTicket — FSM-validated
// ---------------------------------------------------------------------------

export async function transitionTicket(args: {
  ticketId: string
  toStatus: TicketStatus
  actorUserId: string
  actorRole: ActorRole
}): Promise<Ticket> {
  const current = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { id: true, status: true, requesterUserId: true, assigneeUserId: true, subject: true },
  })
  if (!current) throw new TicketNotFoundError(args.ticketId)

  assertTicketTransition(current.status, args.toStatus)
  const kind = eventKindForTransition(current.status, args.toStatus)

  // Timestamp bookkeeping. A reopen clears the resolved/closed marks so the
  // ticket re-enters the open population cleanly.
  const data: Prisma.TicketUpdateInput = { status: args.toStatus }
  if (args.toStatus === 'RESOLVED') data.resolvedAt = new Date()
  if (args.toStatus === 'CLOSED') data.closedAt = new Date()
  if (kind === 'REOPENED') {
    data.resolvedAt = null
    data.closedAt = null
    data.slaBreachedAt = null
  }

  const ticket = await prisma.ticket.update({ where: { id: args.ticketId }, data })

  await recordTicketEvent({
    ticketId: args.ticketId,
    kind,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    auditAction: `TICKET_${kind}`,
    fromValue: current.status,
    toValue: args.toStatus,
  })

  if (args.toStatus === 'RESOLVED') {
    await notifySupport({
      userId: current.requesterUserId,
      event: 'SUPPORT_TICKET_RESOLVED',
      data: { ticketId: current.id, subject: current.subject, href: requesterTicketHref(current.id) },
    })
  } else if (kind === 'REOPENED' && current.assigneeUserId) {
    await notifySupport({
      userId: current.assigneeUserId,
      event: 'SUPPORT_TICKET_REOPENED',
      data: { ticketId: current.id, subject: current.subject, href: adminTicketHref(current.id) },
      audience: 'admin',
    })
  }

  return ticket
}

// ---------------------------------------------------------------------------
// assignTicket
// ---------------------------------------------------------------------------

export async function assignTicket(args: {
  ticketId: string
  toUserId: string | null
  actorUserId: string
}): Promise<Ticket> {
  const current = await prisma.ticket.findUnique({
    where: { id: args.ticketId },
    select: { id: true, status: true, assigneeUserId: true },
  })
  if (!current) throw new TicketNotFoundError(args.ticketId)

  // Assigning a still-NEW ticket implies triage — advance it (legal edge).
  const nextStatus: TicketStatus =
    current.status === 'NEW' && args.toUserId ? 'TRIAGED' : current.status

  const ticket = await prisma.ticket.update({
    where: { id: args.ticketId },
    data: { assigneeUserId: args.toUserId, status: nextStatus },
  })

  await recordTicketEvent({
    ticketId: args.ticketId,
    kind: 'ASSIGNED',
    actorUserId: args.actorUserId,
    actorRole: 'ADMIN',
    auditAction: 'TICKET_ASSIGNED',
    fromValue: current.assigneeUserId,
    toValue: args.toUserId,
  })

  if (nextStatus !== current.status) {
    await recordTicketEvent({
      ticketId: args.ticketId,
      kind: 'STATUS_CHANGED',
      actorUserId: args.actorUserId,
      actorRole: 'ADMIN',
      auditAction: 'TICKET_STATUS_CHANGED',
      fromValue: current.status,
      toValue: nextStatus,
    })
  }

  return ticket
}

// ---------------------------------------------------------------------------
// linkEntity
// ---------------------------------------------------------------------------

export async function linkEntity(args: {
  ticketId: string
  entityType: string
  entityId: string
  actorUserId: string
  actorRole: ActorRole
}): Promise<Ticket> {
  assertLinkableEntityType(args.entityType)

  const ticket = await prisma.ticket.update({
    where: { id: args.ticketId },
    data: { entityType: args.entityType, entityId: args.entityId },
  })

  await recordTicketEvent({
    ticketId: args.ticketId,
    kind: 'STATUS_CHANGED', // no dedicated LINKED kind in V1 enum; payload carries detail
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    auditAction: 'TICKET_LINK_ENTITY',
    payload: { entityType: args.entityType, entityId: args.entityId },
  })

  return ticket
}
