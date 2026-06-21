'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, Send, StickyNote } from 'lucide-react'
import { replyTicketAction, transitionTicketAction, assignTicketAction } from './actions'

type TicketStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'WAITING_ON_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In progress',
  WAITING_ON_REQUESTER: 'Waiting on requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export function TicketControls({
  ticketId,
  currentStatus,
  nextStatuses,
  assigneeUserId,
  admins,
  cannedReplies = [],
}: {
  ticketId: string
  currentStatus: TicketStatus
  nextStatuses: TicketStatus[]
  assigneeUserId: string | null
  admins: { id: string; name: string | null; email: string }[]
  cannedReplies?: { id: string; title: string; body: string }[]
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [assignee, setAssignee] = useState(assigneeUserId ?? '')
  const [pending, start] = useTransition()

  function insertCanned(id: string) {
    const reply = cannedReplies.find((r) => r.id === id)
    if (!reply) return
    setBody((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${reply.body}` : reply.body))
  }

  function sendReply() {
    const text = body.trim()
    if (!text) {
      toast.error('Reply cannot be empty.')
      return
    }
    start(async () => {
      const res = await replyTicketAction({ ticketId, body: text, isInternalNote: internal })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(internal ? 'Internal note added.' : 'Reply sent to requester.')
      setBody('')
      setInternal(false)
      router.refresh()
    })
  }

  function move(toStatus: TicketStatus) {
    start(async () => {
      const res = await transitionTicketAction({ ticketId, toStatus })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Moved to ${STATUS_LABEL[toStatus]}.`)
      router.refresh()
    })
  }

  function reassign(next: string) {
    setAssignee(next)
    start(async () => {
      const res = await assignTicketAction({ ticketId, toUserId: next || null })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(next ? 'Ticket assigned.' : 'Ticket unassigned.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Reply composer */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-ink-900">Respond</h3>
          <div className="flex items-center gap-3">
            {cannedReplies.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) insertCanned(e.target.value)
                  e.currentTarget.selectedIndex = 0
                }}
                aria-label="Insert saved reply"
                className="max-w-[180px] rounded-lg border border-ink-200 px-2 py-1 text-[11.5px] text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <option value="">Insert saved reply…</option>
                {cannedReplies.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-600">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
                className="h-3.5 w-3.5 accent-pink-600"
              />
              <StickyNote className="h-3.5 w-3.5 text-amber-600" />
              Internal note
            </label>
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={
            internal
              ? 'Private note — visible to admins only…'
              : 'Reply to the requester. Markdown supported…'
          }
          className={
            'mt-2 w-full rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
            (internal ? 'border-amber-200 bg-amber-50/40' : 'border-ink-200')
          }
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] text-ink-400">
            {internal ? (
              <>
                <Lock className="h-3 w-3" /> Hidden from the requester
              </>
            ) : (
              'The requester is notified by email + in-app.'
            )}
          </p>
          <button
            type="button"
            onClick={sendReply}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {internal ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </div>

      {/* Status transitions */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-ink-900">Status</h3>
        <p className="mt-0.5 text-[11.5px] text-ink-500">
          Currently <span className="font-semibold text-ink-700">{STATUS_LABEL[currentStatus]}</span>.
          Move it to:
        </p>
        {nextStatuses.length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-400">No further transitions from here.</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => move(s)}
                disabled={pending}
                className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-ink-700 hover:border-pink-400 hover:text-pink-700 disabled:opacity-50"
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assignee */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-ink-900">Assignee</h3>
        <select
          value={assignee}
          onChange={(e) => reassign(e.target.value)}
          disabled={pending}
          className="mt-2 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? a.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
