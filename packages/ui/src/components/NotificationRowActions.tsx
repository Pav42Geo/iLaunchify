'use client'

// NotificationRowActions — per-row overflow menu for the /notifications feed
// (in-app P3, docs/IN_APP_NOTIFICATIONS_AUDIT.md; snooze deliberately absent —
// Pavel 2026-07-06). Rendered by the server-safe NotificationFeed as an
// absolutely-positioned sibling of the row link; server actions arrive as
// props from the host page.

import * as React from 'react'
import { MoreHorizontal, MailOpen, Archive, BellOff } from 'lucide-react'
import { cn } from '../lib/utils'

export interface NotificationRowActionsProps {
  notificationId: string
  /** Row is currently read → offer "Mark as unread". */
  isRead: boolean
  categorySlug?: string
  categoryLabel: string
  /** Mandatory categories can't be muted — hides the mute item. */
  optOutable: boolean
  actions: {
    archive: (notificationId: string) => Promise<void>
    markUnread: (notificationId: string) => Promise<void>
    /** Disables the category's IN_APP channel for this user. */
    muteCategory: (categorySlug: string) => Promise<void>
  }
}

export function NotificationRowActions({
  notificationId,
  isRead,
  categorySlug,
  categoryLabel,
  optOutable,
  actions,
}: NotificationRowActionsProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function run(fn: () => Promise<void>) {
    setOpen(false)
    startTransition(async () => {
      try {
        await fn()
      } catch {
        // Server action failed — the page revalidation simply won't happen.
      }
    })
  }

  const itemCls =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors disabled:opacity-50'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notification actions"
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'rounded-md p-1.5 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700',
          open && 'bg-ink-100 text-ink-700',
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
        >
          {isRead && (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => run(() => actions.markUnread(notificationId))}
              className={itemCls}
            >
              <MailOpen className="h-3.5 w-3.5 text-ink-500" /> Mark as unread
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => run(() => actions.archive(notificationId))}
            className={itemCls}
          >
            <Archive className="h-3.5 w-3.5 text-ink-500" /> Archive
          </button>
          {optOutable && categorySlug && (
            <>
              <div className="my-1 border-t border-ink-100" />
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(() => actions.muteCategory(categorySlug))}
                className={itemCls}
              >
                <BellOff className="h-3.5 w-3.5 text-ink-500" />
                <span className="min-w-0 truncate">
                  Turn off {categoryLabel.toLowerCase()} notifications
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
