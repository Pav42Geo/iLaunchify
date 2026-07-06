// NotificationFeed — shared presentational feed for the /notifications pages
// (in-app notifications P0, docs/IN_APP_NOTIFICATIONS_AUDIT.md §5).
//
// SERVER-safe (no hooks, no handlers): filter chips + pager are plain links
// driven by URL params (?filter=unread&category=orders&cursor=<id>), matching
// the URL-driven-filter pattern used across admin list pages. The host page
// owns data fetching (listNotificationsPage) + the mark-all-read action, and
// passes serializable rows only.

import Link from 'next/link'
import { Archive } from 'lucide-react'
import { cn } from '../lib/utils'
import { notificationCategoryMeta, toneClasses } from './notification-categories'

export interface NotificationFeedItem {
  id: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
  /** Human category label ("Orders", "Support") — shown in row meta. */
  categoryLabel: string
  /** Category slug — drives the row's icon + tone (notification-categories). */
  categorySlug?: string
}

export interface NotificationFeedProps {
  items: NotificationFeedItem[]
  /** Active read filter. */
  filter: 'all' | 'unread'
  /** Active category slug, or null for all. */
  category: string | null
  /** Chip row: every category the settings matrix knows. */
  categories: { slug: string; label: string }[]
  /** Base pathname (e.g. '/notifications') the chips + pager link to. */
  basePath: string
  /** Cursor for the next page, if any. */
  nextCursor: string | null
  /** Row accent. pink = creator, info = partner + admin. */
  accent?: 'pink' | 'info'
  /** Server action archiving one row (reads `notificationId` from formData).
      When present, each row gets an archive button (in-app P1). */
  archiveAction?: (formData: FormData) => Promise<void>
}

function buildHref(
  basePath: string,
  params: { filter?: 'all' | 'unread'; category?: string | null; cursor?: string | null },
): string {
  const qs = new URLSearchParams()
  if (params.filter === 'unread') qs.set('filter', 'unread')
  if (params.category) qs.set('category', params.category)
  if (params.cursor) qs.set('cursor', params.cursor)
  const s = qs.toString()
  return s ? `${basePath}?${s}` : basePath
}

export function NotificationFeed({
  items,
  filter,
  category,
  categories,
  basePath,
  nextCursor,
  accent = 'pink',
  archiveAction,
}: NotificationFeedProps) {
  const unreadRow =
    accent === 'pink' ? 'border-pink-200 bg-pink-50/30' : 'border-info-200 bg-info-50/30'
  const chipOn = 'bg-ink-900 text-white border-ink-900'
  const chipOff = 'border-ink-200 text-ink-700 hover:bg-ink-50'
  const chipCls =
    'inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors'

  return (
    <div className="space-y-4">
      {/* Read-state + category chips (URL-driven) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={buildHref(basePath, { filter: 'all', category })}
          className={cn(chipCls, filter === 'all' ? chipOn : chipOff)}
        >
          All
        </Link>
        <Link
          href={buildHref(basePath, { filter: 'unread', category })}
          className={cn(chipCls, filter === 'unread' ? chipOn : chipOff)}
        >
          Unread
        </Link>
        <span className="mx-1.5 h-4 w-px bg-ink-200" aria-hidden />
        <Link
          href={buildHref(basePath, { filter, category: null })}
          className={cn(chipCls, category === null ? chipOn : chipOff)}
        >
          All types
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={buildHref(basePath, { filter, category: c.slug })}
            className={cn(chipCls, category === c.slug ? chipOn : chipOff)}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white px-6 py-10 text-center text-sm text-ink-500">
          {filter === 'unread' || category
            ? 'Nothing matches these filters.'
            : 'You’re all caught up.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const isUnread = !n.readAt
            const meta = notificationCategoryMeta(n.categorySlug)
            const tone = toneClasses(meta.tone)
            const inner = (
              <div
                className={cn(
                  'flex gap-3 rounded-2xl border px-4 py-3.5 transition-colors',
                  isUnread ? unreadRow : 'border-ink-200 bg-white',
                  n.link && 'hover:bg-ink-50',
                )}
              >
                {/* Category glyph — tone-tinted chip (in-app P1 §4); muted once read. */}
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    isUnread ? tone.chip : 'bg-ink-50',
                  )}
                >
                  <meta.icon
                    strokeWidth={1.75}
                    className={cn('h-4 w-4', isUnread ? tone.icon : 'text-ink-300')}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[14px] text-ink-900', isUnread && 'font-semibold')}>
                    {n.title}
                  </p>
                  {n.body && <p className="mt-0.5 text-[12.5px] text-ink-600">{n.body}</p>}
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {new Date(n.createdAt).toLocaleString()} · {n.categoryLabel}
                  </p>
                </div>
                {/* Spacer keeps text clear of the absolutely-positioned archive button. */}
                {archiveAction && <div className="w-7 shrink-0" aria-hidden />}
              </div>
            )
            return (
              <li key={n.id} className="relative">
                {n.link ? <Link href={n.link}>{inner}</Link> : inner}
                {/* Sibling of the link (a form inside an <a> is invalid HTML and
                    submitting would navigate) — overlaid on the row's top-right. */}
                {archiveAction && (
                  <form action={archiveAction} className="absolute right-3 top-3">
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button
                      type="submit"
                      title="Archive"
                      aria-label="Archive notification"
                      className="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="pt-1 text-center">
          <Link
            href={buildHref(basePath, { filter, category, cursor: nextCursor })}
            className="inline-flex items-center rounded-full border border-ink-200 px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Older notifications →
          </Link>
        </div>
      )}
    </div>
  )
}
