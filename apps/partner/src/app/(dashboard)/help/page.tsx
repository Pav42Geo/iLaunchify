// Partner → Help: "my tickets" list + entry to file a new one, with a short FAQ.

import Link from 'next/link'
import { LifeBuoy, Plus, MessageSquare, CheckCircle2 } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import type { TicketStatus } from '@ilaunchify/db'
import { listTickets } from '@ilaunchify/support'
import { cn } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Help — Partner' }

const STATUS_TONE: Record<TicketStatus, { bg: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', label: 'Open' },
  TRIAGED: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In review' },
  IN_PROGRESS: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Needs your reply' },
  RESOLVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Closed' },
}

export default async function PartnerHelpPage() {
  const user = await requireUser()
  const { rows } = await listTickets({ take: 100 }, { role: 'PARTNER', userId: user.id })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink-900">
            <LifeBuoy className="h-6 w-6 text-pink-600" />
            Help &amp; Support
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Questions about an order, a dispatch deadline, onboarding, or payouts? Open a ticket and
            track it here.
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
        <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-semibold text-ink-900">No tickets yet</h2>
          <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
            Need a hand with a dispatch, your application, or a payout? Open a ticket and our team
            will follow up.
          </p>
          <Link
            href="/help/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
          >
            <Plus className="h-4 w-4" /> Open your first ticket
          </Link>
        </div>
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

      {/* Quick FAQ — keeps the previous static content available. */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-ink-900">Common questions</h2>
        <dl className="mt-3 space-y-3 text-[13px]">
          <div>
            <dt className="font-semibold text-ink-800">What happens during application review?</dt>
            <dd className="mt-0.5 text-ink-600">
              Admins review four sections independently — Business identity, Facility &amp;
              capabilities, Compliance documents, and Public profile. Status and notes appear on your
              My Application page as decisions are made.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-800">How long does review take?</dt>
            <dd className="mt-0.5 text-ink-600">
              We aim for a first decision within 2 business days. Resubmissions after requested
              changes are usually faster.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-800">Still stuck?</dt>
            <dd className="mt-0.5 text-ink-600">
              Open a ticket above — it&apos;s the fastest way to reach us and keeps the whole thread
              in one place.
            </dd>
          </div>
        </dl>
      </div>
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
