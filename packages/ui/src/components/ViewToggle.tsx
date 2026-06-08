'use client'

// Table / card view switch for list pages. URL-driven (?view=…) so the choice
// is shareable + bookmarkable. The page's own default mode clears the param
// (Partner defaults to table, Creator to cards); the other mode sets ?view=.
// Preserves every other query param (filters, sort, tab).

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Table as TableIcon, LayoutGrid } from 'lucide-react'
import { cn } from '../lib/utils'

export type ViewMode = 'table' | 'cards'

export function ViewToggle({
  value,
  defaultMode = 'table',
  className,
}: {
  value: ViewMode
  defaultMode?: ViewMode
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function go(v: ViewMode) {
    const q = new URLSearchParams(sp.toString())
    if (v === defaultMode) q.delete('view')
    else q.set('view', v)
    const s = q.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  return (
    <div className={cn('inline-flex items-center rounded-full border border-ink-200 bg-white p-0.5', className)} role="group" aria-label="View mode">
      <button
        type="button"
        onClick={() => go('table')}
        aria-pressed={value === 'table'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          value === 'table' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900',
        )}
      >
        <TableIcon className="h-3.5 w-3.5" aria-hidden="true" /> Table
      </button>
      <button
        type="button"
        onClick={() => go('cards')}
        aria-pressed={value === 'cards'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          value === 'cards' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900',
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> Cards
      </button>
    </div>
  )
}
