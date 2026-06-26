'use client'

// Task #575 — v2 right-rail action cards for the lead detail page.
//
// Three cards, stacked, sticky:
//   1. StatusCard      → Qualify / Disqualify / Convert
//   2. AssignCard      → Reassign to another admin
//   3. QuickContactCard → mailto / tel / Calendly placeholder
// Tags card is skipped (no Partner.tags column in the V1 schema; see task spec).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Send,
  Mail,
  Phone,
  Calendar,
  UserPlus,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import {
  qualifyLead,
  disqualifyLead,
  addLeadNote,
  assignLead,
} from './actions'

// -----------------------------------------------------------------------------
// Shared chrome — matches /admin/orders/[orderId] right-rail card pattern
// -----------------------------------------------------------------------------

function RailCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof CheckCircle2
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-[14px] font-semibold leading-none tracking-tight text-ink-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-[11px] text-ink-500">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// StatusCard — qualify / disqualify, FSM-aware
// -----------------------------------------------------------------------------

export function StatusCard({
  leadId,
  currentStatus,
}: {
  leadId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showDisqualifyReason, setShowDisqualifyReason] = useState(false)
  const [reason, setReason] = useState('')

  const isLead = ['DRAFT', 'LEAD', 'INVITED'].includes(currentStatus)
  const isQualifiedFunnel = currentStatus === 'INVITED' || currentStatus === 'IN_PROGRESS'
  const frozen = ['IDENTITY_VERIFIED', 'OPERATIONALLY_CONFIGURED', 'ACTIVE', 'SUSPENDED', 'TERMINATED'].includes(currentStatus)

  function onQualify() {
    startTransition(async () => {
      const res = await qualifyLead({ leadId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Invitation issued')
      router.refresh()
    })
  }

  function onDisqualify() {
    if (!showDisqualifyReason) {
      setShowDisqualifyReason(true)
      return
    }
    if (!confirm('Disqualify this lead? This deletes the draft Partner row.')) return
    startTransition(async () => {
      // The reason is logged via a note BEFORE we delete the row so it
      // shows up in the audit history.
      if (reason.trim().length > 0) {
        await addLeadNote({ leadId, body: `[Disqualify reason] ${reason.trim()}` })
      }
      const res = await disqualifyLead({ leadId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Lead disqualified')
      router.push('/leads')
    })
  }

  const tone: { dot: string; bg: string; text: string; border: string; label: string } = (() => {
    switch (currentStatus) {
      case 'DRAFT':
      case 'LEAD':
        return { dot: 'bg-warning-500', bg: 'bg-warning-50', text: 'text-warning-900', border: 'border-warning-200', label: 'Pending review' }
      case 'INVITED':
        return { dot: 'bg-info-500', bg: 'bg-info-50', text: 'text-info-900', border: 'border-info-200', label: 'Invited' }
      case 'IN_PROGRESS':
        return { dot: 'bg-info-500', bg: 'bg-info-50', text: 'text-info-900', border: 'border-info-200', label: 'Onboarding' }
      case 'UNDER_REVIEW':
      case 'IDENTITY_PENDING_REVIEW':
      case 'OPS_PENDING_REVIEW':
        return { dot: 'bg-pink-500', bg: 'bg-pink-50', text: 'text-pink-900', border: 'border-pink-200', label: 'Under review' }
      case 'ACTIVE':
        return { dot: 'bg-success-500', bg: 'bg-success-50', text: 'text-success-900', border: 'border-success-200', label: 'Active partner' }
      case 'SUSPENDED':
      case 'TERMINATED':
        return { dot: 'bg-danger-500', bg: 'bg-danger-50', text: 'text-danger-900', border: 'border-danger-200', label: currentStatus }
      default:
        return { dot: 'bg-ink-400', bg: 'bg-ink-50', text: 'text-ink-800', border: 'border-ink-200', label: currentStatus }
    }
  })()

  return (
    <RailCard
      icon={CheckCircle2}
      title="Status"
      subtitle="Qualify or disqualify this lead."
    >
      {/* Big status pill */}
      <div
        className={cn(
          'mb-3 flex items-center gap-2 rounded-xl border px-3 py-2.5',
          tone.bg,
          tone.border,
          tone.text,
        )}
      >
        <span className={cn('h-2 w-2 rounded-full', tone.dot)} aria-hidden="true" />
        <span className="text-[12.5px] font-semibold uppercase tracking-wider">
          {tone.label}
        </span>
      </div>

      {/* FSM-aware action buttons */}
      <div className="flex flex-col gap-2">
        {isLead && (
          <>
            <button
              type="button"
              onClick={onQualify}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Qualify + invite
            </button>
            <button
              type="button"
              onClick={onDisqualify}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-danger-300 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {showDisqualifyReason ? 'Confirm disqualify' : 'Disqualify'}
            </button>
            {showDisqualifyReason && (
              <div className="mt-1">
                <label htmlFor="dq-reason" className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
                  Reason (optional)
                </label>
                <textarea
                  id="dq-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  placeholder="e.g. doesn't match V1 partner profile"
                />
              </div>
            )}
          </>
        )}

        {isQualifiedFunnel && (
          <>
            <button
              type="button"
              onClick={onQualify}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Re-send invitation
            </button>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] text-ink-600">
              Partner has been invited. Convert-to-creator does not apply — this
              lead is on the partner funnel. Open in
              {' '}
              <a href={`/partners/${leadId}`} className="font-semibold text-pink-700 hover:text-pink-800">
                Partners
              </a>
              {' '}
              to continue verification.
            </p>
          </>
        )}

        {frozen && (
          <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[11.5px] text-ink-600">
            Status frozen — this lead has already advanced past the inbox.
            Re-open requires manual override and is deferred for V1.
          </p>
        )}
      </div>
    </RailCard>
  )
}

// -----------------------------------------------------------------------------
// AssignCard — assign to admin user
// -----------------------------------------------------------------------------

export function AssignCard({
  leadId,
  assignedToUserId,
  adminUsers,
}: {
  leadId: string
  assignedToUserId: string | null
  adminUsers: { id: string; email: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState<string>(assignedToUserId ?? '')

  function onSave() {
    const target = value || null
    if (target === (assignedToUserId ?? null)) {
      toast.info('No change')
      return
    }
    startTransition(async () => {
      const res = await assignLead({ leadId, userId: target })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(target ? 'Lead reassigned' : 'Assignment cleared')
      router.refresh()
    })
  }

  return (
    <RailCard
      icon={UserPlus}
      title="Assignment"
      subtitle="Route this lead to an admin."
    >
      <label htmlFor="assignee" className="sr-only">
        Assignee
      </label>
      <select
        id="assignee"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      >
        <option value="">Unassigned</option>
        {adminUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.email}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        Save assignment
      </button>
    </RailCard>
  )
}

// -----------------------------------------------------------------------------
// TagsCard — placeholder. Partner has no `tags` column in V1. We render a
// disabled hint so the rail composition is complete without making promises.
// -----------------------------------------------------------------------------

export function TagsCard() {
  return (
    <RailCard
      icon={Sparkles}
      title="Tags"
      subtitle="Admin-curated lead tags."
    >
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-3 py-2 text-[11.5px] text-ink-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
        <p>
          Tagging shipped V1.1 — no <code className="font-mono text-[10.5px]">Lead.tags</code> column on the schema yet.
        </p>
      </div>
    </RailCard>
  )
}

// -----------------------------------------------------------------------------
// QuickContactCard — tel / mailto / calendly placeholder
// -----------------------------------------------------------------------------

export function QuickContactCard({
  email,
  phone,
}: {
  email: string
  phone: string | null
}) {
  return (
    <RailCard
      icon={Phone}
      title="Quick contact"
      subtitle="Reach out without leaving admin."
    >
      <div className="flex flex-col gap-2">
        <a
          href={`mailto:${email}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Email
        </a>
        <a
          href={phone ? `tel:${phone}` : undefined}
          aria-disabled={phone ? undefined : true}
          className={cn(
            'inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
            phone
              ? 'border-ink-300 bg-white text-ink-900 hover:border-ink-400 hover:bg-ink-50'
              : 'pointer-events-none border-ink-200 bg-ink-50 text-ink-400',
          )}
        >
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          {phone ? 'Call' : 'No phone on file'}
        </a>
        <a
          href="https://calendly.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          Schedule meeting
        </a>
      </div>
    </RailCard>
  )
}

// -----------------------------------------------------------------------------
// NotesThread — list of existing notes + textarea to add
// -----------------------------------------------------------------------------

export type LeadNoteUI = {
  id: string
  body: string
  authorEmail: string
  at: string // ISO
}

export function NotesThread({
  leadId,
  notes,
}: {
  leadId: string
  notes: LeadNoteUI[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    startTransition(async () => {
      const res = await addLeadNote({ leadId, body })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setBody('')
      toast.success('Note added')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Add form */}
      <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
        <label htmlFor="lead-note" className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
          Add note
        </label>
        <textarea
          id="lead-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Context, follow-ups, disqualify reasons — admin-only."
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] text-ink-400 tabular-nums">{body.length}/4000</span>
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Save note
          </button>
        </div>
      </form>

      {/* List */}
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-white px-4 py-6 text-center text-[12px] text-ink-500">
          No notes yet — be the first to log context.
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
                <span className="font-semibold text-ink-900">{n.authorEmail || 'admin'}</span>
                <span className="text-ink-400 tabular-nums">
                  {new Date(n.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-800">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
