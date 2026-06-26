// =============================================================================
// Admin Support Ticket — detail (W2-SUP3 · SUPPORT_TICKETING_PLAN.md §3.2)
// =============================================================================

import { notFound } from 'next/navigation'
import {
  User as UserIcon,
  Building2,
  Tag,
  Link2,
  Clock,
  Flame,
  StickyNote,
  ShieldCheck,
  Paperclip,
  Download,
} from 'lucide-react'
import { prisma, getCannedReplies } from '@ilaunchify/db'
import type { TicketStatus, TicketPriority } from '@ilaunchify/db'
import {
  getTicket,
  TICKET_TRANSITIONS,
  TicketNotFoundError,
  OPEN_STATUSES,
  parseAttachments,
} from '@ilaunchify/support'
import { getViewerCapabilities } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { TicketControls } from './TicketControls'
import { RefundPanel, type RefundRequestView } from './RefundPanel'
import { TierBadge } from '../page'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ticket — Admin' }

const STATUS_TONE: Record<TicketStatus, { bg: string; dot: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'New' },
  TRIAGED: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'Triaged' },
  IN_PROGRESS: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: 'Waiting on requester' },
  RESOLVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Closed' },
}

const PRIORITY_TONE: Record<TicketPriority, { bg: string; label: string }> = {
  URGENT: { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Urgent' },
  HIGH: { bg: 'bg-amber-50 text-amber-800 border-amber-200', label: 'High' },
  MEDIUM: { bg: 'bg-blue-50 text-blue-800 border-blue-200', label: 'Medium' },
  LOW: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Low' },
}

interface PageProps {
  params: Promise<{ ticketId: string }>
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params

  let ticket
  try {
    ticket = await getTicket(ticketId, { role: 'ADMIN' })
  } catch (err) {
    if (err instanceof TicketNotFoundError) notFound()
    throw err
  }
  // Admin scope always returns the full row; narrow the union for TS.
  if (!('replies' in ticket)) notFound()

  const orderId = ticket.entityType === 'Order' ? ticket.entityId : null

  const [admins, cannedReplies, caps, refundRequests] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    // Active canned replies relevant to this ticket (global + its category).
    getCannedReplies({ activeOnly: true, categoryId: ticket.categoryId }),
    getViewerCapabilities(),
    // Refund requests on this ticket (P3).
    orderId
      ? (prisma.supportRefundRequest.findMany({
          where: { ticketId },
          orderBy: { createdAt: 'desc' },
        }) as Promise<RefundRequestView[]>)
      : Promise.resolve([] as RefundRequestView[]),
  ])

  const status = ticket.status as TicketStatus
  const tone = STATUS_TONE[status]
  const prio = PRIORITY_TONE[ticket.priority as TicketPriority]
  const nextStatuses = [...TICKET_TRANSITIONS[status]] as TicketStatus[]
  const breached = !!ticket.slaBreachedAt && (OPEN_STATUSES as readonly string[]).includes(status)

  return (
    <div className="space-y-5">
      {/* Header */}
      <AdminDetailHeader
        backHref="/support-tickets"
        backLabel="All tickets"
        eyebrow={<span className="font-mono">#{ticket.id.slice(-8)}</span>}
        title={ticket.subject}
        status={
          <>
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider', tone.bg)}>
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
              {tone.label}
            </span>
            <span className={cn('inline-flex rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider', prio.bg)}>
              {prio.label}
            </span>
            {breached && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wider text-rose-700">
                <Flame className="h-3 w-3" /> SLA breached
              </span>
            )}
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-ink-100 px-5 py-3.5 text-[12px] sm:grid-cols-4">
          <Meta icon={UserIcon} label="Requester">
            {ticket.requester?.name ?? ticket.requester?.email ?? '—'}
            <span className="ml-1 text-[12px] uppercase tracking-wider text-ink-700">
              {ticket.requesterRole.toLowerCase()}
            </span>
            <span className="ml-1 align-middle">
              <TierBadge
                tier={ticket.requester?.creatorProfile?.subscriptionTier ?? ticket.requester?.partner?.tier ?? null}
              />
            </span>
          </Meta>
          <Meta icon={Tag} label="Category">{ticket.category?.name ?? '—'}</Meta>
          <Meta icon={ShieldCheck} label="Assignee">
            {ticket.assignee?.name ?? ticket.assignee?.email ?? <span className="text-ink-400">Unassigned</span>}
          </Meta>
          <Meta icon={Clock} label="Opened">{formatDate(ticket.createdAt)}</Meta>
          {ticket.entityType && ticket.entityId && (
            <Meta icon={Link2} label="Linked to">
              <span className="font-medium">{ticket.entityType}</span>{' '}
              <span className="font-mono text-[10.5px] text-ink-500">#{ticket.entityId.slice(-8)}</span>
            </Meta>
          )}
        </dl>
      </AdminDetailHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Thread */}
        <div className="space-y-4">
          {/* Opening message */}
          <article className="rounded-2xl border border-ink-200 bg-white p-4">
            <Author name={ticket.requester?.name ?? ticket.requester?.email ?? 'Requester'} role={ticket.requesterRole} when={ticket.createdAt} />
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{ticket.body}</p>
          </article>

          {ticket.replies.map((r) => (
            <article
              key={r.id}
              className={cn(
                'rounded-2xl border p-4',
                r.isInternalNote ? 'border-amber-200 bg-amber-50/50' : 'border-ink-200 bg-white',
              )}
            >
              <div className="flex items-center justify-between">
                <Author name={r.author?.name ?? 'Admin'} role={r.authorRole} when={r.createdAt} />
                {r.isInternalNote && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider text-amber-800">
                    <StickyNote className="h-2.5 w-2.5" /> Internal note
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{r.body}</p>
              <AttachmentList ticketId={ticket.id} attachments={r.attachments} />
            </article>
          ))}

          {/* Refund requests (P3) — only when this ticket is about an order */}
          {orderId && (caps.includes('refunds:propose') || caps.includes('refunds:approve') || refundRequests.length > 0) && (
            <RefundPanel
              orderId={orderId}
              ticketId={ticketId}
              requests={refundRequests}
              canPropose={caps.includes('refunds:propose')}
              canApprove={caps.includes('refunds:approve')}
            />
          )}

          {/* Activity log */}
          {ticket.events.length > 0 && (
            <details className="rounded-2xl border border-ink-200 bg-white p-4">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-700">
                Activity ({ticket.events.length})
              </summary>
              <ol className="mt-3 space-y-2">
                {ticket.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-[11.5px] text-ink-600">
                    <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink-300" />
                    <span>
                      <span className="font-medium text-ink-800">{humanKind(e.kind)}</span>
                      {e.actor?.name ? ` · ${e.actor.name}` : ' · system'}
                      <span className="ml-1 text-ink-400">{formatDate(e.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>

        {/* Controls */}
        <aside>
          <TicketControls
            ticketId={ticket.id}
            currentStatus={status}
            nextStatuses={nextStatuses}
            assigneeUserId={ticket.assigneeUserId}
            admins={admins}
            cannedReplies={cannedReplies.map((r) => ({ id: r.id, title: r.title, body: r.body }))}
          />
        </aside>
      </div>
    </div>
  )
}

function Meta({ icon: Icon, label, children }: { icon: typeof UserIcon; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-0.5 text-ink-800">{children}</dd>
    </div>
  )
}

function Author({ name, role, when }: { name: string; role: string; when: Date }) {
  const isAdmin = role === 'ADMIN'
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
          isAdmin ? 'bg-pink-100 text-pink-700' : 'bg-ink-100 text-ink-600',
        )}
      >
        {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
      </span>
      <span className="text-[12.5px] font-semibold text-ink-900">{name}</span>
      <span className="text-[12px] uppercase tracking-wider text-ink-700">{role.toLowerCase()}</span>
      <span className="text-[11px] text-ink-400">· {formatDate(when)}</span>
    </div>
  )
}

function AttachmentList({ ticketId, attachments }: { ticketId: string; attachments: unknown }) {
  const items = parseAttachments(attachments)
  if (items.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => (
        <a
          key={a.key}
          href={`/api/ticket-attachment?ticketId=${ticketId}&key=${encodeURIComponent(a.key)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-700 hover:border-ink-300 hover:bg-ink-50"
        >
          <Paperclip className="h-3.5 w-3.5 text-ink-400" />
          <span className="max-w-[180px] truncate font-medium">{a.name}</span>
          <span className="text-[10.5px] text-ink-400">{fmtBytes(a.size)}</span>
          <Download className="h-3.5 w-3.5 text-pink-600" />
        </a>
      ))}
    </div>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function humanKind(kind: string): string {
  return kind
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

function formatDate(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
