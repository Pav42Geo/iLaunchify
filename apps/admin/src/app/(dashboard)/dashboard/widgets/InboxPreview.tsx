// Admin Dashboard — top inbox items across all queues.
//
// Visual rhythm matches the sidebar Inbox group: one small queue-color dot,
// title, subtitle, age. Whole row is a Link with focus ring. Queue chips
// at the top let the admin re-filter without leaving the dashboard.

import Link from 'next/link'
import { cn } from '@ilaunchify/ui'
import { Inbox } from 'lucide-react'
import { DashboardCard, EmptyState } from './OrdersByStatusChart'
import type { InboxRow } from '../dashboard-data'

const QUEUE_TONE: Record<InboxRow['queue'], string> = {
  leads: 'bg-amber-500',
  partners: 'bg-blue-500',
  products: 'bg-pink-500',
  ingredients: 'bg-emerald-500',
  certs: 'bg-purple-500',
}

const QUEUE_LABEL: Record<InboxRow['queue'], string> = {
  leads: 'Lead',
  partners: 'Partner',
  products: 'Product',
  ingredients: 'Ingredient',
  certs: 'Cert',
}

export function InboxPreview({ rows }: { rows: InboxRow[] }) {
  return (
    <DashboardCard
      title="Inbox"
      subtitle={
        rows.length === 0
          ? 'Inbox zero — everything is reviewed.'
          : `${rows.length} oldest pending items, across every queue`
      }
      icon={Inbox}
      href="/leads"
      ctaLabel="Open Leads"
    >
      {rows.length === 0 ? (
        <EmptyState label="Inbox zero. Nothing waiting on you right now." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className={cn(
                  'flex items-center gap-3 px-1.5 py-2.5',
                  'transition-colors hover:bg-ink-50',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded-md',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', QUEUE_TONE[r.queue])}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">
                    {r.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
                    <span className="font-semibold text-ink-700">
                      {QUEUE_LABEL[r.queue]}
                    </span>
                    {r.subtitle && <span> · {r.subtitle}</span>}
                  </p>
                </div>
                {r.pill && (
                  <span className="rounded-full bg-ink-100 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-ink-700">
                    {r.pill}
                  </span>
                )}
                <span className="shrink-0 tabular-nums text-[11px] text-ink-400">
                  {r.ageDays === 0 ? 'today' : `${r.ageDays}d`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
