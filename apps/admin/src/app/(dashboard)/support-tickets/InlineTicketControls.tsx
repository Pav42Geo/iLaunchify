'use client'

// Inline status / priority / assignee editors for the support inbox rows —
// change a ticket without opening it (HexSupport-style). Each reuses the same
// server actions as the detail page; status respects the FSM (valid transitions
// only). Optimistic-free: on success we router.refresh() so counts + sort update.

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Check, ShieldCheck } from 'lucide-react'
import type { TicketStatus, TicketPriority } from '@ilaunchify/db'
import { TICKET_TRANSITIONS } from '@ilaunchify/support'
import { cn } from '@ilaunchify/ui'
import { transitionTicketAction, setPriorityAction, assignTicketAction } from './[ticketId]/actions'

const STATUS_TONE: Record<TicketStatus, { bg: string; dot: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'New' },
  TRIAGED: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'Triaged' },
  IN_PROGRESS: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: 'Waiting' },
  RESOLVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Closed' },
}
const STATUS_LABEL = Object.fromEntries(
  (Object.keys(STATUS_TONE) as TicketStatus[]).map((s) => [s, STATUS_TONE[s].label]),
) as Record<TicketStatus, string>

const PRIORITY_TONE: Record<TicketPriority, { bg: string; label: string }> = {
  URGENT: { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Urgent' },
  HIGH: { bg: 'bg-amber-50 text-amber-800 border-amber-200', label: 'High' },
  MEDIUM: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Medium' },
  LOW: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Low' },
}
const PRIORITIES: TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

// ---------------------------------------------------------------------------
// Shared dropdown shell
// ---------------------------------------------------------------------------

function Dropdown({
  trigger,
  children,
  align = 'left',
}: {
  trigger: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center">
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-30 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink-800 hover:bg-ink-50"
    >
      <span className="flex items-center gap-2">{children}</span>
      {active && <Check className="h-3.5 w-3.5 text-pink-600" />}
    </button>
  )
}

function caret(busy: boolean) {
  return <ChevronDown className={cn('h-3 w-3 text-ink-400', busy && 'animate-pulse')} />
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function InlineStatus({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const tone = STATUS_TONE[status]
  const nextStatuses = [...TICKET_TRANSITIONS[status]] as TicketStatus[]

  function move(to: TicketStatus, close: () => void) {
    close()
    start(async () => {
      const r = await transitionTicketAction({ ticketId, toStatus: to })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Moved to ${STATUS_LABEL[to]}.`)
      router.refresh()
    })
  }

  return (
    <Dropdown
      trigger={
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider', tone.bg)}>
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
          {tone.label}
          {caret(busy)}
        </span>
      }
    >
      {(close) =>
        nextStatuses.length === 0 ? (
          <p className="px-3 py-1.5 text-[12px] text-ink-400">No transitions</p>
        ) : (
          nextStatuses.map((s) => (
            <MenuItem key={s} onClick={() => move(s, close)}>
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STATUS_TONE[s].dot)} />
              {STATUS_LABEL[s]}
            </MenuItem>
          ))
        )
      }
    </Dropdown>
  )
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export function InlinePriority({ ticketId, priority }: { ticketId: string; priority: TicketPriority }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const tone = PRIORITY_TONE[priority]

  function set(p: TicketPriority, close: () => void) {
    close()
    if (p === priority) return
    start(async () => {
      const r = await setPriorityAction({ ticketId, priority: p })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Priority set to ${PRIORITY_TONE[p].label}.`)
      router.refresh()
    })
  }

  return (
    <Dropdown
      trigger={
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', tone.bg)}>
          {tone.label}
          {caret(busy)}
        </span>
      }
    >
      {(close) =>
        PRIORITIES.map((p) => (
          <MenuItem key={p} active={p === priority} onClick={() => set(p, close)}>
            <span className={cn('inline-block h-2 w-2 rounded-full border', PRIORITY_TONE[p].bg)} />
            {PRIORITY_TONE[p].label}
          </MenuItem>
        ))
      }
    </Dropdown>
  )
}

// ---------------------------------------------------------------------------
// Assignee
// ---------------------------------------------------------------------------

export function InlineAssignee({
  ticketId,
  assigneeUserId,
  admins,
}: {
  ticketId: string
  assigneeUserId: string | null
  admins: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const current = admins.find((a) => a.id === assigneeUserId)

  function assign(toUserId: string | null, close: () => void) {
    close()
    if (toUserId === assigneeUserId) return
    start(async () => {
      const r = await assignTicketAction({ ticketId, toUserId })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(toUserId ? 'Assigned.' : 'Unassigned.')
      router.refresh()
    })
  }

  return (
    <Dropdown
      align="right"
      trigger={
        <span className="inline-flex items-center gap-1 text-[12px] text-ink-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            <ShieldCheck className="h-3 w-3" />
          </span>
          {current ? current.label : <span className="text-ink-400">Unassigned</span>}
          {caret(busy)}
        </span>
      }
    >
      {(close) => (
        <>
          <MenuItem active={!assigneeUserId} onClick={() => assign(null, close)}>
            Unassigned
          </MenuItem>
          {admins.map((a) => (
            <MenuItem key={a.id} active={a.id === assigneeUserId} onClick={() => assign(a.id, close)}>
              {a.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  )
}
