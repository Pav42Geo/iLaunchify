// Admin Dashboard — orders distribution by status.
//
// Horizontal bar chart, one row per status. SVG-free implementation (pure
// CSS flex bars) so the admin app doesn't need recharts as a dep, and the
// markup stays printable / screen-reader-friendly.
//
// Each row links into /orders?status=X — bare list today since /orders
// doesn't yet support the filter param; the existing functionality remains
// untouched. The link is wired so when the filter ships later it Just Works.

import Link from 'next/link'
import { cn } from '@ilaunchify/ui'
import { ShoppingBag } from 'lucide-react'
import type { OrdersByStatusBucket } from '../dashboard-data'

const TONE_BAR: Record<OrdersByStatusBucket['tone'], string> = {
  pink: 'bg-pink-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  info: 'bg-info-500',
  ink: 'bg-ink-700',
  danger: 'bg-danger-500',
}

const TONE_LABEL: Record<OrdersByStatusBucket['tone'], string> = {
  pink: 'text-pink-700',
  success: 'text-success-700',
  warning: 'text-warning-700',
  info: 'text-info-700',
  ink: 'text-ink-700',
  danger: 'text-danger-700',
}

export function OrdersByStatusChart({
  data,
}: {
  data: OrdersByStatusBucket[]
}) {
  const total = data.reduce((acc, r) => acc + r.count, 0)
  const max = Math.max(1, ...data.map((r) => r.count))

  return (
    <DashboardCard
      title="Orders by status"
      subtitle={`${total.toLocaleString()} orders across all states`}
      icon={ShoppingBag}
      href="/orders"
      ctaLabel="Open Orders"
    >
      {data.length === 0 ? (
        <EmptyState label="No orders yet — they'll appear here as creators check out." />
      ) : (
        <ul className="space-y-2.5">
          {data.map((row) => {
            const pct = Math.max(2, Math.round((row.count / max) * 100))
            return (
              <li key={row.status}>
                <Link
                  href={`/orders?status=${row.status}`}
                  className={cn(
                    'group block rounded-lg px-2 py-1.5',
                    'transition-colors hover:bg-ink-50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                  )}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <span
                      className={cn(
                        'font-medium capitalize',
                        TONE_LABEL[row.tone],
                      )}
                    >
                      {row.status.toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span className="font-semibold tabular-nums text-ink-900">
                      {row.count}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500',
                        TONE_BAR[row.tone],
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}

// =============================================================================
// Shared dashboard-card chrome
// =============================================================================

import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

function DashboardCard({
  title,
  subtitle,
  icon: Icon,
  href,
  ctaLabel,
  children,
}: {
  title: string
  subtitle?: string
  icon: LucideIcon
  href?: string
  ctaLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>
            )}
          </div>
        </div>
        {href && ctaLabel && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-full text-[12px] font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            {ctaLabel}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

export { DashboardCard, EmptyState }
