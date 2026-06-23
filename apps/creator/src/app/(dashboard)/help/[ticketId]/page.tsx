// Creator → Help → ticket detail. Creator-scoped: getTicket throws if the ticket
// isn't theirs (→ notFound), and the service strips internal notes.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ShieldCheck, User as UserIcon, Paperclip, Download } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import type { TicketStatus } from '@ilaunchify/db'
import { getTicket, TicketNotFoundError, parseAttachments } from '@ilaunchify/support'
import { cn } from '@ilaunchify/ui'
import { ReplyForm } from './ReplyForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ticket — Help' }

const STATUS_TONE: Record<TicketStatus, { bg: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', label: 'Open' },
  TRIAGED: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In review' },
  IN_PROGRESS: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Needs your reply' },
  RESOLVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Closed' },
}

interface PageProps {
  params: Promise<{ ticketId: string }>
}

export default async function CreatorTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params
  const user = await requireUser()

  let ticket
  try {
    ticket = await getTicket(ticketId, { role: 'CREATOR', userId: user.id })
  } catch (err) {
    if (err instanceof TicketNotFoundError) notFound()
    throw err
  }

  const status = ticket.status as TicketStatus
  const tone = STATUS_TONE[status]
  const closed = status === 'CLOSED'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Help
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">{ticket.subject}</h1>
          <p className="mt-0.5 text-[12px] text-ink-500">
            {ticket.category?.name ?? 'Support'} · opened {formatDate(ticket.createdAt)}
          </p>
        </div>
        <span className={cn('inline-flex flex-none rounded-full border px-2.5 py-[3px] text-[11px] font-semibold', tone.bg)}>
          {tone.label}
        </span>
      </div>

      <div className="space-y-3">
        {/* Opening message */}
        <article className="rounded-2xl border border-ink-200 bg-white p-4">
          <Author name={ticket.requester?.name ?? 'You'} you when={ticket.createdAt} />
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{ticket.body}</p>
        </article>

        {ticket.replies.map((r) => {
          const fromAdmin = r.authorRole === 'ADMIN'
          return (
            <article
              key={r.id}
              className={cn('rounded-2xl border p-4', fromAdmin ? 'border-pink-200 bg-pink-50/40' : 'border-ink-200 bg-white')}
            >
              <Author name={fromAdmin ? 'iLaunchify Support' : (r.author?.name ?? 'You')} you={!fromAdmin} admin={fromAdmin} when={r.createdAt} />
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{r.body}</p>
              <AttachmentList ticketId={ticket.id} attachments={r.attachments} />
            </article>
          )
        })}
      </div>

      {closed ? (
        <p className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/50 px-4 py-3 text-center text-[12.5px] text-ink-500">
          This ticket is closed. Need more help?{' '}
          <Link href="/help/new" className="font-semibold text-pink-700 hover:text-pink-800">
            Open a new ticket
          </Link>
          .
        </p>
      ) : (
        <ReplyForm ticketId={ticket.id} />
      )}
    </div>
  )
}

function Author({
  name,
  when,
  you,
  admin,
}: {
  name: string
  when: Date
  you?: boolean
  admin?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
          admin ? 'bg-pink-100 text-pink-700' : 'bg-ink-100 text-ink-600',
        )}
      >
        {admin ? <ShieldCheck className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
      </span>
      <span className="text-[12.5px] font-semibold text-ink-900">{name}</span>
      {you && <span className="text-[12px] uppercase tracking-wider text-ink-700">you</span>}
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

function formatDate(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
