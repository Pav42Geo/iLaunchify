// Admin Dashboard — recent audit activity feed.
//
// One row per AuditLog entry, with actor + verb + entity. Entity is a Link
// to its detail page when one exists (via hrefForEntity on the server).
// Actions are humanized: PARTNER_ACTIVATE → "activated".

import Link from 'next/link'
import { cn } from '@ilaunchify/ui'
import { Activity } from 'lucide-react'
import { DashboardCard, EmptyState } from './OrdersByStatusChart'
import type { ActivityRow } from '../dashboard-data'

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <DashboardCard
      title="Recent activity"
      subtitle={
        rows.length === 0
          ? 'No audit events yet.'
          : `Latest ${rows.length} events across the platform`
      }
      icon={Activity}
      href="/audit"
      ctaLabel="Open Audit log"
    >
      {rows.length === 0 ? (
        <EmptyState label="Activity will appear here once admins and partners take actions." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <ActivityRowItem row={r} />
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const verb = humanizeAction(row.action)
  const entityLabel = `${row.entityType.replace(/([A-Z])/g, ' $1').trim()} ${shortId(row.entityId)}`

  return (
    <div className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-ink-50">
      <span
        aria-hidden="true"
        className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500"
      />
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <span className="font-semibold text-ink-900">{row.actorLabel}</span>{' '}
        <span className="text-ink-600">{verb}</span>{' '}
        {row.href ? (
          <Link
            href={row.href}
            className={cn(
              'font-medium text-pink-700 underline decoration-pink-200 underline-offset-2',
              'hover:decoration-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded',
            )}
          >
            {entityLabel}
          </Link>
        ) : (
          <span className="font-medium text-ink-700">{entityLabel}</span>
        )}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
        {relativeTime(row.createdAt)}
      </span>
    </div>
  )
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    PARTNER_APPLY: 'applied as partner',
    PARTNER_ACTIVATE: 'activated',
    PARTNER_SUSPEND: 'suspended',
    PARTNER_REACTIVATE: 'reactivated',
    PARTNER_REQUEST_CHANGES: 'requested changes on',
    PARTNER_SUBMIT_FOR_REVIEW: 'submitted for review',
    VERIFICATION_SECTION_VERIFY: 'verified section on',
    VERIFICATION_SECTION_REJECT: 'rejected section on',
    LEAD_QUALIFY: 'qualified',
    LEAD_DISQUALIFY: 'disqualified',
    ORDER_CREATED: 'created',
    ORDER_PAID: 'paid for',
    ORDER_CANCELLED: 'cancelled',
    DISPATCH_ACCEPT: 'accepted dispatch on',
    DISPATCH_DECLINE: 'declined dispatch on',
    DISPATCH_PRODUCING: 'started producing',
    DISPATCH_READY: 'marked ready',
    DISPATCH_SHIPPED: 'shipped',
    DISPATCH_DELIVERED: 'delivered',
    PRODUCT_TEMPLATE_PUBLISH: 'published',
    PRODUCT_TEMPLATE_REQUEST_CHANGES: 'requested changes on',
    PRODUCT_TEMPLATE_REJECT: 'rejected',
    CREATOR_TIER_CHANGE: 'changed tier on',
    PARTNER_TIER_CHANGE: 'changed tier on',
    INGREDIENT_VERIFY: 'verified',
    INGREDIENT_LIBRARY_PROMOTE: 'promoted to library',
  }
  return map[action] ?? action.toLowerCase().replace(/_/g, ' ')
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(-6) : id
}

function relativeTime(d: Date): string {
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}
