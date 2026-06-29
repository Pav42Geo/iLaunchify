// Creator → Help: "my tickets" list + entry to file a new one.

import Link from 'next/link'
import { LifeBuoy, Plus, MessageSquare, CheckCircle2 } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import type { TicketStatus } from '@ilaunchify/db'
import { listTickets } from '@ilaunchify/support'
import { cn, EmptyState } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Help & Support' }

const STATUS_TONE: Record<TicketStatus, { bg: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', label: 'Open' },
  TRIAGED: { bg: 'bg-info-50 text-info-700 border-info-200', label: 'In review' },
  IN_PROGRESS: { bg: 'bg-info-50 text-info-700 border-info-200', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Needs your reply' },
  RESOLVED: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Closed' },
}

export default async function CreatorHelpPage() {
  const user = await requireUser()
  const { rows } = await listTickets({ take: 100 }, { role: 'CREATOR', userId: user.id })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-ui-title text-ink-900">
            <LifeBuoy className="h-6 w-6 text-pink-600" />
            Help &amp; Support
          </h1>
          <p className="mt-1 text-ui-body text-ink-500">
            Open a ticket and our team will get back to you. You can track every conversation here.
          </p>
        </div>
        <Link
          href="/help/new"
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
        >
          <Plus className="h-4 w-4" /> New ticket
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          align="center"
          icon={<CheckCircle2 className="h-[22px] w-[22px]" aria-hidden="true" />}
          title="No tickets yet"
          body="Stuck on an order, a charge, or the Design Studio? Open a ticket and we’ll help."
          actions={
            <Link
              href="/help/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Open your first ticket
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <ul className="divide-y divide-ink-100">
            {rows.map((t) => {
              const tone = STATUS_TONE[t.status]
              return (
                <li key={t.id}>
                  <Link
                    href={`/help/${t.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink-900">{t.subject}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-500">
                        <span>{t.category?.name ?? 'Support'}</span>
                        <span aria-hidden>·</span>
                        <span>Updated {formatDate(t.updatedAt)}</span>
                        {t._count.replies > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {t._count.replies}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={cn('inline-flex flex-none rounded-full border px-2.5 py-[3px] text-[11px] font-semibold', tone.bg)}>
                      {tone.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function formatDate(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
